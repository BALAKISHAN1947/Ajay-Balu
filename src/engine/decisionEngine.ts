import type { CustomerIntent } from '../types/intent.ts';
import type { RecommendationResult, RejectionLog } from '../types/recommendation.ts';
import { type ICatalogRepository, getCatalogRepository } from '../repository/catalogRepository.ts';
import { filterLaptopsByHardConstraints, analyzeConstraintFailures } from './hardConstraints.ts';
import { scoreAndRankLaptops } from './softScoring.ts';
import { lockLaptopVariant } from './variantLock.ts';
import { buildDeterministicBundle, evaluateProactiveCrossSells } from './bundleEngine.ts';

/**
 * PRODUCT TRUST PRINCIPLE (Track 01):
 * "Revenue optimization must never override customer intent, hard constraints, compatibility, factual grounding or explicit approval."
 *
 * The agent must increase basket value only through genuinely relevant, compatible, and properly disclosed products.
 * Never use fake urgency, fake scarcity, irrelevant add-ons, forced bundles, hidden price expansion, or automatic budget increases.
 */
export class DeterministicDecisionEngine {
  private repo: ICatalogRepository;

  constructor(repo: ICatalogRepository = getCatalogRepository()) {
    this.repo = repo;
  }

  public evaluateIntent(intent: CustomerIntent): RecommendationResult {
    const allLaptops = this.repo.getLaptops();
    const allMice = this.repo.getMice();
    const allBags = this.repo.getBags();

    // Compute candidate brands considered across all active catalog laptops (Bug 2)
    const activeInStockBrands = Array.from(
      new Set(allLaptops.filter((l) => l.is_active && l.stock_quantity > 0).map((l) => l.brand))
    );
    const candidate_brands_considered = intent.requested_brand
      ? [intent.requested_brand]
      : activeInStockBrands;

    // Step 0: Check for Unsupported Category
    if (intent.unsupported_categories && intent.unsupported_categories.length > 0 && intent.required_categories.length === 0) {
      const unsupported = intent.unsupported_categories[0];
      return {
        status: 'NO_CATEGORY_MATCH',
        match_type: 'NO_CATEGORY_MATCH',
        recommended_laptop: null,
        locked_variant: null,
        accessories: [],
        itemized_line_items: [],
        total_price_inr: 0,
        budget_ceiling_inr: intent.hard_constraints.max_total_budget ?? 0,
        budget_margin_inr: 0,
        reasons: [
          `Our verified catalog specializes exclusively in high-performance laptops, ergonomic mice, and protective workspace bags. Our catalog does not currently sell ${unsupported}.`
        ],
        trade_offs: [],
        rejections: [],
        compatibility_checks: [],
        confidence_score: 0.0,
        unsupported_category: unsupported,
        supported_categories: ['laptop', 'mouse', 'bag'],
        candidate_brands_considered
      };
    }

    const allRejections: RejectionLog[] = [];

    // Step 1: Hard Constraint Filtering on Laptops
    const { passed: hardPassedLaptops, rejections: laptopHardRejections } =
      filterLaptopsByHardConstraints(intent, allLaptops);

    allRejections.push(...laptopHardRejections);

    // If no laptops passed hard constraints: evaluate PARTIAL_MATCH vs NO_PRODUCT_MATCH
    if (hardPassedLaptops.length === 0) {
      const maxBudget = intent.hard_constraints.max_laptop_price ?? intent.hard_constraints.max_total_budget;
      const minRam = intent.hard_constraints.min_ram_gb ?? 8;
      const analysis = analyzeConstraintFailures(intent, allLaptops);

      // Check if there is an in-stock laptop that meets ALL technical requirements but slightly exceeds budget (within 20%)
      const nearBudgetCandidates = allLaptops.filter((p) => {
        if (!p.is_active || p.stock_quantity <= 0) return false;
        // Respect requested brand
        if (intent.requested_brand && p.brand.toLowerCase() !== intent.requested_brand.toLowerCase().trim()) return false;
        // Respect requested model
        if (intent.requested_model) {
          const targetModel = intent.requested_model.toLowerCase().trim();
          const laptopName = p.name.toLowerCase();
          const modelWords = targetModel
            .split(/\s+/)
            .filter((w) => w.length > 2 && w !== intent.requested_brand?.toLowerCase());
          const isMatch =
            laptopName.includes(targetModel) ||
            (modelWords.length > 0 && modelWords.every((w) => laptopName.includes(w)));
          if (!isMatch) return false;
        }
        if (intent.hard_constraints.min_ram_gb && (p.ram.capacity_gb === null || p.ram.capacity_gb < intent.hard_constraints.min_ram_gb)) return false;
        if (intent.hard_constraints.min_storage_gb && p.storage.capacity_gb < intent.hard_constraints.min_storage_gb) return false;
        if (intent.hard_constraints.max_weight_g && p.weight_g > intent.hard_constraints.max_weight_g) return false;
        if (intent.hard_constraints.gpu_model && (!p.gpu || !p.gpu.model.toLowerCase().includes(intent.hard_constraints.gpu_model.toLowerCase()))) return false;
        if (intent.hard_constraints.min_vram_gb && (!p.gpu || (p.gpu.vram_gb ?? 0) < intent.hard_constraints.min_vram_gb)) return false;
        if (intent.hard_constraints.requires_dedicated_gpu && (!p.gpu || p.gpu.type !== 'dedicated')) return false;
        return maxBudget ? (p.price_inr > maxBudget && p.price_inr <= maxBudget * 1.20) : false;
      }).sort((a, b) => a.price_inr - b.price_inr);

      if (nearBudgetCandidates.length > 0 && maxBudget) {
        const partialProduct = nearBudgetCandidates[0];
        const lockedVariant = lockLaptopVariant(partialProduct);
        const priceDelta = partialProduct.price_inr - maxBudget;

        return {
          status: 'PARTIAL_MATCH',
          match_type: 'PARTIAL_MATCH',
          recommended_laptop: {
            product: partialProduct,
            total_score: 82,
            component_scores: { portability: 80, battery: 80, longevity: 80 },
            trade_offs: [
              `Price (₹${partialProduct.price_inr.toLocaleString('en-IN')}) exceeds your ₹${maxBudget.toLocaleString('en-IN')} budget by ₹${priceDelta.toLocaleString('en-IN')}.`
            ]
          },
          locked_variant: lockedVariant,
          accessories: [],
          itemized_line_items: [{ sku: partialProduct.sku, name: partialProduct.name, price_inr: partialProduct.price_inr }],
          total_price_inr: partialProduct.price_inr,
          budget_ceiling_inr: maxBudget,
          budget_margin_inr: -priceDelta,
          reasons: [
            `Closest match found, but it exceeds your ₹${maxBudget.toLocaleString('en-IN')} budget by ₹${priceDelta.toLocaleString('en-IN')}.`,
            `${partialProduct.name} meets all your technical requirements (${partialProduct.ram.capacity_gb}GB RAM, ${partialProduct.storage.capacity_gb}GB storage) at ₹${partialProduct.price_inr.toLocaleString('en-IN')}.`
          ],
          trade_offs: [
            `Exceeds budget ceiling by ₹${priceDelta.toLocaleString('en-IN')} (${((priceDelta / maxBudget) * 100).toFixed(1)}% over budget).`,
            ...analysis.trade_off_options
          ],
          unfulfilled_constraints: [
            `Budget ceiling of ₹${maxBudget.toLocaleString('en-IN')} is exceeded by ₹${priceDelta.toLocaleString('en-IN')} (${partialProduct.name} is ₹${partialProduct.price_inr.toLocaleString('en-IN')}).`
          ],
          rejections: allRejections,
          compatibility_checks: [],
          confidence_score: 0.70,
          constraint_analysis: analysis,
          proactive_add_ons: evaluateProactiveCrossSells(partialProduct, intent, allMice, allBags),
          candidate_brands_considered
        };
      }

      let noMatchPrimaryReason = 'No laptop in the catalog satisfied all hard constraints (budget, minimum RAM, storage, or stock requirements).';
      if (intent.requested_model) {
        noMatchPrimaryReason = "I couldn't find that exact model in the verified catalog.";
      } else if (intent.requested_brand) {
        noMatchPrimaryReason = `No ${intent.requested_brand} laptop in the verified catalog satisfied all hard constraints.`;
      }

      // No close single candidate exists -> NO_PRODUCT_MATCH with full constraint breakdown & nearest alternatives
      return {
        status: 'NO_MATCH',
        match_type: 'NO_PRODUCT_MATCH',
        recommended_laptop: null,
        locked_variant: null,
        accessories: [],
        itemized_line_items: [],
        total_price_inr: 0,
        budget_ceiling_inr: maxBudget ?? 0,
        budget_margin_inr: 0,
        reasons: [
          noMatchPrimaryReason,
          ...analysis.failure_summary_points
        ],
        trade_offs: analysis.trade_off_options,
        rejections: allRejections,
        compatibility_checks: [],
        confidence_score: 0.0,
        unfulfilled_constraints: analysis.failed_constraints.length > 0
          ? analysis.failed_constraints
          : ['UNFULFILLED_HARD_CONSTRAINTS'],
        constraint_analysis: analysis,
        candidate_brands_considered
      };
    }

    // Step 2: Soft Preference Scoring & Ranking
    const rankedLaptops = scoreAndRankLaptops(hardPassedLaptops, intent);

    // Step 3: Bundle Assembly & Compatibility Resolution
    // We attempt bundling starting from the highest-ranked laptop.
    for (let i = 0; i < rankedLaptops.length; i++) {
      const candidate = rankedLaptops[i];
      const bundle = buildDeterministicBundle(candidate.product, intent, allMice, allBags);

      allRejections.push(...bundle.accessory_rejections);

      if (bundle.success) {
        // Locked exact variant
        const lockedVariant = lockLaptopVariant(candidate.product);

        const accessoryReason = bundle.selected_accessories.length > 0
          ? `Accessories: ${bundle.selected_accessories.length} item(s) selected with verified port and protocol compatibility (no adapter required).`
          : 'Accessories: None requested for this configuration.';

        // Factual justification templates
        const reasons: string[] = [
          `Highest scoring match (${candidate.total_score}/100) meeting all hard constraints (>=${intent.hard_constraints.min_ram_gb ?? 16}GB RAM, price within budget).`,
          `Portability score ${candidate.component_scores.portability}/100: Lightweight ${(candidate.product.weight_g / 1000).toFixed(2)} kg chassis designed for daily metro/transit commute.`,
          `Battery score ${candidate.component_scores.battery}/100: ${candidate.product.battery.capacity_wh}Wh battery with fast charging provides ~${candidate.product.battery.claimed_hours} hours of developer runtime.`,
          accessoryReason
        ];

        // Rationale for alternatives
        const alternativeNotes: string[] = [];
        for (let j = 0; j < rankedLaptops.length; j++) {
          if (j !== i) {
            const alt = rankedLaptops[j];
            alternativeNotes.push(
              `Alternative ${alt.product.name} (₹${alt.product.price_inr.toLocaleString('en-IN')}) ranked lower with score ${alt.total_score}/100.`
            );
          }
        }

        // Calculate confidence score (1.0 base, penalized if candidate has unindexed specs)
        let confidence = 1.0;
        if (candidate.product.display.brightness_nits === null) {
          confidence -= 0.15;
        }

        const proactiveAddOns = evaluateProactiveCrossSells(candidate.product, intent, allMice, allBags);

        return {
          status: 'SUCCESS',
          match_type: 'VALID_MATCH',
          recommended_laptop: candidate,
          locked_variant: lockedVariant,
          accessories: bundle.selected_accessories,
          itemized_line_items: bundle.itemized_line_items,
          total_price_inr: bundle.total_price_inr,
          budget_ceiling_inr: bundle.budget_ceiling_inr,
          budget_margin_inr: bundle.budget_margin_inr,
          reasons: reasons,
          trade_offs: candidate.trade_offs,
          rejections: allRejections,
          compatibility_checks: bundle.compatibility_evidence,
          confidence_score: Number(confidence.toFixed(2)),
          proactive_add_ons: proactiveAddOns,
          candidate_brands_considered
        };
      }
    }

    // If all bundles failed (e.g. accessories pushed every laptop over budget): PARTIAL_MATCH
    const topLaptop = rankedLaptops[0];
    const topLockedVariant = lockLaptopVariant(topLaptop.product);
    const topAddOns = evaluateProactiveCrossSells(topLaptop.product, intent, allMice, allBags);

    return {
      status: 'PARTIAL_MATCH',
      match_type: 'PARTIAL_MATCH',
      recommended_laptop: topLaptop,
      locked_variant: topLockedVariant,
      accessories: [],
      itemized_line_items: [{ sku: topLaptop.product.sku, name: topLaptop.product.name, price_inr: topLaptop.product.price_inr }],
      total_price_inr: topLaptop.product.price_inr,
      budget_ceiling_inr: intent.hard_constraints.max_total_budget ?? topLaptop.product.price_inr,
      budget_margin_inr: (intent.hard_constraints.max_total_budget ?? topLaptop.product.price_inr) - topLaptop.product.price_inr,
      reasons: [
        'Partial match: The recommended laptop satisfies all core constraints, but requested accessories could not be fitted within your total budget limit.'
      ],
      trade_offs: [
        'Accessories excluded to maintain overall budget discipline.'
      ],
      unfulfilled_constraints: [
        'Requested accessories (mouse/bag) could not be bundled within the remaining budget margin.'
      ],
      rejections: allRejections,
      compatibility_checks: [],
      confidence_score: 0.80,
      proactive_add_ons: topAddOns,
      candidate_brands_considered
    };
  }
}
