export type OrderStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'
  | 'PAID'
  | 'COMPLETED';

export interface OrderItemSnapshot {
  sku: string;
  name: string;
  category: string;
  price_inr: number;
}

export interface ApprovalRecord {
  approval_id: string;
  session_id: string;
  intent_id?: string;
  basket_hash: string;
  sku_list: string[];
  variant_id: string;
  total_price_inr: number;
  approved_at: string;
  expires_at?: string;
}

export interface InternalOrder {
  internal_order_id: string;
  session_id: string;
  intent_id?: string;
  approval_id: string;
  basket_hash: string;
  sku_snapshot: string[];
  variant_snapshot: string;
  line_items: OrderItemSnapshot[];
  amount_inr: number;
  amount_paise: number;
  currency: 'INR';
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  status: OrderStatus;
  stock_decremented: boolean;
  failure_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderResult {
  internal_order_id: string;
  razorpay_order_id: string;
  razorpay_key_id: string;
  amount: number; // in paise for Razorpay
  currency: 'INR';
}

export interface VerifyPaymentPayload {
  session_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
