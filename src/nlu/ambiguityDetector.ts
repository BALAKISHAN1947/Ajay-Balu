import type { CustomerIntent, AmbiguousField } from '../types/intent.ts';

export interface AmbiguityDetectionResult {
  isAmbiguous: boolean;
  clarificationQuestion?: string;
  ambiguousField?: AmbiguousField;
}

/**
 * Evaluates whether a customer query has critical ambiguities that genuinely prevent
 * a safe, grounded recommendation.
 *
 * Policy:
 * 1. Non-critical preferences (e.g. "good battery", "light") do NOT block search.
 * 2. If budget and RAM are present, we have sufficient information to execute deterministic search.
 * 3. Maximum ONE specific, actionable clarification question per turn.
 */
export function detectAmbiguity(intent: CustomerIntent, rawQuery: string): AmbiguityDetectionResult {
  const lower = rawQuery.toLowerCase();

  // Case 0: Customer explicitly requested an unsupported category (e.g. "running shoes")
  // This is NOT ambiguous intent; it is a clear intent for an unsupported category.
  if (intent.unsupported_categories && intent.unsupported_categories.length > 0) {
    return {
      isAmbiguous: false
    };
  }

  // Case 0b: Follow-up conversational selection or reference is not ambiguous
  if ((intent.follow_up_action && intent.follow_up_action !== 'NONE') || Boolean(intent.target_sku)) {
    return {
      isAmbiguous: false
    };
  }

  // Case 1: No product categories could be determined
  if (!intent.required_categories || intent.required_categories.length === 0) {
    const question = 'Are you looking for a laptop, a workspace accessory (mouse, bag), or a complete bundle?';
    return {
      isAmbiguous: true,
      clarificationQuestion: question,
      ambiguousField: {
        field: 'required_categories',
        reason: 'Customer query did not specify whether they need a laptop, mouse, or bag.',
        clarification_question: question,
        is_critical: true
      }
    };
  }

  // Case 2: Broad query with zero constraints (e.g., "laptop for work" or "show me laptops")
  const hasBudget = intent.hard_constraints.max_total_budget !== undefined || intent.budget?.total_ceiling !== undefined;
  const hasRam = intent.hard_constraints.min_ram_gb !== undefined;
  const hasWorkload = intent.target_workload !== undefined && intent.target_workload !== 'work';

  if (intent.required_categories.includes('laptop') && !hasBudget && !hasRam && !hasWorkload) {
    // Check if query is generic without budget or workload
    if (/\b(laptop for work|need a laptop|looking for a laptop|show me laptops|help me choose|don't know anything|dont know anything|choose a laptop)\b/i.test(lower)) {
      const question = 'To find the best match, what is your approximate budget ceiling and primary use case (e.g. coding with 16GB RAM, college studies, or office tasks)?';
      return {
        isAmbiguous: true,
        clarificationQuestion: question,
        ambiguousField: {
          field: 'budget_and_specs',
          reason: 'Query specifies laptop without budget ceiling or workload specifications.',
          clarification_question: question,
          is_critical: true
        }
      };
    }
  }

  // If query contains enough information (e.g. "coding laptop under 70k, 16GB"), proceed!
  return {
    isAmbiguous: false
  };
}
