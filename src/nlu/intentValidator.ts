import type { CustomerIntent, HardConstraints, SoftPreferences, BudgetSpecification, FollowUpAction, ReferenceTarget } from '../types/intent.ts';
import type { ProductCategory } from '../types/catalog.ts';

export interface ValidationResult {
  valid: boolean;
  intent?: CustomerIntent;
  errors: string[];
}

const VALID_CATEGORIES: ProductCategory[] = ['laptop', 'mouse', 'bag'];

/**
 * Validates untrusted LLM output or parsed JSON against the strict CustomerIntent schema.
 * Prevents malformed, incomplete, or hazardous payloads from entering the deterministic engine.
 */
export function validateCustomerIntent(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['Input is not a valid JSON object.'] };
  }

  const obj = input as Record<string, any>;

  // 1. Required categories validation
  if (!Array.isArray(obj.required_categories)) {
    errors.push('Field "required_categories" must be an array.');
  } else {
    for (const cat of obj.required_categories) {
      if (!VALID_CATEGORIES.includes(cat)) {
        errors.push(`Invalid category "${cat}". Allowed categories: ${VALID_CATEGORIES.join(', ')}.`);
      }
    }
  }

  // 2. Hard constraints validation
  const hard = obj.hard_constraints;
  if (!hard || typeof hard !== 'object' || Array.isArray(hard)) {
    errors.push('Field "hard_constraints" must be an object.');
  } else {
    if (hard.max_total_budget !== undefined) {
      if (typeof hard.max_total_budget !== 'number' || isNaN(hard.max_total_budget) || hard.max_total_budget <= 0) {
        errors.push('"hard_constraints.max_total_budget" must be a positive number.');
      } else if (hard.max_total_budget < 5000 && obj.required_categories?.length === 1 && obj.required_categories[0] === 'laptop') {
        errors.push('"hard_constraints.max_total_budget" is unrealistically low for a laptop (< ₹5,000).');
      }
    }

    if (hard.min_ram_gb !== undefined) {
      if (typeof hard.min_ram_gb !== 'number' || isNaN(hard.min_ram_gb) || hard.min_ram_gb < 4 || hard.min_ram_gb > 128) {
        errors.push('"hard_constraints.min_ram_gb" must be a number between 4 and 128.');
      }
    }

    if (hard.min_storage_gb !== undefined) {
      if (typeof hard.min_storage_gb !== 'number' || isNaN(hard.min_storage_gb) || hard.min_storage_gb < 128) {
        errors.push('"hard_constraints.min_storage_gb" must be a number >= 128.');
      }
    }

    if (hard.max_weight_g !== undefined) {
      if (typeof hard.max_weight_g !== 'number' || isNaN(hard.max_weight_g) || hard.max_weight_g < 500) {
        errors.push('"hard_constraints.max_weight_g" must be a valid weight in grams (> 500g).');
      }
    }

    if (hard.gpu_model !== undefined && typeof hard.gpu_model !== 'string') {
      errors.push('"hard_constraints.gpu_model" must be a string.');
    }

    if (hard.min_vram_gb !== undefined && (typeof hard.min_vram_gb !== 'number' || isNaN(hard.min_vram_gb) || hard.min_vram_gb <= 0)) {
      errors.push('"hard_constraints.min_vram_gb" must be a positive number.');
    }
  }

  // 3. Soft preferences validation
  const soft = obj.soft_preferences;
  if (!soft || typeof soft !== 'object' || Array.isArray(soft)) {
    errors.push('Field "soft_preferences" must be an object.');
  } else {
    const weights = soft.weights;
    if (!weights || typeof weights !== 'object') {
      errors.push('Field "soft_preferences.weights" must be an object containing "portability", "battery", and "longevity".');
    } else {
      for (const key of ['portability', 'battery', 'longevity'] as const) {
        if (typeof weights[key] !== 'number' || isNaN(weights[key]) || weights[key] < 0) {
          errors.push(`"soft_preferences.weights.${key}" must be a non-negative number.`);
        }
      }
    }
  }

  // 4. Budget object validation (if provided)
  if (obj.budget !== undefined && obj.budget !== null) {
    if (typeof obj.budget !== 'object' || Array.isArray(obj.budget)) {
      errors.push('"budget" must be an object if provided.');
    } else {
      if (typeof obj.budget.currency !== 'string') {
        errors.push('"budget.currency" must be a string (e.g. "INR").');
      }
      if (obj.budget.total_ceiling !== undefined && (typeof obj.budget.total_ceiling !== 'number' || obj.budget.total_ceiling <= 0)) {
        errors.push('"budget.total_ceiling" must be a positive number.');
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Normalize soft preference weights to sum to 1.0 if they slightly diverge
  const rawWeights = obj.soft_preferences.weights;
  const weightSum = rawWeights.portability + rawWeights.battery + rawWeights.longevity;
  const normalizedWeights = weightSum > 0
    ? {
        portability: Number((rawWeights.portability / weightSum).toFixed(4)),
        battery: Number((rawWeights.battery / weightSum).toFixed(4)),
        longevity: Number((rawWeights.longevity / weightSum).toFixed(4))
      }
    : { portability: 0.40, battery: 0.35, longevity: 0.25 };

  const validatedIntent: CustomerIntent = {
    intent_id: obj.intent_id ?? `intent_${Date.now()}`,
    raw_query: obj.raw_query ?? '',
    target_workload: obj.target_workload,
    requested_brand: typeof obj.requested_brand === 'string' ? obj.requested_brand : undefined,
    requested_model: typeof obj.requested_model === 'string' ? obj.requested_model : undefined,
    required_categories: obj.required_categories,
    requested_category_raw: obj.requested_category_raw,
    unsupported_categories: Array.isArray(obj.unsupported_categories) ? obj.unsupported_categories : [],
    is_category_supported: obj.is_category_supported ?? (obj.required_categories?.length > 0 && (!obj.unsupported_categories || obj.unsupported_categories.length === 0)),
    budget: (obj.budget && typeof obj.budget === 'object' && !Array.isArray(obj.budget))
      ? obj.budget
      : (hard.max_total_budget ? { currency: 'INR', total_ceiling: hard.max_total_budget, is_hard_ceiling: true } : undefined),
    hard_constraints: {
      max_total_budget: hard.max_total_budget,
      max_laptop_price: hard.max_laptop_price,
      min_ram_gb: hard.min_ram_gb,
      min_storage_gb: hard.min_storage_gb,
      in_stock_only: hard.in_stock_only ?? true,
      max_weight_g: hard.max_weight_g,
      gpu_model: hard.gpu_model,
      min_vram_gb: hard.min_vram_gb,
      requires_dedicated_gpu: hard.requires_dedicated_gpu
    },
    soft_preferences: {
      max_preferred_weight_g: soft.max_preferred_weight_g,
      min_preferred_battery_wh: soft.min_preferred_battery_wh,
      prefer_expandable_ram: soft.prefer_expandable_ram,
      prefer_expandable_storage: soft.prefer_expandable_storage,
      prefer_bluetooth_mouse: soft.prefer_bluetooth_mouse,
      preferred_bag_type: soft.preferred_bag_type,
      weights: normalizedWeights
    },
    compatibility_requirements: obj.compatibility_requirements ?? {
      bag_must_fit_laptop: true,
      mouse_must_interface_without_adapters: true
    },
    ambiguous_fields: obj.ambiguous_fields ?? [],
    follow_up_action: typeof obj.follow_up_action === 'string' ? (obj.follow_up_action as FollowUpAction) : undefined,
    reference_target: typeof obj.reference_target === 'string' ? (obj.reference_target as ReferenceTarget) : undefined,
    target_sku: typeof obj.target_sku === 'string' ? obj.target_sku : undefined,
    target_option_index: typeof obj.target_option_index === 'number' ? obj.target_option_index : undefined
  };

  return { valid: true, intent: validatedIntent, errors: [] };
}
