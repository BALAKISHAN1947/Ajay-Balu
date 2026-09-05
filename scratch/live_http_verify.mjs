// Live HTTP end-to-end verification of Merchant Dashboard & Experiment Engine
import assert from 'node:assert/strict';
import { createServer } from '../src/server/server.ts';

async function runLiveVerification() {
  const PORT = 3099;
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));
  const BASE_URL = `http://127.0.0.1:${PORT}`;

  try {
    console.log('================================================================');
    console.log('STARTING MERCHANT EXPERIMENT ENGINE HTTP VERIFICATION');
    console.log('================================================================');

    // Step 0: Run Baseline Benchmark
    console.log('\n[Step 0] Running 100-Intent Baseline Benchmark...');
    const runRes = await fetch(`${BASE_URL}/api/v1/merchant/benchmark/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalog_version: 'Catalog-v1.0-Baseline', benchmark_version: 'v1.0' })
    });
    assert.strictEqual(runRes.status, 200, `Expected 200, got ${runRes.status}`);
    const runData = await runRes.json();
    assert.strictEqual(runData.status, 'COMPLETED');
    const summaryA = runData.summary;
    console.log(`✓ Baseline completed: 100 intents evaluated (Won: ${summaryA.won_count}, Lost: ${summaryA.lost_count}, Partial: ${summaryA.partial_count})`);
    console.log(`✓ AI Buyer Readiness Score: ${summaryA.ai_buyer_readiness_score}/100`);

    // Verify Fixes List
    const fixesRes = await fetch(`${BASE_URL}/api/v1/merchant/catalog/fixes`);
    assert.strictEqual(fixesRes.status, 200);
    const fixesData = await fixesRes.json();
    const fixStock = [...fixesData.pending, ...fixesData.approved].find((f) => f.fix_id === 'FIX-STOCK-04');
    assert.ok(fixStock, 'FIX-STOCK-04 must exist');
    console.log(`✓ FIX-STOCK-04 affected intents count: ${fixStock.affected_intents_count} (opportunity: ₹${fixStock.opportunity_value_inr})`);
    assert.ok(fixStock.affected_intents_count <= 10, `Affected count must be specific, not 93 (got ${fixStock.affected_intents_count})`);
    assert.notStrictEqual(fixStock.affected_intents_count, 93);

    // 1. Approve FIX-STOCK-04 only
    console.log('\n[Verification 1] Approving FIX-STOCK-04 only...');
    const approveStockRes = await fetch(`${BASE_URL}/api/v1/merchant/catalog/fixes/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fix_id: 'FIX-STOCK-04' })
    });
    assert.strictEqual(approveStockRes.status, 200);
    const approveStockData = await approveStockRes.json();
    assert.strictEqual(approveStockData.success, true);
    assert.strictEqual(approveStockData.fix.status, 'APPROVED');
    console.log('✓ FIX-STOCK-04 successfully approved.');

    // 2. Run its 1-fix experiment
    console.log('\n[Verification 2] Running 1-fix experiment for FIX-STOCK-04...');
    const expStockRes = await fetch(`${BASE_URL}/api/v1/merchant/experiment/isolated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fix_id: 'FIX-STOCK-04' })
    });
    assert.strictEqual(expStockRes.status, 200);
    const expStockData = await expStockRes.json();

    // 3. Confirm approved_fixes_applied contains exactly ['FIX-STOCK-04']
    console.log('\n[Verification 3] Confirming approved_fixes_applied contains exactly [FIX-STOCK-04]...');
    assert.deepStrictEqual(expStockData.approved_fixes_applied, ['FIX-STOCK-04']);
    assert.strictEqual(expStockData.approved_fix_id, 'FIX-STOCK-04');
    console.log('✓ approved_fixes_applied is exactly:', expStockData.approved_fixes_applied);

    // 4. Confirm changed_skus and changed_fields are correct
    console.log('\n[Verification 4] Confirming changed_skus and changed_fields...');
    assert.deepStrictEqual(expStockData.changed_skus, ['NX-LP-OOS-08']);
    assert.deepStrictEqual(expStockData.changed_fields, ['stock_quantity']);
    console.log('✓ changed_skus:', expStockData.changed_skus);
    console.log('✓ changed_fields:', expStockData.changed_fields);
    console.log('✓ approved_fix_title:', expStockData.approved_fix_title);

    // 5. Confirm affected intent count is only the intents actually affected by this fix
    console.log('\n[Verification 5] Confirming affected intent count is fix-specific...');
    assert.ok(fixStock.affected_intents_count <= 10);
    console.log(`✓ Fix-specific affected intent count verified: ${fixStock.affected_intents_count}`);

    // Confirm multi-fix entry point is blocked
    console.log('\n[Verification 5b] Confirming GET /experiment/compare is blocked (405)...');
    const compareRes = await fetch(`${BASE_URL}/api/v1/merchant/experiment/compare`);
    assert.strictEqual(compareRes.status, 405, `Expected 405, got ${compareRes.status}`);
    console.log('✓ GET /experiment/compare properly blocked with 405 Method Not Allowed.');

    // 6. Reset experiment
    console.log('\n[Verification 6] Resetting experiment state...');
    const resetRes = await fetch(`${BASE_URL}/api/v1/merchant/experiment/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert.strictEqual(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.strictEqual(resetData.status, 'RESET');

    // Confirm fixes returned to pending
    const fixesAfterReset = await fetch(`${BASE_URL}/api/v1/merchant/catalog/fixes`);
    const fixesAfterResetData = await fixesAfterReset.json();
    assert.strictEqual(fixesAfterResetData.approved.length, 0, 'Approved fixes must be empty after reset');
    console.log('✓ Experiment reset: all approved fixes restored to PENDING.');

    // 7. Approve FIX-RAM-01 only
    console.log('\n[Verification 7] Approving FIX-RAM-01 only...');
    const approveRamRes = await fetch(`${BASE_URL}/api/v1/merchant/catalog/fixes/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fix_id: 'FIX-RAM-01' })
    });
    assert.strictEqual(approveRamRes.status, 200);
    const approveRamData = await approveRamRes.json();
    assert.strictEqual(approveRamData.success, true);
    console.log('✓ FIX-RAM-01 approved.');

    // 8. Run again
    console.log('\n[Verification 8] Running 1-fix experiment for FIX-RAM-01...');
    const expRamRes = await fetch(`${BASE_URL}/api/v1/merchant/experiment/isolated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fix_id: 'FIX-RAM-01' })
    });
    assert.strictEqual(expRamRes.status, 200);
    const expRamData = await expRamRes.json();

    // 9. Confirm FIX-STOCK-04 does not leak into the new experiment
    console.log('\n[Verification 9] Confirming FIX-STOCK-04 does NOT leak into new experiment...');
    assert.deepStrictEqual(expRamData.approved_fixes_applied, ['FIX-RAM-01']);
    assert.strictEqual(expRamData.approved_fix_id, 'FIX-RAM-01');
    assert.deepStrictEqual(expRamData.changed_skus, ['NX-LP-MINRAMMISS-14']);
    assert.deepStrictEqual(expRamData.changed_fields, ['ram.capacity_gb']);
    assert.ok(!expRamData.approved_fixes_applied.includes('FIX-STOCK-04'));
    assert.ok(!expRamData.changed_skus.includes('NX-LP-OOS-08'));
    console.log('✓ Zero leakage confirmed. applied_fixes:', expRamData.approved_fixes_applied);

    // 10. Confirm Catalog A remains unchanged
    console.log('\n[Verification 10] Confirming Catalog A remains unchanged...');
    assert.strictEqual(expRamData.baseline_catalog_version, 'Catalog-v1.0-Baseline');
    assert.strictEqual(expRamData.catalog_version_a, 'Catalog-v1.0-Baseline');
    assert.strictEqual(expRamData.same_benchmark_version, expRamData.benchmark_version);
    console.log('✓ Catalog A immutable baseline confirmed.');

    console.log('\n================================================================');
    console.log('>>> ALL 10 MERCHANT EXPERIMENT INTEGRITY CHECKS PASSED (100%) <<<');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runLiveVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
