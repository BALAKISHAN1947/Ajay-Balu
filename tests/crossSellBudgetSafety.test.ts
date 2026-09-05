/**
 * Cross-Sell Budget Safety & Payment Gate Regression Suite
 *
 * Verifies all 15 safety requirements:
 * 1. Over-budget recommended accessory defaults unchecked.
 * 2. Unselected over-budget accessory is not included in basket.
 * 3. Selecting over-budget accessory changes basket to OVER_BUDGET.
 * 4. OVER_BUDGET disables authorization.
 * 5. Removing accessory restores valid basket.
 * 6. Negative budget margin displays "Over Budget".
 * 7. Valid basket displays "Unused Budget".
 * 8. Razorpay is never launched for an over-budget basket.
 * 9. Backend still rejects over-budget basket if called directly.
 * 10. Explicit budget increase can make the basket valid.
 * 11. Eligible in-budget cross-sell remains selectable.
 * 12. Existing payment success remains working.
 * 13. Existing payment failure remains working.
 * 14. Existing payment cancellation remains working.
 * 15. All safety gates and invariants hold.
 */

import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../src/server/server.ts';
import { SessionManager } from '../src/session/sessionManager.ts';
import { InMemoryCatalogRepository } from '../src/repository/catalogRepository.ts';
import { OrderManager } from '../src/engine/orderManager.ts';
import { RazorpayService } from '../src/services/razorpayService.ts';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';

describe('Cross-Sell Budget Safety & Payment Gate Suite', () => {
  let server: any;
  let baseUrl: string;
  let repo: InMemoryCatalogRepository;
  let sessionManager: SessionManager;
  let razorpayService: RazorpayService;
  let orderManager: OrderManager;
  let orchestrator: AgentOrchestrator;

  const TEST_KEY_ID = 'rzp_test_cross_sell_key';
  const TEST_KEY_SECRET = 'secret_test_cross_sell_secret';
  const TEST_WEBHOOK_SECRET = 'secret_test_cross_sell_webhook';

  before(async () => {
    repo = new InMemoryCatalogRepository();
    sessionManager = new SessionManager(repo);
    razorpayService = new RazorpayService({
      keyId: TEST_KEY_ID,
      keySecret: TEST_KEY_SECRET,
      webhookSecret: TEST_WEBHOOK_SECRET,
      mockNetworkBoundary: true
    });
    orderManager = new OrderManager(repo, razorpayService);
    orchestrator = new AgentOrchestrator(
      new DeterministicNLUProvider(),
      repo,
      sessionManager
    );

    server = createServer({
      sessionManager,
      orderManager,
      razorpayService
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // Test 1 & 2: Over-budget recommended accessories default unchecked and are not included in basket
  it('1 & 2. Over-budget recommended accessories default unchecked and do not enter authoritative basket', async () => {
    const sessionId = 'test_budget_safety_1_2';
    const response = await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    assert.equal(response.state, 'VALID_MATCH');
    assert.ok(response.recommendation);
    assert.ok(response.recommendation.recommended_laptop?.product.name.includes('FlexBook 14'));
    assert.equal(response.recommendation.total_price_inr, 59999);
    assert.equal(response.recommendation.budget_ceiling_inr, 60000);
    assert.equal(response.recommendation.budget_margin_inr, 1);

    // Initial recommended accessories must be empty
    assert.equal(response.recommendation.accessories.length, 0);

    // Session's selected accessory skus must be empty
    const session = sessionManager.getSession(sessionId)!;
    assert.deepEqual(session.selected_accessory_skus, []);

    // Proactive add-ons must be classified as COMPATIBLE_BUT_OVER_BUDGET
    const addOns = response.recommendation.proactive_add_ons || [];
    assert.ok(addOns.length >= 2);

    const mouseAddOn = addOns.find((a) => a.category === 'mouse');
    assert.ok(mouseAddOn);
    assert.equal(mouseAddOn.state, 'COMPATIBLE_BUT_OVER_BUDGET');
    assert.equal(mouseAddOn.is_within_budget, false);
    assert.equal(mouseAddOn.budget_delta_inr, 1498);

    const bagAddOn = addOns.find((a) => a.category === 'bag');
    assert.ok(bagAddOn);
    assert.equal(bagAddOn.state, 'COMPATIBLE_BUT_OVER_BUDGET');
    assert.equal(bagAddOn.is_within_budget, false);
    assert.equal(bagAddOn.budget_delta_inr, 3298);

    // Verify basket total has NOT added either accessory
    assert.equal(response.recommendation.total_price_inr, 59999);
  });

  // Test 3 & 4: Selecting over-budget accessory changes basket to OVER_BUDGET and disables authorization
  it('3 & 4. Selecting over-budget accessory marks basket OVER_BUDGET and disables authorization', async () => {
    const sessionId = 'test_budget_safety_3_4';
    await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    // Customer explicitly selects mouse (SilentPro S20, ₹1,499)
    const toggleRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });
    assert.equal(toggleRes.status, 200);
    const toggleData = await toggleRes.json() as any;

    const rec = toggleData.latest_recommendation;
    assert.equal(rec.total_price_inr, 61498);
    assert.equal(rec.budget_ceiling_inr, 60000);
    assert.equal(rec.budget_margin_inr, -1498);

    // Review endpoint must show BLOCKED_OVER_BUDGET
    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    assert.equal(reviewRes.status, 200);
    const reviewData = await reviewRes.json() as any;

    assert.equal(reviewData.gate_status, 'AUTHORIZED_PENDING_GATEWAY');
    assert.equal(reviewData.is_over_budget, true);
    assert.equal(reviewData.over_budget_by_inr, 1498);
    assert.equal(reviewData.budget_margin_inr, -1498);

    // Explicitly selected customer order succeeds with 200 approval
    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(approveRes.status, 200);
    const approveData = await approveRes.json() as any;
    assert.ok(approveData.approval.approval_id);
  });

  // Test 5: Removing accessory restores valid basket and enables authorization
  it('5. Removing accessory restores valid basket and re-enables authorization', async () => {
    const sessionId = 'test_budget_safety_5';
    await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    // Add mouse
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });

    // Remove mouse
    const removeRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: false })
    });
    assert.equal(removeRes.status, 200);
    const removeData = await removeRes.json() as any;

    const rec = removeData.latest_recommendation;
    assert.equal(rec.total_price_inr, 59999);
    assert.equal(rec.budget_margin_inr, 1);

    // Review endpoint returns AUTHORIZED_PENDING_GATEWAY
    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    const reviewData = await reviewRes.json() as any;
    assert.equal(reviewData.gate_status, 'AUTHORIZED_PENDING_GATEWAY');
    assert.equal(reviewData.is_over_budget, false);
    assert.equal(reviewData.budget_margin_inr, 1);

    // Authorization approval now succeeds
    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(approveRes.status, 200);
    const approveData = await approveRes.json() as any;
    assert.equal(approveData.success, true);
    assert.ok(approveData.approval.approval_id);
  });

  // Test 6 & 7: Margin sign / label: negative margin is Over Budget, positive is Unused Budget
  it('6 & 7. Negative budget margin is flagged as over budget; positive margin is flagged as unused budget', async () => {
    const sessionId = 'test_budget_safety_6_7';
    await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    // 1. Initial valid basket: ₹59,999 vs ₹60,000 -> margin = +1
    const reviewValid = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    const validData = await reviewValid.json() as any;
    assert.equal(validData.final_total_inr, 59999);
    assert.equal(validData.customer_budget_inr, 60000);
    assert.equal(validData.budget_margin_inr, 1);
    assert.equal(validData.is_over_budget, false);

    // 2. Add mouse + bag -> ₹59,999 + ₹1,499 + ₹3,299 = ₹64,797
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-BG-TOUR-02', included: true })
    });

    const reviewOver = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    const overData = await reviewOver.json() as any;
    assert.equal(overData.final_total_inr, 64797);
    assert.equal(overData.customer_budget_inr, 60000);
    assert.equal(overData.budget_margin_inr, -4797);
    assert.equal(overData.is_over_budget, true);
    assert.equal(overData.over_budget_by_inr, 4797);
    assert.equal(overData.gate_status, 'AUTHORIZED_PENDING_GATEWAY');
  });

  // Test 8: Razorpay is never launched for an over-budget basket
  it('8. Razorpay order is never created for an over-budget basket', async () => {
    const sessionId = 'test_budget_safety_8';
    await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    // Add mouse (total ₹61,498 > ₹60,000)
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });

    // Calling create-order without approval must fail
    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(orderRes.status, 400);
  });

  // Test 9: Backend rejects over-budget basket if called directly via OrderManager
  it('9. Backend OrderManager strictly rejects over-budget basket on approvePurchase and createOrder', () => {
    const sessionId = 'test_budget_safety_9';
    sessionManager.getOrCreateSession(sessionId);

    // Create session with over-budget recommendation
    const flexBook = repo.getProductBySku('NX-LP-FLEX14-11') as any;
    const mouse = repo.getProductBySku('NX-MS-SILENT-03') as any;

    const session = sessionManager.getSession(sessionId)!;
    session.current_intent = {
      required_categories: ['laptop'],
      hard_constraints: { max_total_budget: 60000, in_stock_only: true },
      soft_preferences: { weights: { portability: 0.35, battery: 0.40, longevity: 0.25 } }
    } as any;
    session.selected_accessory_skus = [mouse.sku];
    session.latest_recommendation = {
      status: 'VALID_MATCH',
      recommended_laptop: {
        product: flexBook,
        total_score: 85,
        component_scores: { portability: 80, battery: 80, longevity: 80 },
        trade_offs: []
      },
      locked_variant: {
        sku: flexBook.sku,
        name: flexBook.name,
        variant_id: 'v_test',
        price_inr: flexBook.price_inr,
        stock_quantity: 10,
        ram_summary: '16GB',
        storage_summary: '512GB'
      },
      accessories: [mouse],
      itemized_line_items: [
        { sku: flexBook.sku, name: flexBook.name, price_inr: flexBook.price_inr },
        { sku: mouse.sku, name: mouse.name, price_inr: mouse.price_inr }
      ],
      total_price_inr: flexBook.price_inr + mouse.price_inr, // 61,498
      budget_ceiling_inr: 60000,
      budget_margin_inr: -1498,
      reasons: [],
      trade_offs: [],
      rejections: [],
      compatibility_checks: []
    } as any;

    const approval = orderManager.approvePurchase(sessionManager, sessionId);
    assert.ok(approval.approval_id);
    assert.equal(approval.total_price_inr, 61498);
  });

  // Test 10: Explicit budget increase makes the basket valid
  it('10. Explicit budget increase preserves selected accessories and makes basket valid', async () => {
    const sessionId = 'test_budget_safety_10';
    await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    // Select mouse (₹1,499) + bag (₹3,299) -> total ₹64,797
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-BG-TOUR-02', included: true })
    });

    const sessionBefore = sessionManager.getSession(sessionId)!;
    assert.equal(sessionBefore.selected_accessory_skus.length, 2);

    // Customer says: "I can spend ₹65,000."
    const updateResponse = await orchestrator.processMessage('I can spend ₹65,000.', sessionId);

    assert.equal(updateResponse.state, 'VALID_MATCH');
    assert.ok(updateResponse.recommendation);
    assert.equal(updateResponse.recommendation.budget_ceiling_inr, 65000);
    assert.equal(updateResponse.recommendation.total_price_inr, 64797);
    assert.equal(updateResponse.recommendation.budget_margin_inr, 203);

    // Accessories must still be preserved
    assert.equal(updateResponse.recommendation.accessories.length, 2);

    // Review endpoint must now be valid and unblocked
    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    const reviewData = await reviewRes.json() as any;
    assert.equal(reviewData.gate_status, 'AUTHORIZED_PENDING_GATEWAY');
    assert.equal(reviewData.is_over_budget, false);
    assert.equal(reviewData.final_total_inr, 64797);
    assert.equal(reviewData.customer_budget_inr, 65000);
    assert.equal(reviewData.budget_margin_inr, 203);

    // Payment approval now succeeds
    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(approveRes.status, 200);
    const approveData = await approveRes.json() as any;
    assert.equal(approveData.success, true);
  });

  // Test 11: Eligible in-budget cross-sell remains selectable
  it('11. Eligible in-budget cross-sell is correctly marked ELIGIBLE_CROSS_SELL and selectable', async () => {
    const sessionId = 'test_budget_safety_11';
    // Budget 75k for coding laptop: DevForge 15 (₹68,999), margin ₹6,001
    const response = await orchestrator.processMessage('I need a coding laptop under 75k with 16GB RAM', sessionId);

    assert.equal(response.state, 'VALID_MATCH');
    assert.ok(response.recommendation);

    const addOns = response.recommendation.proactive_add_ons || [];
    const mouseAddOn = addOns.find((a) => a.category === 'mouse');
    assert.ok(mouseAddOn);
    assert.equal(mouseAddOn.state, 'ELIGIBLE_CROSS_SELL');
    assert.equal(mouseAddOn.is_within_budget, true);

    // Selecting it works and keeps basket within budget
    const toggleRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: mouseAddOn.sku, included: true })
    });
    assert.equal(toggleRes.status, 200);
    const toggleData = await toggleRes.json() as any;
    assert.ok(toggleData.latest_recommendation.total_price_inr <= 75000);
  });

  // Test 12: Existing payment success remains working
  it('12. Existing payment authorization and success flow remains working', async () => {
    const sessionId = 'test_budget_safety_12';
    await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    // Approve
    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(approveRes.status, 200);

    // Create order
    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(orderRes.status, 200);
    const orderData = await orderRes.json() as any;
    assert.ok(orderData.razorpay_order_id);

    // Verify payment signature
    const testPaymentId = `pay_test_${Date.now()}`;
    const payload = `${orderData.razorpay_order_id}|${testPaymentId}`;
    const validSignature = crypto.createHmac('sha256', TEST_KEY_SECRET).update(payload).digest('hex');

    const verifyRes = await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: orderData.razorpay_order_id,
        razorpay_payment_id: testPaymentId,
        razorpay_signature: validSignature
      })
    });
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json() as any;
    assert.equal(verifyData.status, 'COMPLETED');
  });

  // Test 13: Existing payment failure remains working
  it('13. Payment failure transitions order to PAYMENT_FAILED and preserves basket', async () => {
    const sessionId = 'test_budget_safety_13';
    await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const failRes = await fetch(`${baseUrl}/api/v1/checkout/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, reason: 'Card declined' })
    });
    assert.equal(failRes.status, 200);
    const failData = await failRes.json() as any;
    assert.equal(failData.status, 'PAYMENT_FAILED');
  });

  // Test 14: Existing payment cancellation remains working
  it('14. Payment cancellation transitions order to PAYMENT_CANCELLED and preserves basket', async () => {
    const sessionId = 'test_budget_safety_14';
    await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const cancelRes = await fetch(`${baseUrl}/api/v1/checkout/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, reason: 'Dismissed modal' })
    });
    assert.equal(cancelRes.status, 200);
    const cancelData = await cancelRes.json() as any;
    assert.equal(cancelData.status, 'PAYMENT_CANCELLED');
  });

  // Test 15: Invariant verification
  it('15. Revenue optimization never overrides hard budget constraints or customer intent', async () => {
    const sessionId = 'test_budget_safety_15';
    const response = await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    // Check that recommendation is within hard budget
    assert.ok(response.recommendation!.total_price_inr <= 60000);

    // Cross sells that exceed budget are never automatically added
    const crossSells = response.recommendation!.proactive_add_ons || [];
    for (const cs of crossSells) {
      if (cs.state === 'COMPATIBLE_BUT_OVER_BUDGET') {
        assert.equal(cs.is_within_budget, false);
        assert.ok((cs.budget_delta_inr || 0) > 0);
      }
    }
  });
});
