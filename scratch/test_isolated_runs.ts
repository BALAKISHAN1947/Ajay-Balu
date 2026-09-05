import { BenchmarkRunner } from '../src/benchmark/benchmarkRunner.ts';
import { BENCHMARK_INTENTS } from '../src/data/benchmarkIntents.ts';
import { CatalogFixEngine } from '../src/benchmark/catalogFixEngine.ts';

async function checkSwift() {
  const fixEngine = new CatalogFixEngine();
  fixEngine.approveFix('FIX-STOCK-04');
  const catB = fixEngine.createVersionBCatalogWithFixes(['FIX-STOCK-04']);
  const runner = new BenchmarkRunner(catB.repo);
  const res = await runner.runBenchmark(catB.catalog_version, 'v1.0', BENCHMARK_INTENTS);
  const r = res.results.find(x => x.benchmark_id === 'BENCH-BUDGET-11')!;
  console.log('BENCH-BUDGET-11 under Catalog B:');
  console.log('Selected SKU:', r.selected_sku, 'Matched:', r.matched_sku);
  console.log('Rejections:', r.rejection_reasons);
  console.log('Satisfied:', r.satisfied_constraints);
  console.log('Unsatisfied:', r.unsatisfied_constraints);
}
checkSwift();
