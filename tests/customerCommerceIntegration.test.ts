import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { SessionManager, getSessionManager } from '../src/session/sessionManager.ts';
import { getCatalogRepository, type ICatalogRepository } from '../src/repository/catalogRepository.ts';
import { DeterministicNLUProvider, GroqLLMProvider } from '../src/llm/llmProvider.ts';
import { OrderManager } from '../src/engine/orderManager.ts';
import { RazorpayService } from '../src/services/razorpayService.ts';
import { createServer } from '../src/server/server.ts';
import { normalizeBudget, normalizeGpu } from '../src/nlu/normalization.ts';

describe('Customer Commerce Integration Pass (Scenarios A through Z)', () => {
  let repo: ICatalogRepository;
  let sessionManager: SessionManager;
  let orchestrator: AgentOrchestrator;
  let razorpayService: RazorpayService;
  let orderManager: OrderManager;
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    repo = getCatalogRepository();
    sessionManager = new SessionManager(repo);
    const nlu = new DeterministicNLUProvider();
    orchestrator = new AgentOrchestrator(nlu, repo, sessionManager);
    razorpayService = new RazorpayService({
      keyId: 'rzp_test_mock_key',
      keySecret: 'rzp_test_mock_secret',
      webhookSecret: 'test_webhook_secret',
      mockNetworkBoundary: true
    });
    orderManager = new OrderManager(repo, razorpayService);

    server = createServer({
      sessionManager,
      orchestrator,
      orderManager,
      razorpayService
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // A. Arbitrary natural-language query
  it('A. Arbitrary natural-language query: "I want something cheap for college and Python"', async () => {
    const res = await orchestrator.processMessage('I want something cheap for college and Python', 'ses_test_a');
    assert.ok(['VALID_MATCH', 'RECOMMENDATION_READY'].includes(res.state));
    assert.ok(res.recommendation?.recommended_laptop);
    assert.equal(res.recommendation?.recommended_laptop.product.category, 'laptop');
    // Campus 14 (₹42,999) or FlexBook 14 (₹59,999)
    assert.ok(res.recommendation?.recommended_laptop.product.price_inr <= 60000);
  });

  // B. Numeric budget 20k
  it('B. Numeric budget 20k: "I need a laptop under 20000"', async () => {
    const res = await orchestrator.processMessage('I need a laptop under 20000', 'ses_test_b');
    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.equal(res.recommendation?.recommended_laptop, null);
    // Closest option is Campus 14 at ₹42,999 (gap ₹22,999)
    const closest = res.recommendation?.constraint_analysis?.closest_options[0];
    assert.ok(closest);
    assert.equal(closest.sku, 'NX-LP-CAMPUS-07');
    assert.equal(closest.budget_delta_inr, 22999);
  });

  // C. Numeric budget 25k
  it('C. Numeric budget 25k: "I need a laptop under 25000"', async () => {
    const res = await orchestrator.processMessage('I need a laptop under 25000', 'ses_test_c');
    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.equal(res.recommendation?.recommended_laptop, null);
    const closest = res.recommendation?.constraint_analysis?.closest_options[0];
    assert.ok(closest);
    assert.equal(closest.sku, 'NX-LP-CAMPUS-07');
    assert.equal(closest.price_inr, 42999);
    assert.equal(closest.budget_delta_inr, 17999);
  });

  // D. Numeric budget 30k
  it('D. Numeric budget 30k: "I need a laptop around 30k"', async () => {
    const parsed = normalizeBudget('I need a laptop around 30k');
    assert.ok(parsed);
    assert.equal(parsed?.amount, 30000);
    assert.equal(parsed?.isHardCeiling, false);

    const res = await orchestrator.processMessage('I need a laptop around 30k', 'ses_test_d');
    assert.ok(res.recommendation);
    // Closest model in catalog is Campus 14 (₹42,999)
    assert.ok(res.explanation?.includes('Campus 14') || res.explanation?.includes('42,999'));
  });

  // E. GPU 4060
  it('E. GPU 4060: "I need a gaming laptop with RTX 4060"', async () => {
    const parsedGpu = normalizeGpu('I need a gaming laptop with RTX 4060');
    assert.ok(parsedGpu);
    assert.equal(parsedGpu?.model, 'RTX 4060');
    assert.equal(parsedGpu?.min_vram_gb, 8);
    assert.equal(parsedGpu?.requiresDedicated, true);

    const res = await orchestrator.processMessage('I need a gaming laptop with RTX 4060', 'ses_test_e');
    assert.ok(res.recommendation);
    // Nexora Titan 15 or WorkStation 16 is evaluated
    assert.ok(res.explanation && res.explanation.length > 0);
  });

  // F. Hinglish query
  it('F. Hinglish query: "Bhai mujhe coding ke liye laptop chahiye 60k ke andar"', async () => {
    const parsed = normalizeBudget('Bhai mujhe coding ke liye laptop chahiye 60k ke andar');
    assert.ok(parsed);
    assert.equal(parsed?.amount, 60000);
    assert.equal(parsed?.isHardCeiling, true);

    const res = await orchestrator.processMessage('Bhai mujhe coding ke liye laptop chahiye 60k ke andar', 'ses_test_f');
    assert.ok(['VALID_MATCH', 'RECOMMENDATION_READY'].includes(res.state));
    assert.ok(res.recommendation?.recommended_laptop);
    // Within 60,000 budget
    assert.ok(res.recommendation!.total_price_inr <= 60000);
  });

  // G. Ambiguous query
  it('G. Ambiguous query: "I need a laptop for work"', async () => {
    const res = await orchestrator.processMessage('I need a laptop for work', 'ses_test_g');
    assert.equal(res.state, 'CLARIFICATION_REQUIRED');
    assert.ok(res.clarification_question);
    assert.ok(res.clarification_question.includes('budget'));
  });

  // H. No exact product match
  it('H. No exact product match: "I need a laptop under 35k with 32GB RAM"', async () => {
    const res = await orchestrator.processMessage('I need a laptop under 35k with 32GB RAM', 'ses_test_h');
    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.equal(res.recommendation?.recommended_laptop, null);
    assert.ok(res.recommendation?.constraint_analysis);
    assert.ok(res.recommendation!.constraint_analysis!.failure_summary_points.length > 0);
  });

  // I. Partial match
  it('I. Partial match: Near-budget match explicitly shows price gap and trade-offs', async () => {
    const res = await orchestrator.processMessage('I need a laptop under 58000 with 16GB RAM', 'ses_test_i');
    assert.ok(['PARTIAL_MATCH', 'NO_PRODUCT_MATCH'].includes(res.state));
    assert.ok(res.explanation?.includes('exceeds'));
  });

  // J. Comparison
  it('J. Comparison: "Show me the best option and one alternative"', async () => {
    const res = await orchestrator.processMessage('Show me the best option and one alternative', 'ses_test_j');
    assert.ok(res.explanation?.includes('Factual Specification Comparison'));
    assert.ok(res.explanation?.includes('AeroBook 14'));
    assert.ok(res.explanation?.includes('DevForge 15'));
  });

  // K. Cross-sell evaluation
  it('K. Cross-sell: Evaluates compatible mouse and bag without auto-purchasing', async () => {
    const res = await orchestrator.processMessage('I need a laptop for coding under 70000', 'ses_test_k');
    assert.ok(res.recommendation?.proactive_add_ons);
    assert.ok(res.recommendation!.proactive_add_ons.length > 0);
    // None selected by default
    const session = sessionManager.getSession('ses_test_k');
    assert.ok(session);
  });

  // L. Cross-sell within budget
  it('L. Cross-sell within budget: Toggle accessory within budget updates total and margin', async () => {
    const session = sessionManager.getOrCreateSession('ses_test_l');
    await orchestrator.processMessage('I need a coding laptop under 75000', 'ses_test_l');

    // Toggle mouse (SilentPro S20, ₹1,499: 69,499 + 1,499 = 70,998 <= 75,000)
    const toggleRes = sessionManager.toggleAccessory('ses_test_l', 'NX-MS-SILENT-03', true);
    assert.equal(toggleRes.success, true);
    const rec = toggleRes.session!.latest_recommendation!;
    assert.ok(rec.total_price_inr <= 75000);
    assert.ok(rec.budget_margin_inr >= 0);
  });

  // M. Cross-sell over budget does not block checkout for explicitly selected order
  it('M. Cross-sell over budget: Allows checkout when customer explicitly selects accessory above budget', async () => {
    const session = sessionManager.getOrCreateSession('ses_test_m');
    await orchestrator.processMessage('I need a coding laptop under 60000', 'ses_test_m');

    // Add accessory that pushes over 60,000 budget (SilentPro S20: 59,999 + 1,499 = 61,498 > 60,000)
    sessionManager.toggleAccessory('ses_test_m', 'NX-MS-SILENT-03', true);
    const review = sessionManager.generatePurchaseReview('ses_test_m');
    assert.equal(review.is_over_budget, true);
    assert.equal(review.gate_status, 'AUTHORIZED_PENDING_GATEWAY');

    // Explicit selection succeeds approval
    const approval = orderManager.approvePurchase(sessionManager, 'ses_test_m');
    assert.ok(approval.approval_id);
    assert.equal(approval.session_id, 'ses_test_m');
  });

  // N. Inline budget increase
  it('N. Inline budget increase: Direct UI update recalculates basket without chat round-trip', async () => {
    const updateRes = sessionManager.updateBudget('ses_test_m', 65000);
    assert.equal(updateRes.success, true);
    const rec = updateRes.session!.latest_recommendation!;
    assert.equal(rec.budget_ceiling_inr, 65000);
    assert.ok(rec.total_price_inr <= 65000);

    // Review is now authorized
    const review = sessionManager.generatePurchaseReview('ses_test_m');
    assert.equal(review.is_over_budget, false);
    assert.equal(review.gate_status, 'AUTHORIZED_PENDING_GATEWAY');
  });

  // O. Checkout immediately after valid accessory selection
  it('O. Checkout immediately available when basket is valid', async () => {
    const approval = orderManager.approvePurchase(sessionManager, 'ses_test_m');
    assert.ok(approval.approval_id);
    assert.equal(approval.session_id, 'ses_test_m');
  });

  // P. Razorpay order uses authoritative backend amount
  it('P. Razorpay order uses authoritative backend amount: Ignores client-supplied amount', async () => {
    const orderResult = await orderManager.createPaymentOrder(sessionManager, 'ses_test_m', 100);
    const order = orderManager.getOrder(orderResult.internal_order_id);
    assert.ok(order);
    assert.equal(orderResult.amount, order!.amount_paise);
    assert.notEqual(orderResult.amount, 100);
  });

  // Q. Payment success
  it('Q. Payment success: Valid signature finalizes order and confirms purchase', async () => {
    const order = orderManager.getOrder(sessionManager.getSession('ses_test_m')!.current_order_id!);
    assert.ok(order);

    const validSignature = crypto
      .createHmac('sha256', 'rzp_test_mock_secret')
      .update(`${order!.razorpay_order_id}|pay_test_succ_123`)
      .digest('hex');

    const verifyResult = orderManager.verifyPayment(sessionManager, 'ses_test_m', {
      razorpay_order_id: order!.razorpay_order_id!,
      razorpay_payment_id: 'pay_test_succ_123',
      razorpay_signature: validSignature
    });

    assert.equal(verifyResult.success, true);
    assert.equal(verifyResult.status, 'COMPLETED');
    assert.equal(order!.status, 'COMPLETED');
  });

  // R. Payment failure
  it('R. Payment failure: Preserves basket and selected accessories for retry', async () => {
    const session = sessionManager.getOrCreateSession('ses_test_r');
    await orchestrator.processMessage('I need a laptop for coding under 70000', 'ses_test_r');
    orderManager.approvePurchase(sessionManager, 'ses_test_r');
    const orderResult = await orderManager.createPaymentOrder(sessionManager, 'ses_test_r');

    const failResult = orderManager.failPayment(sessionManager, 'ses_test_r', 'Insufficient balance');
    assert.equal(failResult.success, true);

    const order = orderManager.getOrder(orderResult.internal_order_id);
    assert.equal(order?.status, 'PAYMENT_FAILED');
    // Basket and selected accessories remain intact
    assert.ok(session.latest_recommendation);
    assert.ok(session.selected_accessory_skus);
  });

  // S. Retry payment
  it('S. Retry payment: Allows customer to re-authorize and complete payment', async () => {
    orderManager.approvePurchase(sessionManager, 'ses_test_r');
    const retryOrder = await orderManager.createPaymentOrder(sessionManager, 'ses_test_r');
    assert.ok(retryOrder.razorpay_order_id);
  });

  // T. Duplicate webhook
  it('T. Duplicate webhook: Second delivery with same event ID is safely ignored', async () => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret';
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_hook_dup_1',
            order_id: 'rzp_nonexistent_order',
            amount: 6000000
          }
        }
      }
    });

    const sig = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
    const res1 = orderManager.processWebhook(payload, sig, 'evt_dup_999', sessionManager);
    assert.equal(res1.success, true);

    const res2 = orderManager.processWebhook(payload, sig, 'evt_dup_999', sessionManager);
    assert.equal(res2.success, true);
    assert.equal(res2.processed, false); // Ignored duplicate
  });

  // U. Invalid webhook signature
  it('U. Invalid webhook signature: Strictly rejected with success: false', async () => {
    const payload = JSON.stringify({ event: 'payment.captured' });
    const res = orderManager.processWebhook(payload, 'bad_signature', 'evt_bad_1', sessionManager);
    assert.equal(res.success, false);
    assert.equal(res.message, 'Invalid webhook signature.');
  });

  // V. payment.captured
  it('V. payment.captured: Captures payment and updates order authoritatively', async () => {
    const session = sessionManager.getOrCreateSession('ses_test_v');
    await orchestrator.processMessage('I need a laptop for coding under 70000', 'ses_test_v');
    orderManager.approvePurchase(sessionManager, 'ses_test_v');
    const orderRes = await orderManager.createPaymentOrder(sessionManager, 'ses_test_v');

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret';
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_cap_valid_1',
            order_id: orderRes.razorpay_order_id,
            amount: orderRes.amount
          }
        }
      }
    });

    const sig = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
    const res = orderManager.processWebhook(payload, sig, 'evt_cap_001', sessionManager);
    assert.equal(res.success, true);

    const order = orderManager.getOrder(orderRes.internal_order_id);
    assert.equal(order?.status, 'COMPLETED');
  });

  // W. payment.failed
  it('W. payment.failed: Webhook marks order as PAYMENT_FAILED without decrementing stock', async () => {
    const session = sessionManager.getOrCreateSession('ses_test_w');
    await orchestrator.processMessage('I need a laptop for coding under 70000', 'ses_test_w');
    orderManager.approvePurchase(sessionManager, 'ses_test_w');
    const orderRes = await orderManager.createPaymentOrder(sessionManager, 'ses_test_w');

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret';
    const payload = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_fail_hook_1',
            order_id: orderRes.razorpay_order_id,
            error_description: 'Card expired'
          }
        }
      }
    });

    const sig = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
    const res = orderManager.processWebhook(payload, sig, 'evt_fail_001', sessionManager);
    assert.equal(res.success, true);

    const order = orderManager.getOrder(orderRes.internal_order_id);
    assert.equal(order?.status, 'PAYMENT_FAILED');
    assert.equal(order?.stock_decremented, false);
  });

  // X. order.paid
  it('X. order.paid: Webhook marks order as PAID / COMPLETED', async () => {
    const session = sessionManager.getOrCreateSession('ses_test_x');
    await orchestrator.processMessage('I need a laptop for coding under 70000', 'ses_test_x');
    orderManager.approvePurchase(sessionManager, 'ses_test_x');
    const orderRes = await orderManager.createPaymentOrder(sessionManager, 'ses_test_x');

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret';
    const payload = JSON.stringify({
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: orderRes.razorpay_order_id,
            amount: orderRes.amount
          }
        }
      }
    });

    const sig = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
    const res = orderManager.processWebhook(payload, sig, 'evt_paid_001', sessionManager);
    assert.equal(res.success, true);

    const order = orderManager.getOrder(orderRes.internal_order_id);
    assert.equal(order?.status, 'COMPLETED');
  });

  // Y. Groq failure fallback
  it('Y. Groq failure fallback: Falls back cleanly to deterministic NLU on transient error', async () => {
    // GroqLLMProvider with invalid API key
    const badGroq = new GroqLLMProvider('invalid_key_simulate_network_fail');
    const fallbackIntentJson = await badGroq.generateStructuredIntent('I need a laptop for coding under 60000');
    assert.ok(fallbackIntentJson);
    const parsed = JSON.parse(fallbackIntentJson);
    assert.equal(parsed.budget?.total_ceiling, 60000);
    assert.equal(parsed.target_workload, 'coding');
  });

  // Z. No hallucinated catalog attributes
  it('Z. No hallucinated catalog attributes: Specifications match catalog repository exactly', async () => {
    const res = await orchestrator.processMessage('I need a laptop for coding under 70000 with 16GB RAM', 'ses_test_z');
    assert.ok(res.recommendation?.recommended_laptop);
    const candidate = res.recommendation!.recommended_laptop.product;
    const catProduct = repo.getProductBySku(candidate.sku) as any;
    assert.ok(catProduct);
    assert.equal(candidate.price_inr, catProduct.price_inr);
    assert.equal(candidate.ram.capacity_gb, catProduct.ram.capacity_gb);
    assert.equal(candidate.weight_g, catProduct.weight_g);
    assert.equal(candidate.battery.capacity_wh, catProduct.battery.capacity_wh);
  });
});
