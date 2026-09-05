import { CatalogFixEngine } from '../src/benchmark/catalogFixEngine.ts';
import { BenchmarkRunner } from '../src/benchmark/benchmarkRunner.ts';
import { BENCHMARK_INTENTS } from '../src/data/benchmarkIntents.ts';
import { InMemoryCatalogRepository } from '../src/repository/catalogRepository.ts';
import { ALL_PRODUCTS } from '../src/data/catalog.ts';

async function auditFixes() {
  const fixEngine = new CatalogFixEngine();
  const repoA = new InMemoryCatalogRepository(ALL_PRODUCTS);
  const runnerA = new BenchmarkRunner(repoA);

  const fixes = ['FIX-RAM-01', 'FIX-BRIGHT-02', 'FIX-DONGLE-03', 'FIX-STOCK-04'];

  for (const fixId of fixes) {
    fixEngine.resetApprovedFixes();
    fixEngine.approveFix(fixId);
    const catB = fixEngine.createVersionBCatalogWithFixes([fixId]);
    const runnerB = new BenchmarkRunner(catB.repo);

    console.log('\n=========================================');
    console.log('Auditing fix:', fixId);
    console.log('=========================================');

    let totalDiffs = 0;
    for (let i = 0; i < BENCHMARK_INTENTS.length; i++) {
      const intent = BENCHMARK_INTENTS[i];
      const resA = await runnerA.evaluateSingleIntent(intent);
      const resB = await runnerB.evaluateSingleIntent(intent);

      const statusChanged = resA.status !== resB.status;
      const skuChanged = resA.selected_sku !== resB.selected_sku;
      const oppChanged = resA.catalog_attributed_opportunity_inr !== resB.catalog_attributed_opportunity_inr;
      const rejectionsA = resA.rejection_reasons || [];
      const rejectionsB = resB.rejection_reasons || [];

      if (statusChanged || skuChanged || oppChanged || JSON.stringify(rejectionsA) !== JSON.stringify(rejectionsB)) {
        totalDiffs++;
        console.log(`Intent ${intent.benchmark_id}: "${intent.natural_language_query}"`);
        console.log(`  Status: ${resA.status} -> ${resB.status}`);
        console.log(`  Selected SKU: ${resA.selected_sku} -> ${resB.selected_sku}`);
        console.log(`  Opp INR: ${resA.catalog_attributed_opportunity_inr} -> ${resB.catalog_attributed_opportunity_inr}`);
        console.log(`  Rejections A: ${JSON.stringify(rejectionsA)}`);
        console.log(`  Rejections B: ${JSON.stringify(rejectionsB)}`);
      }
    }
    console.log(`Total diffs for ${fixId}: ${totalDiffs}`);
  }
}

auditFixes().catch(console.error);
