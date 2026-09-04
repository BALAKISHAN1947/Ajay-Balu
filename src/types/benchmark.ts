import type { ProductCategory } from './catalog.ts';
import type { AgentState, MatchType } from './agent.ts';

/**
 * REVENUE OPTIMIZATION GUARDRAIL (Track 01):
 * "AgentReady may optimize merchant revenue only through better intent matching,
 * truthful product information, relevant compatible cross-sell, better decision support,
 * and successful authorized transactions. It may never manipulate the customer or override customer constraints."
 *
 * EXTERNAL AI LIMITATION:
 * "AgentReady does not observe or control rankings from ChatGPT, Gemini, Perplexity, or other external AI systems.
 * The benchmark is a controlled simulation of buyer intent against Nexora's catalog."
 */

export type OpportunityType = 'WON' | 'PARTIAL' | 'LOST' | 'UNSUPPORTED_CATEGORY';

export type LostOpportunityReasonCode =
  | 'MISSING_ATTRIBUTE'
  | 'AMBIGUOUS_ATTRIBUTE'
  | 'CATEGORY_MISMATCH'
  | 'VARIANT_MISMATCH'
  | 'BUDGET_MISMATCH'
  | 'GPU_MISMATCH'
  | 'RAM_MISMATCH'
  | 'STORAGE_MISMATCH'
  | 'COMPATIBILITY_FAILURE'
  | 'OUT_OF_STOCK'
  | 'PRICE_MISMATCH'
  | 'INSUFFICIENT_VERIFICATION'
  | 'NO_RELEVANT_PRODUCT';

export type IntentGroup =
  | 'developer'
  | 'gaming'
  | 'student_budget'
  | 'travel_portability'
  | 'creator'
  | 'office_workspace'
  | 'comparison'
  | 'bundle_accessory';

export interface ExpectedHardConstraints {
  budget_max?: number;
  min_ram_gb?: number;
  min_storage_gb?: number;
  max_weight_g?: number;
  gpu_model?: string;
  min_vram_gb?: number;
  requires_dedicated_gpu?: boolean;
  in_stock_only?: boolean;
}

export interface ExpectedDecisionCharacteristics {
  expected_outcome: OpportunityType;
  expected_loss_reason?: LostOpportunityReasonCode;
  target_sku?: string;
  notes?: string;
}

export interface BenchmarkValidationError {
  status: 'INVALID_BENCHMARK_DATA';
  benchmark_id: string;

  field: string;
  reason: string;
}

export type BenchmarkIntentValidationResult =
  | {
    valid: true;
    status?: undefined;
    benchmark_id?: undefined;
    field?: undefined;
    reason?: undefined;
    error?: undefined;
  }
  | {
    valid: false;
    status: 'INVALID_BENCHMARK_DATA';
    benchmark_id: string;
    field: string;
    reason: string;
    error: BenchmarkValidationError;
  };

export interface BenchmarkIntent {
  benchmark_id: string;
  natural_language_query: string;
  group: IntentGroup;
  expected_category: ProductCategory | 'unsupported';
  expected_hard_constraints: ExpectedHardConstraints;
  expected_soft_preferences: Record<string, any>;
  requested_accessories: ('mouse' | 'bag')[];
  expected_decision_characteristics: ExpectedDecisionCharacteristics;
  benchmark_version: string;
}

export interface BenchmarkResult {
  benchmark_id: string;
  query: string;
  group: IntentGroup;
  status: 'WON' | 'PARTIAL' | 'LOST' | 'UNSUPPORTED';
  match_state: MatchType | AgentState;
  opportunity_type: OpportunityType;
  selected_sku: string | null;
  selected_name: string | null;
  selected_variant: string | null;
  matched_product_sku?: string | null;
  matched_sku?: string | null;
  closest_product_sku?: string | null;
  closest_sku?: string | null;
  closest_product_name?: string | null;
  closest_product_unmet_reasons?: string[];
  hard_constraints: Record<string, any>;
  satisfied_constraints: string[];
  unsatisfied_constraints: string[];
  unmet_constraints?: string[];
  trade_offs?: string[];
  explanation?: string;
  compatibility_passed: string[];
  compatibility_failed: string[];
  cross_sell_candidates: string[];
  eligible_cross_sells: string[];
  over_budget_cross_sells: string[];
  checkout_eligible: boolean;
  basket_total_inr: number;
  rejection_reasons: string[];
  loss_reason_code?: LostOpportunityReasonCode;
  loss_reason_detail?: string;
  loss_reason_description?: string;
  catalog_attributed_opportunity_inr: number;
  opportunity_value_inr?: number;
  simulated_acceptance: boolean;
  simulated_cross_sell_accepted: boolean;
  incremental_basket_inr: number;
  intent?: BenchmarkIntent;
}

export interface LossReasonMetrics {
  code: LostOpportunityReasonCode;
  label: string;
  count: number;
  percentage: number;
  catalog_attributed_opportunity_inr: number;
}

export interface BenchmarkRunSummary {
  run_id: string;
  benchmark_version: string;
  catalog_version: string;
  timestamp: string;
  total_intents: number;
  supported_intents: number;
  unsupported_intents: number;
  won_count: number;
  partial_count: number;
  lost_count: number;
  product_match_rate: number;          // WON / supported_intents
  hard_constraint_adherence: number;   // Satisfied checks / total evaluated checks
  variant_accuracy_rate: number;       // Selected variants matching required specs
  compatibility_success_rate: number;  // Passed compatibility checks / required checks
  simulated_acceptance_rate: number;   // Simulated acceptance proportion
  checkout_ready_rate: number;         // Checkout-ready proportion
  eligible_cross_sells_count: number;
  over_budget_cross_sells_count: number;
  simulated_cross_sells_accepted_count: number;
  avg_base_basket_inr: number;
  avg_basket_after_cross_sell_inr: number;
  incremental_basket_value_inr: number;
  catalog_attributed_opportunity_value_inr: number;
  loss_reasons_breakdown: LossReasonMetrics[];
  results: BenchmarkResult[];
}

export interface CatalogIssue {
  issue_id: string;
  sku: string;
  product_name: string;
  category: ProductCategory;
  field_path: string;
  current_value: any;
  issue_type: 'MISSING_ATTRIBUTE' | 'AMBIGUOUS_VALUE' | 'OUT_OF_STOCK';
  description: string;
  verification_source?: string;
  verified_proposed_value?: any;
  source_status: 'UNVERIFIED' | 'MERCHANT_VERIFIED';
}

export interface CatalogFixAction {
  fix_id: string;
  issue_id: string;
  sku: string;
  product_name: string;
  field_path: string;
  current_value: any;
  proposed_value: any;
  source_label: string;
  source_status: 'UNVERIFIED' | 'MERCHANT_VERIFIED';
  affected_intents_count: number;
  opportunity_value_inr: number;
  priority_score: number;
  severity_weight: number;
  ease_factor: number;
  expected_effect: string;
  status: 'PENDING' | 'APPROVED';
}

export interface MetricDelta {
  before: number;
  after: number;
  delta: number;
  pct_change?: number;
}

/**
 * Per-benchmark-row reconciliation of opportunity value delta.
 * When the aggregate opportunity value changes between Version A and Version B,
 * every changed row is listed here so the UI can trace the delta to its source.
 * This is NOT "revenue recovered" — it is a change in the catalog-attributed
 * benchmark estimation only.
 */
export interface OpportunityValueDeltaSource {
  benchmark_id: string;
  query: string;
  before_opportunity_inr: number;
  after_opportunity_inr: number;
  delta_inr: number;
  before_outcome: OpportunityType;
  after_outcome: OpportunityType;
  /** Human-readable explanation of why the value changed */
  reason: string;
}

export interface ExperimentComparison {
  /** Unique identifier for this experiment run */
  experiment_id: string;
  /** Immutable baseline catalog version label */
  catalog_version_a: string;
  /** Enriched catalog version label */
  catalog_version_b: string;
  benchmark_version: string;
  /** The immutable baseline catalog version (never mutated) */
  baseline_catalog_version: string;
  /** The enriched catalog version label (includes fix IDs applied) */
  enriched_catalog_version: string;
  timestamp: string;
  /** All fix IDs present in Version B (may be more than one for multi-fix runs) */
  approved_fixes_applied: string[];
  /**
   * The single causal fix for an isolated one-fix experiment.
   * Null for multi-fix runs. Identifies exactly which fix caused Version B.
   */
  approved_fix_id: string | null;
  /**
   * True only when at least one buyer intent moved between outcome categories
   * (e.g. LOST→WON, PARTIAL→WON). False when all WON/PARTIAL/LOST counts
   * are identical between Version A and Version B.
   * MUST BE FALSE before any "opportunity recovered" language is shown.
   */
  has_outcome_changes: boolean;
  metrics: {
    product_match_rate: MetricDelta;
    variant_accuracy_rate: MetricDelta;
    compatibility_success_rate: MetricDelta;
    checkout_ready_rate: MetricDelta;
    simulated_acceptance_rate: MetricDelta;
    simulated_cross_sell_acceptance_rate: MetricDelta;
    catalog_attributed_opportunity_value_inr: MetricDelta;
    won_count: MetricDelta;
    lost_count: MetricDelta;
  };
  /** Only includes actual outcome changes (LOST→WON, PARTIAL→WON, etc.). SKU-only upgrades are excluded. */
  intent_transitions: Array<{
    benchmark_id: string;
    query: string;
    before_outcome: OpportunityType;
    after_outcome: OpportunityType;
    before_sku: string | null;
    after_sku: string | null;
    cause?: string;
    reason_improved?: string;
    before_status?: OpportunityType;
    after_status?: OpportunityType;
    reason?: string;
    /** The fix_id that caused this transition */
    caused_by_fix_id?: string | null;
    approved_fix_id?: string | null;
  }>;
  /**
   * Per-row reconciliation of any opportunity value delta.
   * Empty when the aggregate delta is zero. When non-empty, each entry
   * explains WHY the catalog-attributed opportunity value changed for a specific
   * benchmark row. Aggregate delta = sum of all delta_inr values here.
   */
  opportunity_value_delta_sources: OpportunityValueDeltaSource[];
}

