/**
 * Final Product-Quality Test Suite (Track 01 Requirements)
 *
 * Verifies:
 * 1. No-match reports all important constraint failures with counts and alternatives
 * 2. Budget-vs-RAM trade-off alternatives are ranked correctly
 * 3. Partial match identifies unmet constraint explicitly
 * 4. Comparison output uses exact catalog facts (no hallucinations)
 * 5. Recommendation explanation is grounded (evidence-based persuasion, trade-off disclosures)
 * 6. No unsupported category leakage
 * 7. Normal recommendation response processing state sequence
 * 8. Payment success remains backend-authoritative
 * 9. Webhook is processed
 * 10. Duplicate webhook ignored
 * 11. Out-of-order webhook cannot regress paid state
 * 12. Payment failure preserves basket
 * 13. Retry works cleanly without duplicate completion
 */

import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server/server.ts';
import { SessionManager } from '../src/session/sessionManager.ts';
import { InMemoryCatalogRepository } from '../src/repository/catalogRepository.ts';
import { OrderManager } from '../src/engine/orderManager.ts';
import { RazorpayService } from '../src/services/razorpayService.ts';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';
import { analyzeConstraintFailures } from '../src/engine/hardConstraints.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

describe('Final Product-Quality & Verification Suite (Track 01)', () => {
  let server: any;
  let baseUrl: string;
  let repo: InMemoryCatalogRepository;
  let sessionManager: SessionManager;
  let razorpayService: RazorpayService;
  let orderManager: OrderManager;
  let orchestrator: AgentOrchestrator;

  const TEST_KEY_ID = 'rzp_test_quality_pass_key';
  const TEST_KEY_SECRET = 'secret_test_quality_pass_secret';
  const TEST_WEBHOOK_SECRET = 'secret_test_quality_webhook';

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
    orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);

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

  // 1. No-match reports all important constraint failures
  it('1. No-match reports all important constraint failures with counts and alternatives', async () => {
    const sessionId = 'test_qp_nomatch_all';
    const res = await orchestrator.processMessage('I need a laptop under ₹35,000 with 32GB RAM', sessionId);

    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.equal(res.recommendation?.recommended_laptop, null);
    assert.ok(res.recommendation?.constraint_analysis);

    const analysis = res.recommendation.constraint_analysis;
    // Failed constraints identified
    assert.ok(analysis.failed_constraints.includes('BUDGET_CEILING'));
    assert.ok(analysis.failed_constraints.includes('BUDGET_AND_RAM_COMBINATION') || analysis.failed_constraints.includes('MIN_RAM'));

    // Counts present
    assert.equal(analysis.counts.satisfying_ram, 1); // Only WorkStation 16 has 32GB
    assert.equal(analysis.counts.satisfying_budget, 0); // None <= 35k (cheapest is 42,999)

    // Formatted explanation contains all required sections
    assert.ok(res.explanation);
    assert.ok(res.explanation.includes('NO EXACT MATCH'));
    assert.ok(res.explanation.includes('Budget <= ₹35,000'));
    assert.ok(res.explanation.includes('RAM >= 32GB'));
    assert.ok(res.explanation.includes('satisfy the 32GB RAM requirement, but exceed your budget ceiling'));
    assert.ok(res.explanation.includes('Closest options:'));
    assert.ok(res.explanation.includes('Trade-off options:'));
  });

  // 2. Budget-vs-RAM trade-off alternatives are ranked correctly
  it('2. Budget-vs-RAM trade-off alternatives are ranked correctly', async () => {
    const laptops = repo.getLaptops();
    const intent = {
      required_categories: ['laptop'] as any,
      hard_constraints: {
        max_total_budget: 35000,
        min_ram_gb: 32,
        in_stock_only: true
      },
      soft_preferences: {
        weights: { portability: 0.4, battery: 0.35, longevity: 0.25 }
      }
    };

    const analysis = analyzeConstraintFailures(intent, laptops);
    assert.ok(analysis.closest_options.length >= 2);

    // Option A: Cheapest 32GB laptop (WorkStation 16)
    const optA = analysis.closest_options.find((o) => o.type === 'CHEAPEST_SATISFYING_SPEC')!;
    assert.ok(optA);
    assert.equal(optA.sku, 'NX-LP-PRO16-05');
    assert.equal(optA.ram_gb, 32);
    assert.equal(optA.price_inr, 89999);
    assert.equal(optA.budget_delta_inr, 89999 - 35000);

    // Option B: Best laptop closest to budget (Campus 14 @ ₹42,999, 8GB RAM)
    const optB = analysis.closest_options.find((o) => o.type === 'CLOSEST_TO_BUDGET')!;
    assert.ok(optB);
    assert.equal(optB.sku, 'NX-LP-CAMPUS-07');
    assert.equal(optB.ram_gb, 8);
    assert.equal(optB.price_inr, 42999);

    // Option C: Balanced compromise (16GB RAM tier, e.g. FlexBook 14 @ ₹59,999)
    const optC = analysis.closest_options.find((o) => o.type === 'BALANCED_COMPROMISE')!;
    assert.ok(optC);
    assert.equal(optC.ram_gb, 16);

    // Trade-off options formulated
    assert.ok(analysis.trade_off_options.some((t) => t.includes('Increase budget to ₹89,999')));
    assert.ok(analysis.trade_off_options.some((t) => t.includes('Reduce RAM requirement to 16GB')));
  });

  // 3. Partial match identifies unmet constraint
  it('3. Partial match explicitly discloses unmet requirement and amount exceeded', async () => {
    const sessionId = 'test_qp_partial';
    const res = await orchestrator.processMessage('I need a coding laptop under 55k with 16GB RAM', sessionId);

    assert.equal(res.state, 'PARTIAL_MATCH');
    assert.equal(res.match_type, 'PARTIAL_MATCH');
    assert.ok(res.recommendation);
    assert.ok(res.recommendation.recommended_laptop);

    // Unmet constraint explicitly stated
    assert.ok(res.unfulfilled_constraints);
    assert.ok(res.unfulfilled_constraints[0].includes('Budget ceiling of ₹55,000 is exceeded'));

    // Explanation explicitly states: "Closest match found, but it exceeds your ₹55,000 budget by ₹4,999."
    assert.ok(res.explanation);
    assert.ok(res.explanation.includes('Closest match found, but it exceeds your ₹55,000 budget by ₹4,999'));
    assert.ok(res.explanation.includes('Nexora FlexBook 14'));
  });

  // 4. Comparison output uses exact catalog facts
  it('4. Comparison output displays side-by-side specs using exact catalog facts without hallucination', async () => {
    const sessionId = 'test_qp_compare';
    const res = await orchestrator.processMessage('Compare AeroBook 14 and DevForge 15', sessionId);

    assert.ok(res.explanation);
    // Table headers & specs
    assert.ok(res.explanation.includes('Factual Specification Comparison'));
    assert.ok(res.explanation.includes('Nexora AeroBook 14'));
    assert.ok(res.explanation.includes('Nexora DevForge 15'));

    // Exact catalog values
    assert.ok(res.explanation.includes('₹62,999'));
    assert.ok(res.explanation.includes('₹64,999'));
    assert.ok(res.explanation.includes('16GB LPDDR5 (Soldered)'));
    assert.ok(res.explanation.includes('16GB DDR5 (Expandable)'));
    assert.ok(res.explanation.includes('1.28kg (1280g)'));
    assert.ok(res.explanation.includes('1.82kg (1820g)'));
    assert.ok(res.explanation.includes('57Wh (10.5 hrs)'));
    assert.ok(res.explanation.includes('52Wh (7 hrs)'));
    assert.ok(res.explanation.includes('Thunderbolt 4'));
    assert.ok(res.explanation.includes('12 units available'));
    assert.ok(res.explanation.includes('8 units available'));

    // Negative check: No fake benchmarks or FPS
    assert.equal(res.explanation.includes('Geekbench'), false);
    assert.equal(res.explanation.includes('FPS'), false);
    assert.equal(res.explanation.includes('Cinebench'), false);
  });

  // 5. Grounded evidence-based persuasion
  it('5. Decision inquiry returns grounded evidence-based persuasion without manipulative hype', async () => {
    const sessionId = 'test_qp_decision';
    const res = await orchestrator.processMessage('Which one should I buy for coding and daily travel?', sessionId);

    assert.ok(res.explanation);
    // Recommends AeroBook based on travel priorities
    assert.ok(res.explanation.includes('Nexora AeroBook 14'));
    assert.ok(res.explanation.includes('Portability'));
    assert.ok(res.explanation.includes('0.54kg lighter'));
    assert.ok(res.explanation.includes('Battery'));
    assert.ok(res.explanation.includes('57Wh battery provides 5Wh more capacity'));

    // Explicitly discloses hardware trade-off
    assert.ok(res.explanation.includes('Trade-off to consider'));
    assert.ok(res.explanation.includes('soldered and non-expandable'));

    // Negative check: Zero manipulative or absolute claims
    assert.equal(res.explanation.toLowerCase().includes('perfect product'), false);
    assert.equal(res.explanation.toLowerCase().includes('best ever'), false);
    assert.equal(res.explanation.toLowerCase().includes('you must buy this'), false);
    assert.equal(res.explanation.toLowerCase().includes('guaranteed'), false);
  });

  // 6. No unsupported category leakage
  it('6. Unsupported category query produces NO_CATEGORY_MATCH with zero product recommendations', async () => {
    const sessionId = 'test_qp_shoes';
    const res = await orchestrator.processMessage('I need running shoes under ₹5,000', sessionId);

    assert.equal(res.state, 'NO_CATEGORY_MATCH');
    assert.equal(res.match_type, 'NO_CATEGORY_MATCH');
    assert.equal(res.recommendation?.recommended_laptop, null);
    assert.equal(res.recommendation?.accessories.length, 0);
    assert.equal(res.recommendation?.itemized_line_items.length, 0);

    // Negative check: Zero unrelated catalog items leaked
    assert.equal(res.explanation?.includes('AeroBook'), false);
    assert.equal(res.explanation?.includes('DevForge'), false);
    assert.equal(res.explanation?.includes('ErgoMouse'), false);
    assert.ok(res.explanation?.toLowerCase().includes('does not currently sell running shoes'));
  });

  // 7. Normal recommendation response has processing state sequence
  it('7. Frontend app.js defines sequential loading steps and bounded duration', () => {
    const appJsContent = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
    const styleCssContent = fs.readFileSync(path.join(PUBLIC_DIR, 'style.css'), 'utf8');

    // Sequential states present in app.js
    assert.ok(appJsContent.includes('Understanding your requirements…'));
    assert.ok(appJsContent.includes('Checking Nexora’s catalog…'));
    assert.ok(appJsContent.includes('Comparing available options…'));

    // Bounded delay (~1600ms)
    assert.ok(appJsContent.includes('1600 - elapsed'));

    // Spinner CSS present
    assert.ok(styleCssContent.includes('.inline-spinner'));
  });

  // 8. Payment success remains backend-authoritative
  it('8. Payment order creation strictly ignores client-supplied amount and computes authoritative total', async () => {
    const sessionId = 'test_qp_auth_math';
    // Establish recommendation
    await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a coding laptop under 70k with 16GB RAM, mouse and bag'
      })
    });

    // Approve
    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    // Malicious client tries amount = 100
    const res = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, amount: 100 })
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.amount, 6729700); // 6,729,700 paise (₹67,297), NOT 100
  });

  // 9. Webhook is processed
  it('9. Razorpay webhook with valid raw-body signature is verified and finalizes order', async () => {
    const sessionId = 'test_qp_webhook_proc';
    await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a coding laptop under 70k with 16GB RAM, mouse and bag'
      })
    });

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_hook_qp_123',
            order_id: orderData.razorpay_order_id,
            amount: orderData.amount,
            status: 'captured'
          }
        }
      }
    });

    const signature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    const hookRes = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': signature,
        'X-Razorpay-Event-Id': 'evt_qp_hook_999'
      },
      body: rawPayload
    });

    assert.equal(hookRes.status, 200);
    const hookData = await hookRes.json() as any;
    assert.equal(hookData.processed, true);

    const internalOrder = orderManager.getOrder(orderData.internal_order_id)!;
    assert.equal(internalOrder.status, 'COMPLETED');
  });

  // 10. Duplicate webhook ignored
  it('10. Duplicate webhook delivery is recognized and ignored without duplicate processing', async () => {
    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_dup_qp' } } }
    });

    const signature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    const eventId = 'evt_duplicate_quality_test';

    const res1 = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': signature,
        'X-Razorpay-Event-Id': eventId
      },
      body: rawPayload
    });
    assert.equal(res1.status, 200);

    const res2 = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': signature,
        'X-Razorpay-Event-Id': eventId
      },
      body: rawPayload
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json() as any;
    assert.equal(data2.processed, false);
    assert.ok(data2.message.includes('Duplicate'));
  });

  // 11. Out-of-order webhook cannot regress paid state
  it('11. Out-of-order webhook cannot regress an already COMPLETED order to PAYMENT_FAILED', async () => {
    const sessionId = 'test_qp_order_order';
    await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a coding laptop under 70k with 16GB RAM, mouse and bag'
      })
    });

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    // Verify payment first -> marks COMPLETED
    const paymentId = `pay_complete_qp_${Date.now()}`;
    const payload = `${orderData.razorpay_order_id}|${paymentId}`;
    const validSig = crypto.createHmac('sha256', TEST_KEY_SECRET).update(payload).digest('hex');

    await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: orderData.razorpay_order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSig
      })
    });

    const internalOrder = orderManager.getOrder(orderData.internal_order_id)!;
    assert.equal(internalOrder.status, 'COMPLETED');

    // Late arriving payment.failed webhook
    const rawFailPayload = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            order_id: orderData.razorpay_order_id,
            error_description: 'Late decline arrived out of order'
          }
        }
      }
    });

    const failSig = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(rawFailPayload, 'utf8'))
      .digest('hex');

    await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': failSig,
        'X-Razorpay-Event-Id': 'evt_late_fail_123'
      },
      body: rawFailPayload
    });

    // State MUST NOT regress to PAYMENT_FAILED
    assert.equal(internalOrder.status, 'COMPLETED');
  });

  // 12. Payment failure preserves basket
  it('12. Payment failure preserves basket and selected accessories for retry', async () => {
    const sessionId = 'test_qp_fail_basket';
    await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a coding laptop under 70k with 16GB RAM, mouse and bag'
      })
    });

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
      body: JSON.stringify({ session_id: sessionId, reason: 'Insufficient funds' })
    });
    assert.equal(failRes.status, 200);

    const session = sessionManager.getSession(sessionId)!;
    assert.ok(session.latest_recommendation);
    assert.equal(session.selected_accessory_skus.length, 2);
  });

  // 13. Retry works
  it('13. Retry workflow re-approves basket and completes order without duplicating orders', async () => {
    const sessionId = 'test_qp_retry_flow';
    await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a coding laptop under 70k with 16GB RAM, mouse and bag'
      })
    });

    // Attempt 1: Cancel
    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const order1Res = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const order1Data = await order1Res.json() as any;

    await fetch(`${baseUrl}/api/v1/checkout/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    // Attempt 2 (Retry): Re-approve and create new attempt
    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const order2Res = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const order2Data = await order2Res.json() as any;

    assert.notEqual(order1Data.internal_order_id, order2Data.internal_order_id);

    // Complete attempt 2
    const paymentId = `pay_retry_qp_${Date.now()}`;
    const payload = `${order2Data.razorpay_order_id}|${paymentId}`;
    const sig = crypto.createHmac('sha256', TEST_KEY_SECRET).update(payload).digest('hex');

    const verifyRes = await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: order2Data.razorpay_order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: sig
      })
    });

    assert.equal(verifyRes.status, 200);
    const order2 = orderManager.getOrder(order2Data.internal_order_id)!;
    assert.equal(order2.status, 'COMPLETED');
    const order1 = orderManager.getOrder(order1Data.internal_order_id)!;
    assert.equal(order1.status, 'PAYMENT_CANCELLED');
  });
});
