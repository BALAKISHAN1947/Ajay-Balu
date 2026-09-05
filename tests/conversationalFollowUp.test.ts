import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { getCatalogRepository, type ICatalogRepository } from '../src/repository/catalogRepository.ts';
import { getSessionManager, SessionManager } from '../src/session/sessionManager.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';
import { OrderManager } from '../src/engine/orderManager.ts';

describe('Conversational Follow-Up & Reference Resolution (19 Regression Scenarios)', () => {
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

  // 1. "Okay, give me that" selects previous closest recommendation
  it('1. "Okay, give me that" selects previous closest recommendation', async () => {
    const sId = `test_followup_1_${Date.now()}`;
    const t1 = await orchestrator.processMessage('Give me a laptop under 30000', sId);
    assert.equal(t1.state, 'NO_PRODUCT_MATCH');
    assert.ok(t1.recommendation?.constraint_analysis?.closest_options?.length);
    assert.equal(t1.recommendation.constraint_analysis.closest_options[0].sku, 'NX-LP-CAMPUS-07');

    const t2 = await orchestrator.processMessage('Okay, give me that.', sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.sku, 'NX-LP-CAMPUS-07');
    assert.equal(t2.recommendation?.total_price_inr, 42999);
    assert.notEqual(t2.state, 'CLARIFICATION_REQUIRED');
  });

  // 2. "Give me that laptop" selects previous recommendation
  it('2. "Give me that laptop" selects previous recommendation', async () => {
    const sId = `test_followup_2_${Date.now()}`;
    await orchestrator.processMessage('I want a laptop under 30000', sId);
    const t2 = await orchestrator.processMessage('Give me that laptop', sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.sku, 'NX-LP-CAMPUS-07');
  });

  // 3. "I\'ll take it" selects previous recommendation
  it('3. "I\'ll take it" selects previous recommendation', async () => {
    const sId = `test_followup_3_${Date.now()}`;
    await orchestrator.processMessage('I want a laptop under 30000', sId);
    const t2 = await orchestrator.processMessage("I'll take it", sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.sku, 'NX-LP-CAMPUS-07');
  });

  // 4. "Yes, that one" selects previous recommendation
  it('4. "Yes, that one" selects previous recommendation', async () => {
    const sId = `test_followup_4_${Date.now()}`;
    await orchestrator.processMessage('I want a laptop under 30000', sId);
    const t2 = await orchestrator.processMessage('Yes, that one', sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.sku, 'NX-LP-CAMPUS-07');
  });

  // 5. "Give me the first one" selects first previous option
  it('5. "Give me the first one" selects first previous option', async () => {
    const sId = `test_followup_5_${Date.now()}`;
    const t1 = await orchestrator.processMessage('Compare Apple and Lenovo laptops under 90000', sId);
    assert.equal(t1.state, 'RECOMMENDATION_READY');
    const session = sessionManager.getSession(sId);
    assert.ok(session?.comparison_products && session.comparison_products.length >= 2);
    const firstSku = session.comparison_products[0].sku;

    const t2 = await orchestrator.processMessage('Give me the first one', sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.sku, firstSku);
  });

  // 6. "Take the second one" selects second previous option
  it('6. "Take the second one" selects second previous option', async () => {
    const sId = `test_followup_6_${Date.now()}`;
    const t1 = await orchestrator.processMessage('Compare Apple and Lenovo laptops under 90000', sId);
    assert.equal(t1.state, 'RECOMMENDATION_READY');
    const session = sessionManager.getSession(sId);
    assert.ok(session?.comparison_products && session.comparison_products.length >= 2);
    const secondSku = session.comparison_products[1].sku;

    const t2 = await orchestrator.processMessage('Take the second one', sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.sku, secondSku);
  });

  // 7. "Take the cheaper one" resolves deterministically
  it('7. "Take the cheaper one" resolves deterministically', async () => {
    const sId = `test_followup_7_${Date.now()}`;
    await orchestrator.processMessage('Compare Apple and Lenovo laptops under 90000', sId);
    const session = sessionManager.getSession(sId);
    assert.ok(session?.comparison_products && session.comparison_products.length >= 2);
    const sorted = [...session.comparison_products].sort((a, b) => a.price_inr - b.price_inr);
    const cheaperSku = sorted[0].sku;

    const t2 = await orchestrator.processMessage('Take the cheaper one', sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.sku, cheaperSku);
    assert.equal(t2.recommendation?.total_price_inr, sorted[0].price_inr);
  });

  // 8. Follow-up after NO_PRODUCT_MATCH resolves to closest verified option
  it('8. Follow-up after NO_PRODUCT_MATCH resolves to closest verified option', async () => {
    const sId = `test_followup_8_${Date.now()}`;
    const t1 = await orchestrator.processMessage('laptop under 30000', sId);
    assert.equal(t1.state, 'NO_PRODUCT_MATCH');
    const t2 = await orchestrator.processMessage('Okay, give me that', sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.name, 'Nexora Campus 14');
  });

  // 9. Follow-up does not create a fake budget
  it('9. Follow-up does not create a fake budget', async () => {
    const sId = `test_followup_9_${Date.now()}`;
    await orchestrator.processMessage('laptop under 30000', sId);
    const t2 = await orchestrator.processMessage('Okay, give me that', sId);
    // Ceiling matches actual product price of 42999 rather than an invented arbitrary number
    assert.equal(t2.recommendation?.budget_ceiling_inr, 42999);
    assert.equal(t2.recommendation?.total_price_inr, 42999);
    assert.equal(t2.intent?.hard_constraints.max_total_budget, 42999);
  });

  // 10. Follow-up does not cause clarification when reference is unambiguous
  it('10. Follow-up does not cause clarification when reference is unambiguous', async () => {
    const sId = `test_followup_10_${Date.now()}`;
    await orchestrator.processMessage('Give me a laptop under 30000', sId);
    const t2 = await orchestrator.processMessage('give me that', sId);
    assert.notEqual(t2.state, 'CLARIFICATION_REQUIRED');
    assert.equal(t2.clarification_question, undefined);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
  });

  // 11. Referenced SKU is revalidated against current catalog
  it('11. Referenced SKU is revalidated against current catalog', async () => {
    const sId = `test_followup_11_${Date.now()}`;
    const session = sessionManager.getOrCreateSession(sId);
    // Artificially inject an invalid non-existent SKU in conversation context
    session.comparison_products = [{
      sku: 'NON-EXISTENT-SKU-999',
      name: 'Hallucinated Laptop Pro',
      price_inr: 50000,
      position: 1
    }];
    const res = await orchestrator.processMessage('Give me the first one', sId);
    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.ok(res.errors && res.errors.length > 0);
  });

  // 12. Referenced out-of-stock product is rejected safely
  it('12. Referenced out-of-stock product is rejected safely', async () => {
    const sId = `test_followup_12_${Date.now()}`;
    const session = sessionManager.getOrCreateSession(sId);
    // Inject out-of-stock model NX-LP-OOS-08 (stock = 0)
    session.comparison_products = [{
      sku: 'NX-LP-OOS-08',
      name: 'Nexora SwiftBook 14',
      price_inr: 63500,
      position: 1
    }];
    const res = await orchestrator.processMessage('Take the first one', sId);
    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.ok(res.explanation && res.explanation.includes('out of stock'));
    assert.ok(res.errors && res.errors.some((e) => e.includes('out of stock')));
  });

  // 13. A clearly new search does NOT reuse previous recommendation
  it('13. A clearly new search does NOT reuse previous recommendation', async () => {
    const sId = `test_followup_13_${Date.now()}`;
    await orchestrator.processMessage('Give me a laptop under 30000', sId);
    // Turn 2 is a distinct new search for an Apple laptop under 90000
    const t2 = await orchestrator.processMessage('I want an Apple laptop under 90000', sId);
    assert.ok(t2.state === 'VALID_MATCH' || t2.state === 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.brand, 'Apple');
    assert.notEqual(t2.recommendation?.recommended_laptop?.product.sku, 'NX-LP-CAMPUS-07');
  });

  // 14. Brand comparison follow-up ("I'll take the Lenovo one")
  it('14. Product-comparison follow-up: "I\'ll take the Lenovo one" resolves Lenovo SKU', async () => {
    const sId = `test_followup_14_${Date.now()}`;
    await orchestrator.processMessage('Compare Apple and Lenovo laptops under 90000', sId);
    const t2 = await orchestrator.processMessage("I'll take the Lenovo one", sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.brand, 'Lenovo');
    assert.equal(t2.recommendation?.recommended_laptop?.product.sku, 'LN-LP-THINK14-01');
  });

  // 15. Payment continuation: Razorpay approval and checkout can proceed immediately
  it('15. Payment continuation: basket is valid and approved without extra conversational gate', async () => {
    const sId = `test_followup_15_${Date.now()}`;
    await orchestrator.processMessage('Give me a laptop under 30000', sId);
    await orchestrator.processMessage('Okay, give me that', sId);

    const session = sessionManager.getSession(sId)!;
    assert.ok(session.latest_recommendation?.recommended_laptop);
    assert.equal(session.latest_recommendation.total_price_inr, 42999);

    // Customer can authorize immediately
    const approval = orderManager.approvePurchase(sessionManager, sId);
    assert.ok(approval.approval_id);

    // Order manager creates Razorpay order immediately
    const order = await orderManager.createPaymentOrder(sessionManager, sId, approval.approval_id);
    assert.ok(order.razorpay_order_id);
    assert.equal(order.amount, 4299900);
  });

  // 16. Affirmation variants: "yeah I'll take it", "that one please"
  it('16. Affirmation variants: "yeah I\'ll take it" and "that one please" work correctly', async () => {
    const sId1 = `test_followup_16a_${Date.now()}`;
    await orchestrator.processMessage('Give me a laptop under 30000', sId1);
    const r1 = await orchestrator.processMessage("yeah I'll take it", sId1);
    assert.equal(r1.state, 'RECOMMENDATION_READY');
    assert.equal(r1.recommendation?.recommended_laptop?.product.sku, 'NX-LP-CAMPUS-07');

    const sId2 = `test_followup_16b_${Date.now()}`;
    await orchestrator.processMessage('Give me a laptop under 30000', sId2);
    const r2 = await orchestrator.processMessage('that one please', sId2);
    assert.equal(r2.state, 'RECOMMENDATION_READY');
    assert.equal(r2.recommendation?.recommended_laptop?.product.sku, 'NX-LP-CAMPUS-07');
  });

  // 17. Follow-up preserves unchecked accessories by default
  it('17. Follow-up keeps accessories optional and unchecked by default', async () => {
    const sId = `test_followup_17_${Date.now()}`;
    await orchestrator.processMessage('Give me a laptop under 30000', sId);
    const t2 = await orchestrator.processMessage('Okay, give me that', sId);
    assert.equal(t2.recommendation?.accessories.length, 0);
    assert.ok(t2.recommendation?.proactive_add_ons && t2.recommendation.proactive_add_ons.length > 0);
    const session = sessionManager.getSession(sId)!;
    assert.equal(session.selected_accessory_skus.length, 0);
  });

  // 18. "Give me the one you mentioned"
  it('18. "Give me the one you mentioned" selects previous recommendation', async () => {
    const sId = `test_followup_18_${Date.now()}`;
    await orchestrator.processMessage('Give me a laptop under 30000', sId);
    const t2 = await orchestrator.processMessage('Give me the one you mentioned', sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.sku, 'NX-LP-CAMPUS-07');
  });

  // 19. "I want the first one" on coding comparison
  it('19. "I want the first one" selects first candidate after coding comparison', async () => {
    const sId = `test_followup_19_${Date.now()}`;
    await orchestrator.processMessage('Show me the best two laptops for coding', sId);
    const session = sessionManager.getSession(sId)!;
    assert.ok(session.comparison_products && session.comparison_products.length >= 2);
    const firstSku = session.comparison_products[0].sku;

    const t2 = await orchestrator.processMessage('I want the first one', sId);
    assert.equal(t2.state, 'RECOMMENDATION_READY');
    assert.equal(t2.recommendation?.recommended_laptop?.product.sku, firstSku);
  });
});
