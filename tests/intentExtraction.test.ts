import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBudget, normalizeRam, normalizeCategories } from '../src/nlu/normalization.ts';
import { validateCustomerIntent } from '../src/nlu/intentValidator.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { getCatalogRepository } from '../src/repository/catalogRepository.ts';
import { AgentTools } from '../src/tools/agentTools.ts';

describe('Milestone 2: Intent Extraction, Normalization & Agent Pipeline', () => {
  const nluProvider = new DeterministicNLUProvider();
  const orchestrator = new AgentOrchestrator(nluProvider);
  const repo = getCatalogRepository();
  const tools = new AgentTools(repo);

  it('1. Normal customer query produces valid CustomerIntent', async () => {
    const rawQuery = 'I need a coding laptop under ₹70,000 with at least 16GB RAM, something light for daily travel, plus a Bluetooth mouse and a laptop bag.';
    const jsonStr = await nluProvider.generateStructuredIntent(rawQuery);
    const parsed = JSON.parse(jsonStr);

    const validation = validateCustomerIntent(parsed);
    assert.equal(validation.valid, true);
    assert.ok(validation.intent);
    assert.equal(validation.intent!.hard_constraints.max_total_budget, 70000);
    assert.equal(validation.intent!.hard_constraints.min_ram_gb, 16);
    assert.deepEqual(validation.intent!.required_categories.sort(), ['bag', 'laptop', 'mouse']);
  });

  it('2. "70k" becomes 70000 INR', () => {
    const res = normalizeBudget('I need a laptop under 70k');
    assert.ok(res);
    assert.equal(res!.amount, 70000);
    assert.equal(res!.isHardCeiling, true);
  });

  it('2b. "under seventy thousand" becomes 70000 INR', () => {
    const res = normalizeBudget('laptop under seventy thousand');
    assert.ok(res);
    assert.equal(res!.amount, 70000);
    assert.equal(res!.isHardCeiling, true);
  });

  it('3. "16 gigs" becomes 16GB RAM', () => {
    const res = normalizeRam('give me 16 gigs of ram');
    assert.ok(res);
    assert.equal(res!.capacity_gb, 16);
  });

  it('4. Explicit "must have" becomes hard constraint', () => {
    const res = normalizeRam('must have 16gb ram');
    assert.ok(res);
    assert.equal(res!.capacity_gb, 16);
    assert.equal(res!.isHardConstraint, true);
  });

  it('5. "lightweight" becomes soft preference and assigns portability weight', async () => {
    const rawQuery = 'I want a lightweight laptop under 70k with 16GB RAM';
    const jsonStr = await nluProvider.generateStructuredIntent(rawQuery);
    const validation = validateCustomerIntent(JSON.parse(jsonStr));

    assert.equal(validation.valid, true);
    assert.equal(validation.intent?.soft_preferences.max_preferred_weight_g, 1400);
    assert.equal(validation.intent?.soft_preferences.weights.portability, 0.40);
  });

  it('6. Required categories are correctly extracted (laptop, mouse, bag)', () => {
    const cats = normalizeCategories('I need an ultrabook with a wireless mouse and a laptop backpack');
    assert.ok(cats.includes('laptop'));
    assert.ok(cats.includes('mouse'));
    assert.ok(cats.includes('bag'));
    assert.equal(cats.length, 3);
  });

  it('7. Missing critical information triggers clarification ("laptop for work")', async () => {
    const res = await orchestrator.processMessage('I need a laptop for work');
    assert.equal(res.state, 'CLARIFICATION_REQUIRED');
    assert.ok(res.clarification_question);
    assert.ok(res.clarification_question!.includes('budget'));
  });

  it('8. Non-critical missing information does not unnecessarily trigger clarification', async () => {
    const res = await orchestrator.processMessage('Need a coding laptop under 65k with 16GB RAM and good battery');
    assert.notEqual(res.state, 'CLARIFICATION_REQUIRED');
    assert.ok(res.state === 'RECOMMENDATION_READY' || res.state === 'VALID_MATCH');
    assert.ok(res.recommendation);
  });

  it('9. Invalid LLM JSON is rejected safely', () => {
    // Malformed category type
    const malformed1 = {
      required_categories: ['invalid_category_xyz'],
      hard_constraints: { max_total_budget: 50000 },
      soft_preferences: { weights: { portability: 0.4, battery: 0.3, longevity: 0.3 } }
    };
    const res1 = validateCustomerIntent(malformed1);
    assert.equal(res1.valid, false);
    assert.ok(res1.errors.some((e) => e.includes('Invalid category')));

    // Non-numeric budget
    const malformed2 = {
      required_categories: ['laptop'],
      hard_constraints: { max_total_budget: 'seventy thousand' },
      soft_preferences: { weights: { portability: 0.4, battery: 0.3, longevity: 0.3 } }
    };
    const res2 = validateCustomerIntent(malformed2);
    assert.equal(res2.valid, false);
    assert.ok(res2.errors.some((e) => e.includes('"hard_constraints.max_total_budget" must be a positive number')));
  });

  it('10. LLM output cannot override hard constraints', async () => {
    // LLM creates intent with max_total_budget = 70000
    // Even if prompt asks for expensive WorkStation 16 (₹89,999), deterministic engine strictly rejects it
    const res = await orchestrator.processMessage('I want the WorkStation 16 with 32GB RAM under 70000');
    if (res.recommendation) {
      assert.ok(res.recommendation.total_price_inr <= 70000 || res.recommendation.status === 'NO_MATCH');
      if (res.recommendation.recommended_laptop) {
        assert.notEqual(res.recommendation.recommended_laptop.product.sku, 'NX-LP-PRO16-05');
      }
    }
  });

  it('11. Deterministic engine output remains unchanged for the same intent', async () => {
    const query = 'Coding laptop under 70k with 16GB RAM, mouse and bag';
    const res1 = await orchestrator.processMessage(query);
    const res2 = await orchestrator.processMessage(query);

    assert.equal(res1.state, res2.state);
    assert.equal(res1.recommendation?.total_price_inr, res2.recommendation?.total_price_inr);
    assert.equal(res1.recommendation?.locked_variant?.sku, res2.recommendation?.locked_variant?.sku);
  });

  it('12. Explanation contains only verified product facts', async () => {
    const query = 'I need a laptop for coding under ₹70,000 with at least 16GB RAM, mouse and bag';
    const res = await orchestrator.processMessage(query);

    assert.ok(res.state === 'RECOMMENDATION_READY' || res.state === 'VALID_MATCH');
    assert.ok(res.explanation);
    // Must contain exact verified values from catalog
    assert.ok(res.explanation!.includes('NX-LP-AERO14-01'));
    assert.ok(res.explanation!.includes('16GB LPDDR5'));
    assert.ok(res.explanation!.includes('1.28 kg'));
    assert.ok(res.explanation!.includes('57Wh'));
  });

  it('13. Explanation cannot invent a price', async () => {
    const query = 'I need a laptop for coding under ₹70,000 with at least 16GB RAM, mouse and bag';
    const res = await orchestrator.processMessage(query);

    assert.ok(res.explanation);
    // Must match the exact calculated engine total ₹67,297
    assert.ok(res.explanation!.includes('₹67,297'));
  });

  it('14. No-match scenario is explained without recommending an invalid product', async () => {
    const res = await orchestrator.processMessage('I need a laptop under 35k with at least 32GB RAM');

    assert.ok(res.state === 'NO_MATCH' || res.state === 'NO_PRODUCT_MATCH');
    assert.ok(res.recommendation);
    assert.equal(res.recommendation!.recommended_laptop, null);
    assert.equal(res.recommendation!.locked_variant, null);
    assert.ok(res.explanation?.includes('could not find a product satisfying all hard constraints'));
  });

  it('15. End-to-end natural-language query reaches a deterministic recommendation', async () => {
    const query = 'I need a laptop for coding under ₹70,000. I travel every day, so I want something light with good battery life, at least 16GB RAM, and I also need a mouse and laptop bag.';
    const res = await orchestrator.processMessage(query);

    assert.ok(res.state === 'RECOMMENDATION_READY' || res.state === 'VALID_MATCH');
    assert.ok(res.recommendation);
    assert.equal(res.recommendation!.locked_variant?.sku, 'NX-LP-AERO14-01');
    assert.equal(res.recommendation!.accessories.length, 2);
    assert.equal(res.recommendation!.total_price_inr, 67297);
  });

  it('Tools interface functions work deterministically', () => {
    // Tool 1: search_products
    const laptops = tools.search_products({ category: 'laptop', max_price_inr: 70000, min_ram_gb: 16 });
    assert.ok(laptops.length >= 3);

    // Tool 2: get_product_details
    const details = tools.get_product_details('NX-LP-AERO14-01');
    assert.equal(details.name, 'Nexora AeroBook 14');

    // Tool 3: check_compatibility
    const compat = tools.check_compatibility('NX-LP-AERO14-01', 'NX-BG-SLIM-01');
    assert.equal(compat.compatible, true);

    // Tool 4: check_stock_and_price
    const stockRes = tools.check_stock_and_price(['NX-LP-AERO14-01', 'NX-LP-OOS-08']);
    assert.equal(stockRes.valid, false); // NX-LP-OOS-08 is out of stock

    // Tool 5: calculate_cart
    const cart = tools.calculate_cart(['NX-LP-AERO14-01', 'NX-MS-ERGO-01', 'NX-BG-SLIM-01']);
    assert.equal(cart.total_inr, 62999 + 1799 + 2499);
  });
});
