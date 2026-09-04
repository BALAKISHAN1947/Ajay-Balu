import type { CustomerIntent } from './intent.ts';
import type { RecommendationResult, LockedVariant } from './recommendation.ts';
import type { AgentState } from './agent.ts';

export interface AuditEvent {
  event_id: string;
  session_id: string;
  timestamp: string;
  type:
    | 'SESSION_STARTED'
    | 'USER_MESSAGE_RECEIVED'
    | 'INTENT_PARSED'
    | 'CLARIFICATION_REQUESTED'
    | 'RECOMMENDATION_GENERATED'
    | 'VALID_MATCH_RECORDED'
    | 'PARTIAL_MATCH_RECORDED'
    | 'NO_PRODUCT_MATCH_RECORDED'
    | 'NO_CATEGORY_MATCH_RECORDED'
    | 'PRODUCT_SELECTED'
    | 'ACCESSORY_SELECTED'
    | 'ACCESSORY_REMOVED'
    | 'BUDGET_UPDATED'
    | 'PURCHASE_REVIEW_OPENED'
    | 'PURCHASE_REVIEW_BLOCKED_OVER_BUDGET'
    | 'INCOMPATIBLE_ACCESSORY_BLOCKED'
    | 'PURCHASE_APPROVED'
    | 'CHECKOUT_VALIDATION_STARTED'
    | 'CHECKOUT_VALIDATION_FAILED'
    | 'RAZORPAY_ORDER_CREATED'
    | 'PAYMENT_STARTED'
    | 'PAYMENT_CANCELLED'
    | 'PAYMENT_FAILED'
    | 'PAYMENT_SIGNATURE_VERIFIED'
    | 'PAYMENT_SIGNATURE_REJECTED'
    | 'WEBHOOK_RECEIVED'
    | 'WEBHOOK_REJECTED'
    | 'DUPLICATE_WEBHOOK_IGNORED'
    | 'PAYMENT_STATUS_VERIFIED'
    | 'ORDER_PAID'
    | 'ORDER_CONFIRMED';
  payload?: Record<string, any>;
}

export interface ChatMessage {
  message_id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  state?: AgentState;
  clarification_question?: string;
}

export interface PurchaseReviewLineItem {
  sku: string;
  name: string;
  category: string;
  price_inr: number;
}

export interface PurchaseReview {
  session_id: string;
  created_at: string;
  customer_budget_inr: number;
  final_total_inr: number;
  budget_margin_inr: number;
  basket_hash: string;
  primary_product: {
    sku: string;
    name: string;
    variant_id: string;
    price_inr: number;
    stock: number;
    in_stock: boolean;
    ram_summary: string;
    storage_summary: string;
    weight_g: number;
    battery_wh: number;
  };
  accessories: Array<{
    sku: string;
    name: string;
    category: string;
    price_inr: number;
    stock: number;
    in_stock: boolean;
    compatibility_status: boolean;
    compatibility_reason: string;
  }>;
  line_items: PurchaseReviewLineItem[];
  verified_trade_offs: string[];
  audit_events_count: number;
  gate_status: 'AUTHORIZED_PENDING_GATEWAY' | 'BLOCKED_OVER_BUDGET';
  is_over_budget?: boolean;
  over_budget_by_inr?: number;
}

export interface Session {
  session_id: string;
  created_at: string;
  updated_at: string;
  current_state: AgentState;
  messages: ChatMessage[];
  current_intent: CustomerIntent | null;
  latest_recommendation: RecommendationResult | null;
  selected_accessory_skus: string[];
  audit_events: AuditEvent[];
  active_approval_id?: string;
  active_basket_hash?: string;
  current_order_id?: string;
}

export interface ProductComparisonResult {
  primary: {
    sku: string;
    name: string;
    price_inr: number;
    weight_g: number;
    ram_summary: string;
    storage_summary: string;
    battery_wh: number;
    screen_size_inch: number;
  };
  alternative: {
    sku: string;
    name: string;
    price_inr: number;
    weight_g: number;
    ram_summary: string;
    storage_summary: string;
    battery_wh: number;
    screen_size_inch: number;
    rejection_reason?: string;
  };
  factual_differences: string[];
}
