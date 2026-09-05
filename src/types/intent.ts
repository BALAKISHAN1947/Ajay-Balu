import type { ProductCategory } from './catalog.ts';

export interface HardConstraints {
  max_total_budget?: number;
  max_laptop_price?: number;
  min_ram_gb?: number;
  min_storage_gb?: number;
  in_stock_only?: boolean;
  max_weight_g?: number; // when weight is an absolute hard limit
  gpu_model?: string;
  min_vram_gb?: number;
  requires_dedicated_gpu?: boolean;
}

export interface SoftPreferenceWeights {
  portability: number; // e.g. 0.40
  battery: number;     // e.g. 0.35
  longevity: number;   // e.g. 0.25
}

export interface SoftPreferences {
  max_preferred_weight_g?: number; // e.g. 1400g
  min_preferred_battery_wh?: number; // e.g. 55Wh
  prefer_expandable_ram?: boolean;
  prefer_expandable_storage?: boolean;
  prefer_bluetooth_mouse?: boolean;
  preferred_bag_type?: 'backpack' | 'messenger' | 'sleeve';
  weights: SoftPreferenceWeights;
}

export interface BudgetSpecification {
  currency: string;
  total_ceiling?: number;
  is_hard_ceiling: boolean;
  raw_expression?: string;
}

export interface AmbiguousField {
  field: string;
  reason: string;
  clarification_question?: string;
  is_critical: boolean;
}

export interface CustomerIntent {
  intent_id?: string;
  raw_query?: string;
  target_workload?: string;
  requested_brand?: string;
  requested_model?: string;
  required_categories: ProductCategory[];
  requested_category_raw?: string;
  unsupported_categories?: string[];
  is_category_supported?: boolean;
  budget?: BudgetSpecification;
  hard_constraints: HardConstraints;
  soft_preferences: SoftPreferences;
  compatibility_requirements?: {
    bag_must_fit_laptop: boolean;
    mouse_must_interface_without_adapters: boolean;
  };
  ambiguous_fields?: AmbiguousField[];
  follow_up_action?: FollowUpAction;
  reference_target?: ReferenceTarget;
  target_sku?: string;
  target_option_index?: number;
}

export type FollowUpAction =
  | 'SELECT_PREVIOUS_RECOMMENDATION'
  | 'SELECT_PREVIOUS_OPTION'
  | 'SELECT_PRODUCT'
  | 'REFINE_PREVIOUS_REQUEST'
  | 'NONE';

export type ReferenceTarget =
  | 'previous_recommendation'
  | 'first_option'
  | 'second_option'
  | 'cheaper_option'
  | 'selected_product'
  | 'none';
