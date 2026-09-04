import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { getCatalogRepository } from '../src/repository/catalogRepository.ts';
import { getSessionManager } from '../src/session/sessionManager.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';

describe('Milestone 4.5: Commerce Intelligence Quality Upgrade (15-Query Suite)', () => {
  const repo = getCatalogRepository();
  const sessionManager = getSessionManager(repo);
  const nlu = new DeterministicNLUProvider();
  const orchestrator = new AgentOrchestrator(nlu, repo, sessionManager);

  // 1. "I want a laptop under ₹10,000."
  it('Query 1: "I want a laptop under ₹10,000" -> NO_PRODUCT_MATCH with budget gap and lowest model', async () => {
    const res = await orchestrator.processMessage('I want a laptop under ₹10,000.', 'test_ci_q1');
    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.equal(res.recommendation?.recommended_laptop, null);
    assert.equal(res.recommendation?.total_price_inr, 0);

    const explanation = res.explanation || '';
    assert.match(explanation, /₹42,999|Campus 14/i, 'Must mention lowest-priced laptop in catalog (Campus 14 at ₹42,999)');
    assert.match(explanation, /32,999/i, 'Must compute exact budget gap of ₹32,999');
    assert.ok(res.recommendation?.constraint_analysis?.closest_options.length! > 0, 'Must provide closest options');
  });

  // 2. "I want a laptop under ₹25,000."
  it('Query 2: "I want a laptop under ₹25,000" -> NO_PRODUCT_MATCH with ₹17,999 gap', async () => {
    const res = await orchestrator.processMessage('I want a laptop under ₹25,000.', 'test_ci_q2');
    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.equal(res.recommendation?.recommended_laptop, null);

    const explanation = res.explanation || '';
    assert.match(explanation, /₹42,999|Campus 14/i);
    assert.match(explanation, /17,999/i, 'Must compute exact budget gap of ₹17,999');
  });

  // 3. "I want a laptop under ₹30,000."
  it('Query 3: "I want a laptop under ₹30,000" -> NO_PRODUCT_MATCH with ₹12,999 gap', async () => {
    const res = await orchestrator.processMessage('I want a laptop under ₹30,000.', 'test_ci_q3');
    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.equal(res.recommendation?.recommended_laptop, null);

    const explanation = res.explanation || '';
    assert.match(explanation, /₹42,999|Campus 14/i);
    assert.match(explanation, /12,999/i, 'Must compute exact budget gap of ₹12,999');
  });

  // 4. "I need a laptop under ₹70,000 with 16GB RAM."
  it('Query 4: "I need a laptop under ₹70,000 with 16GB RAM" -> VALID_MATCH within budget with 16GB RAM', async () => {
    const res = await orchestrator.processMessage('I need a laptop under ₹70,000 with 16GB RAM.', 'test_ci_q4');
    assert.ok(res.state === 'VALID_MATCH' || res.state === 'RECOMMENDATION_READY');
    assert.ok(res.recommendation?.recommended_laptop);
    assert.ok(res.recommendation.total_price_inr <= 70000);
    assert.ok((res.recommendation.recommended_laptop.product.ram.capacity_gb ?? 0) >= 16);
  });

  // 5. "I need a laptop under ₹70,000 with RTX 4060."
  it('Query 5: "I need a laptop under ₹70,000 with RTX 4060" -> NO_PRODUCT_MATCH explaining RTX 4060 price gap and RTX 3050 alternative', async () => {
    const res = await orchestrator.processMessage('I need a laptop under ₹70,000 with RTX 4060.', 'test_ci_q5');
    assert.ok(res.state === 'NO_PRODUCT_MATCH' || res.state === 'PARTIAL_MATCH');

    const explanation = res.explanation || '';
    assert.match(explanation, /RTX 4060/i);
    assert.match(explanation, /89,999|WorkStation 16|19,999/i, 'Must explain RTX 4060 starts at ₹89,999 (gap ₹19,999)');
    assert.match(explanation, /Titan 15|RTX 3050/i, 'Must present Titan 15 (RTX 3050) as sub-70k alternative');
  });

  // 6. "I need a gaming laptop with RTX 4060 and 32GB RAM."
  it('Query 6: "I need a gaming laptop with RTX 4060 and 32GB RAM" -> VALID_MATCH with WorkStation 16', async () => {
    const res = await orchestrator.processMessage('I need a gaming laptop with RTX 4060 and 32GB RAM.', 'test_ci_q6');
    assert.ok(res.state === 'VALID_MATCH' || res.state === 'RECOMMENDATION_READY');
    assert.ok(res.recommendation?.recommended_laptop);
    assert.equal(res.recommendation.recommended_laptop.product.sku, 'NX-LP-PRO16-05');
    assert.equal(res.recommendation.recommended_laptop.product.gpu?.model, 'NVIDIA GeForce RTX 4060');
    assert.equal(res.recommendation.recommended_laptop.product.ram.capacity_gb, 32);
  });

  // 7. "I need a coding laptop under ₹70k and I travel daily."
  it('Query 7: "I need a coding laptop under ₹70k and I travel daily" -> AeroBook 14 or CarbonCraft 14 (lightweight, large battery)', async () => {
    const res = await orchestrator.processMessage('I need a coding laptop under ₹70k and I travel daily.', 'test_ci_q7');
    assert.ok(res.state === 'VALID_MATCH' || res.state === 'RECOMMENDATION_READY');
    assert.ok(res.recommendation?.recommended_laptop);
    const prod = res.recommendation.recommended_laptop.product;
    assert.ok(
      prod.sku === 'NX-LP-AERO14-01' || prod.sku === 'NX-LP-CARBON14-13',
      'Must recommend lightweight developer ultrabook'
    );
    assert.ok(prod.weight_g <= 1300);
    assert.ok(prod.battery.capacity_wh >= 55);
  });

  // 8. "Which is better for coding: AeroBook or DevForge?"
  it('Query 8: "Which is better for coding: AeroBook or DevForge?" -> Compares DevForge compilation power vs AeroBook mobility', async () => {
    const res = await orchestrator.processMessage('Which is better for coding: AeroBook or DevForge?', 'test_ci_q8');
    assert.equal(res.state, 'RECOMMENDATION_READY');
    const explanation = res.explanation || '';
    assert.match(explanation, /DevForge 15/i);
    assert.match(explanation, /AeroBook 14/i);
    assert.match(explanation, /32GB/i);
    assert.match(explanation, /compilation|Docker|throughput/i);
    assert.match(explanation, /1\.21kg|mobility|transit|travel/i);
  });

  // 9. "Which one should I buy for gaming?"
  it('Query 9: "Which one should I buy for gaming?" -> Evaluates Titan 15 (RTX 3050) vs WorkStation 16 (RTX 4060)', async () => {
    const res = await orchestrator.processMessage('Which one should I buy for gaming?', 'test_ci_q9');
    assert.equal(res.state, 'RECOMMENDATION_READY');
    const explanation = res.explanation || '';
    assert.match(explanation, /Titan 15|WorkStation 16/i);
    assert.match(explanation, /RTX 3050|RTX 4060/i);
    assert.match(explanation, /144Hz|refresh rate/i);
  });

  // 10. "Add a compatible mouse."
  it('Query 10: "Add a compatible mouse" -> Follow-up attaches compatible mouse to session basket', async () => {
    const sessionId = 'test_ci_q10';
    await orchestrator.processMessage('I need a laptop under ₹70,000 with 16GB RAM.', sessionId);
    const res = await orchestrator.processMessage('Add a compatible mouse.', sessionId);
    assert.equal(res.state, 'RECOMMENDATION_READY');
    assert.ok(res.recommendation?.accessories.some((a) => a.category === 'mouse'));
    const explanation = res.explanation || '';
    assert.match(explanation, /Added .*(?:mouse|SilentPro|ErgoGrip)/i);
  });

  // 11. "Add a bag that fits the laptop."
  it('Query 11: "Add a bag that fits the laptop" -> Follow-up attaches fitting bag to session basket', async () => {
    const sessionId = 'test_ci_q11';
    await orchestrator.processMessage('I need a laptop under ₹70,000 with 16GB RAM.', sessionId);
    const res = await orchestrator.processMessage('Add a bag that fits the laptop.', sessionId);
    assert.equal(res.state, 'RECOMMENDATION_READY');
    assert.ok(res.recommendation?.accessories.some((a) => a.category === 'bag'));
    const explanation = res.explanation || '';
    assert.match(explanation, /Added .*bag|protective sleeve|backpack/i);
  });

  // 12. "I want a laptop and accessories under ₹70k."
  it('Query 12: "I want a laptop and accessories under ₹70k" -> Full bundle fits under ₹70,000', async () => {
    const res = await orchestrator.processMessage('I want a laptop and accessories under ₹70k.', 'test_ci_q12');
    assert.ok(res.state === 'VALID_MATCH' || res.state === 'RECOMMENDATION_READY');
    assert.ok(res.recommendation);
    assert.ok(res.recommendation.total_price_inr <= 70000, `Total ${res.recommendation.total_price_inr} must be <= 70,000`);
    assert.ok(res.recommendation.accessories.length >= 1, 'Should include accessories');
  });

  // 13. "I need running shoes under ₹5,000."
  it('Query 13: "I need running shoes under ₹5,000" -> NO_CATEGORY_MATCH, zero products', async () => {
    const res = await orchestrator.processMessage('I need running shoes under ₹5,000.', 'test_ci_q13');
    assert.equal(res.state, 'NO_CATEGORY_MATCH');
    assert.equal(res.recommendation?.recommended_laptop, null);
    assert.equal(res.recommendation?.total_price_inr, 0);
    const explanation = res.explanation || '';
    assert.match(explanation, /running shoes/i);
    assert.match(explanation, /laptop/i);
    assert.match(explanation, /mouse|mice/i);
    assert.match(explanation, /bag/i);
  });

  // 14. "I need a laptop under ₹50k with 64GB RAM."
  it('Query 14: "I need a laptop under ₹50k with 64GB RAM" -> NO_PRODUCT_MATCH explaining RAM and budget limits', async () => {
    const res = await orchestrator.processMessage('I need a laptop under ₹50k with 64GB RAM.', 'test_ci_q14');
    assert.equal(res.state, 'NO_PRODUCT_MATCH');
    assert.equal(res.recommendation?.recommended_laptop, null);
    const explanation = res.explanation || '';
    assert.match(explanation, /64GB/i);
    assert.match(explanation, /32GB|RAM|budget/i);
  });

  // 15. "I need something cheap but good for coding."
  it('Query 15: "I need something cheap but good for coding" -> Returns viable coding laptop with trade-off disclosure', async () => {
    const res = await orchestrator.processMessage('I need something cheap but good for coding.', 'test_ci_q15');
    assert.ok(res.state === 'VALID_MATCH' || res.state === 'RECOMMENDATION_READY');
    assert.ok(res.recommendation?.recommended_laptop);
    assert.ok(res.recommendation.recommended_laptop.product.price_inr <= 70000);
    assert.ok(res.recommendation.trade_offs.length > 0);
  });

  // Proactive Cross-Sell & Evidence-Based Persuasion Integrity
  it('Proactive Add-Ons: Automatically evaluated and attached without forcing into total', async () => {
    const res = await orchestrator.processMessage('I need a laptop under ₹70,000 with 16GB RAM.', 'test_ci_proactive');
    assert.ok(res.recommendation?.proactive_add_ons);
    assert.ok(res.recommendation.proactive_add_ons.length > 0);

    const addOn = res.recommendation.proactive_add_ons[0];
    assert.ok(addOn.sku);
    assert.ok(addOn.price_inr > 0);
    assert.ok(addOn.new_total_inr > addOn.current_total_inr);
    assert.ok(addOn.compatibility_reason);
    assert.ok(addOn.relevance_reason);
  });

  it('Evidence-Based Persuasion: Zero manipulative banned phrases in explanations', async () => {
    const queries = [
      'I need a laptop under ₹70,000 with 16GB RAM.',
      'I need a gaming laptop with RTX 4060 and 32GB RAM.',
      'Which is better for coding: AeroBook or DevForge?',
      'Which one should I buy for gaming?'
    ];

    const bannedPhrases = [
      /\bperfect product\b/i,
      /\bbest ever\b/i,
      /\byou must buy this\b/i,
      /\bguaranteed to satisfy\b/i,
      /\bunbeatable deal\b/i
    ];

    for (const q of queries) {
      const res = await orchestrator.processMessage(q, `test_persuasion_${Date.now()}`);
      const explanation = res.explanation || '';
      for (const banned of bannedPhrases) {
        assert.ok(!banned.test(explanation), `Explanation for "${q}" contains banned phrase: ${banned}`);
      }
    }
  });

  it('Follow-up Refinement: "Can I get something cheaper?" offers lower price tier with explicit trade-offs', async () => {
    const sessionId = 'test_ci_cheaper';
    await orchestrator.processMessage('I need a laptop under ₹70,000 with 16GB RAM.', sessionId);
    const res = await orchestrator.processMessage('Can I get something cheaper?', sessionId);
    assert.equal(res.state, 'RECOMMENDATION_READY');
    const explanation = res.explanation || '';
    assert.match(explanation, /saves ₹|cheaper alternative/i);
    assert.match(explanation, /Trade-off/i);
  });
});
