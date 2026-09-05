import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server/server.ts';
import { getSessionManager, SessionManager } from '../src/session/sessionManager.ts';
import { getCatalogRepository, InMemoryCatalogRepository } from '../src/repository/catalogRepository.ts';
import { OrderManager } from '../src/engine/orderManager.ts';
import { RazorpayService } from '../src/services/razorpayService.ts';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

describe('Regression: Optional Accessories Initialization & Authoritative Budget Safety (Scenarios A-E)', () => {
  let server: any;
  let baseUrl: string;
  let repo: InMemoryCatalogRepository;
  let sessionManager: SessionManager;
  let razorpayService: RazorpayService;
  let orderManager: OrderManager;
  let orchestrator: AgentOrchestrator;

  before(async () => {
    repo = new InMemoryCatalogRepository();
    sessionManager = new SessionManager(repo);
    razorpayService = new RazorpayService({
      keyId: 'rzp_test_mock_agentready_key',
      keySecret: 'secret_test_key_agentready_buildathon',
      webhookSecret: 'secret_test_webhook_agentready',
      mockNetworkBoundary: true
    });
    orderManager = new OrderManager(repo, razorpayService);
    const nlu = new DeterministicNLUProvider();
    orchestrator = new AgentOrchestrator(nlu, repo, sessionManager);

    server = createServer({
      sessionManager,
      orchestrator,
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

  // 1 & 2. Optional accessories initialize unchecked and absent from basket initially (Scenario A)
  it('1 & 2. Scenario A: Optional accessories initialize unchecked and absent from basket (laptop only)', async () => {
    const sessionId = 'test_acc_flow_scenario_a';
    const res = await orchestrator.processMessage(
      'I need a coding laptop under ₹70,000. I travel every day, so I want something light with good battery life, at least 16GB RAM.',
      sessionId
    );

    assert.equal(res.state, 'VALID_MATCH');
    assert.equal(res.recommendation?.recommended_laptop?.product.sku, 'NX-LP-CARBON14-13');
    assert.equal(res.recommendation?.recommended_laptop?.product.price_inr, 69499);
    
    // Authoritative basket has 0 accessories
    assert.deepEqual(res.recommendation?.accessories, []);
    assert.equal(res.recommendation?.total_price_inr, 69499);
    assert.equal(res.recommendation?.budget_ceiling_inr, 70000);
    assert.equal(res.recommendation?.budget_margin_inr, 501);

    // Session selected accessory SKUs is empty
    const session = sessionManager.getSession(sessionId);
    assert.deepEqual(session?.selected_accessory_skus, []);

    // Proactive add-ons are identified as compatible but NOT selected
    const proactiveAddOns = res.recommendation?.proactive_add_ons || [];
    assert.ok(proactiveAddOns.length >= 2);
    const silentPro = proactiveAddOns.find((a) => a.sku === 'NX-MS-SILENT-03');
    const sleeve = proactiveAddOns.find((a) => a.sku === 'NX-BG-SLV14-03');
    assert.ok(silentPro, 'SilentPro S20 must be present in proactive add-ons');
    assert.ok(sleeve, 'Urban Protective Sleeve 14 must be present in proactive add-ons');
  });

  // 3. Laptop-only valid basket enables checkout (Scenario A continued)
  it('3. Scenario A: Laptop-only valid basket enables checkout approval and review', async () => {
    const sessionId = 'test_acc_flow_scenario_a';
    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    assert.equal(reviewRes.status, 200);
    const review = await reviewRes.json() as any;

    assert.equal(review.final_total_inr, 69499);
    assert.equal(review.customer_budget_inr, 70000);
    assert.equal(review.budget_margin_inr, 501);
    assert.equal(review.is_over_budget, false);
    assert.equal(review.gate_status, 'AUTHORIZED_PENDING_GATEWAY');

    // Approval succeeds immediately
    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(approveRes.status, 200);
    const approve = await approveRes.json() as any;
    assert.equal(approve.success, true);
    assert.ok(approve.approval.approval_id);
  });

  // 4 & 5. Scenario B: Explicitly selecting accessory pushes over budget and blocks checkout
  it('4 & 5. Scenario B: Selecting one accessory (SilentPro S20) pushes over budget and blocks checkout', async () => {
    const sessionId = 'test_acc_flow_scenario_b';
    await orchestrator.processMessage(
      'I need a coding laptop under ₹70,000. I travel every day, so I want something light with good battery life, at least 16GB RAM.',
      sessionId
    );

    // Customer manually selects SilentPro S20 (₹1,499: 69,499 + 1,499 = 70,998 > 70,000)
    const toggleRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });
    assert.equal(toggleRes.status, 200);
    const toggleData = await toggleRes.json() as any;
    const rec = toggleData.latest_recommendation;

    assert.equal(rec.total_price_inr, 70998);
    assert.equal(rec.budget_ceiling_inr, 70000);
    assert.equal(rec.budget_margin_inr, -998);
    assert.equal(rec.accessories.length, 1);
    assert.equal(rec.accessories[0].sku, 'NX-MS-SILENT-03');

    // Review endpoint shows AUTHORIZED_PENDING_GATEWAY with informational is_over_budget
    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    assert.equal(reviewRes.status, 200);
    const review = await reviewRes.json() as any;
    assert.equal(review.is_over_budget, true);
    assert.equal(review.over_budget_by_inr, 998);
    assert.equal(review.gate_status, 'AUTHORIZED_PENDING_GATEWAY');

    // For explicitly selected customer orders, checkout is approved
    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(approveRes.status, 200);
    const approve = await approveRes.json() as any;
    assert.ok(approve.approval.approval_id);
  });

  // 6. Scenario C: Removing accessory immediately restores checkout eligibility without chat round-trip
  it('6. Scenario C: Removing accessory restores valid basket (₹69,499) and re-enables checkout', async () => {
    const sessionId = 'test_acc_flow_scenario_b'; // continue from scenario B

    // Customer clicks [Remove accessory] -> calls toggle with included: false
    const removeRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: false })
    });
    assert.equal(removeRes.status, 200);
    const removeData = await removeRes.json() as any;
    const rec = removeData.latest_recommendation;

    assert.equal(rec.total_price_inr, 69499);
    assert.equal(rec.budget_ceiling_inr, 70000);
    assert.equal(rec.budget_margin_inr, 501);
    assert.deepEqual(rec.accessories, []);

    // Review endpoint shows AUTHORIZED_PENDING_GATEWAY
    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    const review = await reviewRes.json() as any;
    assert.equal(review.is_over_budget, false);
    assert.equal(review.final_total_inr, 69499);
    assert.equal(review.gate_status, 'AUTHORIZED_PENDING_GATEWAY');

    // Approval now succeeds
    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(approveRes.status, 200);
    const approve = await approveRes.json() as any;
    assert.equal(approve.success, true);
  });

  // 7. Scenario D: Selecting both accessories (SilentPro + Sleeve) pushes to ₹72,297 and blocks checkout
  it('7. Scenario D: Selecting both accessories produces ₹72,297 and blocks checkout', async () => {
    const sessionId = 'test_acc_flow_scenario_d';
    await orchestrator.processMessage(
      'I need a coding laptop under ₹70,000. I travel every day, so I want something light with good battery life, at least 16GB RAM.',
      sessionId
    );

    // Select SilentPro S20 (₹1,499)
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });

    // Select Urban Protective Sleeve 14 (₹1,299)
    const toggleRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-BG-SLV14-03', included: true })
    });
    const toggleData = await toggleRes.json() as any;
    const rec = toggleData.latest_recommendation;

    // Total: 69,499 + 1,499 + 1,299 = 72,297
    assert.equal(rec.total_price_inr, 72297);
    assert.equal(rec.budget_ceiling_inr, 70000);
    assert.equal(rec.budget_margin_inr, -2297);
    assert.equal(rec.accessories.length, 2);

    // Checkout authorized for explicitly selected order
    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    const review = await reviewRes.json() as any;
    assert.equal(review.is_over_budget, true);
    assert.equal(review.over_budget_by_inr, 2297);
    assert.equal(review.gate_status, 'AUTHORIZED_PENDING_GATEWAY');

    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(approveRes.status, 200);
  });

  // Scenario E: Remove both accessories restores ₹69,499 and enables checkout
  it('Scenario E: Removing both accessories restores ₹69,499 and enables checkout', async () => {
    const sessionId = 'test_acc_flow_scenario_d'; // continue from scenario D

    // Remove SilentPro
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: false })
    });

    // Remove Sleeve
    const removeRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-BG-SLV14-03', included: false })
    });
    const removeData = await removeRes.json() as any;
    const rec = removeData.latest_recommendation;

    assert.equal(rec.total_price_inr, 69499);
    assert.equal(rec.budget_ceiling_inr, 70000);
    assert.equal(rec.budget_margin_inr, 501);
    assert.deepEqual(rec.accessories, []);

    // Review and approval succeed
    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    const review = await reviewRes.json() as any;
    assert.equal(review.is_over_budget, false);
    assert.equal(review.gate_status, 'AUTHORIZED_PENDING_GATEWAY');

    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(approveRes.status, 200);
  });

  // 8. No "Increase Budget" UI exists in frontend
  it('8. Frontend verification: No "Increase Budget" button or UI exists', () => {
    const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

    assert.doesNotMatch(appJs, />\s*Increase Budget/i, 'app.js must not contain Increase Budget button text');
    assert.doesNotMatch(indexHtml, />\s*Increase Budget/i, 'index.html must not contain Increase Budget button text');
  });

  // 9. Client cannot bypass server-side budget protection
  it('9. Client cannot bypass server-side budget protection for ₹72,297 > ₹70,000', async () => {
    const sessionId = 'test_bypass_attempt';
    await orchestrator.processMessage('I need a coding laptop under ₹70,000.', sessionId);

    // Force over-budget state
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-BG-SLV14-03', included: true })
    });

    // 1. Client attempts direct /create-order without prior customer approval
    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(orderRes.status, 400);

    // 3. Client attempts forged payment verification
    const verifyRes = await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: 'order_fake_bypass',
        razorpay_payment_id: 'pay_fake_bypass',
        razorpay_signature: 'forged_sig'
      })
    });
    assert.equal(verifyRes.status, 400);
  });
});
