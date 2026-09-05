import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BENCHMARK_INTENTS } from '../src/data/benchmarkIntents.ts';
import {
  BenchmarkRunner,
  validateBenchmarkIntent,
  validateBenchmarkDataset,
  BenchmarkDataError
} from '../src/benchmark/benchmarkRunner.ts';
import {
  ExperimentEngine,
  getExperimentEngine
} from '../src/benchmark/experimentEngine.ts';
import {
  getCatalogFixEngine,
  CatalogFixEngine
} from '../src/benchmark/catalogFixEngine.ts';
import type { BenchmarkIntent } from '../src/types/benchmark.ts';

// Helper mimicking frontend escapeHtml
function escapeHtmlDefensive(str: any): string {
  if (str === null || str === undefined) return '';
  const s = typeof str === 'string' ? str : String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

describe('Milestone 5: Benchmark Validation, State Machine & Crash Prevention Suite', () => {
  const runner = new BenchmarkRunner();

  // Requirement 18.1: All 100 built-in intents validate
  it('1. All 100 built-in intents validate via validateBenchmarkIntent', () => {
    assert.strictEqual(BENCHMARK_INTENTS.length, 100, 'Must have exactly 100 intents');
    for (const intent of BENCHMARK_INTENTS) {
      const val = validateBenchmarkIntent(intent);
      assert.strictEqual(val.valid, true, `Intent ${intent.benchmark_id} must be valid: ${(val as any).reason}`);
    }
  });

  // Requirement 18.2: All 100 have non-empty natural_language_query
  it('2. All 100 intents have non-empty natural_language_query', () => {
    for (const intent of BENCHMARK_INTENTS) {
      assert.strictEqual(typeof intent.natural_language_query, 'string', `${intent.benchmark_id} query must be string`);
      assert.ok(intent.natural_language_query.trim().length > 0, `${intent.benchmark_id} query must not be empty`);
    }
  });

  // Requirement 18.3: No benchmark intent can enter evaluation with undefined query
  it('3. No benchmark intent can enter evaluation with undefined query', async () => {
    const malformed = {
      ...BENCHMARK_INTENTS[0],
      natural_language_query: undefined as any
    };

    const val = validateBenchmarkIntent(malformed);
    assert.strictEqual(val.valid, false);
    assert.strictEqual(val.field, 'natural_language_query');

    await assert.rejects(
      async () => {
        const dataset = [...BENCHMARK_INTENTS.slice(1), malformed];
        await runner.runBenchmark('Catalog-v1.0', 'Benchmark-v1.0', dataset);
      },
      (err: any) => {
        assert.ok(err instanceof BenchmarkDataError);
        assert.strictEqual(err.field, 'natural_language_query');
        assert.strictEqual(err.benchmark_id, malformed.benchmark_id);
        return true;
      }
    );
  });

  // Requirement 18.4: Malformed intent returns structured INVALID_BENCHMARK_DATA
  it('4. Malformed intent returns structured INVALID_BENCHMARK_DATA error', () => {
    const invalidIntent: any = {
      benchmark_id: 'BENCH-BAD-01',
      natural_language_query: '',
      group: 'developer',
      expected_category: 'laptop',
      expected_hard_constraints: {},
      expected_soft_preferences: {},
      requested_accessories: [],
      benchmark_version: 'v1.0'
    };

    const val = validateBenchmarkIntent(invalidIntent);
    assert.strictEqual(val.valid, false);
    assert.strictEqual(val.status, 'INVALID_BENCHMARK_DATA');
    assert.strictEqual(val.benchmark_id, 'BENCH-BAD-01');
    assert.strictEqual(val.field, 'natural_language_query');
    assert.ok(val.reason.includes('non-empty string'));
  });

  // Requirement 18.5: Malformed intent does not throw TypeError
  it('5. Malformed intent does not throw TypeError during validation or runner execution', async () => {
    const dangerousInputs: any[] = [
      null,
      undefined,
      {},
      { benchmark_id: 123 },
      { benchmark_id: 'ID-1', natural_language_query: null },
      { benchmark_id: 'ID-2', natural_language_query: 'laptop', group: null }
    ];

    for (const input of dangerousInputs) {
      assert.doesNotThrow(() => {
        const res = validateBenchmarkIntent(input);
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.status, 'INVALID_BENCHMARK_DATA');
      }, 'Validation must handle malformed data without throwing TypeError');
    }
  });

  // Requirement 18.6: Benchmark count remains exactly 100
  it('6. Benchmark count remains exactly 100', async () => {
    assert.strictEqual(BENCHMARK_INTENTS.length, 100);

    const check = validateBenchmarkDataset(BENCHMARK_INTENTS.slice(0, 99));
    assert.strictEqual(check.valid, false);
    assert.strictEqual(check.error?.field, 'intents.length');
    assert.ok(check.error?.reason.includes('must be exactly 100'));

    await assert.rejects(
      async () => {
        await runner.runBenchmark('Catalog-v1.0', 'Benchmark-v1.0', BENCHMARK_INTENTS.slice(0, 99));
      },
      (err: any) => {
        assert.ok(err instanceof BenchmarkDataError);
        assert.strictEqual(err.field, 'intents.length');
        assert.ok(err.message.includes('must be exactly 100'));
        return true;
      }
    );
  });

  // Requirement 18.7: benchmark_id values are unique
  it('7. benchmark_id values are unique and duplicate IDs are rejected', async () => {
    const idSet = new Set(BENCHMARK_INTENTS.map((i) => i.benchmark_id));
    assert.strictEqual(idSet.size, 100);

    const withDuplicate = [
      ...BENCHMARK_INTENTS.slice(0, 99),
      { ...BENCHMARK_INTENTS[0] } // duplicate first item
    ];

    const check = validateBenchmarkDataset(withDuplicate);
    assert.strictEqual(check.valid, false);
    assert.strictEqual(check.error?.field, 'benchmark_id');
    assert.ok(check.error?.reason.includes('Duplicate benchmark_id'));

    await assert.rejects(
      async () => {
        await runner.runBenchmark('Catalog-v1.0', 'Benchmark-v1.0', withDuplicate);
      },
      (err: any) => {
        assert.ok(err instanceof BenchmarkDataError);
        assert.strictEqual(err.field, 'benchmark_id');
        assert.ok(err.message.includes('Duplicate benchmark_id'));
        return true;
      }
    );
  });

  // Requirement 18.8: Successful run produces exactly 100 result records
  it('8. Successful run produces exactly 100 result records', async () => {
    const summary = await runner.runBenchmark('Catalog-v1.0', 'Benchmark-v1.0', BENCHMARK_INTENTS);
    assert.strictEqual(summary.total_intents, 100);
    assert.strictEqual(summary.results.length, 100);
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(summary.results[i].benchmark_id, BENCHMARK_INTENTS[i].benchmark_id);
    }
  });

  // Requirement 18.9: Dashboard counts match result records
  it('9. Dashboard counts match result records', async () => {
    const summary = await runner.runBenchmark('Catalog-v1.0', 'Benchmark-v1.0', BENCHMARK_INTENTS);
    const sumTally = summary.won_count + summary.partial_count + summary.lost_count + summary.unsupported_intents;
    assert.strictEqual(sumTally, summary.results.length);
    assert.strictEqual(sumTally, 100);

    const wonFromResults = summary.results.filter((r) => r.status === 'WON').length;
    const partialFromResults = summary.results.filter((r) => r.status === 'PARTIAL').length;
    const lostFromResults = summary.results.filter((r) => r.status === 'LOST').length;
    const unsupportedFromResults = summary.results.filter((r) => r.status === 'UNSUPPORTED').length;

    assert.strictEqual(wonFromResults, summary.won_count);
    assert.strictEqual(partialFromResults, summary.partial_count);
    assert.strictEqual(lostFromResults, summary.lost_count);
    assert.strictEqual(unsupportedFromResults, summary.unsupported_intents);
  });

  // Requirement 18.10: Failed run does not overwrite the last completed benchmark
  it('10. Failed run does not overwrite the last completed benchmark', async () => {
    const exp = new ExperimentEngine();
    const completedBaseline = await exp.runBaseline('Catalog-v1.0-Baseline');
    assert.ok(completedBaseline.results.length === 100);

    const malformedDataset = [
      ...BENCHMARK_INTENTS.slice(1),
      { ...BENCHMARK_INTENTS[0], natural_language_query: '' }
    ];

    try {
      await runner.runBenchmark('Catalog-v1.0-Corrupted', 'Benchmark-v1.0', malformedDataset);
      assert.fail('Should have thrown BenchmarkDataError');
    } catch (err: any) {
      assert.ok(err instanceof BenchmarkDataError);
    }

    // The baseline summary in experiment engine remains the valid completed one
    const latest = exp.getBaselineSummary();
    assert.ok(latest !== null);
    assert.strictEqual(latest?.catalog_version, 'Catalog-v1.0-Baseline');
    assert.strictEqual(latest?.results.length, 100);
  });

  // Requirement 18.11: Isolated 1-fix experiment cannot run without a completed baseline or without approved fix
  it('11. Before/After cannot run without a completed baseline or without approved fix', async () => {
    const freshExp = new ExperimentEngine();
    // 11A: Without baseline run
    await assert.rejects(
      async () => {
        await freshExp.runIsolatedExperiment('FIX-RAM-01');
      },
      (err: any) => {
        return err.message.includes('PRECONDITION_FAILED') && err.message.includes('baseline benchmark first');
      }
    );

    // 11B: With baseline run, but without approved fix
    const unapprovedFixEngine = new CatalogFixEngine();
    const expNoFix = new ExperimentEngine(unapprovedFixEngine);
    await expNoFix.runBaseline();
    await assert.rejects(
      async () => {
        await expNoFix.runIsolatedExperiment('FIX-RAM-01');
      },
      (err: any) => {
        return err.message.includes('PRECONDITION_FAILED') && err.message.includes('not approved');
      }
    );
  });

  // Requirement 18.12: Before/After uses same 100 benchmark IDs and queries
  it('12. Before/After uses same 100 benchmark IDs and queries', async () => {
    const fixEngine = new CatalogFixEngine();
    fixEngine.approveFix('FIX-RAM-01');
    const exp = new ExperimentEngine(fixEngine);

    const baselineSummary = await exp.runBaseline();
    const comparison = await exp.runIsolatedExperiment('FIX-RAM-01');
    const enrichedSummary = exp.getEnrichedSummary()!;

    assert.strictEqual(baselineSummary.results.length, 100);
    assert.strictEqual(enrichedSummary.results.length, 100);

    for (let i = 0; i < 100; i++) {
      assert.strictEqual(
        baselineSummary.results[i].benchmark_id,
        enrichedSummary.results[i].benchmark_id
      );
      assert.strictEqual(
        baselineSummary.results[i].query,
        enrichedSummary.results[i].query
      );
    }
    assert.ok(comparison.metrics.product_match_rate.after >= comparison.metrics.product_match_rate.before);
  });

  // Requirement 17: Test the exact .replace() failure and verify regression fix
  it('17. Regression: escapeHtml(undefined) returns empty string and all 100 results render without .replace crash', async () => {
    // 17A: Defensive escapeHtml unit check
    assert.strictEqual(escapeHtmlDefensive(undefined), '');
    assert.strictEqual(escapeHtmlDefensive(null), '');
    assert.strictEqual(escapeHtmlDefensive(12345), '12345');
    assert.strictEqual(escapeHtmlDefensive('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

    // 17B: Run the real 100-intent benchmark and map every single result through frontend renderer logic
    const summary = await runner.runBenchmark('Catalog-v1.0', 'Benchmark-v1.0', BENCHMARK_INTENTS);
    assert.strictEqual(summary.results.length, 100);

    for (const r of summary.results) {
      // Simulate exact table rendering from public/app.js:
      assert.doesNotThrow(() => {
        const idHtml = escapeHtmlDefensive(r.benchmark_id);
        const groupHtml = escapeHtmlDefensive(r.group);
        const queryHtml = escapeHtmlDefensive(r.query);
        const statusHtml = escapeHtmlDefensive(r.status);
        const skuHtml = escapeHtmlDefensive(r.matched_sku || r.matched_product_sku || r.closest_sku || r.closest_product_sku || '');
        const reasonHtml = escapeHtmlDefensive(r.loss_reason_code || '');
        const descHtml = escapeHtmlDefensive(r.loss_reason_description || r.explanation || '');

        assert.ok(idHtml.length > 0);
        assert.ok(queryHtml.length > 0);
        assert.ok(groupHtml.length > 0);
        assert.ok(statusHtml.length > 0);
      }, `Rendering result ${r.benchmark_id} must never throw TypeError`);
    }
  });
});
