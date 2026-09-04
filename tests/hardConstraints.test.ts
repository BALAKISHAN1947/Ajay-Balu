import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterLaptopsByHardConstraints } from '../src/engine/hardConstraints.ts';
import type { CustomerIntent } from '../src/types/intent.ts';
import { LAPTOPS } from '../src/data/catalog.ts';

describe('Hard Constraint Filter Engine', () => {
  const baseIntent: CustomerIntent = {
    required_categories: ['laptop'],
    hard_constraints: {
      max_total_budget: 70000,
      min_ram_gb: 16,
      min_storage_gb: 512,
      in_stock_only: true
    },
    soft_preferences: {
      weights: { portability: 0.4, battery: 0.35, longevity: 0.25 }
    }
  };

  it('1. Valid laptop passes hard constraints (AeroBook 14)', () => {
    const aeroBook = LAPTOPS.find((l) => l.sku === 'NX-LP-AERO14-01')!;
    assert.ok(aeroBook, 'AeroBook 14 should exist');

    const result = filterLaptopsByHardConstraints(baseIntent, [aeroBook]);
    assert.equal(result.passed.length, 1);
    assert.equal(result.passed[0].sku, 'NX-LP-AERO14-01');
    assert.equal(result.rejections.length, 0);
  });

  it('2. Over-budget laptop fails hard constraint (WorkStation 16 @ ₹89,999)', () => {
    const overBudget = LAPTOPS.find((l) => l.sku === 'NX-LP-PRO16-05')!;
    assert.ok(overBudget, 'WorkStation 16 should exist');

    const result = filterLaptopsByHardConstraints(baseIntent, [overBudget]);
    assert.equal(result.passed.length, 0);
    assert.equal(result.rejections.length, 1);
    assert.equal(result.rejections[0].rule, 'MAX_PRICE');
    assert.equal(result.rejections[0].sku, 'NX-LP-PRO16-05');
  });

  it('3. Under-RAM laptop fails hard constraint (SlimBook 14 @ 8GB RAM)', () => {
    const underRam = LAPTOPS.find((l) => l.sku === 'NX-LP-SLIM14-03')!;
    assert.ok(underRam, 'SlimBook 14 should exist');

    const result = filterLaptopsByHardConstraints(baseIntent, [underRam]);
    assert.equal(result.passed.length, 0);
    assert.equal(result.rejections.length, 1);
    assert.equal(result.rejections[0].rule, 'MIN_RAM');
    assert.equal(result.rejections[0].actual, '8GB');
  });

  it('4. Out-of-stock laptop fails hard constraint (SwiftBook 14 @ stock=0)', () => {
    const oos = LAPTOPS.find((l) => l.sku === 'NX-LP-OOS-08')!;
    assert.ok(oos, 'SwiftBook 14 should exist');

    const result = filterLaptopsByHardConstraints(baseIntent, [oos]);
    assert.equal(result.passed.length, 0);
    assert.equal(result.rejections.length, 1);
    assert.equal(result.rejections[0].rule, 'IN_STOCK');
    assert.equal(result.rejections[0].actual, 0);
  });

  it('11. Missing required hard attribute causes safe rejection (AlphaBook 14 with null RAM)', () => {
    const missingRam = LAPTOPS.find((l) => l.sku === 'NX-LP-MINRAMMISS-14')!;
    assert.ok(missingRam, 'AlphaBook 14 should exist');

    const result = filterLaptopsByHardConstraints(baseIntent, [missingRam]);
    assert.equal(result.passed.length, 0);
    assert.equal(result.rejections.length, 1);
    assert.equal(result.rejections[0].rule, 'MISSING_REQUIRED_ATTRIBUTE');
    assert.equal(result.rejections[0].actual, null);
  });

  it('12. Rejection logs contain the correct rule, values, and human-readable reason', () => {
    const devPro = LAPTOPS.find((l) => l.sku === 'NX-LP-DEVPRO15-09')!; // ₹72,500
    const result = filterLaptopsByHardConstraints(baseIntent, [devPro]);

    assert.equal(result.rejections.length, 1);
    const rej = result.rejections[0];
    assert.equal(rej.sku, 'NX-LP-DEVPRO15-09');
    assert.equal(rej.rule, 'MAX_PRICE');
    assert.equal(rej.actual, 72500);
    assert.ok(rej.reason.includes('exceeds budget ceiling'));
  });
});
