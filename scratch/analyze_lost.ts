import { BenchmarkRunner } from '../src/benchmark/benchmarkRunner.ts';
import { BENCHMARK_INTENTS } from '../src/data/benchmarkIntents.ts';
import { InMemoryCatalogRepository } from '../src/repository/catalogRepository.ts';
import { ALL_PRODUCTS } from '../src/data/catalog.ts';
import { CatalogFixEngine } from '../src/benchmark/catalogFixEngine.ts';

async function analyzeLost() {
  const fixEngine = new CatalogFixEngine();
  const repoA = new InMemoryCatalogRepository(ALL_PRODUCTS);
  const runnerA = new BenchmarkRunner(repoA);
  const baseline = await runnerA.runBenchmark('Catalog-A', 'v1.0', BENCHMARK_INTENTS, repoA);

  console.log('=== 23 LOST INTENTS IN CATALOG A ===');
  for (const r of baseline.results) {
    if (r.status === 'LOST') {
      console.log(`\n[${r.benchmark_id}] Query: "${r.query}"`);
      console.log(`  Loss Reason: ${r.loss_reason_code} - ${r.loss_reason_detail}`);
      console.log(`  Rejection Reasons count: ${r.rejection_reasons.length}`);
      console.log(`  Sample rejections:`, r.rejection_reasons.slice(0, 3));
    }
  }

  console.log('\n=== 7 PARTIAL INTENTS IN CATALOG A ===');
  for (const r of baseline.results) {
    if (r.status === 'PARTIAL') {
      console.log(`\n[${r.benchmark_id}] Query: "${r.query}"`);
      console.log(`  Selected SKU: ${r.selected_sku}`);
      console.log(`  Trade-offs:`, r.trade_offs);
    }
  }
}

analyzeLost().catch(console.error);
