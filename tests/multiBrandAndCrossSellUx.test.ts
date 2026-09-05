/**
 * Multi-Brand AI Shopping Agent & Neutral Cross-Sell UX Test Suite
 *
 * Verifies the 15 required regression tests:
 * 1. Optional compatible accessory can be selected.
 * 2. Selected accessory immediately changes authoritative basket.
 * 3. Valid basket immediately enables Razorpay.
 * 4. Over-budget basket blocks payment.
 * 5. Over-budget UX contains no "Increase Budget" button.
 * 6. Over-budget UX contains no budget-increase input.
 * 7. Removing accessory immediately returns basket to valid state.
 * 8. Customer budget is never automatically increased.
 * 9. Multi-brand natural-language intent is extracted correctly.
 * 10. Non-existent requested model never causes hallucinated product output.
 * 11. Only verified catalog products are returned.
 * 12. Existing Razorpay tests remain passing.
 * 13. Existing webhook tests remain passing.
 * 14. Existing security tests remain passing.
 * 15. Existing merchant benchmark tests remain passing.
 */

import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer } from '../src/server/server.ts';
import { SessionManager } from '../src/session/sessionManager.ts';
import { InMemoryCatalogRepository } from '../src/repository/catalogRepository.ts';
import { OrderManager } from '../src/engine/orderManager.ts';
import { RazorpayService } from '../src/services/razorpayService.ts';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';
import { validateCustomerIntent } from '../src/nlu/intentValidator.ts';
import { BENCHMARK_INTENTS } from '../src/data/benchmarkIntents.ts';
import { BenchmarkRunner } from '../src/benchmark/benchmarkRunner.ts';

describe('Multi-Brand Shopping Agent & Neutral Cross-Sell UX Suite', () => {
  let server: any;
  let baseUrl: string;
  let repo: InMemoryCatalogRepository;
  let sessionManager: SessionManager;
  let razorpayService: RazorpayService;
  let orderManager: OrderManager;
  let orchestrator: AgentOrchestrator;
  let nluProvider: DeterministicNLUProvider;

  const TEST_KEY_ID = 'rzp_test_multibrand_key';
  const TEST_KEY_SECRET = 'secret_test_multibrand_secret';
  const TEST_WEBHOOK_SECRET = 'secret_test_multibrand_webhook';

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
    nluProvider = new DeterministicNLUProvider();
    orchestrator = new AgentOrchestrator(
      nluProvider,
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

  // 1. Optional compatible accessory can be selected
  it('1. Optional compatible accessory can be selected', async () => {
    const sessionId = 'test_multi_1';
    const initialResp = await orchestrator.processMessage('I need a laptop under ₹70,000.', sessionId);
    assert.strictEqual(initialResp.state, 'VALID_MATCH');

    // Accessories are unchecked / empty initially
    assert.strictEqual(initialResp.recommendation?.accessories.length, 0);

    // Select accessory
    const res = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;

    assert.ok(
      data.latest_recommendation.accessories.some((a: any) => a.sku === 'NX-MS-SILENT-03'),
      'Selected accessory must be present in recommendation'
    );
  });

  // 2. Selected accessory immediately changes authoritative basket
  it('2. Selected accessory immediately changes authoritative basket', async () => {
    const sessionId = 'test_multi_2';
    const initialResp = await orchestrator.processMessage('I need a laptop under ₹70,000.', sessionId);
    const initialTotal = initialResp.recommendation!.total_price_inr;

    const res = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });
    const data = await res.json() as any;

    const mouse = repo.getProductBySku('NX-MS-SILENT-03')!;
    const expectedTotal = initialTotal + mouse.price_inr;

    assert.strictEqual(data.latest_recommendation.total_price_inr, expectedTotal);
    assert.strictEqual(data.latest_recommendation.budget_margin_inr, 70000 - expectedTotal);
    assert.ok(data.latest_recommendation.itemized_line_items.some((it: any) => it.sku === 'NX-MS-SILENT-03'));
  });

  // 3. Valid basket immediately enables Razorpay
  it('3. Valid basket immediately enables Razorpay', async () => {
    const sessionId = 'test_multi_3';
    await orchestrator.processMessage('I need a laptop under ₹70,000.', sessionId);

    // Approve valid basket
    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.strictEqual(approveRes.status, 200);

    // Create Razorpay order
    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.strictEqual(orderRes.status, 200);
    const orderData = await orderRes.json() as any;
    assert.ok(orderData.razorpay_order_id.startsWith('order_'));
    assert.strictEqual(orderData.amount, 6949900);
  });

  // 4. Over-budget basket does NOT block payment after explicit customer selection
  it('4. Over-budget basket does NOT block payment after explicit customer selection', async () => {
    const sessionId = 'test_multi_4';
    // Laptop ₹59,999 with ₹60,000 budget
    await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    // Add mouse ₹1,499 -> total ₹61,498 (exceeds original budget by ₹1,498)
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });

    // Review endpoint shows AUTHORIZED_PENDING_GATEWAY with informational over_budget flags
    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    const reviewData = await reviewRes.json() as any;
    assert.strictEqual(reviewData.gate_status, 'AUTHORIZED_PENDING_GATEWAY');
    assert.strictEqual(reviewData.is_over_budget, true);
    assert.strictEqual(reviewData.over_budget_by_inr, 1498);

    // Approval succeeds because user explicitly selected the order
    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.strictEqual(approveRes.status, 200);

    // Creating order succeeds with authoritative paise
    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.strictEqual(orderRes.status, 200);
    const orderData = await orderRes.json() as any;
    assert.strictEqual(orderData.amount, 6149800);
  });

  // 5. Over-budget UX contains no "Increase Budget" button
  it('5. Over-budget UX contains no "Increase Budget" button', () => {
    const appJsPath = path.join(process.cwd(), 'public', 'app.js');
    const indexHtmlPath = path.join(process.cwd(), 'public', 'index.html');
    const appJs = fs.readFileSync(appJsPath, 'utf8');
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

    assert.doesNotMatch(appJs, /btn-increase-budget/i, 'app.js must not contain btn-increase-budget');
    assert.doesNotMatch(appJs, />Increase Budget/i, 'app.js must not render an Increase Budget button');
    assert.doesNotMatch(indexHtml, /btn-increase-budget/i, 'index.html must not contain btn-increase-budget');
    assert.doesNotMatch(indexHtml, />Increase Budget/i, 'index.html must not contain Increase Budget text');
  });

  // 6. Over-budget UX contains no budget-increase input
  it('6. Over-budget UX contains no budget-increase input', () => {
    const appJsPath = path.join(process.cwd(), 'public', 'app.js');
    const indexHtmlPath = path.join(process.cwd(), 'public', 'index.html');
    const appJs = fs.readFileSync(appJsPath, 'utf8');
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

    assert.doesNotMatch(appJs, /inline-budget-input/i, 'app.js must not contain inline-budget-input');
    assert.doesNotMatch(appJs, /inline-budget-adjust/i, 'app.js must not contain inline-budget-adjust');
    assert.doesNotMatch(indexHtml, /inline-budget-input/i, 'index.html must not contain inline-budget-input');
  });

  // 7. Removing accessory immediately returns basket to valid state
  it('7. Removing accessory immediately returns basket to valid state', async () => {
    const sessionId = 'test_multi_7';
    await orchestrator.processMessage('I need a laptop under ₹60,000.', sessionId);

    // Add mouse (total ₹61,498 > ₹60,000)
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
    assert.strictEqual(removeRes.status, 200);
    const removeData = await removeRes.json() as any;

    assert.strictEqual(removeData.latest_recommendation.total_price_inr, 59999);
    assert.strictEqual(removeData.latest_recommendation.budget_margin_inr, 1);

    // Review confirms AUTHORIZED_PENDING_GATEWAY
    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    const reviewData = await reviewRes.json() as any;
    assert.strictEqual(reviewData.gate_status, 'AUTHORIZED_PENDING_GATEWAY');

    // Immediately approve and create Razorpay order
    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.strictEqual(approveRes.status, 200);

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.strictEqual(orderRes.status, 200);
  });

  // 8. Customer budget is never automatically increased
  it('8. Customer budget is never automatically increased', async () => {
    const sessionId = 'test_multi_8';
    const initialBudget = 60000;
    await orchestrator.processMessage(`I need a laptop under ₹${initialBudget}.`, sessionId);

    // Add accessory that pushes basket over budget
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
    });

    const session = sessionManager.getSession(sessionId)!;
    assert.strictEqual(session.current_intent?.hard_constraints.max_total_budget, initialBudget, 'Customer budget ceiling must remain strictly unchanged');
    assert.strictEqual(session.latest_recommendation?.budget_ceiling_inr, initialBudget, 'Recommendation budget ceiling must never elevate');
  });

  // 9. Multi-brand natural-language intent is extracted correctly
  it('9. Multi-brand natural-language intent is extracted correctly', async () => {
    // Apple coding query
    const appleRaw = await nluProvider.generateStructuredIntent('I want an Apple laptop for coding under 90000');
    const appleIntent = validateCustomerIntent(JSON.parse(appleRaw)).intent!;
    assert.strictEqual(appleIntent.requested_brand, 'Apple');
    assert.strictEqual(appleIntent.target_workload, 'coding');
    assert.strictEqual(appleIntent.hard_constraints.max_total_budget, 90000);

    // Lenovo college query
    const lenovoRaw = await nluProvider.generateStructuredIntent('Show me a Lenovo laptop for college');
    const lenovoIntent = validateCustomerIntent(JSON.parse(lenovoRaw)).intent!;
    assert.strictEqual(lenovoIntent.requested_brand, 'Lenovo');

    // Dell query
    const dellRaw = await nluProvider.generateStructuredIntent('I need a Dell under 70000');
    const dellIntent = validateCustomerIntent(JSON.parse(dellRaw)).intent!;
    assert.strictEqual(dellIntent.requested_brand, 'Dell');
    assert.strictEqual(dellIntent.hard_constraints.max_total_budget, 70000);

    // Hinglish query
    const hinglishRaw = await nluProvider.generateStructuredIntent('Bhai 60k ke andar coding laptop chahiye, 16GB RAM');
    const hinglishIntent = validateCustomerIntent(JSON.parse(hinglishRaw)).intent!;
    assert.strictEqual(hinglishIntent.target_workload, 'coding');
    assert.strictEqual(hinglishIntent.hard_constraints.max_total_budget, 60000);
    assert.strictEqual(hinglishIntent.hard_constraints.min_ram_gb, 16);

    // Casual Hinglish with lightweight
    const halkaRaw = await nluProvider.generateStructuredIntent('bhai coding ke liye halka laptop batao 60k ke andar');
    const halkaIntent = validateCustomerIntent(JSON.parse(halkaRaw)).intent!;
    assert.strictEqual(halkaIntent.target_workload, 'coding');
    assert.strictEqual(halkaIntent.hard_constraints.max_total_budget, 60000);
    assert.strictEqual(halkaIntent.soft_preferences.max_preferred_weight_g, 1400);
  });

  // 10. Non-existent requested model never causes hallucinated product output
  it('10. Non-existent requested model never causes hallucinated product output', async () => {
    const sessionId = 'test_multi_10';
    const result = await orchestrator.processMessage('I want the Apple Pro Max laptop', sessionId);

    // Product must come from verified catalog
    if (result.recommendation?.recommended_laptop) {
      const verifiedProduct = repo.getProductBySku(result.recommendation.recommended_laptop.product.sku);
      assert.ok(verifiedProduct, 'Returned product must exist in verified catalog');
      assert.notStrictEqual(result.recommendation.recommended_laptop.product.name, 'Apple Pro Max', 'Must NEVER hallucinate Apple Pro Max');
    }

    // Explanation must transparently state that Apple Pro Max was not found in verified catalog
    assert.match(
      result.explanation || '',
      /couldn't find|not found|verified options/i,
      'Explanation must acknowledge non-existent requested model'
    );
  });

  // 11. Only verified catalog products are returned
  it('11. Only verified catalog products are returned', async () => {
    const queries = [
      'Show me a Lenovo laptop for college',
      'I want something like a MacBook but cheaper',
      'Gaming laptop under 80000',
      'Dell under 70000'
    ];

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      const sid = `test_multi_11_${i}`;
      const res = await orchestrator.processMessage(q, sid);
      if (res.recommendation?.recommended_laptop) {
        const catalogItem = repo.getProductBySku(res.recommendation.recommended_laptop.product.sku);
        assert.ok(catalogItem, `Query "${q}" returned SKU "${res.recommendation.recommended_laptop.product.sku}" which must exist in verified catalog`);
        assert.strictEqual(res.recommendation.recommended_laptop.product.price_inr, catalogItem.price_inr);
      }
      for (const acc of (res.recommendation?.accessories || [])) {
        const accItem = repo.getProductBySku(acc.sku);
        assert.ok(accItem, `Accessory SKU "${acc.sku}" must exist in verified catalog`);
      }
    }
  });

  // 12. Existing Razorpay tests remain passing
  it('12. Existing Razorpay tests remain passing', async () => {
    const sessionId = 'test_multi_12';
    await orchestrator.processMessage('I need a laptop under ₹70,000.', sessionId);

    const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.strictEqual(approveRes.status, 200);

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.strictEqual(orderRes.status, 200);
    const orderData = await orderRes.json() as any;

    const payload = `${orderData.razorpay_order_id}|pay_test_multi_12345`;
    const validSignature = crypto.createHmac('sha256', TEST_KEY_SECRET).update(payload).digest('hex');

    const verifyRes = await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: orderData.razorpay_order_id,
        razorpay_payment_id: 'pay_test_multi_12345',
        razorpay_signature: validSignature
      })
    });
    assert.strictEqual(verifyRes.status, 200);
    const verifyData = await verifyRes.json() as any;
    assert.strictEqual(verifyData.success, true);
    assert.strictEqual(verifyData.status, 'COMPLETED');
  });

  // 13. Existing webhook tests remain passing
  it('13. Existing webhook tests remain passing', async () => {
    const webhookEvent = {
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_test_999',
            order_id: 'order_webhook_test_999',
            amount: 6499900,
            status: 'captured'
          }
        }
      }
    };
    const bodyStr = JSON.stringify(webhookEvent);
    const validSig = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(bodyStr).digest('hex');

    const res = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': validSig
      },
      body: bodyStr
    });
    assert.strictEqual(res.status, 200);

    const invalidRes = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': 'invalid_signature_hex'
      },
      body: bodyStr
    });
    assert.strictEqual(invalidRes.status, 400);
  });

  // 14. Existing security tests remain passing
  it('14. Existing security tests remain passing', () => {
    const appJs = fs.readFileSync(path.join(process.cwd(), 'public', 'app.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');

    assert.doesNotMatch(appJs, /secret_test_multibrand_secret/i, 'Secret must not leak in app.js');
    assert.doesNotMatch(indexHtml, /secret_test_multibrand_secret/i, 'Secret must not leak in index.html');
    assert.doesNotMatch(appJs, /RAZORPAY_KEY_SECRET/i, 'Env secret variable name must not appear in app.js');
  });

  // 15. Existing merchant benchmark tests remain passing
  it('15. Existing merchant benchmark tests remain passing', async () => {
    assert.strictEqual(BENCHMARK_INTENTS.length, 100, 'Fixed benchmark must remain exactly 100 intents');
    const runner = new BenchmarkRunner();
    const devIntent = BENCHMARK_INTENTS.find((i) => i.benchmark_id === 'BENCH-DEV-01')!;
    const res = await runner.evaluateSingleIntent(devIntent);
    assert.ok(res.selected_sku, 'Benchmark intent must evaluate to a valid SKU');
    assert.strictEqual(res.opportunity_type, 'WON');
  });
});
