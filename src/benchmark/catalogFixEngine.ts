import type { Product, LaptopProduct, MouseProduct } from '../types/catalog.ts';
import { ALL_PRODUCTS } from '../data/catalog.ts';
import { InMemoryCatalogRepository, type ICatalogRepository } from '../repository/catalogRepository.ts';
import type { CatalogFixAction, BenchmarkRunSummary } from '../types/benchmark.ts';

/**
 * CATALOG FIX RECOMMENDATION ENGINE (Track 01):
 * Identifies catalog flaws from benchmark results, attaches authoritative verified manufacturer data,
 * calculates deterministic priority ranking, and enforces an explicit merchant approval gate.
 *
 * NON-NEGOTIABLE RULE:
 * The system NEVER invents factual attributes. Values must originate from verified merchant
 * manufacturer documentation or explicit merchant authorization.
 */
export class CatalogFixEngine {
  private pendingFixes: Map<string, CatalogFixAction>;
  private approvedFixes: Map<string, CatalogFixAction>;

  constructor() {
    this.pendingFixes = new Map();
    this.approvedFixes = new Map();
    this.initializeAuthoritativeFixCandidates();
  }

  private initializeAuthoritativeFixCandidates() {
    // Fix 1: AlphaBook 14 - RAM capacity missing
    // Sourced from: Intel Core i5-1335U Platform Spec Sheet & Nexora QA Spec #NX-QA-2026-LP14
    this.pendingFixes.set('FIX-RAM-01', {
      fix_id: 'FIX-RAM-01',
      issue_id: 'ISSUE-RAM-ALPHA14',
      sku: 'NX-LP-MINRAMMISS-14',
      product_name: 'Nexora AlphaBook 14',
      field_path: 'ram.capacity_gb',
      current_value: null,
      proposed_value: 16,
      source_label: 'Manufacturer Spec Sheet (Intel i5-1335U Platform Spec #NX-QA-2026-LP14)',
      source_status: 'MERCHANT_VERIFIED',
      affected_intents_count: 5,
      opportunity_value_inr: 290000,
      priority_score: 0, // calculated dynamically
      severity_weight: 1.5, // Hard constraint blocker
      ease_factor: 1.0,     // Instant metadata update
      expected_effect: 'Allows deterministic decision engine to verify 16GB RAM hard constraint for developer queries.',
      status: 'PENDING'
    });

    // Fix 2: EdgeBook 14 - Display brightness nits missing
    // Sourced from: BOE 14.0" 2240x1400 IPS Panel Specification Datasheet Rev 2.1
    this.pendingFixes.set('FIX-BRIGHT-02', {
      fix_id: 'FIX-BRIGHT-02',
      issue_id: 'ISSUE-BRIGHT-EDGE14',
      sku: 'NX-LP-EDGE14-10',
      product_name: 'Nexora EdgeBook 14',
      field_path: 'display.brightness_nits',
      current_value: null,
      proposed_value: 350,
      source_label: 'BOE 14.0" IPS Panel Datasheet Rev 2.1 (Verified 350 nits peak)',
      source_status: 'MERCHANT_VERIFIED',
      affected_intents_count: 4,
      opportunity_value_inr: 274000,
      priority_score: 0,
      severity_weight: 1.2,
      ease_factor: 1.0,
      expected_effect: 'Restores outdoor visibility verification for creator and travel buyer requests.',
      status: 'PENDING'
    });

    // Fix 3: BasicClick B1 - Dongle type ambiguous
    // Sourced from: Nexora Peripheral Component Bill of Materials #NX-BOM-MS05
    this.pendingFixes.set('FIX-DONGLE-03', {
      fix_id: 'FIX-DONGLE-03',
      issue_id: 'ISSUE-DONGLE-BASIC05',
      sku: 'NX-MS-AMBIG-05',
      product_name: 'Nexora BasicClick B1',
      field_path: 'dongle_type',
      current_value: null,
      proposed_value: 'USB-A',
      source_label: 'Hardware Packaging & Component Bill of Materials #NX-BOM-MS05',
      source_status: 'MERCHANT_VERIFIED',
      affected_intents_count: 3,
      opportunity_value_inr: 2097,
      priority_score: 0,
      severity_weight: 1.1,
      ease_factor: 1.0,
      expected_effect: 'Enables port compatibility verification for laptops with USB-A ports.',
      status: 'PENDING'
    });

    // Fix 4: SwiftBook 14 - Out of Stock
    // Sourced from: Inbound Warehouse Delivery Receipt #WH-BLR-8812 (10 units received)
    this.pendingFixes.set('FIX-STOCK-04', {
      fix_id: 'FIX-STOCK-04',
      issue_id: 'ISSUE-STOCK-SWIFT08',
      sku: 'NX-LP-OOS-08',
      product_name: 'Nexora SwiftBook 14',
      field_path: 'stock_quantity',
      current_value: 0,
      proposed_value: 10,
      source_label: 'Warehouse Inbound Inventory Receipt #WH-BLR-8812 (10 units verified in stock)',
      source_status: 'MERCHANT_VERIFIED',
      affected_intents_count: 6,
      opportunity_value_inr: 381000,
      priority_score: 0,
      severity_weight: 1.6, // Stock blocker
      ease_factor: 0.9,
      expected_effect: 'Unlocks SwiftBook 14 for student and travel buyers requesting Ryzen 5 ultralight laptops.',
      status: 'PENDING'
    });
  }

  /**
   * Re-evaluates priority scores dynamically based on actual benchmark results:
   * Priority Score = (Affected Intents * 10) + (Opportunity Value / 10,000) * Severity Weight * Ease Factor
   */
  public updateFixMetricsFromBenchmark(summary: BenchmarkRunSummary): CatalogFixAction[] {
    const actions = Array.from(this.pendingFixes.values());

    for (const action of actions) {
      // Find matching benchmark failures targeting this product or failure code
      const matching = summary.results.filter((r) => {
        return (
          r.rejection_reasons.some((rej) => rej.includes(action.sku)) ||
          r.query.toLowerCase().includes(action.product_name.toLowerCase()) ||
          (action.sku === 'NX-LP-MINRAMMISS-14' && r.loss_reason_code === 'MISSING_ATTRIBUTE') ||
          (action.sku === 'NX-LP-EDGE14-10' && r.loss_reason_code === 'MISSING_ATTRIBUTE') ||
          (action.sku === 'NX-MS-AMBIG-05' && r.loss_reason_code === 'AMBIGUOUS_ATTRIBUTE') ||
          (action.sku === 'NX-LP-OOS-08' && r.loss_reason_code === 'OUT_OF_STOCK')
        );
      });

      if (matching.length > 0) {
        action.affected_intents_count = matching.length;
        action.opportunity_value_inr = matching.reduce((sum, r) => sum + r.catalog_attributed_opportunity_inr, 0);
      }

      // Calculate deterministic priority score
      const baseIntentScore = action.affected_intents_count * 10;
      const opportunityScore = action.opportunity_value_inr / 10000;
      action.priority_score = Number(
        (baseIntentScore + opportunityScore * action.severity_weight * action.ease_factor).toFixed(1)
      );
    }

    actions.sort((a, b) => b.priority_score - a.priority_score);
    return actions;
  }

  public getPendingFixes(): CatalogFixAction[] {
    return Array.from(this.pendingFixes.values()).filter((f) => f.status === 'PENDING');
  }

  public getApprovedFixes(): CatalogFixAction[] {
    return Array.from(this.approvedFixes.values());
  }

  /**
   * MERCHANT APPROVAL GATE:
   * Explicit action required by merchant before modifying any product data.
   */
  public approveFix(fixId: string): { success: boolean; fix?: CatalogFixAction; error?: string } {
    const fix = this.pendingFixes.get(fixId);
    if (!fix) {
      return { success: false, error: `Fix action "${fixId}" not found.` };
    }

    fix.status = 'APPROVED';
    this.approvedFixes.set(fixId, fix);
    return { success: true, fix };
  }

  /**
   * Creates an isolated Catalog Version B incorporating all approved fixes.
   * Catalog Version A remains pristine and unmodified.
   */
  public createVersionBCatalog(baseProducts: Product[] = ALL_PRODUCTS): {
    repo: ICatalogRepository;
    catalog_version: string;
    applied_fixes: string[];
  } {
    // Deep clone base catalog products
    const clonedProducts: Product[] = JSON.parse(JSON.stringify(baseProducts));
    const appliedFixes: string[] = [];

    for (const [fixId, fix] of this.approvedFixes.entries()) {
      const prod = clonedProducts.find((p) => p.sku === fix.sku);
      if (prod) {
        this.applyFieldPatch(prod, fix.field_path, fix.proposed_value);
        appliedFixes.push(fixId);
      }
    }

    const versionBRepo = new InMemoryCatalogRepository(clonedProducts);
    const fixLabel = appliedFixes.length > 0 ? `+${appliedFixes.join('+')}` : '';
    return {
      repo: versionBRepo,
      catalog_version: `Catalog-v1.1-Enriched${fixLabel}`,
      applied_fixes: appliedFixes
    };
  }

  /**
   * Creates an isolated Catalog Version B with EXACTLY the specified fix IDs.
   * Used for single-fix causal experiment runs.
   * Catalog Version A remains pristine and unmodified.
   *
   * @param fixIds - The exact set of fix_ids to apply. Each must be APPROVED.
   */
  public createVersionBCatalogWithFixes(fixIds: string[], baseProducts: Product[] = ALL_PRODUCTS): {
    repo: ICatalogRepository;
    catalog_version: string;
    applied_fixes: string[];
  } {
    const clonedProducts: Product[] = JSON.parse(JSON.stringify(baseProducts));
    const appliedFixes: string[] = [];

    for (const fixId of fixIds) {
      const fix = this.approvedFixes.get(fixId);
      if (!fix) continue;
      const prod = clonedProducts.find((p) => p.sku === fix.sku);
      if (prod) {
        this.applyFieldPatch(prod, fix.field_path, fix.proposed_value);
        appliedFixes.push(fixId);
      }
    }

    const versionBRepo = new InMemoryCatalogRepository(clonedProducts);
    const fixLabel = appliedFixes.length === 1 ? appliedFixes[0] : appliedFixes.join(' + ');
    return {
      repo: versionBRepo,
      catalog_version: `Catalog-v1.0 + ${fixLabel}`,
      applied_fixes: appliedFixes
    };
  }

  private applyFieldPatch(product: Product, fieldPath: string, value: any) {
    const parts = fieldPath.split('.');
    let curr: any = product;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]]) curr[parts[i]] = {};
      curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = value;
  }
}

let globalFixEngine: CatalogFixEngine | null = null;

export function getCatalogFixEngine(): CatalogFixEngine {
  if (!globalFixEngine) {
    globalFixEngine = new CatalogFixEngine();
  }
  return globalFixEngine;
}
