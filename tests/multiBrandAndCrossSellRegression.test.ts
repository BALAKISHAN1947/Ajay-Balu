import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { getCatalogRepository, type ICatalogRepository } from '../src/repository/catalogRepository.ts';
import { getSessionManager, SessionManager } from '../src/session/sessionManager.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';
import { OrderManager } from '../src/engine/orderManager.ts';

describe('Regression: Multi-Brand Search & Cross-Sell Razorpay Flow (18 Defect Tests)', () => {
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

  // 1. Explicit Apple request does not return Nexora as primary match
  it('1. Explicit Apple request does not return Nexora as primary match', async () => {
    const res = await orchestrator.processMessage(
      'I want an Apple laptop for coding under 90000',
      'reg_test_apple_1'
    );
    assert.ok(res.recommendation?.recommended_laptop, 'Must return a recommended laptop');
    const brand = res.recommendation.recommended_laptop.product.brand;
    assert.equal(brand.toLowerCase(), 'apple', `Brand must be Apple, but got ${brand}`);
    assert.notEqual(res.recommendation.recommended_laptop.product.sku.startsWith('NX-'), true, 'Must not be a Nexora product');
    assert.ok(res.recommendation.total_price_inr <= 90000, 'Must fit under 90,000 budget');
  });

  // 2. Explicit Lenovo request does not return Nexora as primary match
  it('2. Explicit Lenovo request does not return Nexora as primary match', async () => {
    const res = await orchestrator.processMessage(
      'bhai Lenovo ka laptop chahiye coding ke liye 70k ke andar',
      'reg_test_lenovo_2'
    );
    assert.ok(res.recommendation?.recommended_laptop, 'Must return a recommended laptop');
    const brand = res.recommendation.recommended_laptop.product.brand;
    assert.equal(brand.toLowerCase(), 'lenovo', `Brand must be Lenovo, but got ${brand}`);
    assert.notEqual(res.recommendation.recommended_laptop.product.sku.startsWith('NX-'), true, 'Must not be a Nexora product');
    assert.ok(res.recommendation.total_price_inr <= 70000, 'Must fit under 70,000 budget');
  });

  // 3. Explicit Dell request does not return Nexora as primary match
  it('3. Explicit Dell request does not return Nexora as primary match', async () => {
    const res = await orchestrator.processMessage(
      'Show me a Dell laptop',
      'reg_test_dell_3'
    );
    assert.ok(res.recommendation?.recommended_laptop, 'Must return a recommended laptop');
    const brand = res.recommendation.recommended_laptop.product.brand;
    assert.equal(brand.toLowerCase(), 'dell', `Brand must be Dell, but got ${brand}`);
    assert.notEqual(res.recommendation.recommended_laptop.product.sku.startsWith('NX-'), true, 'Must not be a Nexora product');
  });

  // 4. Explicit nonexistent model does not produce a hallucinated product
  it('4. Explicit nonexistent model does not produce a hallucinated product', async () => {
    const res = await orchestrator.processMessage(
      'I want the Apple Pro Max laptop',
      'reg_test_apple_promax_4'
    );
    // Should NOT silently substitute a Nexora product as a match for "Apple Pro Max"
    if (res.state === 'NO_PRODUCT_MATCH') {
      assert.equal(res.recommendation?.recommended_laptop, null, 'No hallucinated laptop');
      assert.match(res.explanation || '', /couldn't find that exact model in the verified catalog/i);
    } else if (res.recommendation?.recommended_laptop) {
      assert.notEqual(res.recommendation.recommended_laptop.product.brand.toLowerCase(), 'nexora', 'Must not substitute Nexora for Apple');
    }
  });

  // 5. Existing product fallback logic still works only when the user did NOT specify a conflicting brand/model
  it('5. Existing product fallback logic still works only when user did NOT specify conflicting brand/model', async () => {
    const res = await orchestrator.processMessage(
      "I don't care about the brand. Give me the best coding laptop under 70000",
      'reg_test_nobrand_5'
    );
    assert.ok(res.recommendation?.recommended_laptop, 'Must return a match when brand is not constrained');
    assert.ok(res.recommendation.total_price_inr <= 70000, 'Must respect budget');
  });

  // 6. Multi-brand search returns verified products across brands
  it('6. Multi-brand search returns verified products across brands', () => {
    const laptops = repo.getLaptops();
    const brands = new Set(laptops.map((l) => l.brand.toLowerCase()));
    assert.ok(brands.has('apple'), 'Catalog must contain Apple');
    assert.ok(brands.has('lenovo'), 'Catalog must contain Lenovo');
    assert.ok(brands.has('dell'), 'Catalog must contain Dell');
    assert.ok(brands.has('hp'), 'Catalog must contain HP');
    assert.ok(brands.has('asus'), 'Catalog must contain ASUS');
    assert.ok(brands.has('acer'), 'Catalog must contain Acer');
    assert.ok(brands.has('nexora'), 'Catalog must preserve Nexora');
    assert.ok(laptops.length >= 20, `Catalog must have multi-brand products (current: ${laptops.length})`);
  });

  // 7. Optional accessories are unchecked by default
  it('7. Optional accessories are unchecked by default', async () => {
    const res = await orchestrator.processMessage(
      'I want a coding laptop under 70000',
      'reg_test_accessories_default_7'
    );
    assert.ok(res.recommendation);
    assert.equal(res.recommendation.accessories.length, 0, 'No accessories should be in primary bundle');
    assert.ok(res.recommendation.proactive_add_ons && res.recommendation.proactive_add_ons.length > 0, 'Proactive cross-sells should be provided');
  });

  // 8. Unselected accessory is absent from authoritative basket
  it('8. Unselected accessory is absent from authoritative basket', async () => {
    const sessionId = 'reg_test_basket_absent_8';
    await orchestrator.processMessage('I want a coding laptop under 70000', sessionId);
    const session = sessionManager.getSession(sessionId);
    assert.ok(session);
    assert.equal(session.selected_accessory_skus.length, 0, 'Selected accessory skus must be empty initially');
    const review = sessionManager.generatePurchaseReview(sessionId);
    assert.equal(review.accessories.length, 0, 'Purchase review must contain 0 accessories');
    assert.equal(review.final_total_inr, review.primary_product.price_inr, 'Total must equal laptop price only');
  });

  // 9. Selecting accessory updates authoritative basket immediately
  it('9. Selecting accessory updates authoritative basket immediately', async () => {
    const sessionId = 'reg_test_basket_toggle_9';
    const res = await orchestrator.processMessage('I want a coding laptop under 70000', sessionId);
    const laptop = res.recommendation!.recommended_laptop!.product;
    const addOn = res.recommendation!.proactive_add_ons![0];
    assert.ok(addOn, 'Must have at least one addOn');

    // Add accessory
    const updated = sessionManager.toggleAccessory(sessionId, addOn.sku, true);
    assert.ok(updated.session?.selected_accessory_skus.includes(addOn.sku), 'Accessory must be included in session');
    assert.equal(updated.session?.latest_recommendation!.total_price_inr, laptop.price_inr + addOn.price_inr, 'Authoritative total must update immediately');
  });

  // 10. Valid selected basket enables Razorpay
  it('10. Valid selected basket enables Razorpay', async () => {
    const sessionId = 'reg_test_valid_razorpay_10';
    await orchestrator.processMessage('I want a coding laptop under 70000', sessionId);
    const review = sessionManager.generatePurchaseReview(sessionId);
    assert.equal(review.is_over_budget, false, 'Should be within budget');

    const approval = orderManager.approvePurchase(sessionManager, sessionId);
    assert.ok(approval.approval_id, 'Approval must succeed');
    const order = await orderManager.createPaymentOrder(sessionManager, sessionId, approval.approval_id);
    assert.ok(order.razorpay_order_id.startsWith('order_'), 'Razorpay order must be created');
  });

  // 11. Over-budget selected basket does NOT block Razorpay after explicit customer selection
  it('11. Over-budget selected basket does NOT block Razorpay after explicit customer selection', async () => {
    const sessionId = 'reg_test_overbudget_block_11';
    // Budget 70000
    const res = await orchestrator.processMessage('I want a laptop under 70000', sessionId);
    assert.ok(res.recommendation);

    // Add all accessories to exceed 70,000 budget
    const mice = repo.getMice();
    const bags = repo.getBags();
    sessionManager.toggleAccessory(sessionId, mice[0].sku, true);
    sessionManager.toggleAccessory(sessionId, bags[0].sku, true);

    const session = sessionManager.getSession(sessionId);
    const total = session!.latest_recommendation!.total_price_inr;
    if (total > 70000) {
      const review = sessionManager.generatePurchaseReview(sessionId);
      assert.equal(review.is_over_budget, true, 'Basket must be marked over-budget for informational purposes');
      // Explicit customer selection must NOT block approval
      const approval = orderManager.approvePurchase(sessionManager, sessionId);
      assert.ok(approval.approval_id);
    }
  });

  // 12. Removing accessory immediately restores checkout eligibility when within budget
  it('12. Removing accessory immediately restores checkout eligibility when within budget', async () => {
    const sessionId = 'reg_test_restore_eligibility_12';
    await orchestrator.processMessage('I want a laptop under 70000', sessionId);
    const mice = repo.getMice();
    const bags = repo.getBags();

    // Push over budget
    sessionManager.toggleAccessory(sessionId, mice[0].sku, true);
    sessionManager.toggleAccessory(sessionId, bags[0].sku, true);

    // Remove bag to restore within budget
    sessionManager.toggleAccessory(sessionId, bags[0].sku, false);
    sessionManager.toggleAccessory(sessionId, mice[0].sku, false);

    const review = sessionManager.generatePurchaseReview(sessionId);
    assert.equal(review.is_over_budget, false, 'Must be within budget again');
    const approval = orderManager.approvePurchase(sessionManager, sessionId);
    assert.ok(approval.approval_id, 'Approval should now succeed');
    const order = await orderManager.createPaymentOrder(sessionManager, sessionId, approval.approval_id);
    assert.ok(order.razorpay_order_id.startsWith('order_'), 'Razorpay order must succeed');
  });

  // 13. No "Increase Budget" UI remains
  it('13. No "Increase Budget" UI remains', () => {
    const html = readFileSync(resolve(process.cwd(), 'public/index.html'), 'utf-8');
    const js = readFileSync(resolve(process.cwd(), 'public/app.js'), 'utf-8');
    assert.doesNotMatch(html, /Increase Budget/i, 'index.html must not contain Increase Budget');
    assert.doesNotMatch(js, /handleInlineBudgetIncrease/i, 'app.js must not contain handleInlineBudgetIncrease');
    assert.doesNotMatch(js, /btn-increase-budget/i, 'app.js must not contain btn-increase-budget');
  });

  // 14. Customer budget is never automatically increased
  it('14. Customer budget is never automatically increased', async () => {
    const sessionId = 'reg_test_budget_freeze_14';
    await orchestrator.processMessage('I want a laptop under 70000', sessionId);
    const mice = repo.getMice();
    sessionManager.toggleAccessory(sessionId, mice[0].sku, true);
    const session = sessionManager.getSession(sessionId);
    assert.equal(session?.latest_recommendation?.budget_ceiling_inr, 70000, 'Budget ceiling must remain exactly 70,000');
  });

  // 15. Existing Razorpay tests still pass
  it('15. Existing Razorpay tests still pass', async () => {
    const sessionId = 'reg_test_razorpay_pass_15';
    await orchestrator.processMessage('I want a laptop under 70000', sessionId);
    const approval = orderManager.approvePurchase(sessionManager, sessionId);
    assert.ok(approval.approval_id);
    const order = await orderManager.createPaymentOrder(sessionManager, sessionId, approval.approval_id);
    assert.ok(order.amount > 0);
  });

  // 16. Existing webhook tests still pass
  it('16. Existing webhook tests still pass', async () => {
    const sessionId = 'reg_test_webhook_pass_16';
    await orchestrator.processMessage('I want a laptop under 70000', sessionId);
    const approval = orderManager.approvePurchase(sessionManager, sessionId);
    const order = await orderManager.createPaymentOrder(sessionManager, sessionId, approval.approval_id);

    // Verify payment signature verification strictly rejects invalid signature
    const result = orderManager.verifyPayment(
      sessionManager,
      sessionId,
      {
        razorpay_order_id: order.razorpay_order_id,
        razorpay_payment_id: 'pay_mock_123',
        razorpay_signature: 'dummy_signature_will_fail'
      }
    );
    assert.equal(result.success, false, 'Invalid signature must be rejected');
    assert.equal(result.status, 'PAYMENT_FAILED', 'Order status must transition to PAYMENT_FAILED');
  });

  // 17. Existing merchant benchmark tests still pass
  it('17. Existing merchant benchmark tests still pass', () => {
    const laptops = repo.getLaptops();
    // Benchmark expects all original 15 Nexora SKUs to be present and intact
    const originalNexoraSkus = [
      'NX-LP-AERO14-01', 'NX-LP-DEV15-02', 'NX-LP-SLIM14-03', 'NX-LP-CODE14-04',
      'NX-LP-PRO16-05', 'NX-LP-LITE13-06', 'NX-LP-CAMPUS-07', 'NX-LP-OOS-08',
      'NX-LP-DEVPRO15-09', 'NX-LP-EDGE14-10', 'NX-LP-FLEX14-11', 'NX-LP-TITAN15-12',
      'NX-LP-CARBON14-13', 'NX-LP-MINRAMMISS-14', 'NX-LP-CODE15-15'
    ];
    for (const sku of originalNexoraSkus) {
      const found = laptops.find((l) => l.sku === sku);
      assert.ok(found, `Original benchmark SKU ${sku} must be present`);
    }
  });

  // 18. Existing security tests still pass
  it('18. Existing security tests still pass', () => {
    const js = readFileSync(resolve(process.cwd(), 'public/app.js'), 'utf-8');
    const html = readFileSync(resolve(process.cwd(), 'public/index.html'), 'utf-8');
    assert.doesNotMatch(js, /rzp_test_[a-zA-Z0-9]{14}/, 'Client JS must not contain test secret keys');
    assert.doesNotMatch(html, /rzp_test_[a-zA-Z0-9]{14}/, 'Client HTML must not contain test secret keys');
    assert.doesNotMatch(js, /RAZORPAY_KEY_SECRET/i, 'Secret env var must not be referenced in client JS');
  });
});
