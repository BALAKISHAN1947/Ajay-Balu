import type { ICatalogRepository } from '../repository/catalogRepository.ts';
import { getCatalogRepository } from '../repository/catalogRepository.ts';
import { DeterministicDecisionEngine } from '../engine/decisionEngine.ts';
import { DeterministicNLUProvider } from '../llm/llmProvider.ts';
import { validateCustomerIntent } from '../nlu/intentValidator.ts';
import { BENCHMARK_INTENTS } from '../data/benchmarkIntents.ts';
import type {
  BenchmarkIntent,
  BenchmarkResult,
  BenchmarkRunSummary,
  LostOpportunityReasonCode,
  OpportunityType,
  LossReasonMetrics,
  BenchmarkValidationError,
  BenchmarkIntentValidationResult
} from '../types/benchmark.ts';

export class BenchmarkDataError extends Error {
  public status = 'INVALID_BENCHMARK_DATA';
  public benchmark_id: string;
  public field: string;
  public reason: string;

  constructor(error: BenchmarkValidationError) {
    super(`[INVALID_BENCHMARK_DATA] Intent "${error.benchmark_id}" has invalid field "${error.field}": ${error.reason}`);
    this.name = 'BenchmarkDataError';
    this.benchmark_id = error.benchmark_id;
    this.field = error.field;
    this.reason = error.reason;
  }
}

/**
 * Validates a single benchmark intent record before execution.
 */
export function validateBenchmarkIntent(intent: any): BenchmarkIntentValidationResult {
  if (!intent || typeof intent !== 'object') {
    return {
      valid: false,
      status: 'INVALID_BENCHMARK_DATA',
      benchmark_id: 'UNKNOWN',
      field: 'intent',
      reason: 'Benchmark intent must be a non-null object',
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: 'UNKNOWN',
        field: 'intent',
        reason: 'Benchmark intent must be a non-null object'
      }
    };
  }

  if (typeof intent.benchmark_id !== 'string' || intent.benchmark_id.trim().length === 0) {
    const fallbackId = String(intent.benchmark_id || 'UNKNOWN');
    return {
      valid: false,
      status: 'INVALID_BENCHMARK_DATA',
      benchmark_id: fallbackId,
      field: 'benchmark_id',
      reason: 'benchmark_id must be a non-empty string',
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: fallbackId,
        field: 'benchmark_id',
        reason: 'benchmark_id must be a non-empty string'
      }
    };
  }

  const id = intent.benchmark_id;

  if (typeof intent.natural_language_query !== 'string' || intent.natural_language_query.trim().length === 0) {
    return {
      valid: false,
      status: 'INVALID_BENCHMARK_DATA',
      benchmark_id: id,
      field: 'natural_language_query',
      reason: 'natural_language_query must be a non-empty string',
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: id,
        field: 'natural_language_query',
        reason: 'natural_language_query must be a non-empty string'
      }
    };
  }

  const validGroups = [
    'developer',
    'gaming',
    'student_budget',
    'travel_portability',
    'creator',
    'office_workspace',
    'comparison',
    'bundle_accessory'
  ];
  if (!intent.group || !validGroups.includes(intent.group)) {
    return {
      valid: false,
      status: 'INVALID_BENCHMARK_DATA',
      benchmark_id: id,
      field: 'group',
      reason: `group must be one of: ${validGroups.join(', ')}`,
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: id,
        field: 'group',
        reason: `group must be one of: ${validGroups.join(', ')}`
      }
    };
  }

  const validCategories = ['laptop', 'mouse', 'bag', 'unsupported'];
  if (!intent.expected_category || !validCategories.includes(intent.expected_category)) {
    return {
      valid: false,
      status: 'INVALID_BENCHMARK_DATA',
      benchmark_id: id,
      field: 'expected_category',
      reason: `expected_category must be one of: ${validCategories.join(', ')}`,
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: id,
        field: 'expected_category',
        reason: `expected_category must be one of: ${validCategories.join(', ')}`
      }
    };
  }

  if (!intent.expected_hard_constraints || typeof intent.expected_hard_constraints !== 'object') {
    return {
      valid: false,
      status: 'INVALID_BENCHMARK_DATA',
      benchmark_id: id,
      field: 'expected_hard_constraints',
      reason: 'expected_hard_constraints must be an object',
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: id,
        field: 'expected_hard_constraints',
        reason: 'expected_hard_constraints must be an object'
      }
    };
  }

  if (!intent.expected_soft_preferences || typeof intent.expected_soft_preferences !== 'object') {
    return {
      valid: false,
      status: 'INVALID_BENCHMARK_DATA',
      benchmark_id: id,
      field: 'expected_soft_preferences',
      reason: 'expected_soft_preferences must be an object',
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: id,
        field: 'expected_soft_preferences',
        reason: 'expected_soft_preferences must be an object'
      }
    };
  }

  if (!Array.isArray(intent.requested_accessories)) {
    return {
      valid: false,
      status: 'INVALID_BENCHMARK_DATA',
      benchmark_id: id,
      field: 'requested_accessories',
      reason: 'requested_accessories must be an array',
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: id,
        field: 'requested_accessories',
        reason: 'requested_accessories must be an array'
      }
    };
  }

  if (typeof intent.benchmark_version !== 'string' || intent.benchmark_version.trim().length === 0) {
    return {
      valid: false,
      status: 'INVALID_BENCHMARK_DATA',
      benchmark_id: id,
      field: 'benchmark_version',
      reason: 'benchmark_version must be a non-empty string',
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: id,
        field: 'benchmark_version',
        reason: 'benchmark_version must be a non-empty string'
      }
    };
  }

  return { valid: true };
}

/**
 * Validates an entire collection of benchmark intents.
 * Enforces dataset size of 100, uniqueness of IDs, and validity of every record.
 */
export function validateBenchmarkDataset(intents: BenchmarkIntent[]): { valid: boolean; error?: BenchmarkValidationError; count: number } {
  if (!Array.isArray(intents)) {
    return {
      valid: false,
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: 'ALL',
        field: 'intents',
        reason: 'Benchmark intents collection must be an array'
      },
      count: 0
    };
  }

  if (intents.length !== 100) {
    return {
      valid: false,
      error: {
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: 'ALL',
        field: 'intents.length',
        reason: `Benchmark intents count must be exactly 100, received ${intents.length}`
      },
      count: intents.length
    };
  }

  const seenIds = new Set<string>();
  for (const intent of intents) {
    const val = validateBenchmarkIntent(intent);
    if (!val.valid && val.error) {
      return { valid: false, error: val.error, count: intents.length };
    }
    if (seenIds.has(intent.benchmark_id)) {
      return {
        valid: false,
        error: {
          status: 'INVALID_BENCHMARK_DATA',
          benchmark_id: intent.benchmark_id,
          field: 'benchmark_id',
          reason: `Duplicate benchmark_id found: "${intent.benchmark_id}"`
        },
        count: intents.length
      };
    }
    seenIds.add(intent.benchmark_id);
  }

  return { valid: true, count: intents.length };
}

/**
 * CONTROLLED AI BUYER BENCHMARK RUNNER:
 * Evaluates realistic buyer requests against Nexora's deterministic catalog & decision engine.
 *
 * REVENUE OPTIMIZATION GUARDRAIL:
 * "AgentReady may optimize merchant revenue only through better intent matching, truthful product information,
 * relevant compatible cross-sell, better decision support, and successful authorized transactions.
 * It may never manipulate the customer or override customer constraints."
 */
export class BenchmarkRunner {
  private repo: ICatalogRepository;
  private decisionEngine: DeterministicDecisionEngine;
  private nlu: DeterministicNLUProvider;

  constructor(repo: ICatalogRepository = getCatalogRepository()) {
    this.repo = repo;
    this.decisionEngine = new DeterministicDecisionEngine(repo);
    this.nlu = new DeterministicNLUProvider();
  }

  public async runBenchmark(
    catalogVersion = 'Catalog-v1.0',
    benchmarkVersion = 'Benchmark-v1.0',
    intents: BenchmarkIntent[] = BENCHMARK_INTENTS
  ): Promise<BenchmarkRunSummary> {
    // PHASE A: VALIDATE DATASET
    const validation = validateBenchmarkDataset(intents);
    if (!validation.valid && validation.error) {
      throw new BenchmarkDataError(validation.error);
    }

    // PHASE B: EXECUTE BENCHMARK
    const results: BenchmarkResult[] = [];

    for (const item of intents) {
      const result = await this.evaluateSingleIntent(item);
      results.push(result);
    }

    return this.calculateSummary(results, catalogVersion, benchmarkVersion);
  }

  public async evaluateSingleIntent(item: BenchmarkIntent): Promise<BenchmarkResult> {
    if (!item || typeof item.natural_language_query !== 'string' || item.natural_language_query.trim().length === 0) {
      throw new BenchmarkDataError({
        status: 'INVALID_BENCHMARK_DATA',
        benchmark_id: item?.benchmark_id || 'UNKNOWN',
        field: 'natural_language_query',
        reason: 'natural_language_query must be a non-empty string'
      });
    }

    // Step 1: NLU Intent Extraction
    const rawIntentJson = await this.nlu.generateStructuredIntent(item.natural_language_query);
    const parsed = JSON.parse(rawIntentJson);

    // Merge requested accessories if specified in benchmark intent
    if (item.requested_accessories && item.requested_accessories.length > 0) {
      for (const acc of item.requested_accessories) {
        if (!parsed.required_categories.includes(acc)) {
          parsed.required_categories.push(acc);
        }
      }
      if (item.requested_accessories.includes('bag')) {
        parsed.compatibility_requirements = parsed.compatibility_requirements || {};
        parsed.compatibility_requirements.bag_must_fit_laptop = true;
      }
      if (item.requested_accessories.includes('mouse')) {
        parsed.compatibility_requirements = parsed.compatibility_requirements || {};
        parsed.compatibility_requirements.mouse_must_interface_without_adapters = true;
      }
    }

    // Step 2: Validate Intent
    const validation = validateCustomerIntent(parsed);
    const intent = validation.intent || parsed;

    // Step 3: Authoritative Deterministic Engine Evaluation
    const engineResult = this.decisionEngine.evaluateIntent(intent);

    // Step 4: Classify Outcome & Opportunity Type
    let opportunityType: OpportunityType;
    let lossReasonCode: LostOpportunityReasonCode | undefined;
    let lossReasonDetail: string | undefined;

    const isUnsupported =
      engineResult.status === 'NO_CATEGORY_MATCH' || engineResult.match_type === 'NO_CATEGORY_MATCH';
    const isWon =
      (engineResult.status === 'SUCCESS' || engineResult.status === 'VALID_MATCH' || engineResult.match_type === 'VALID_MATCH') &&
      (engineResult.recommended_laptop !== null || engineResult.accessories.length > 0);
    const isPartial =
      engineResult.status === 'PARTIAL_MATCH' || engineResult.match_type === 'PARTIAL_MATCH';

    if (isUnsupported) {
      opportunityType = 'UNSUPPORTED_CATEGORY';
      lossReasonCode = 'CATEGORY_MISMATCH';
      lossReasonDetail = `Merchant does not sell category: ${engineResult.unsupported_category || 'requested category'}`;
    } else if (isWon) {
      opportunityType = 'WON';
    } else if (isPartial && engineResult.recommended_laptop) {
      opportunityType = 'PARTIAL';
      lossReasonCode = 'BUDGET_MISMATCH';
      lossReasonDetail = engineResult.recommended_laptop.trade_offs[0] || 'Requires budget expansion';
    } else {
      opportunityType = 'LOST';
      const diagnosed = this.diagnoseLossReason(item, engineResult.rejections);
      lossReasonCode = diagnosed.code;
      lossReasonDetail = diagnosed.detail;
    }

    // Step 5: Constraints & Compatibility Tracking
    const satisfiedConstraints: string[] = [];
    const unsatisfiedConstraints: string[] = [];

    if (item.expected_hard_constraints.budget_max) {
      if (engineResult.total_price_inr <= item.expected_hard_constraints.budget_max && engineResult.recommended_laptop) {
        satisfiedConstraints.push(`Budget <= ₹${item.expected_hard_constraints.budget_max}`);
      } else {
        unsatisfiedConstraints.push(`Budget <= ₹${item.expected_hard_constraints.budget_max}`);
      }
    }

    if (item.expected_hard_constraints.min_ram_gb) {
      const ram = engineResult.recommended_laptop?.product.ram.capacity_gb;
      if (ram && ram >= item.expected_hard_constraints.min_ram_gb) {
        satisfiedConstraints.push(`RAM >= ${item.expected_hard_constraints.min_ram_gb}GB`);
      } else {
        unsatisfiedConstraints.push(`RAM >= ${item.expected_hard_constraints.min_ram_gb}GB`);
      }
    }

    if (item.expected_hard_constraints.min_storage_gb) {
      const storage = engineResult.recommended_laptop?.product.storage.capacity_gb;
      if (storage && storage >= item.expected_hard_constraints.min_storage_gb) {
        satisfiedConstraints.push(`Storage >= ${item.expected_hard_constraints.min_storage_gb}GB`);
      } else {
        unsatisfiedConstraints.push(`Storage >= ${item.expected_hard_constraints.min_storage_gb}GB`);
      }
    }

    if (item.expected_hard_constraints.gpu_model) {
      const gpuModel = engineResult.recommended_laptop?.product.gpu?.model || '';
      if (gpuModel.toLowerCase().includes(item.expected_hard_constraints.gpu_model.toLowerCase())) {
        satisfiedConstraints.push(`GPU == ${item.expected_hard_constraints.gpu_model}`);
      } else {
        unsatisfiedConstraints.push(`GPU == ${item.expected_hard_constraints.gpu_model}`);
      }
    }

    const compatibilityPassed = engineResult.compatibility_checks
      .filter((c) => c.compatible)
      .map((c) => `${c.accessory_category}:${c.accessory_sku} (${c.reason})`);
    const compatibilityFailed = engineResult.compatibility_checks
      .filter((c) => !c.compatible)
      .map((c) => `${c.accessory_category}:${c.accessory_sku} (${c.reason})`);

    // Step 6: Cross-sell Classification
    const crossSellCandidates = (engineResult.proactive_add_ons || []).map((a) => a.sku);
    const eligibleCrossSells = (engineResult.proactive_add_ons || [])
      .filter((a) => a.state === 'ELIGIBLE_CROSS_SELL')
      .map((a) => a.sku);
    const overBudgetCrossSells = (engineResult.proactive_add_ons || [])
      .filter((a) => a.state === 'COMPATIBLE_BUT_OVER_BUDGET')
      .map((a) => a.sku);

    // Simulated Cross-Sell Acceptance Policy (Controlled Benchmark Definition)
    const simulatedCrossSellAccepted = eligibleCrossSells.length > 0 && item.requested_accessories.length > 0;
    let incrementalBasketInr = 0;
    if (simulatedCrossSellAccepted) {
      const acceptedAddOn = engineResult.proactive_add_ons?.find((a) => eligibleCrossSells.includes(a.sku));
      if (acceptedAddOn) {
        incrementalBasketInr = acceptedAddOn.price_inr;
      }
    }

    // Step 7: Catalog-Attributed Opportunity Value Calculation
    let opportunityValueInr = 0;
    if (opportunityType === 'LOST') {
      // Base opportunity on benchmark intent budget or typical category price
      opportunityValueInr = item.expected_hard_constraints.budget_max || 65000;
    } else if (opportunityType === 'PARTIAL') {
      opportunityValueInr = engineResult.total_price_inr;
    }

    // Step 8: Simulated Acceptance (Controlled Benchmark Metric)
    const simulatedAcceptance = opportunityType === 'WON' || (opportunityType === 'PARTIAL' && engineResult.budget_margin_inr >= -10000);

    return {
      benchmark_id: item.benchmark_id,
      query: item.natural_language_query,
      group: item.group,
      status: (opportunityType === 'UNSUPPORTED_CATEGORY' ? 'UNSUPPORTED' : opportunityType) as 'WON' | 'PARTIAL' | 'LOST' | 'UNSUPPORTED',
      opportunity_type: opportunityType,
      match_state: engineResult.match_type || 'NO_PRODUCT_MATCH',
      matched_product_sku: engineResult.recommended_laptop?.product.sku || (engineResult.accessories[0]?.sku ?? null),
      matched_sku: engineResult.recommended_laptop?.product.sku || (engineResult.accessories[0]?.sku ?? null),
      closest_product_sku: engineResult.recommended_laptop ? null : (engineResult.rejections[0]?.sku || null),
      closest_sku: engineResult.recommended_laptop ? null : (engineResult.rejections[0]?.sku || null),
      closest_product_name: engineResult.recommended_laptop ? null : (engineResult.rejections[0]?.sku || null),
      closest_product_unmet_reasons: engineResult.rejections.map((r) => r.reason),
      selected_sku: engineResult.recommended_laptop?.product.sku || (engineResult.accessories[0]?.sku ?? null),
      selected_name: engineResult.recommended_laptop?.product.name || (engineResult.accessories[0]?.name ?? null),
      selected_variant: engineResult.locked_variant?.variant_id || null,
      hard_constraints: item.expected_hard_constraints,
      satisfied_constraints: satisfiedConstraints,
      unsatisfied_constraints: unsatisfiedConstraints,
      unmet_constraints: unsatisfiedConstraints,
      trade_offs: (engineResult.trade_offs || []).map((t: any) => (typeof t === 'string' ? t : (t.option || t.message || String(t)))),
      explanation: (engineResult as any).explanation || lossReasonDetail,
      compatibility_passed: compatibilityPassed,
      compatibility_failed: compatibilityFailed,
      cross_sell_candidates: crossSellCandidates,
      eligible_cross_sells: eligibleCrossSells,
      over_budget_cross_sells: overBudgetCrossSells,
      checkout_eligible: opportunityType === 'WON',
      basket_total_inr: engineResult.total_price_inr,
      rejection_reasons: engineResult.rejections.map((r) => `${r.sku}: ${r.reason}`),
      loss_reason_code: lossReasonCode,
      loss_reason_detail: lossReasonDetail,
      loss_reason_description: lossReasonDetail,
      catalog_attributed_opportunity_inr: opportunityValueInr,
      opportunity_value_inr: opportunityValueInr,
      simulated_acceptance: simulatedAcceptance,
      simulated_cross_sell_accepted: simulatedCrossSellAccepted,
      incremental_basket_inr: incrementalBasketInr,
      intent: item
    };
  }

  private diagnoseLossReason(
    item: BenchmarkIntent,
    rejections: Array<{ sku: string; reason: string }>
  ): { code: LostOpportunityReasonCode; detail: string } {
    const query = typeof item?.natural_language_query === 'string' ? item.natural_language_query.toLowerCase() : '';

    // Specific intentional attribute defects:
    if (query.includes('alphabook') || query.includes('minrammiss')) {
      return { code: 'MISSING_ATTRIBUTE', detail: 'AlphaBook 14: RAM capacity is null in catalog specification.' };
    }
    if (query.includes('edgebook') || query.includes('brightness')) {
      return { code: 'MISSING_ATTRIBUTE', detail: 'EdgeBook 14: Display brightness nits attribute is missing.' };
    }
    if (query.includes('basicclick') || (query.includes('dongle') && query.includes('mouse'))) {
      return { code: 'AMBIGUOUS_ATTRIBUTE', detail: 'BasicClick B1: Dongle connection protocol is ambiguous/unverified.' };
    }
    if (query.includes('swiftbook')) {
      return { code: 'OUT_OF_STOCK', detail: 'NX-LP-OOS-08: SwiftBook 14 has zero units in stock inventory.' };
    }

    if (item.expected_hard_constraints.gpu_model || query.includes('rtx') || query.includes('gpu') || query.includes('graphics')) {
      return {
        code: 'GPU_MISMATCH',
        detail: `Requested GPU (${item.expected_hard_constraints.gpu_model || 'dedicated GPU'}) not available within specified budget.`
      };
    }

    if (item.expected_hard_constraints.min_ram_gb && item.expected_hard_constraints.min_ram_gb >= 32) {
      return {
        code: 'RAM_MISMATCH',
        detail: `Requested ${item.expected_hard_constraints.min_ram_gb}GB RAM not available within budget ceiling.`
      };
    }

    if (item.expected_hard_constraints.budget_max && item.expected_hard_constraints.budget_max < 40000) {
      return {
        code: 'PRICE_MISMATCH',
        detail: `Budget ceiling (₹${item.expected_hard_constraints.budget_max.toLocaleString('en-IN')}) below merchant entry product tier (₹42,999).`
      };
    }

    // Check if rejections mention missing attribute
    for (const rej of rejections) {
      const reasonLower = rej.reason.toLowerCase();
      if (rej.sku === 'NX-LP-MINRAMMISS-14' && reasonLower.includes('ram capacity is missing')) {
        return { code: 'MISSING_ATTRIBUTE', detail: 'AlphaBook 14: RAM capacity is null in catalog specification.' };
      }
      if (rej.sku === 'NX-LP-EDGE14-10' && reasonLower.includes('brightness')) {
        return { code: 'MISSING_ATTRIBUTE', detail: 'EdgeBook 14: Display brightness nits attribute is missing.' };
      }
      if (rej.sku === 'NX-MS-AMBIG-05' && reasonLower.includes('dongle')) {
        return { code: 'AMBIGUOUS_ATTRIBUTE', detail: 'BasicClick B1: Dongle connection protocol is ambiguous/unverified.' };
      }
    }

    if (rejections.some((r) => r.reason.toLowerCase().includes('budget') || r.reason.toLowerCase().includes('price'))) {
      return {
        code: 'BUDGET_MISMATCH',
        detail: 'Catalog products meeting specifications exceed customer hard budget.'
      };
    }

    return {
      code: 'NO_RELEVANT_PRODUCT',
      detail: 'No catalog inventory satisfies combined technical requirements.'
    };
  }

  private calculateSummary(
    results: BenchmarkResult[],
    catalogVersion: string,
    benchmarkVersion: string
  ): BenchmarkRunSummary {
    const totalIntents = results.length;
    const unsupportedIntents = results.filter((r) => r.opportunity_type === 'UNSUPPORTED_CATEGORY').length;
    const supportedIntents = totalIntents - unsupportedIntents;

    const wonCount = results.filter((r) => r.opportunity_type === 'WON').length;
    const partialCount = results.filter((r) => r.opportunity_type === 'PARTIAL').length;
    const lostCount = results.filter((r) => r.opportunity_type === 'LOST').length;

    // Product Match Rate = WON / supported_intents (strictly excluding unsupported category)
    const productMatchRate = supportedIntents > 0 ? Number((wonCount / supportedIntents).toFixed(3)) : 0;

    // Hard Constraint Adherence
    let totalChecks = 0;
    let passedChecks = 0;
    for (const r of results) {
      if (r.opportunity_type !== 'UNSUPPORTED_CATEGORY') {
        passedChecks += r.satisfied_constraints.length;
        totalChecks += (r.satisfied_constraints.length + r.unsatisfied_constraints.length);
      }
    }
    const hardConstraintAdherence = totalChecks > 0 ? Number((passedChecks / totalChecks).toFixed(3)) : 1.0;

    // Variant Accuracy: WON products that successfully locked variant
    const wonResults = results.filter((r) => r.opportunity_type === 'WON');
    const accurateVariants = wonResults.filter((r) => r.selected_variant !== null).length;
    const variantAccuracyRate = wonCount > 0 ? Number((accurateVariants / wonCount).toFixed(3)) : 0;

    // Compatibility Success
    let totalCompat = 0;
    let passedCompat = 0;
    for (const r of results) {
      passedCompat += r.compatibility_passed.length;
      totalCompat += (r.compatibility_passed.length + r.compatibility_failed.length);
    }
    const compatibilitySuccessRate = totalCompat > 0 ? Number((passedCompat / totalCompat).toFixed(3)) : 1.0;

    // Simulated Acceptance & Checkout Ready
    const simulatedAcceptanceCount = results.filter((r) => r.simulated_acceptance).length;
    const simulatedAcceptanceRate = supportedIntents > 0 ? Number((simulatedAcceptanceCount / supportedIntents).toFixed(3)) : 0;
    const checkoutReadyCount = results.filter((r) => r.checkout_eligible).length;
    const checkoutReadyRate = supportedIntents > 0 ? Number((checkoutReadyCount / supportedIntents).toFixed(3)) : 0;

    // Cross-sell Metrics
    let eligibleCrossSellsCount = 0;
    let overBudgetCrossSellsCount = 0;
    let simulatedCrossSellsAcceptedCount = 0;
    let totalBaseBasket = 0;
    let totalIncremental = 0;

    for (const r of results) {
      eligibleCrossSellsCount += r.eligible_cross_sells.length;
      overBudgetCrossSellsCount += r.over_budget_cross_sells.length;
      if (r.simulated_cross_sell_accepted) {
        simulatedCrossSellsAcceptedCount++;
        totalIncremental += r.incremental_basket_inr;
      }
      if (r.basket_total_inr > 0) {
        totalBaseBasket += r.basket_total_inr;
      }
    }

    const avgBaseBasketInr = wonCount > 0 ? Math.round(totalBaseBasket / wonCount) : 0;
    const avgBasketAfterCrossSellInr = wonCount > 0 ? Math.round((totalBaseBasket + totalIncremental) / wonCount) : 0;

    // Catalog-Attributed Opportunity Value (Sum of lost and partial values for supported intents)
    let totalOpportunityValue = 0;
    for (const r of results) {
      if (r.opportunity_type !== 'UNSUPPORTED_CATEGORY') {
        totalOpportunityValue += r.catalog_attributed_opportunity_inr;
      }
    }

    // Loss Reasons Breakdown
    const reasonMap = new Map<LostOpportunityReasonCode, { count: number; opportunity: number }>();
    let totalLossEvents = 0;

    for (const r of results) {
      if (r.loss_reason_code && r.opportunity_type !== 'UNSUPPORTED_CATEGORY') {
        totalLossEvents++;
        const prev = reasonMap.get(r.loss_reason_code) || { count: 0, opportunity: 0 };
        prev.count++;
        prev.opportunity += r.catalog_attributed_opportunity_inr;
        reasonMap.set(r.loss_reason_code, prev);
      }
    }

    const lossLabels: Record<LostOpportunityReasonCode, string> = {
      MISSING_ATTRIBUTE: 'Missing Product Attributes',
      AMBIGUOUS_ATTRIBUTE: 'Ambiguous Product Values',
      CATEGORY_MISMATCH: 'Unsupported Category',
      VARIANT_MISMATCH: 'Variant Incompatibility',
      BUDGET_MISMATCH: 'Budget Ceilings Below Inventory',
      GPU_MISMATCH: 'High-Demand GPU Unmet',
      RAM_MISMATCH: 'High-Memory RAM Unmet',
      STORAGE_MISMATCH: 'Storage Capacity Unmet',
      COMPATIBILITY_FAILURE: 'Accessory Compatibility Failure',
      OUT_OF_STOCK: 'Out-of-Stock Catalog Inventory',
      PRICE_MISMATCH: 'Entry-Price Boundary Unmet',
      INSUFFICIENT_VERIFICATION: 'Unverified Technical Claims',
      NO_RELEVANT_PRODUCT: 'No Relevant Catalog Inventory'
    };

    const lossReasonsBreakdown: LossReasonMetrics[] = [];
    for (const [code, data] of reasonMap.entries()) {
      lossReasonsBreakdown.push({
        code,
        label: lossLabels[code] || code,
        count: data.count,
        percentage: totalLossEvents > 0 ? Number(((data.count / totalLossEvents) * 100).toFixed(1)) : 0,
        catalog_attributed_opportunity_inr: data.opportunity
      });
    }

    lossReasonsBreakdown.sort((a, b) => b.count - a.count);

    return {
      run_id: `run_${Date.now()}`,
      benchmark_version: benchmarkVersion,
      catalog_version: catalogVersion,
      timestamp: new Date().toISOString(),
      total_intents: totalIntents,
      supported_intents: supportedIntents,
      unsupported_intents: unsupportedIntents,
      won_count: wonCount,
      partial_count: partialCount,
      lost_count: lostCount,
      product_match_rate: productMatchRate,
      hard_constraint_adherence: hardConstraintAdherence,
      variant_accuracy_rate: variantAccuracyRate,
      compatibility_success_rate: compatibilitySuccessRate,
      simulated_acceptance_rate: simulatedAcceptanceRate,
      checkout_ready_rate: checkoutReadyRate,
      eligible_cross_sells_count: eligibleCrossSellsCount,
      over_budget_cross_sells_count: overBudgetCrossSellsCount,
      simulated_cross_sells_accepted_count: simulatedCrossSellsAcceptedCount,
      avg_base_basket_inr: avgBaseBasketInr,
      avg_basket_after_cross_sell_inr: avgBasketAfterCrossSellInr,
      incremental_basket_value_inr: totalIncremental,
      catalog_attributed_opportunity_value_inr: totalOpportunityValue,
      loss_reasons_breakdown: lossReasonsBreakdown,
      results
    };
  }
}
