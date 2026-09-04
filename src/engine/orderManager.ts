import { SessionManager } from '../session/sessionManager.ts';
import { type ICatalogRepository, getCatalogRepository } from '../repository/catalogRepository.ts';
import { RazorpayService, getRazorpayService } from '../services/razorpayService.ts';
import { inrToPaise } from '../utils/currency.ts';
import { computeBasketHash } from '../utils/hash.ts';
import type { InternalOrder, ApprovalRecord, CreateOrderResult } from '../types/order.ts';

export class OrderManager {
  private orders: Map<string, InternalOrder> = new Map(); // internal_order_id -> order
  private ordersByRazorpayId: Map<string, InternalOrder> = new Map(); // razorpay_order_id -> order
  private approvals: Map<string, ApprovalRecord> = new Map(); // approval_id -> approval
  private processedWebhookEvents: Set<string> = new Set(); // event_id for idempotency
  private repo: ICatalogRepository;
  private razorpayService: RazorpayService;

  constructor(
    repo: ICatalogRepository = getCatalogRepository(),
    razorpayService: RazorpayService = getRazorpayService()
  ) {
    this.repo = repo;
    this.razorpayService = razorpayService;
  }

  public getOrder(orderId: string): InternalOrder | undefined {
    return this.orders.get(orderId);
  }

  public getOrderByRazorpayId(razorpayOrderId: string): InternalOrder | undefined {
    return this.ordersByRazorpayId.get(razorpayOrderId);
  }

  public getApproval(approvalId: string): ApprovalRecord | undefined {
    return this.approvals.get(approvalId);
  }

  /**
   * Helper to compute the authoritative basket details from active session.
   */
  public getAuthoritativeBasket(sessionManager: SessionManager, sessionId: string) {
    const session = sessionManager.getSession(sessionId);
    if (!session || !session.latest_recommendation || !session.latest_recommendation.recommended_laptop) {
      throw new Error('No active recommendation found for this session.');
    }

    const rec = session.latest_recommendation;
    const primary = rec.recommended_laptop!.product;
    const locked = rec.locked_variant!;

    const currentPrimary = this.repo.getProductBySku(primary.sku);
    if (!currentPrimary) {
      throw new Error(`Primary product ${primary.sku} no longer found in catalog.`);
    }

    const lineItems = [
      {
        sku: currentPrimary.sku,
        name: `${currentPrimary.name} (${locked.variant_id})`,
        category: 'laptop',
        price_inr: currentPrimary.price_inr
      }
    ];

    for (const accSku of session.selected_accessory_skus) {
      const accProd = this.repo.getProductBySku(accSku);
      if (!accProd) {
        throw new Error(`Accessory SKU ${accSku} no longer found in catalog.`);
      }
      lineItems.push({
        sku: accProd.sku,
        name: accProd.name,
        category: accProd.category,
        price_inr: accProd.price_inr
      });
    }

    const totalInr = lineItems.reduce((sum, it) => sum + it.price_inr, 0);
    const skus = lineItems.map((it) => it.sku);
    const basketHash = computeBasketHash({
      sessionId,
      intentId: session.current_intent?.intent_id,
      skus,
      variantId: locked.variant_id,
      totalInr
    });

    return {
      session,
      rec,
      primary: currentPrimary,
      locked,
      lineItems,
      totalInr,
      skus,
      basketHash
    };
  }

  /**
   * Explicit Customer Approval Gate.
   * Binds approval to the exact basket, intent, variants, SKUs, and calculated total.
   */
  public approvePurchase(sessionManager: SessionManager, sessionId: string): ApprovalRecord {
    const basket = this.getAuthoritativeBasket(sessionManager, sessionId);

    // Revalidate stock before granting approval
    if (basket.primary.stock_quantity <= 0) {
      throw new Error(`Selected laptop ${basket.primary.name} is currently out of stock.`);
    }

    for (const item of basket.lineItems) {
      const prod = this.repo.getProductBySku(item.sku);
      if (!prod || prod.stock_quantity <= 0) {
        throw new Error(`Item ${item.name} (${item.sku}) is currently out of stock.`);
      }
    }

    // Budget guard
    if (basket.totalInr > basket.rec.budget_ceiling_inr) {
      throw new Error(
        `Authoritative total (₹${basket.totalInr}) exceeds customer budget ceiling (₹${basket.rec.budget_ceiling_inr}).`
      );
    }

    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const approval: ApprovalRecord = {
      approval_id: approvalId,
      session_id: sessionId,
      intent_id: basket.session.current_intent?.intent_id,
      basket_hash: basket.basketHash,
      sku_list: basket.skus,
      variant_id: basket.locked.variant_id,
      total_price_inr: basket.totalInr,
      approved_at: now
    };

    this.approvals.set(approvalId, approval);

    // Bind to session
    basket.session.active_approval_id = approvalId;
    basket.session.active_basket_hash = basket.basketHash;

    sessionManager.addAuditEvent(sessionId, 'PURCHASE_APPROVED', {
      approval_id: approvalId,
      basket_hash: basket.basketHash,
      amount_inr: basket.totalInr,
      skus: basket.skus,
      variant_id: basket.locked.variant_id
    });

    return approval;
  }

  /**
   * Creates a Razorpay Order in Test Mode after strict multi-step validation.
   * Part 8:
   * 1. Load session.
   * 2. Confirm approval exists.
   * 3. Confirm approval belongs to current session.
   * 4. Confirm basket hash still matches.
   * 5. Confirm exact SKU/variant set matches.
   * 6. Revalidate current stock.
   * 7. Revalidate current price.
   * 8. Recalculate authoritative basket total.
   * 9. Confirm total does not exceed user's hard budget.
   * 10. Convert INR to paise.
   * 11. Create internal pending order record.
   * 12. Create Razorpay TEST MODE order.
   * 13. Store razorpay_order_id.
   * 14. Transition to PAYMENT_PENDING.
   * 15. Write audit event.
   */
  public async createPaymentOrder(
    sessionManager: SessionManager,
    sessionId: string,
    clientProvidedAmount?: any
  ): Promise<CreateOrderResult> {
    sessionManager.addAuditEvent(sessionId, 'CHECKOUT_VALIDATION_STARTED', {
      session_id: sessionId
    });

    // 1. Load session
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      sessionManager.addAuditEvent(sessionId, 'CHECKOUT_VALIDATION_FAILED', { reason: 'SESSION_NOT_FOUND' });
      throw new Error(`Session "${sessionId}" not found.`);
    }

    // 2. Confirm approval exists
    if (!session.active_approval_id) {
      sessionManager.addAuditEvent(sessionId, 'CHECKOUT_VALIDATION_FAILED', { reason: 'MISSING_APPROVAL' });
      throw new Error('Approval required: Purchase has not been authorized by customer.');
    }

    const approval = this.approvals.get(session.active_approval_id);
    if (!approval) {
      sessionManager.addAuditEvent(sessionId, 'CHECKOUT_VALIDATION_FAILED', { reason: 'INVALID_APPROVAL_RECORD' });
      throw new Error('Approval record not found or expired. Please re-authorize purchase.');
    }

    // 3. Confirm approval belongs to current session
    if (approval.session_id !== sessionId) {
      sessionManager.addAuditEvent(sessionId, 'CHECKOUT_VALIDATION_FAILED', { reason: 'APPROVAL_SESSION_MISMATCH' });
      throw new Error('Approval does not match active session.');
    }

    // 4 & 5. Recalculate authoritative basket & check hash
    const basket = this.getAuthoritativeBasket(sessionManager, sessionId);

    // 6. Revalidate current price
    if (basket.totalInr !== approval.total_price_inr) {
      sessionManager.addAuditEvent(sessionId, 'CHECKOUT_VALIDATION_FAILED', {
        reason: 'PRICE_CHANGED',
        approved_price: approval.total_price_inr,
        current_price: basket.totalInr
      });
      delete session.active_approval_id;
      delete session.active_basket_hash;
      throw new Error(
        `Catalog price changed from ₹${approval.total_price_inr} to ₹${basket.totalInr}. Fresh authorization required.`
      );
    }

    // 7. Confirm basket hash still matches
    if (basket.basketHash !== approval.basket_hash) {
      sessionManager.addAuditEvent(sessionId, 'CHECKOUT_VALIDATION_FAILED', {
        reason: 'BASKET_HASH_MISMATCH',
        approved_hash: approval.basket_hash,
        current_hash: basket.basketHash
      });
      // Invalidate stale approval
      delete session.active_approval_id;
      delete session.active_basket_hash;
      throw new Error('Basket has changed since authorization. Please review and re-authorize.');
    }

    // 8. Revalidate current stock
    for (const item of basket.lineItems) {
      const prod = this.repo.getProductBySku(item.sku);
      if (!prod || prod.stock_quantity <= 0) {
        sessionManager.addAuditEvent(sessionId, 'CHECKOUT_VALIDATION_FAILED', {
          reason: 'STOCK_UNAVAILABLE',
          sku: item.sku,
          name: item.name
        });
        throw new Error(`Item ${item.name} (${item.sku}) is currently out of stock.`);
      }
    }

    // 8. Reject client-controlled amount tampering (Part 5)
    // Regardless of clientProvidedAmount, we strictly use authoritative basket total
    const authoritativeTotalInr = basket.totalInr;

    // 9. Confirm total does not exceed user's hard budget
    if (authoritativeTotalInr > basket.rec.budget_ceiling_inr) {
      sessionManager.addAuditEvent(sessionId, 'CHECKOUT_VALIDATION_FAILED', {
        reason: 'BUDGET_EXCEEDED',
        authoritative_total: authoritativeTotalInr,
        budget: basket.rec.budget_ceiling_inr
      });
      throw new Error('Authoritative total exceeds customer budget ceiling.');
    }

    // 10. Convert INR to paise
    const amountPaise = inrToPaise(authoritativeTotalInr);

    // 11. Create internal pending order record
    const internalOrderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const internalOrder: InternalOrder = {
      internal_order_id: internalOrderId,
      session_id: sessionId,
      intent_id: session.current_intent?.intent_id,
      approval_id: approval.approval_id,
      basket_hash: basket.basketHash,
      sku_snapshot: basket.skus,
      variant_snapshot: basket.locked.variant_id,
      line_items: basket.lineItems,
      amount_inr: authoritativeTotalInr,
      amount_paise: amountPaise,
      currency: 'INR',
      status: 'PAYMENT_PENDING',
      stock_decremented: false,
      created_at: now,
      updated_at: now
    };

    // 12. Create Razorpay TEST MODE order
    const rzpOrder = await this.razorpayService.createRazorpayOrder({
      amount_paise: amountPaise,
      currency: 'INR',
      receipt: internalOrderId,
      notes: {
        session_id: sessionId,
        internal_order_id: internalOrderId,
        sku_count: String(basket.skus.length)
      }
    });

    // 13. Store razorpay_order_id
    internalOrder.razorpay_order_id = rzpOrder.id;

    // Register order in memory
    this.orders.set(internalOrderId, internalOrder);
    this.ordersByRazorpayId.set(rzpOrder.id, internalOrder);
    session.current_order_id = internalOrderId;

    // 15. Write audit events
    sessionManager.addAuditEvent(sessionId, 'RAZORPAY_ORDER_CREATED', {
      internal_order_id: internalOrderId,
      razorpay_order_id: rzpOrder.id,
      amount_inr: authoritativeTotalInr,
      amount_paise: amountPaise
    });

    sessionManager.addAuditEvent(sessionId, 'PAYMENT_STARTED', {
      internal_order_id: internalOrderId,
      razorpay_order_id: rzpOrder.id
    });

    // Return only safe fields (never secrets)
    return {
      internal_order_id: internalOrderId,
      razorpay_order_id: rzpOrder.id,
      razorpay_key_id: this.razorpayService.getKeyId(),
      amount: amountPaise,
      currency: 'INR'
    };
  }

  /**
   * Server-side signature verification & order completion.
   * Part 11:
   * 1. Find internal order.
   * 2. Find stored Razorpay Order ID.
   * 3. Verify signature.
   * 4. Verify payment state before marking PAID.
   * 5. Prevent duplicate finalization.
   * 6. Write audit events.
   */
  public verifyPayment(
    sessionManager: SessionManager,
    sessionId: string,
    payload: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }
  ): { success: boolean; order_id: string; status: string; error?: string } {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = payload;

    const order = this.ordersByRazorpayId.get(razorpay_order_id);
    if (!order) {
      sessionManager.addAuditEvent(sessionId, 'PAYMENT_SIGNATURE_REJECTED', {
        reason: 'ORDER_NOT_FOUND',
        razorpay_order_id
      });
      return { success: false, order_id: '', status: 'ERROR', error: 'Order not found for given Razorpay Order ID.' };
    }

    // Idempotency: If order is already completed / paid, return success without re-processing
    if (order.status === 'PAID' || order.status === 'COMPLETED') {
      return {
        success: true,
        order_id: order.internal_order_id,
        status: order.status
      };
    }

    // Strict state check: cannot verify unless in PAYMENT_PENDING
    if (order.status !== 'PAYMENT_PENDING') {
      return {
        success: false,
        order_id: order.internal_order_id,
        status: order.status,
        error: `Cannot verify payment for order in state ${order.status}`
      };
    }

    // Verify signature using server-side HMAC-SHA256
    const isValidSignature = this.razorpayService.verifyPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    if (!isValidSignature) {
      order.status = 'PAYMENT_FAILED';
      order.failure_reason = 'Invalid payment signature';
      order.updated_at = new Date().toISOString();

      sessionManager.addAuditEvent(sessionId, 'PAYMENT_SIGNATURE_REJECTED', {
        internal_order_id: order.internal_order_id,
        razorpay_order_id,
        razorpay_payment_id
      });
      sessionManager.addAuditEvent(sessionId, 'PAYMENT_FAILED', {
        internal_order_id: order.internal_order_id,
        reason: 'SIGNATURE_VERIFICATION_FAILED'
      });

      return {
        success: false,
        order_id: order.internal_order_id,
        status: 'PAYMENT_FAILED',
        error: 'Payment verification failed: Signature mismatch.'
      };
    }

    // Valid Signature! Finalize order
    order.razorpay_payment_id = razorpay_payment_id;
    order.status = 'PAID';
    order.updated_at = new Date().toISOString();

    sessionManager.addAuditEvent(sessionId, 'PAYMENT_SIGNATURE_VERIFIED', {
      internal_order_id: order.internal_order_id,
      razorpay_order_id,
      razorpay_payment_id
    });
    sessionManager.addAuditEvent(sessionId, 'ORDER_PAID', {
      internal_order_id: order.internal_order_id,
      amount_inr: order.amount_inr
    });

    // Decrement stock exactly once
    if (!order.stock_decremented) {
      for (const item of order.line_items) {
        const prod = this.repo.getProductBySku(item.sku);
        if (prod && prod.stock_quantity > 0) {
          prod.stock_quantity -= 1;
        }
      }
      order.stock_decremented = true;
    }

    order.status = 'COMPLETED';
    order.updated_at = new Date().toISOString();

    sessionManager.addAuditEvent(sessionId, 'ORDER_CONFIRMED', {
      internal_order_id: order.internal_order_id,
      final_status: 'COMPLETED'
    });

    return {
      success: true,
      order_id: order.internal_order_id,
      status: 'COMPLETED'
    };
  }

  /**
   * Customer cancels / closes Checkout modal.
   * Preserves session and basket.
   */
  public cancelPayment(sessionManager: SessionManager, sessionId: string, reason?: string) {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`);
    }

    if (session.current_order_id) {
      const order = this.orders.get(session.current_order_id);
      if (order && (order.status === 'PAID' || order.status === 'COMPLETED')) {
        // Cannot cancel completed order
        return { success: false, error: 'Cannot cancel already completed order.' };
      }
      if (order) {
        order.status = 'PAYMENT_CANCELLED';
        order.failure_reason = reason || 'Customer closed checkout modal';
        order.updated_at = new Date().toISOString();
      }
    }

    sessionManager.addAuditEvent(sessionId, 'PAYMENT_CANCELLED', {
      session_id: sessionId,
      reason: reason || 'Checkout modal dismissed'
    });

    return { success: true, status: 'PAYMENT_CANCELLED' };
  }

  /**
   * Payment failure handler.
   * Preserves session and basket for retry.
   */
  public failPayment(sessionManager: SessionManager, sessionId: string, reason?: string) {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`);
    }

    if (session.current_order_id) {
      const order = this.orders.get(session.current_order_id);
      if (order && (order.status === 'PAID' || order.status === 'COMPLETED')) {
        return { success: false, error: 'Cannot mark paid order as failed.' };
      }
      if (order) {
        order.status = 'PAYMENT_FAILED';
        order.failure_reason = reason || 'Payment transaction failed';
        order.updated_at = new Date().toISOString();
      }
    }

    sessionManager.addAuditEvent(sessionId, 'PAYMENT_FAILED', {
      session_id: sessionId,
      reason: reason || 'Payment transaction failed'
    });

    return { success: true, status: 'PAYMENT_FAILED' };
  }

  /**
   * Webhook processor for Razorpay events.
   * Parts 12 & 13:
   * - Verifies HMAC-SHA256 signature against RAW body
   * - Uses x-razorpay-event-id for idempotency
   * - Idempotently finalizes order without duplicate stock decrement
   */
  public processWebhook(
    rawBody: string | Buffer,
    signature: string,
    eventId: string | undefined,
    sessionManager: SessionManager
  ): { success: boolean; processed: boolean; message: string } {
    // 1. Verify signature against raw body
    const isValid = this.razorpayService.verifyWebhookSignature({
      raw_webhook_body: rawBody,
      signature
    });

    if (!isValid) {
      return { success: false, processed: false, message: 'Invalid webhook signature.' };
    }

    // 2. Check event idempotency
    if (eventId) {
      if (this.processedWebhookEvents.has(eventId)) {
        return { success: true, processed: false, message: 'Duplicate webhook event ignored.' };
      }
      this.processedWebhookEvents.add(eventId);
    }

    // 3. Parse JSON from raw body
    let payload: any;
    try {
      payload = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
    } catch {
      return { success: false, processed: false, message: 'Invalid JSON payload.' };
    }

    const eventName = payload.event;
    const rzpOrderId =
      payload.payload?.payment?.entity?.order_id ||
      payload.payload?.order?.entity?.id;

    const order = rzpOrderId ? this.ordersByRazorpayId.get(rzpOrderId) : undefined;
    const sessionId = order?.session_id;

    if (sessionId) {
      sessionManager.addAuditEvent(sessionId, 'WEBHOOK_RECEIVED', {
        event: eventName,
        event_id: eventId,
        razorpay_order_id: rzpOrderId
      });
    }

    // Handle payment capture / order paid
    if (eventName === 'payment.captured' || eventName === 'order.paid') {
      if (order && order.status !== 'COMPLETED' && order.status !== 'PAID') {
        const rzpPaymentId = payload.payload?.payment?.entity?.id || `pay_webhook_${Date.now()}`;
        order.razorpay_payment_id = rzpPaymentId;
        order.status = 'PAID';
        order.updated_at = new Date().toISOString();

        if (sessionId) {
          sessionManager.addAuditEvent(sessionId, 'PAYMENT_STATUS_VERIFIED', {
            via: 'webhook',
            razorpay_payment_id: rzpPaymentId
          });
          sessionManager.addAuditEvent(sessionId, 'ORDER_PAID', {
            internal_order_id: order.internal_order_id
          });
        }

        // Decrement stock once
        if (!order.stock_decremented) {
          for (const item of order.line_items) {
            const prod = this.repo.getProductBySku(item.sku);
            if (prod && prod.stock_quantity > 0) {
              prod.stock_quantity -= 1;
            }
          }
          order.stock_decremented = true;
        }

        order.status = 'COMPLETED';
        order.updated_at = new Date().toISOString();

        if (sessionId) {
          sessionManager.addAuditEvent(sessionId, 'ORDER_CONFIRMED', {
            internal_order_id: order.internal_order_id,
            via: 'webhook'
          });
        }
      }
    } else if (eventName === 'payment.failed') {
      if (order && order.status === 'PAYMENT_PENDING') {
        order.status = 'PAYMENT_FAILED';
        order.failure_reason = payload.payload?.payment?.entity?.error_description || 'Payment failed via webhook';
        order.updated_at = new Date().toISOString();

        if (sessionId) {
          sessionManager.addAuditEvent(sessionId, 'PAYMENT_FAILED', {
            internal_order_id: order.internal_order_id,
            via: 'webhook',
            reason: order.failure_reason
          });
        }
      }
    }

    return { success: true, processed: true, message: `Webhook event "${eventName}" processed successfully.` };
  }
}

// Singleton instance
let defaultOrderManager: OrderManager | null = null;
export function getOrderManager(
  repo?: ICatalogRepository,
  razorpayService?: RazorpayService
): OrderManager {
  if (!defaultOrderManager) {
    defaultOrderManager = new OrderManager(repo, razorpayService);
  }
  return defaultOrderManager;
}
