import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAndRankLaptops } from '../src/engine/softScoring.ts';
import { lockLaptopVariant } from '../src/engine/variantLock.ts';
import { buildDeterministicBundle } from '../src/engine/bundleEngine.ts';
import type { CustomerIntent } from '../src/types/intent.ts';
import { LAPTOPS, MICE, BAGS } from '../src/data/catalog.ts';

describe('Bundle Engine & Soft Scoring', () => {
  const intent: CustomerIntent = {
    required_categories: ['laptop', 'mouse', 'bag'],
    hard_constraints: {
      max_total_budget: 70000,
      min_ram_gb: 16,
      min_storage_gb: 512,
      in_stock_only: true
    },
    soft_preferences: {
      max_preferred_weight_g: 1400,
      min_preferred_battery_wh: 55,
      prefer_bluetooth_mouse: true,
      preferred_bag_type: 'backpack',
      weights: { portability: 0.40, battery: 0.35, longevity: 0.25 }
    }
  };

  it('9. Bundle total cannot exceed hard budget (CarbonCraft 14 @ ₹69,499 fails bundle under ₹70k)', () => {
    const carbonCraft = LAPTOPS.find((l) => l.sku === 'NX-LP-CARBON14-13')!; // ₹69,499
    const bundleResult = buildDeterministicBundle(carbonCraft, intent, MICE, BAGS);

    // CarbonCraft alone leaves only ₹501, cannot afford any mouse (min ₹899) or bag (min ₹1099)
    assert.equal(bundleResult.success, false);
    assert.ok(bundleResult.failure_reason?.includes('No compatible in-stock mouse found within budget'));
  });

  it('9b. Bundle stays strictly under budget when valid accessories fit (AeroBook 14)', () => {
    const aeroBook = LAPTOPS.find((l) => l.sku === 'NX-LP-AERO14-01')!; // ₹62,999
    const bundleResult = buildDeterministicBundle(aeroBook, intent, MICE, BAGS);

    assert.equal(bundleResult.success, true);
    assert.ok(bundleResult.total_price_inr <= 70000);
    assert.equal(bundleResult.total_price_inr, 62999 + 1799 + 2499); // ₹67,297
    assert.equal(bundleResult.budget_margin_inr, 70000 - 67297);     // ₹2,703
    assert.equal(bundleResult.selected_accessories.length, 2);
  });

  it('10. Exact variant is preserved and locked without substitution', () => {
    const aeroBook = LAPTOPS.find((l) => l.sku === 'NX-LP-AERO14-01')!;
    const locked = lockLaptopVariant(aeroBook);

    assert.equal(locked.sku, 'NX-LP-AERO14-01');
    assert.equal(locked.variant_id, 'v_14_16_512_i5');
    assert.equal(locked.price_inr, 62999);
    assert.equal(locked.stock_quantity, 12);
    assert.ok(locked.ram_summary.includes('16GB LPDDR5'));
    assert.ok(locked.storage_summary.includes('512GB'));
  });

  it('13. Multiple valid laptops are ranked deterministically based on weighted preferences', () => {
    // Select valid laptops with 16GB RAM and under ₹70k
    const candidates = LAPTOPS.filter(
      (l) => l.ram.capacity_gb === 16 && l.price_inr <= 70000 && l.stock_quantity > 0
    );

    const ranked = scoreAndRankLaptops(candidates, intent);

    assert.ok(ranked.length >= 3);
    // AeroBook 14 (1.28kg, 57Wh) should outrank Titan 15 (2.35kg) on travel coding preference
    const aeroIndex = ranked.findIndex((r) => r.product.sku === 'NX-LP-AERO14-01');
    const titanIndex = ranked.findIndex((r) => r.product.sku === 'NX-LP-TITAN15-12');

    assert.ok(aeroIndex < titanIndex, 'AeroBook 14 must outrank heavy Titan 15');
    assert.ok(ranked[0].total_score >= ranked[1].total_score);
    assert.ok(ranked[0].trade_offs.length > 0);
  });
});
