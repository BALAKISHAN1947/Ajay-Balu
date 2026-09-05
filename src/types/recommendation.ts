import type { LaptopProduct, ProductCategory } from './catalog.ts';
import type { CompatibilityResult } from './compatibility.ts';

export interface RejectionLog {
  sku: string;
  name?: string;
  category: ProductCategory;
  rule: string;
  actual: string | number | boolean | null;
  required: string | number | boolean | null;
  reason: string;
}

export interface ComponentScores {
  portability: number;
  battery: number;
  longevity: number;
}

export interface ScoredLaptop {
  product: LaptopProduct;
  total_score: number;
  component_scores: ComponentScores;
  trade_offs: string[];
}

export interface LockedVariant {
  sku: string;
  variant_id: string;
  name: string;
  price_inr: number;
  stock_quantity: number;
  ram_summary: string;
  storage_summary: string;
}

export interface BundleItem {
  sku: string;
  category: ProductCategory;
  name: string;
  price_inr: number;
  compatibility_evidence?: string;
}

export type RecommendationStatus =
  | 'SUCCESS'
  | 'VALID_MATCH'
  | 'PARTIAL_MATCH'
  | 'NO_PRODUCT_MATCH'
  | 'NO_CATEGORY_MATCH'
  | 'NO_MATCH';

export interface ClosestOption {
  type: 'CHEAPEST_SATISFYING_SPEC' | 'CLOSEST_TO_BUDGET' | 'BALANCED_COMPROMISE' | 'SAME_BRAND_ALTERNATIVE';
  label: string;
  sku: string;
  name: string;
  price_inr: number;
  ram_gb: number | null;
  storage_gb?: number;
  budget_delta_inr: number;
  unmet_constraints: string[];
  trade_off: string;
}

export interface ConstraintAnalysis {
  requested: {
    budget_ceiling_inr?: number;
    min_ram_gb?: number;
    min_storage_gb?: number;
    max_weight_g?: number;
  };
  failed_constraints: string[];
  counts: {
    total_active_in_stock: number;
    satisfying_budget: number;
    satisfying_ram: number;
    satisfying_storage: number;
    satisfying_weight: number;
  };
  failure_summary_points: string[];
  closest_options: ClosestOption[];
  trade_off_options: string[];
}

export type CrossSellState =
  | 'ELIGIBLE_CROSS_SELL'
  | 'COMPATIBLE_BUT_OVER_BUDGET'
  | 'INELIGIBLE';

export interface ProactiveAddOn {
  sku: string;
  name: string;
  category: 'mouse' | 'bag';
  price_inr: number;
  current_total_inr: number;
  new_total_inr: number;
  incremental_value_inr: number;
  is_within_budget: boolean;
  budget_delta_inr?: number;
  state: CrossSellState;
  compatibility_reason: string;
  relevance_reason: string;
}

export interface RecommendationResult {
  status: RecommendationStatus;
  match_type?: 'VALID_MATCH' | 'PARTIAL_MATCH' | 'NO_PRODUCT_MATCH' | 'NO_CATEGORY_MATCH';
  recommended_laptop: ScoredLaptop | null;
  locked_variant: LockedVariant | null;
  accessories: BundleItem[];
  itemized_line_items: Array<{ sku: string; name: string; price_inr: number }>;
  total_price_inr: number;
  budget_ceiling_inr: number;
  budget_margin_inr: number;
  reasons: string[];
  trade_offs: string[];
  rejections: RejectionLog[];
  compatibility_checks: CompatibilityResult[];
  confidence_score: number;
  unsupported_category?: string;
  supported_categories?: string[];
  unfulfilled_constraints?: string[];
  constraint_analysis?: ConstraintAnalysis;
  proactive_add_ons?: ProactiveAddOn[];
  candidate_brands_considered?: string[];
}

