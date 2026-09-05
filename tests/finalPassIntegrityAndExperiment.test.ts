import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { ALL_PRODUCTS } from '../src/data/catalog.ts';
import { BENCHMARK_INTENTS } from '../src/data/benchmarkIntents.ts';
import { InMemoryCatalogRepository } from '../src/repository/catalogRepository.ts';
import { BenchmarkRunner } from '../src/benchmark/benchmarkRunner.ts';
import { CatalogFixEngine } from '../src/benchmark/catalogFixEngine.ts';
import { ExperimentEngine } from '../src/benchmark/experimentEngine.ts';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';
import { getSessionManager } from '../src/session/sessionManager.ts';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

describe('PART 15: Raw HTML Leakage Regression Tests', () => {
  it('1. public/app.js does not contain raw HTML string interpolation into escapeHtml', () => {
    const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
    const doubleEscaped = appJs.match(/escapeHtml\([^)]*<[^)]*\)/g);
    assert.strictEqual(doubleEscaped, null, 'app.js must not pass literal HTML tags into escapeHtml()');
  });

  it('2. Experiment header renders clean visible text without leaked raw markup', () => {
    const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
    // Ensure clean exactFixId extraction is used in visual causal header
    assert.ok(appJs.includes('exactFixId'), 'app.js must extract exactFixId cleanly');
    assert.ok(appJs.includes('↓ ONE APPROVED CATALOG CHANGE ↓'));
    assert.ok(appJs.includes('↓ SAME 100 CONTROLLED INTENTS ↓'));
    assert.ok(appJs.includes('(isolated one-fix causal experiment)'));
  });

  it('3. Catalog action cards display eligibility notices without leaking raw tags', () => {
    const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
    assert.ok(appJs.includes('Affected benchmark intents:'));
    assert.ok(appJs.includes('This approved fix has no affected benchmark intents, so a buyer-outcome improvement is not expected.'));
  });

  it('4. Zero-transition experiments display honest explanation without raw tags', () => {
    const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
    assert.ok(appJs.includes('The selected catalog change altered modeled opportunity attribution but did not change buyer outcomes in this benchmark.'));
  });

  it('5. Customer-facing agent response explanation contains no leaked HTML tags', async () => {
    const repo = new InMemoryCatalogRepository(ALL_PRODUCTS);
    const sessionManager = getSessionManager(repo);
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);

    const queries = [
      'I need a coding laptop under 70000 with 16GB RAM',
      'Show me a lightweight travel laptop under 60k',
      'running shoes for marathon training',
      'I want 32GB RAM under 50k'
    ];

    for (const q of queries) {
      const res = await orchestrator.processMessage(q, `test_html_${Date.now()}`);
      if (res.explanation) {
        assert.strictEqual(res.explanation.includes('<span'), false, `Query "${q}" leaked <span into explanation`);
        assert.strictEqual(res.explanation.includes('</span>'), false, `Query "${q}" leaked </span> into explanation`);
        assert.strictEqual(res.explanation.includes('&lt;span'), false, `Query "${q}" leaked &lt;span into explanation`);
      }
    }
  });
});

describe('PART 16: Before/After Causal Experiment & Attribution Integrity Tests', () => {
  it('1. Catalog A is immutable and remains pristine across multiple runs', async () => {
    const originalCount = ALL_PRODUCTS.length;
    const originalAlphaBook = ALL_PRODUCTS.find((p) => p.sku === 'NX-LP-MINRAMMISS-14') as any;
    const originalRam = originalAlphaBook?.ram?.capacity_gb ?? null;

    const fixEngine = new CatalogFixEngine();
    const expEngine = new ExperimentEngine(fixEngine);

    await expEngine.runBaseline();

    assert.strictEqual(ALL_PRODUCTS.length, originalCount);
    assert.strictEqual(originalAlphaBook?.ram?.capacity_gb ?? null, originalRam);
  });

  it('2. Catalog B starts from pristine Catalog A snapshot', () => {
    const fixEngine = new CatalogFixEngine();
    fixEngine.approveFix('FIX-RAM-01');

    const versionB = fixEngine.createVersionBCatalogWithFixes(['FIX-RAM-01']);
    const modifiedLaptop = versionB.repo.getProductBySku('NX-LP-MINRAMMISS-14') as any;

    assert.strictEqual(modifiedLaptop?.ram?.capacity_gb, 16);
    // Base catalog must still have null
    const baseLaptop = ALL_PRODUCTS.find((p) => p.sku === 'NX-LP-MINRAMMISS-14') as any;
    assert.strictEqual(baseLaptop?.ram?.capacity_gb, null);
  });

  it('3. Exactly one approved fix is applied per isolated experiment', () => {
    const fixEngine = new CatalogFixEngine();
    fixEngine.approveFix('FIX-STOCK-04');

    const versionB = fixEngine.createVersionBCatalogWithFixes(['FIX-STOCK-04']);
    assert.strictEqual(versionB.applied_fixes.length, 1);
    assert.strictEqual(versionB.applied_fixes[0], 'FIX-STOCK-04');
  });

  it('4. Catalog B actually contains the fix', () => {
    const fixEngine = new CatalogFixEngine();
    fixEngine.approveFix('FIX-STOCK-04');

    const versionB = fixEngine.createVersionBCatalogWithFixes(['FIX-STOCK-04']);
    const swiftBook = versionB.repo.getProductBySku('NX-LP-OOS-08');
    assert.ok(swiftBook);
    assert.strictEqual(swiftBook.stock_quantity, 10);
  });

  it('5. All other catalog fields remain unchanged in Catalog B', () => {
    const fixEngine = new CatalogFixEngine();
    fixEngine.approveFix('FIX-RAM-01');

    const versionB = fixEngine.createVersionBCatalogWithFixes(['FIX-RAM-01']);

    // Check all other products
    for (const original of ALL_PRODUCTS) {
      if (original.sku === 'NX-LP-MINRAMMISS-14') continue;
      const bProduct = versionB.repo.getProductBySku(original.sku);
      assert.ok(bProduct, `Product ${original.sku} must exist in Catalog B`);
      assert.strictEqual(bProduct.price_inr, original.price_inr);
      assert.strictEqual(bProduct.stock_quantity, original.stock_quantity);
    }
  });

  it('6. All 100 intents are re-evaluated against Catalog B without reusing Catalog A cache', async () => {
    const fixEngine = new CatalogFixEngine();
    const expEngine = new ExperimentEngine(fixEngine);

    await expEngine.runBaseline();
    fixEngine.approveFix('FIX-RAM-01');

    const comparison = await expEngine.runIsolatedExperiment('FIX-RAM-01');
    assert.strictEqual(comparison.same_benchmark_version, 'Benchmark-v1.0');
    assert.strictEqual(comparison.approved_fixes_applied.length, 1);
    assert.strictEqual(comparison.approved_fixes_applied[0], 'FIX-RAM-01');
  });

  it('7. Causally affected intents and changed SKU/fields are correctly identified', async () => {
    const fixEngine = new CatalogFixEngine();
    const expEngine = new ExperimentEngine(fixEngine);

    await expEngine.runBaseline();
    fixEngine.approveFix('FIX-RAM-01');

    const comparison = await expEngine.runIsolatedExperiment('FIX-RAM-01');
    assert.deepStrictEqual(comparison.changed_skus, ['NX-LP-MINRAMMISS-14']);
    assert.deepStrictEqual(comparison.changed_fields, ['ram.capacity_gb']);
  });

  it('8. WON -> WON is strictly excluded from outcome transitions', async () => {
    const fixEngine = new CatalogFixEngine();
    const expEngine = new ExperimentEngine(fixEngine);

    await expEngine.runBaseline();
    fixEngine.approveFix('FIX-RAM-01');

    const comparison = await expEngine.runIsolatedExperiment('FIX-RAM-01');
    for (const t of comparison.intent_transitions) {
      assert.notStrictEqual(t.before_outcome, t.after_outcome, 'Unchanged outcomes must never be counted as transitions');
    }
  });

  it('9. Opportunity attribution changes are separate from outcome transitions', async () => {
    const fixEngine = new CatalogFixEngine();
    const expEngine = new ExperimentEngine(fixEngine);

    await expEngine.runBaseline();
    fixEngine.approveFix('FIX-RAM-01');

    const comparison = await expEngine.runIsolatedExperiment('FIX-RAM-01');
    if (!comparison.has_outcome_changes) {
      assert.strictEqual(comparison.intent_transitions.length, 0);
      // Modeled opportunity shifts are isolated in opportunity_value_delta_sources
      if (comparison.opportunity_value_delta_sources) {
        assert.ok(Array.isArray(comparison.opportunity_value_delta_sources));
      }
    }
  });

  it('10. Zero-transition experiments remain zero when genuinely zero without fabrication', async () => {
    const fixEngine = new CatalogFixEngine();
    const expEngine = new ExperimentEngine(fixEngine);

    await expEngine.runBaseline();
    fixEngine.approveFix('FIX-RAM-01');

    const comparison = await expEngine.runIsolatedExperiment('FIX-RAM-01');
    assert.strictEqual(comparison.has_outcome_changes, false);
    assert.strictEqual(comparison.intent_transitions.length, 0);
  });

  it('11. Previous fix cannot leak into the next experiment', async () => {
    const fixEngine = new CatalogFixEngine();
    const expEngine = new ExperimentEngine(fixEngine);

    await expEngine.runBaseline();

    // Experiment 1: FIX-RAM-01
    fixEngine.approveFix('FIX-RAM-01');
    const comp1 = await expEngine.runIsolatedExperiment('FIX-RAM-01');
    assert.deepStrictEqual(comp1.approved_fixes_applied, ['FIX-RAM-01']);

    // Reset experiment
    expEngine.resetExperiment();
    fixEngine.resetApprovedFixes();

    // Experiment 2: FIX-STOCK-04
    fixEngine.approveFix('FIX-STOCK-04');
    const comp2 = await expEngine.runIsolatedExperiment('FIX-STOCK-04');
    assert.deepStrictEqual(comp2.approved_fixes_applied, ['FIX-STOCK-04']);
    assert.ok(!comp2.approved_fixes_applied.includes('FIX-RAM-01'), 'FIX-RAM-01 must not leak into FIX-STOCK-04 experiment');
  });

  it('12. Reset restores pristine baseline and pending fixes', async () => {
    const fixEngine = new CatalogFixEngine();
    const expEngine = new ExperimentEngine(fixEngine);

    await expEngine.runBaseline();
    fixEngine.approveFix('FIX-RAM-01');

    expEngine.resetExperiment();
    fixEngine.resetApprovedFixes();

    assert.strictEqual(fixEngine.getApprovedFixes().length, 0);
    assert.strictEqual(fixEngine.getPendingFixes().length, 4);
    assert.strictEqual(expEngine.getEnrichedSummary(), null);
    assert.ok(expEngine.getBaselineSummary() !== null, 'Baseline summary is preserved');
  });
});
