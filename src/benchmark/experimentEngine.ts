import { BenchmarkRunner } from './benchmarkRunner.ts';
import { CatalogFixEngine, getCatalogFixEngine } from './catalogFixEngine.ts';
import { getCatalogRepository } from '../repository/catalogRepository.ts';
import { BENCHMARK_INTENTS } from '../data/benchmarkIntents.ts';
import type {
  BenchmarkRunSummary,
  ExperimentComparison,
  MetricDelta,
  OpportunityType,
  OpportunityValueDeltaSource
} from '../types/benchmark.ts';

let _experimentCounter = 0;

function generateExperimentId(): string {
  _experimentCounter++;
  const ts = Date.now().toString(36).toUpperCase();
  return `EXP-${String(_experimentCounter).padStart(3, '0')}-${ts}`;
}

/**
 * BEFORE / AFTER EXPERIMENT ENGINE (Track 01):
 * Executes controlled A/B evaluation between Baseline Catalog (Version A)
 * and Merchant-Enriched Catalog (Version B) against the exact same 100 buyer intents.
 *
 * KEY INTEGRITY RULES:
 * - Version A is immutable. It is NEVER modified.
 * - "Recovered" language is forbidden unless has_outcome_changes === true.
 * - opportunity_value_delta_sources traces every INR difference to a benchmark row.
 * - Isolated experiments use exactly ONE approved fix_id for causal clarity.
 */
export class ExperimentEngine {
  private fixEngine: CatalogFixEngine;
  private baselineSummary: BenchmarkRunSummary | null = null;
  private enrichedSummary: BenchmarkRunSummary | null = null;

  constructor(fixEngine: CatalogFixEngine = getCatalogFixEngine()) {
    this.fixEngine = fixEngine;
  }

  /**
   * Runs the baseline benchmark on Catalog Version A (Immutable Baseline).
   */
  public async runBaseline(versionLabel = 'Catalog-v1.0-Baseline'): Promise<BenchmarkRunSummary> {
    const baseRepo = getCatalogRepository();
    const runner = new BenchmarkRunner(baseRepo);
    this.baselineSummary = await runner.runBenchmark(versionLabel, 'Benchmark-v1.0', BENCHMARK_INTENTS);
    this.fixEngine.updateFixMetricsFromBenchmark(this.baselineSummary);
    return this.baselineSummary;
  }

  /**
   * Runs an ISOLATED one-fix experiment.
   * Version B = Catalog Version A + exactly ONE approved fix.
   * This is the recommended path for causal attribution demos.
   *
   * @param fixId - The single fix_id to apply. Must already be APPROVED.
   */
  public async runIsolatedExperiment(fixId: string): Promise<ExperimentComparison> {
    if (!this.baselineSummary) {
      throw new Error('PRECONDITION_FAILED: Run the 100-intent baseline benchmark first.');
    }

    const allApproved = this.fixEngine.getApprovedFixes();
    const targetFix = allApproved.find((f) => f.fix_id === fixId);
    if (!targetFix) {
      throw new Error(`PRECONDITION_FAILED: Fix "${fixId}" is not approved. Approve it first via the merchant approval gate.`);
    }

    // Build a Version B with ONLY this single fix applied
    const versionBData = this.fixEngine.createVersionBCatalogWithFixes([fixId]);
    const runnerB = new BenchmarkRunner(versionBData.repo);
    this.enrichedSummary = await runnerB.runBenchmark(
      versionBData.catalog_version,
      'Benchmark-v1.0',
      BENCHMARK_INTENTS
    );

    return this.compareSummaries(
      this.baselineSummary,
      this.enrichedSummary,
      [fixId],
      fixId // single causal fix
    );
  }

  /**
   * Runs the enriched benchmark on Catalog Version B (all approved fixes).
   * Uses the EXACT same 100 intents as the baseline.
   */
  public async runEnrichedExperiment(): Promise<ExperimentComparison> {
    if (!this.baselineSummary) {
      throw new Error('PRECONDITION_FAILED: Run the 100-intent baseline benchmark first.');
    }

    const approvedFixes = this.fixEngine.getApprovedFixes();
    if (approvedFixes.length === 0) {
      throw new Error('PRECONDITION_FAILED: No approved Catalog Version B change is available yet.');
    }

    const versionBData = this.fixEngine.createVersionBCatalog();
    const runnerB = new BenchmarkRunner(versionBData.repo);
    this.enrichedSummary = await runnerB.runBenchmark(
      versionBData.catalog_version,
      'Benchmark-v1.0',
      BENCHMARK_INTENTS
    );

    // Multi-fix run: approved_fix_id is null (not a single causal experiment)
    return this.compareSummaries(
      this.baselineSummary,
      this.enrichedSummary,
      versionBData.applied_fixes,
      null // multi-fix — not a single causal experiment
    );
  }

  /**
   * Resets the experiment state so a fresh isolated experiment can be started
   * from the same immutable Version A baseline without re-running the baseline.
   * Does NOT clear the baseline summary.
   */
  public resetExperiment(): void {
    this.enrichedSummary = null;
  }

  public getBaselineSummary(): BenchmarkRunSummary | null {
    return this.baselineSummary;
  }

  public getEnrichedSummary(): BenchmarkRunSummary | null {
    return this.enrichedSummary;
  }

  public compareSummaries(
    before: BenchmarkRunSummary,
    after: BenchmarkRunSummary,
    appliedFixes: string[] = [],
    singleFixId: string | null = null
  ): ExperimentComparison {
    // PROGRAMMATIC PROOF: Version A and Version B evaluate the EXACT SAME 100 INTENTS
    if (before.results.length !== 100 || after.results.length !== 100) {
      throw new Error(`Intent count mismatch: Baseline has ${before.results.length}, Enriched has ${after.results.length}. Both must be exactly 100.`);
    }

    for (let i = 0; i < 100; i++) {
      if (before.results[i].benchmark_id !== after.results[i].benchmark_id) {
        throw new Error(`Intent ID mismatch at index ${i}: Baseline=${before.results[i].benchmark_id}, Enriched=${after.results[i].benchmark_id}`);
      }
      if (before.results[i].query !== after.results[i].query) {
        throw new Error(`Intent query mismatch for ID "${before.results[i].benchmark_id}"`);
      }
    }

    const calcDelta = (bVal: number, aVal: number): MetricDelta => {
      const delta = Number((aVal - bVal).toFixed(3));
      const pct_change = bVal !== 0 ? Number((((aVal - bVal) / bVal) * 100).toFixed(1)) : 0;
      return { before: bVal, after: aVal, delta, pct_change };
    };

    // Track ONLY actual outcome changes (LOST→WON, PARTIAL→WON, etc.)
    // SKU-only upgrades within the same outcome are excluded.
    const outcomeTransitions: ExperimentComparison['intent_transitions'] = [];
    const beforeMap = new Map(before.results.map((r) => [r.benchmark_id, r]));

    for (const afterRes of after.results) {
      const beforeRes = beforeMap.get(afterRes.benchmark_id);
      if (!beforeRes) continue;

      // Only record REAL outcome changes — not SKU-only changes
      if (beforeRes.opportunity_type !== afterRes.opportunity_type) {
        let reason = '';
        if (beforeRes.opportunity_type === 'LOST' && afterRes.opportunity_type === 'WON') {
          reason = `Resolved ${beforeRes.loss_reason_code || 'catalog defect'} via approved catalog enrichment (${singleFixId || appliedFixes.join(', ')}).`;
        } else if (beforeRes.opportunity_type === 'PARTIAL' && afterRes.opportunity_type === 'WON') {
          reason = 'Satisfied hard constraints previously marked as partial via catalog enrichment.';
        } else if (beforeRes.opportunity_type === 'LOST' && afterRes.opportunity_type === 'PARTIAL') {
          reason = 'Partially resolved: buyer can now be served with a disclosed trade-off.';
        } else {
          reason = `Outcome changed: ${beforeRes.opportunity_type} → ${afterRes.opportunity_type}.`;
        }

        outcomeTransitions.push({
          benchmark_id: afterRes.benchmark_id,
          query: afterRes.query,
          before_outcome: beforeRes.opportunity_type,
          after_outcome: afterRes.opportunity_type,
          before_status: beforeRes.opportunity_type,
          after_status: afterRes.opportunity_type,
          before_sku: beforeRes.selected_sku,
          after_sku: afterRes.selected_sku,
          cause: reason,
          reason_improved: reason,
          reason,
          caused_by_fix_id: singleFixId,
          approved_fix_id: singleFixId
        });
      }
      // SKU-only changes are intentionally NOT recorded here.
    }

    // OPPORTUNITY VALUE RECONCILIATION:
    // For every benchmark row where catalog_attributed_opportunity_inr changed,
    // record the delta so the UI can trace it. This is NOT revenue — it is a
    // change in the benchmark estimate.
    const deltaSources: OpportunityValueDeltaSource[] = [];
    for (const afterRes of after.results) {
      const beforeRes = beforeMap.get(afterRes.benchmark_id);
      if (!beforeRes) continue;
      const beforeOpp = beforeRes.catalog_attributed_opportunity_inr;
      const afterOpp = afterRes.catalog_attributed_opportunity_inr;
      const diff = afterOpp - beforeOpp;
      if (diff !== 0) {
        let reason = '';
        if (beforeRes.opportunity_type !== afterRes.opportunity_type) {
          reason = `Outcome changed ${beforeRes.opportunity_type}→${afterRes.opportunity_type}: opportunity attribution reclassified.`;
        } else if (beforeRes.selected_sku !== afterRes.selected_sku) {
          reason = `SKU changed (${beforeRes.selected_sku || 'none'} → ${afterRes.selected_sku || 'none'}) within same outcome. Basket valuation difference; no outcome improvement.`;
        } else {
          reason = `Basket total or valuation changed without outcome change. Attribution difference only; no buyer intent moved to WON.`;
        }
        deltaSources.push({
          benchmark_id: afterRes.benchmark_id,
          query: afterRes.query,
          before_opportunity_inr: beforeOpp,
          after_opportunity_inr: afterOpp,
          delta_inr: diff,
          before_outcome: beforeRes.opportunity_type,
          after_outcome: afterRes.opportunity_type,
          reason
        });
      }
    }

    const hasOutcomeChanges = outcomeTransitions.length > 0;

    return {
      experiment_id: generateExperimentId(),
      catalog_version_a: before.catalog_version,
      catalog_version_b: after.catalog_version,
      benchmark_version: before.benchmark_version,
      baseline_catalog_version: before.catalog_version,
      enriched_catalog_version: after.catalog_version,
      timestamp: new Date().toISOString(),
      approved_fixes_applied: appliedFixes,
      approved_fix_id: singleFixId,
      has_outcome_changes: hasOutcomeChanges,
      metrics: {
        product_match_rate: calcDelta(before.product_match_rate, after.product_match_rate),
        variant_accuracy_rate: calcDelta(before.variant_accuracy_rate, after.variant_accuracy_rate),
        compatibility_success_rate: calcDelta(before.compatibility_success_rate, after.compatibility_success_rate),
        checkout_ready_rate: calcDelta(before.checkout_ready_rate, after.checkout_ready_rate),
        simulated_acceptance_rate: calcDelta(before.simulated_acceptance_rate, after.simulated_acceptance_rate),
        simulated_cross_sell_acceptance_rate: calcDelta(
          before.supported_intents > 0 ? Number((before.simulated_cross_sells_accepted_count / before.supported_intents).toFixed(3)) : 0,
          after.supported_intents > 0 ? Number((after.simulated_cross_sells_accepted_count / after.supported_intents).toFixed(3)) : 0
        ),
        catalog_attributed_opportunity_value_inr: calcDelta(
          before.catalog_attributed_opportunity_value_inr,
          after.catalog_attributed_opportunity_value_inr
        ),
        won_count: calcDelta(before.won_count, after.won_count),
        lost_count: calcDelta(before.lost_count, after.lost_count)
      },
      intent_transitions: outcomeTransitions,
      opportunity_value_delta_sources: deltaSources
    };
  }
}

let globalExperimentEngine: ExperimentEngine | null = null;

export function getExperimentEngine(): ExperimentEngine {
  if (!globalExperimentEngine) {
    globalExperimentEngine = new ExperimentEngine();
  }
  return globalExperimentEngine;
}

export function resetGlobalExperimentEngine(): void {
  globalExperimentEngine = null;
}
