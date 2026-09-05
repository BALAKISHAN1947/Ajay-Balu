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

export interface LatencyTimings {
  t1_frontend_start?: number;
  t2_server_received: number;
  t3_groq_intent_start?: number;
  t4_groq_intent_received?: number;
  t5_engine_start?: number;
  t6_engine_completed?: number;
  t7_groq_explanation_start?: number;
  t8_groq_explanation_completed?: number;
  t9_server_completed: number;

  llm_intent_ms?: number;
  deterministic_engine_ms?: number;
  llm_explanation_ms?: number;
  total_server_ms: number;
  frontend_roundtrip_ms?: number;
}

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
  candidate_brands_considered?: string[];
  selected_accessory_skus?: string[];
  errors?: string[];
  execution_time_ms: number;
  timings?: LatencyTimings;
}
