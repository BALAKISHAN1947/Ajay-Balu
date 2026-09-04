import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { getCatalogRepository } from '../src/repository/catalogRepository.ts';
import { SessionManager } from '../src/session/sessionManager.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';

describe('Match State Distinction: NO_CATEGORY_MATCH, NO_PRODUCT_MATCH, PARTIAL_MATCH, VALID_MATCH', () => {
  const repo = getCatalogRepository();

  it('1. NO_CATEGORY_MATCH: Unsupported category ("running shoes") returns clean state, zero unrelated products, and audit telemetry', async () => {
    const sessionManager = new SessionManager(repo);
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);
    const sessionId = 'ses_test_no_cat';

    const res = await orchestrator.processMessage('I need running shoes under ₹5,000.', sessionId);

    // State & Match Type
    assert.equal(res.state, 'NO_CATEGORY_MATCH');
    assert.equal(res.match_type, 'NO_CATEGORY_MATCH');

    // Must NOT recommend unrelated products from available categories
    assert.ok(res.recommendation);
    assert.equal(res.recommendation!.recommended_laptop, null);
    assert.equal(res.recommendation!.locked_variant, null);
    assert.equal(res.recommendation!.accessories.length, 0);
    assert.equal(res.recommendation!.itemized_line_items.length, 0);

    // Grounded explanation explains merchant catalog boundary
    assert.ok(res.explanation);
    assert.ok(res.explanation!.toLowerCase().includes('does not currently sell running shoes'));
    assert.ok(res.explanation!.includes('Laptops'));
    assert.ok(res.explanation!.includes('Mice'));
    assert.ok(res.explanation!.includes('Laptop Bags'));

    // Audit telemetry recorded for merchant intelligence
    const session = sessionManager.getSession(sessionId);
    assert.ok(session);
    const catEvent = session!.audit_events.find((e) => e.type === 'NO_CATEGORY_MATCH_RECORDED');
    assert.ok(catEvent, 'NO_CATEGORY_MATCH_RECORDED audit event must be logged');
    assert.equal(catEvent!.payload?.requested_category, 'running shoes');
    assert.deepEqual(catEvent!.payload?.supported_categories, ['laptop', 'mouse', 'bag']);
  });

  it('1b. NO_CATEGORY_MATCH: Other unsupported categories (smartphones, mechanical keyboards, monitors)', async () => {
    const sessionManager = new SessionManager(repo);
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);

    const resPhone = await orchestrator.processMessage('Looking for a smartphone under 30k', 'ses_test_phone');
    assert.equal(resPhone.state, 'NO_CATEGORY_MATCH');
    assert.equal(resPhone.recommendation?.recommended_laptop, null);

    const resKeyboard = await orchestrator.processMessage('Show me mechanical keyboards', 'ses_test_kb');
    assert.equal(resKeyboard.state, 'NO_CATEGORY_MATCH');
    assert.equal(resKeyboard.recommendation?.recommended_laptop, null);
  });

  it('2. NO_PRODUCT_MATCH: Supported category (laptop) where no product satisfies hard constraints', async () => {
    const sessionManager = new SessionManager(repo);
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);
    const sessionId = 'ses_test_no_prod';

    // Budget of 20k is far below lowest laptop SKU (₹49,999)
    const res = await orchestrator.processMessage('I need a laptop under 20,000 INR', sessionId);

    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.equal(res.match_type, 'NO_PRODUCT_MATCH');
    assert.ok(res.recommendation);
    assert.equal(res.recommendation.recommended_laptop, null);
    assert.equal(res.recommendation.locked_variant, null);

    // Explanation provides rejection context
    assert.ok(res.explanation?.includes('could not find a product satisfying all hard constraints'));

    // Audit telemetry recorded
    const session = sessionManager.getSession(sessionId);
    assert.ok(session);
    const prodEvent = session!.audit_events.find((e) => e.type === 'NO_PRODUCT_MATCH_RECORDED');
    assert.ok(prodEvent, 'NO_PRODUCT_MATCH_RECORDED audit event must be logged');
  });

  it('3. PARTIAL_MATCH: Products exist in category but cannot satisfy one or more requested constraints', async () => {
    const sessionManager = new SessionManager(repo);
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);
    const sessionId = 'ses_test_partial';

    // Customer requests 16GB RAM coding laptop under 55k.
    // Nexora has 16GB RAM coding laptop (FlexBook 14 @ ₹59,999), but it exceeds the requested 55k budget by ₹4,999 (9%).
    const res = await orchestrator.processMessage('I need a coding laptop under 55k with 16GB RAM', sessionId);

    assert.equal(res.state, 'PARTIAL_MATCH');
    assert.equal(res.match_type, 'PARTIAL_MATCH');
    assert.ok(res.recommendation);
    assert.ok(res.recommendation!.recommended_laptop);
    assert.equal(res.recommendation!.recommended_laptop!.product.sku, 'NX-LP-FLEX14-11');

    // Unfulfilled constraint clearly logged and communicated
    assert.ok(res.unfulfilled_constraints && res.unfulfilled_constraints.length > 0);
    assert.ok(res.unfulfilled_constraints![0].includes('Budget ceiling'));

    // Audit telemetry recorded
    const session = sessionManager.getSession(sessionId);
    assert.ok(session);
    const partialEvent = session!.audit_events.find((e) => e.type === 'PARTIAL_MATCH_RECORDED');
    assert.ok(partialEvent, 'PARTIAL_MATCH_RECORDED audit event must be logged');
  });

  it('4. VALID_MATCH: At least one valid product satisfies all hard constraints', async () => {
    const sessionManager = new SessionManager(repo);
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);
    const sessionId = 'ses_test_valid';

    // Coding laptop under 70k with 16GB RAM, mouse and bag
    // AeroBook 14 (₹62,999) + Mouse (₹1,799) + Bag (₹2,499) = ₹67,297 <= ₹70,000.
    const res = await orchestrator.processMessage(
      'I need a coding laptop under 70k with 16GB RAM, mouse and bag',
      sessionId
    );

    assert.equal(res.state, 'VALID_MATCH');
    assert.equal(res.match_type, 'VALID_MATCH');
    assert.ok(res.recommendation);
    assert.ok(res.recommendation!.recommended_laptop);
    assert.equal(res.recommendation!.recommended_laptop!.product.sku, 'NX-LP-AERO14-01');
    assert.equal(res.recommendation!.locked_variant?.variant_id, 'v_14_16_512_i5');
    assert.equal(res.recommendation!.accessories.length, 2);
    assert.equal(res.recommendation!.total_price_inr, 67297);
    assert.ok(res.recommendation!.total_price_inr <= 70000);

    // Audit telemetry recorded
    const session = sessionManager.getSession(sessionId);
    assert.ok(session);
    const validEvent = session!.audit_events.find((e) => e.type === 'VALID_MATCH_RECORDED');
    assert.ok(validEvent, 'VALID_MATCH_RECORDED audit event must be logged');
  });
});
