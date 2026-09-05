import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server/server.ts';
import { getSessionManager } from '../src/session/sessionManager.ts';
import { getCatalogRepository } from '../src/repository/catalogRepository.ts';

/**
 * Regression Test Suite — Production Bug Fixes
 *
 * REG-01: "Coding laptop under 70k"
 *   Verifies Bug 1 fix (total_score not final_score) and Bug 2 fix (processor.cores not cores_physical).
 *
 * REG-02: "Light laptop for travel under 60k"
 *   The exact query that triggered the original toFixed crash. Engine must respond without error.
 *
 * REG-03: "Running shoes under 5k"
 *   Must return NO_CATEGORY_MATCH with no unrelated products recommended.
 *
 * REG-04: "32GB RAM laptop under 50k"
 *   Impossible combo — no product must be returned unless it truly satisfies 32GB constraint.
 *
 * REG-05: "Laptop + bag compatibility"
 *   Bag accessories must carry compatibility_evidence and a dimensional check must exist.
 *
 * REG-06: "Cheapest coding laptop"
 *   All numeric fields (budget_margin_inr, total_price_inr, confidence_score) must be finite.
 */

describe('Regression: Production Bug Fixes (6 Queries)', () => {
  let server: any;
  let baseUrl: string;
  const repo = getCatalogRepository();
  const sessionManager = getSessionManager(repo);

  before(async () => {
    server = createServer({ sessionManager });
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? (address as any).port : 3001;
        baseUrl = 'http://127.0.0.1:' + String(port);
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise<void>((resolve) => server.close(resolve));
  });

  it('[REG-01] Coding laptop under 70k: total_score numeric, processor.cores is number', async () => {
    const res = await fetch(baseUrl + '/api/v1/agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'reg_ses_01', message: 'I need a laptop for coding under 70000 with 16GB RAM' })
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(
      data.state === 'RECOMMENDATION_READY' || data.state === 'VALID_MATCH',
      'state: ' + data.state
    );
    const rec = data.recommendation;
    assert.ok(rec && rec.recommended_laptop, 'recommended_laptop must exist');
    // Bug 1 fix: total_score (not final_score)
    const ts: unknown = rec.recommended_laptop.total_score;
    assert.ok(typeof ts === 'number' && isFinite(ts as number) && (ts as number) >= 0 && (ts as number) <= 100, 'total_score: ' + String(ts));
    // Bug 2 fix: processor.cores (not cores_physical)
    const cores: unknown = rec.recommended_laptop.product.processor.cores;
    assert.ok(typeof cores === 'number' && (cores as number) > 0, 'processor.cores: ' + String(cores));
    // Bug 5: confidence_score safe
    const conf: unknown = rec.confidence_score;
    assert.ok(typeof conf === 'number' && isFinite(conf as number), 'confidence_score: ' + String(conf));
    // Bug 4: budget_margin_inr safe
    const margin: unknown = rec.budget_margin_inr;
    assert.ok(typeof margin === 'number' && isFinite(margin as number), 'budget_margin_inr: ' + String(margin));
  });

  it('[REG-02] Light travel laptop under 60k: no crash, weight_g is finite positive', async () => {
    const res = await fetch(baseUrl + '/api/v1/agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'reg_ses_02', message: 'I need a light laptop for travel under 60000' })
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    const validStates = ['RECOMMENDATION_READY', 'VALID_MATCH', 'PARTIAL_MATCH', 'NO_PRODUCT_MATCH', 'NO_MATCH'];
    assert.ok(validStates.includes(data.state), 'Unexpected state: ' + data.state);
    if (data.recommendation && data.recommendation.recommended_laptop) {
      const wg: unknown = data.recommendation.recommended_laptop.product.weight_g;
      assert.ok(typeof wg === 'number' && isFinite(wg as number) && (wg as number) > 0, 'weight_g: ' + String(wg));
      const ts: unknown = data.recommendation.recommended_laptop.total_score;
      assert.ok(typeof ts === 'number' && isFinite(ts as number), 'total_score: ' + String(ts));
    }
  });

  it('[REG-03] Running shoes: NO_CATEGORY_MATCH, zero unrelated products', async () => {
    const res = await fetch(baseUrl + '/api/v1/agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'reg_ses_03', message: 'I need running shoes under 5000' })
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    const isCategoryMiss = data.state === 'NO_CATEGORY_MATCH' ||
      (data.recommendation && data.recommendation.match_type === 'NO_CATEGORY_MATCH');
    assert.ok(isCategoryMiss, 'Expected NO_CATEGORY_MATCH, got: ' + data.state);
    assert.equal(data.recommendation && data.recommendation.recommended_laptop, null);
    const accLen = data.recommendation && Array.isArray(data.recommendation.accessories)
      ? data.recommendation.accessories.length : -1;
    assert.equal(accLen, 0, 'accessories must be empty, got: ' + accLen);
    const expl: string = ((data.explanation) || '').toLowerCase();
    assert.ok(
      expl.includes('laptop') || expl.includes('nexora') || expl.includes('catalog'),
      'Explanation must describe catalog. Got: ' + expl.substring(0, 200)
    );
  });

  it('[REG-04] 32GB RAM under 50k: no hallucinated constraint-violating product', async () => {
    const res = await fetch(baseUrl + '/api/v1/agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'reg_ses_04', message: 'I need a laptop with 32GB RAM under 50000' })
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    const rec = data.recommendation;
    const isNoProduct = data.state === 'NO_PRODUCT_MATCH' || data.state === 'NO_MATCH' ||
      (rec && rec.match_type === 'NO_PRODUCT_MATCH');
    const isPartial = data.state === 'PARTIAL_MATCH' || (rec && rec.match_type === 'PARTIAL_MATCH');
    if (isNoProduct) {
      assert.equal(rec.recommended_laptop, null, 'recommended_laptop must be null for NO_PRODUCT_MATCH');
    } else if (isPartial) {
      const clues: string = [
        ...(rec.trade_offs || []),
        ...(rec.unfulfilled_constraints || []),
        ...(rec.reasons || [])
      ].join(' ').toLowerCase();
      assert.ok(
        clues.includes('budget') || clues.includes('ram') || clues.includes('exceed'),
        'PARTIAL_MATCH must disclose unfulfilled constraint. Clues: ' + clues.substring(0, 200)
      );
    } else if (rec && rec.recommended_laptop) {
      const ramGb: number | null = rec.recommended_laptop.product.ram.capacity_gb;
      assert.ok(ramGb !== null && ramGb >= 32, 'Product must satisfy >=32GB RAM. Got: ' + String(ramGb));
    }
  });

  it('[REG-05] Laptop + bag: bag has compatibility_evidence, dimensional check present', async () => {
    const res = await fetch(baseUrl + '/api/v1/agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'reg_ses_05', message: 'I need a coding laptop under 70000 with 16GB RAM and a bag' })
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(
      data.state === 'RECOMMENDATION_READY' || data.state === 'VALID_MATCH',
      'state: ' + data.state
    );
    const rec = data.recommendation;
    const bags: any[] = (rec.accessories || []).filter((a: any) => a.sku && (String(a.sku).includes('-BG-') || a.category === 'bag'));
    assert.ok(bags.length > 0, 'At least one bag must be in accessories');
    for (const bag of bags) {
      assert.ok(
        typeof bag.compatibility_evidence === 'string' && bag.compatibility_evidence.length > 0,
        'Bag ' + String(bag.sku) + ' missing compatibility_evidence'
      );
    }
    const checks: any[] = rec.compatibility_checks || [];
    // CompatibilityResult uses accessory_sku and reason (not item_sku / rule_applied)
    const hasBagCheck = checks.some((c: any) =>
      (c.accessory_sku && String(c.accessory_sku).includes('-BG-')) ||
      (c.accessory_category === 'bag')
    );
    assert.ok(
      hasBagCheck,
      'No bag compatibility check found. checks: ' + JSON.stringify(checks.map((c: any) => ({ sku: c.accessory_sku, cat: c.accessory_category })))
    );
  });

  it('[REG-06] Cheapest coding laptop: budget_margin_inr, total_price_inr, confidence_score all finite', async () => {
    const res = await fetch(baseUrl + '/api/v1/agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'reg_ses_06', message: 'What is the cheapest laptop for coding you have?' })
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(
      data.state === 'RECOMMENDATION_READY' || data.state === 'VALID_MATCH',
      'state: ' + data.state
    );
    const rec = data.recommendation;
    const margin: unknown = rec.budget_margin_inr;
    assert.ok(typeof margin === 'number' && isFinite(margin as number), 'budget_margin_inr: ' + String(margin));
    const tp: unknown = rec.total_price_inr;
    assert.ok(typeof tp === 'number' && isFinite(tp as number) && (tp as number) > 0, 'total_price_inr: ' + String(tp));
    const conf: unknown = rec.confidence_score;
    assert.ok(
      typeof conf === 'number' && isFinite(conf as number) && (conf as number) >= 0 && (conf as number) <= 1,
      'confidence_score: ' + String(conf)
    );
    const workloads: string[] = (rec.recommended_laptop && rec.recommended_laptop.product &&
      rec.recommended_laptop.product.target_workload) || [];
    assert.ok(
      workloads.some((w: string) => ['coding', 'web_development', 'compilation', 'docker'].includes(w)),
      'Must target a coding workload. Got: ' + workloads.join(', ')
    );
  });
});
