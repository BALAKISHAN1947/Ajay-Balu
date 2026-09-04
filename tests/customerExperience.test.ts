import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server/server.ts';
import { getSessionManager } from '../src/session/sessionManager.ts';
import { getCatalogRepository } from '../src/repository/catalogRepository.ts';
import type { LaptopProduct } from '../src/types/catalog.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

describe('Milestone 3: Customer Experience, API & Session Gate', () => {
  let server: any;
  let baseUrl: string;
  const repo = getCatalogRepository();
  const sessionManager = getSessionManager(repo);

  before(async () => {
    server = createServer({ sessionManager });
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 3000;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(resolve));
    }
  });

  it('1. Customer can submit a natural-language query to POST /api/v1/agent/message', async () => {
    const res = await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'test_ses_01',
        message: 'I need a coding laptop under ₹70,000 with 16GB RAM, light for travel, mouse and bag'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.session_id, 'test_ses_01');
    assert.ok(data.state === 'RECOMMENDATION_READY' || data.state === 'VALID_MATCH');
  });

  it('2. Recommendation is returned with locked variant and compatible accessories', async () => {
    const res = await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'test_ses_02',
        message: 'I need a laptop for coding under 70k with at least 16GB RAM, mouse and bag'
      })
    });

    const data = await res.json() as any;
    assert.ok(data.recommendation);
    assert.equal(data.recommendation.recommended_laptop.product.sku, 'NX-LP-AERO14-01');
    assert.equal(data.recommendation.locked_variant.variant_id, 'v_14_16_512_i5');
    assert.equal(data.recommendation.accessories.length, 2);
  });

  it('3. Clarification question is displayed when critical info is missing ("laptop for work")', async () => {
    const res = await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'test_ses_03',
        message: 'I need a laptop for work'
      })
    });

    const data = await res.json() as any;
    assert.equal(data.state, 'CLARIFICATION_REQUIRED');
    assert.ok(data.clarification_question);
    assert.ok(data.clarification_question.includes('budget'));
  });

  it('4. Follow-up modifies session intent and refines recommendation', async () => {
    const sessionId = 'test_ses_followup';

    // Turn 1: Broad query requiring clarification
    const res1 = await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a laptop for work'
      })
    });
    const data1 = await res1.json() as any;
    assert.equal(data1.state, 'CLARIFICATION_REQUIRED');

    // Turn 2: Customer clarifies with budget and portability preference
    const res2 = await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'My budget is under 70k, coding with 16GB RAM, mouse and bag, and I prioritize portability'
      })
    });
    const data2 = await res2.json() as any;
    assert.ok(data2.state === 'RECOMMENDATION_READY' || data2.state === 'VALID_MATCH');
    assert.equal(data2.recommendation.recommended_laptop.product.sku, 'NX-LP-AERO14-01');
  });

  it('5. Recommendation facts match backend catalog facts exactly', async () => {
    const res = await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'test_ses_facts',
        message: 'I need a coding laptop under 70k with 16GB RAM, mouse and bag'
      })
    });
    const data = await res.json() as any;
    const laptop = data.recommendation.recommended_laptop.product;
    const catalogProduct = repo.getProductBySku('NX-LP-AERO14-01')! as LaptopProduct;

    assert.equal(laptop.name, catalogProduct.name);
    assert.equal(laptop.price_inr, catalogProduct.price_inr);
    assert.equal(laptop.weight_g, catalogProduct.weight_g);
    assert.equal(laptop.battery.capacity_wh, catalogProduct.battery.capacity_wh);
  });

  it('6. Incompatible accessory cannot be selected (backend rejection)', async () => {
    const sessionId = 'test_ses_incompat';

    // Establish session with AeroBook 14 (312.4mm length)
    await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a coding laptop under 70k with 16GB RAM, mouse and bag'
      })
    });

    // Attempt to attach NX-BG-TINY-04 (max length 305mm, but AeroBook is 312.4mm + 5mm buffer = 317.4mm)
    const res = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: 'NX-BG-TINY-04',
        included: true
      })
    });

    assert.equal(res.status, 400);
    const errData = await res.json() as any;
    assert.ok(errData.error.includes('cannot be attached') || errData.error.includes('Dimensional fit failed'));
  });

  it('7. Bundle total always comes from authoritative backend calculation', async () => {
    const sessionId = 'test_ses_bundle';

    // Start with bundle (laptop + mouse + bag = 62999 + 1799 + 2499 = 67297)
    const initialRes = await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a laptop for coding under 70k with 16GB RAM, mouse and bag'
      })
    });
    const initialData = await initialRes.json() as any;
    assert.equal(initialData.recommendation.total_price_inr, 67297);

    // Exclude mouse (NX-MS-ERGO-01 @ ₹1,799)
    const updateRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: 'NX-MS-ERGO-01',
        included: false
      })
    });

    assert.equal(updateRes.status, 200);
    const session = await updateRes.json() as any;
    // Expected: 67297 - 1799 = 65498
    assert.equal(session.latest_recommendation.total_price_inr, 65498);
    assert.equal(session.latest_recommendation.budget_margin_inr, 70000 - 65498);
  });

  it('8. Purchase review shows exact SKU, variant, and gate status', async () => {
    const sessionId = 'test_ses_review';

    await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a laptop for coding under 70k with 16GB RAM, mouse and bag'
      })
    });

    const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
    assert.equal(reviewRes.status, 200);

    const review = await reviewRes.json() as any;
    assert.equal(review.primary_product.sku, 'NX-LP-AERO14-01');
    assert.equal(review.primary_product.variant_id, 'v_14_16_512_i5');
    assert.equal(review.final_total_inr, 67297);
    assert.equal(review.gate_status, 'AUTHORIZED_PENDING_GATEWAY');
    assert.ok(review.audit_events_count >= 2);
  });

  it('9. No-match case renders correctly without recommending an invalid SKU', async () => {
    const res = await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'test_ses_nomatch',
        message: 'I need a laptop under 35k with 32GB RAM'
      })
    });

    const data = await res.json() as any;
    assert.ok(data.state === 'NO_MATCH' || data.state === 'NO_PRODUCT_MATCH');
    assert.equal(data.recommendation.recommended_laptop, null);
    assert.ok(data.explanation.includes('could not find a product'));
  });

  it('10. Backend errors render a useful message for invalid inputs', async () => {
    const res = await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'test_ses_err',
        message: 12345 // invalid non-string
      })
    });

    assert.equal(res.status, 400);
    const data = await res.json() as any;
    assert.ok(data.error.includes('Field "message" is required and must be a string'));
  });

  it('11. No secret values or credentials appear in public client code', () => {
    const htmlContent = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
    const jsContent = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf-8');

    // Check for sensitive tokens
    const forbiddenPatterns = [
      /rzp_live_[a-zA-Z0-9]+/i,
      /AIzaSy[a-zA-Z0-9_-]+/i,
      /sk-[a-zA-Z0-9]+/i,
      /LLM_API_KEY/i,
      /RAZORPAY_KEY_SECRET/i
    ];

    for (const pattern of forbiddenPatterns) {
      assert.equal(pattern.test(htmlContent), false, `Forbidden token detected in index.html: ${pattern}`);
      assert.equal(pattern.test(jsContent), false, `Forbidden token detected in app.js: ${pattern}`);
    }
  });

  it('12. Product comparison endpoint returns factual differences without benchmark hallucinations', async () => {
    const sessionId = 'test_ses_comp';

    await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a coding laptop under 70k with 16GB RAM, mouse and bag'
      })
    });

    const compRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/compare?alternative_sku=NX-LP-DEVPRO15-09`);
    assert.equal(compRes.status, 200);

    const compData = await compRes.json() as any;
    assert.equal(compData.primary.sku, 'NX-LP-AERO14-01');
    assert.equal(compData.alternative.sku, 'NX-LP-DEVPRO15-09');
    assert.ok(compData.factual_differences.length >= 3);
    assert.ok(compData.factual_differences.some((d: string) => d.includes('lighter')));
    assert.ok(compData.factual_differences.some((d: string) => d.includes('battery')));
  });
});
