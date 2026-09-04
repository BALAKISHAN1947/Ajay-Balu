import type { CustomerIntent } from './intent.ts';
import type { RecommendationResult } from './recommendation.ts';

export type MatchType =
  | 'VALID_MATCH'
  | 'PARTIAL_MATCH'
  | 'NO_PRODUCT_MATCH'
  | 'NO_CATEGORY_MATCH';

export type AgentState =
  | 'DISCOVERY'
  | 'INTENT_PARSED'
  | 'CLARIFICATION_REQUIRED'
  | 'RECOMMENDATION_READY'
  | 'VALID_MATCH'
  | 'PARTIAL_MATCH'
  | 'NO_PRODUCT_MATCH'
  | 'NO_CATEGORY_MATCH'
  | 'NO_MATCH'
  | 'INVALID_BUDGET_INPUT'
  | 'ERROR';

export interface AgentResponse {
  session_id: string;
  state: AgentState;
  match_type?: MatchType;
  user_query: string;
  intent: CustomerIntent | null;
  clarification_question?: string;
  recommendation?: RecommendationResult;
  explanation?: string;
  unsupported_category?: string;
  supported_categories?: string[];
  unfulfilled_constraints?: string[];
  errors?: string[];
  execution_time_ms: number;
}
