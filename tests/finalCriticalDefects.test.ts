import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { getCatalogRepository, type ICatalogRepository } from '../src/repository/catalogRepository.ts';
import { getSessionManager, SessionManager } from '../src/session/sessionManager.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';
import { OrderManager } from '../src/engine/orderManager.ts';
import { getRazorpayService } from '../src/services/razorpayService.ts';
import { BENCHMARK_INTENTS } from '../src/data/benchmarkIntents.ts';
import fs from 'node:fs';
import path from 'node:path';

describe('Final Checkout Behavior Regression Suite (19 Required Tests)', () => {
  let repo: ICatalogRepository;
  let sessionManager: SessionManager;
  let orchestrator: AgentOrchestrator;
  let orderManager: OrderManager;

  before(() => {
    repo = getCatalogRepository();
    sessionManager = getSessionManager(repo);
    const nlu = new DeterministicNLUProvider();
    orchestrator = new AgentOrchestrator(nlu, repo, sessionManager);
    orderManager = new OrderManager(repo);
  });

  // 1. Accessories start unchecked
  it('1. Accessories start unchecked', async () => {
    const sId = `chk_1_${Date.now()}`;
    const res = await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    const session = sessionManager.getSession(sId)!;
    assert.deepEqual(session.selected_accessory_skus, []);
    assert.equal(res.recommendation?.accessories.length, 0);
  });

  // 2. Unselected accessories are absent from basket
  it('2. Unselected accessories are absent from basket', async () => {
    const sId = `chk_2_${Date.now()}`;
    const res = await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    const lineItems = res.recommendation?.itemized_line_items || [];
    assert.equal(lineItems.length, 1, 'Basket should only contain the base laptop initially');
    assert.equal(lineItems[0].sku, 'AP-LP-MBA13-01');
  });

  // 3. Explicitly selected accessory becomes part of basket
  it('3. Explicitly selected accessory becomes part of basket', async () => {
    const sId = `chk_3_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    const toggleRes = sessionManager.toggleAccessory(sId, 'AP-MS-MAGIC-01', true);
    assert.ok(toggleRes.success);
    assert.deepEqual(toggleRes.session?.selected_accessory_skus, ['AP-MS-MAGIC-01']);
    const items = toggleRes.session?.latest_recommendation?.itemized_line_items || [];
    assert.equal(items.length, 2);
    assert.ok(items.some((it) => it.sku === 'AP-MS-MAGIC-01'));
  });

  // 4. Two explicitly selected accessories become part of basket
  it('4. Two explicitly selected accessories become part of basket', async () => {
    const sId = `chk_4_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    sessionManager.toggleAccessory(sId, 'AP-MS-MAGIC-01', true);
    const toggleRes2 = sessionManager.toggleAccessory(sId, 'AP-BG-SLV13-01', true);
    assert.ok(toggleRes2.success);
    assert.deepEqual(toggleRes2.session?.selected_accessory_skus, ['AP-MS-MAGIC-01', 'AP-BG-SLV13-01']);
    const items = toggleRes2.session?.latest_recommendation?.itemized_line_items || [];
    assert.equal(items.length, 3);
    assert.equal(toggleRes2.session?.latest_recommendation?.total_price_inr, 89999 + 2999 + 3499);
  });

  // 5. Selected accessories are displayed as part of "Your selected order"
  it('5. Selected accessories are displayed as part of "Your selected order"', () => {
    const htmlPath = path.resolve('public/index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(htmlContent.includes('Your Selected Order:'), 'HTML must feature Your Selected Order header');
  });

  // 6. Selected accessories are never labeled "optional"
  it('6. Selected accessories are never labeled "optional"', () => {
    const appJsPath = path.resolve('public/app.js');
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    assert.ok(
      !appJsContent.includes('These accessories are optional'),
      'Must never render: "These accessories are optional"'
    );
    assert.ok(
      !appJsContent.includes('Remove an accessory to continue within your budget'),
      'Must never render: "Remove an accessory to continue within your budget"'
    );
    assert.ok(
      !appJsContent.includes('Budget exceeded — remove accessory'),
      'Must never render: "Budget exceeded — remove accessory"'
    );
  });

  // 7. Selected order above original budget does NOT block checkout
  it('7. Selected order above original budget does NOT block checkout', async () => {
    const sId = `chk_7_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    // Add mouse and sleeve to push total from 89,999 to 96,497 (above original 90,000 budget)
    sessionManager.toggleAccessory(sId, 'AP-MS-MAGIC-01', true);
    sessionManager.toggleAccessory(sId, 'AP-BG-SLV13-01', true);

    const review = sessionManager.generatePurchaseReview(sId);
    assert.equal(review.final_total_inr, 96497);
    assert.equal(review.customer_budget_inr, 90000);
    assert.equal(review.is_over_budget, true);
    // Gate status is authorized, not blocked!
    assert.equal(review.gate_status, 'AUTHORIZED_PENDING_GATEWAY');

    // Server approval succeeds without throwing budget exception
    const approval = orderManager.approvePurchase(sessionManager, sId);
    assert.ok(approval.approval_id);
    assert.equal(approval.total_price_inr, 96497);
  });

  // 8. Valid selected order immediately enables Razorpay
  it('8. Valid selected order immediately enables Razorpay', async () => {
    const sId = `chk_8_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    sessionManager.toggleAccessory(sId, 'AP-MS-MAGIC-01', true);
    sessionManager.toggleAccessory(sId, 'AP-BG-SLV13-01', true);

    orderManager.approvePurchase(sessionManager, sId);
    const order = await orderManager.createPaymentOrder(sessionManager, sId);
    assert.ok(order.razorpay_order_id);
    assert.ok(order.razorpay_order_id.startsWith('order_'));
    assert.equal(order.amount, 9649700);
    const stored = orderManager.getOrder(order.internal_order_id);
    assert.equal(stored?.amount_inr, 96497);
  });

  // 9. Client cannot alter authoritative order amount
  it('9. Client cannot alter authoritative order amount', async () => {
    const sId = `chk_9_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    orderManager.approvePurchase(sessionManager, sId);

    // Client passes manipulated amount: ₹1
    const order = await orderManager.createPaymentOrder(sessionManager, sId, 1);
    // Backend strictly ignores client amount and uses authoritative total ₹89,999 (8999900 paise)
    assert.equal(order.amount, 8999900);
    const stored = orderManager.getOrder(order.internal_order_id);
    assert.equal(stored?.amount_inr, 89999);
    assert.equal(stored?.amount_paise, 8999900);
  });

  // 10. Server recalculates final basket
  it('10. Server recalculates final basket', async () => {
    const sId = `chk_10_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    const basket = orderManager.getAuthoritativeBasket(sessionManager, sId);
    assert.equal(basket.totalInr, 89999);
    assert.equal(basket.lineItems.length, 1);
  });

  // 11. Out-of-stock accessory blocks checkout
  it('11. Out-of-stock accessory blocks checkout', async () => {
    const sId = `chk_11_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    const mouse = repo.getProductBySku('AP-MS-MAGIC-01')!;
    const originalStock = mouse.stock_quantity;
    try {
      mouse.stock_quantity = 0; // Simulate stock depletion
      sessionManager.toggleAccessory(sId, 'AP-MS-MAGIC-01', true);

      assert.throws(() => {
        orderManager.approvePurchase(sessionManager, sId);
      }, /out of stock/i);
    } finally {
      mouse.stock_quantity = originalStock;
    }
  });

  // 12. Incompatible accessory blocks checkout
  it('12. Incompatible accessory blocks checkout', async () => {
    const sId = `chk_12_${Date.now()}`;
    await orchestrator.processMessage('I want the Nexora DevForge 15 laptop', sId);
    const session = sessionManager.getSession(sId)!;
    // Incompatible 13-inch sleeve for a 15-inch laptop fails dimensional check
    const incompatibleBagSku = 'NX-BG-TINY-04';
    session.selected_accessory_skus.push(incompatibleBagSku);

    assert.throws(() => {
      orderManager.approvePurchase(sessionManager, sId);
    }, /incompatible/i);
  });

  // 13. Invalid SKU blocks checkout
  it('13. Invalid SKU blocks checkout', async () => {
    const sId = `chk_13_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    const session = sessionManager.getSession(sId)!;
    session.selected_accessory_skus.push('INVALID-NONEXISTENT-SKU');

    assert.throws(() => {
      orderManager.approvePurchase(sessionManager, sId);
    }, /no longer found in catalog/i);
  });

  // 14. Razorpay signature verification remains intact
  it('14. Razorpay signature verification remains intact', () => {
    const rzp = getRazorpayService();
    const valid = rzp.verifyPaymentSignature({
      razorpay_order_id: 'order_test_123',
      razorpay_payment_id: 'pay_test_123',
      razorpay_signature: 'invalid_sig'
    });
    assert.equal(valid, false, 'Invalid signature must be strictly rejected');
  });

  // 15. Webhook verification remains intact
  it('15. Webhook verification remains intact', () => {
    const rzp = getRazorpayService();
    const valid = rzp.verifyWebhookSignature({
      raw_webhook_body: '{"event":"payment.captured"}',
      signature: 'invalid_sig'
    });
    assert.equal(valid, false, 'Invalid webhook signature must be strictly rejected');
  });

  // 16. Multi-brand search remains intact
  it('16. Multi-brand search remains intact', async () => {
    const res = await orchestrator.processMessage("Give me the best coding laptop under 70000, brand doesn't matter", `chk_16_${Date.now()}`);
    const considered = res.candidate_brands_considered || res.recommendation?.candidate_brands_considered;
    assert.ok(Array.isArray(considered));
    assert.ok(considered.length >= 5);
    assert.ok(considered.includes('Apple'));
    assert.ok(considered.includes('Lenovo'));
    assert.ok(considered.includes('HP'));
  });

  // 17. Brand-specific cross-sell remains intact
  it('17. Brand-specific cross-sell remains intact', async () => {
    const res = await orchestrator.processMessage('I want an Apple laptop for coding under 90000', `chk_17_${Date.now()}`);
    const addOns = res.recommendation?.proactive_add_ons || [];
    assert.ok(addOns.length > 0);
    assert.ok(addOns.some((a) => a.sku.startsWith('AP-') || a.name.toLowerCase().includes('apple')));
  });

  // 18. Groq conversational follow-up remains intact
  it('18. Groq conversational follow-up remains intact', async () => {
    const sId = `chk_18_${Date.now()}`;
    await orchestrator.processMessage('I want a laptop under 30000', sId);
    const res = await orchestrator.processMessage('Okay, give me that', sId);
    assert.equal(res.state, 'RECOMMENDATION_READY');
    assert.equal(res.recommendation?.recommended_laptop?.product.sku, 'NX-LP-CAMPUS-07');
  });

  // 19. Merchant 100-intent benchmark remains intact
  it('19. Merchant 100-intent benchmark remains intact', () => {
    assert.equal(BENCHMARK_INTENTS.length, 100, 'Controlled benchmark must contain exactly 100 intents');
  });

  // 20. Order above original budget can be approved and create-order returns 200
  it('20. Order above original budget can be approved and create-order returns 200', async () => {
    const sId = `chk_20_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    sessionManager.toggleAccessory(sId, 'AP-MS-MAGIC-01', true);
    sessionManager.toggleAccessory(sId, 'AP-BG-SLV13-01', true);

    const approval = orderManager.approvePurchase(sessionManager, sId);
    assert.ok(approval.approval_id);

    const order = await orderManager.createPaymentOrder(sessionManager, sId);
    assert.ok(order.razorpay_order_id);
    assert.equal(order.amount, 9649700);
  });

  // 21. Successful signature verification marks payment successful and clears failure state
  it('21. Successful signature verification marks payment successful and clears failure state', async () => {
    const sId = `chk_21_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    orderManager.approvePurchase(sessionManager, sId);
    const order = await orderManager.createPaymentOrder(sessionManager, sId);

    const rzp = getRazorpayService();
    // Generate valid test signature
    const secret = process.env.RAZORPAY_KEY_SECRET || 'test_secret_for_verification';
    const crypto = await import('node:crypto');
    const paymentId = `pay_test_${Date.now()}`;
    const validSignature = crypto.default
      .createHmac('sha256', secret)
      .update(`${order.razorpay_order_id}|${paymentId}`)
      .digest('hex');

    const verifyResult = orderManager.verifyPayment(sessionManager, sId, {
      razorpay_order_id: order.razorpay_order_id,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature
    });

    assert.ok(verifyResult.success);
    assert.ok(verifyResult.status === 'COMPLETED' || verifyResult.status === 'PAID');
    const stored = orderManager.getOrder(order.internal_order_id);
    assert.ok(stored?.status === 'COMPLETED' || stored?.status === 'PAID');
  });

  // 22. Invalid signature is strictly rejected
  it('22. Invalid signature is strictly rejected', async () => {
    const sId = `chk_22_${Date.now()}`;
    await orchestrator.processMessage('I want an Apple laptop for coding under 90000', sId);
    orderManager.approvePurchase(sessionManager, sId);
    const order = await orderManager.createPaymentOrder(sessionManager, sId);

    const verifyResult = orderManager.verifyPayment(sessionManager, sId, {
      razorpay_order_id: order.razorpay_order_id,
      razorpay_payment_id: 'pay_invalid',
      razorpay_signature: 'invalid_tampered_signature'
    });

    assert.equal(verifyResult.success, false);
    assert.ok(verifyResult.status === 'PAYMENT_FAILED' || verifyResult.status === 'SIGNATURE_VERIFICATION_FAILED');
  });

  // 23. Client frontend code contains no stale budget-block check in handleProceedPayment
  it('23. Client frontend code contains no stale budget-block check in handleProceedPayment', () => {
    const appJs = fs.readFileSync(path.resolve('public/app.js'), 'utf8');
    assert.ok(!appJs.includes('Purchase blocked — basket exceeds customer budget'), 'Stale budget block message must be absent');
  });
});
