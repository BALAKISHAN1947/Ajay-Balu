import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicDecisionEngine } from '../src/engine/decisionEngine.ts';
import type { CustomerIntent } from '../src/types/intent.ts';

describe('Deterministic Decision Engine (End-to-End Pipeline)', () => {
  const engine = new DeterministicDecisionEngine();

  const primaryCodingIntent: CustomerIntent = {
    intent_id: 'intent_test_01',
    raw_query: 'I need a laptop for coding under ₹70,000. Light, good battery, at least 16GB RAM, and durable. Also need a mouse and bag.',
    target_workload: 'coding',
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

  it('Executes the primary customer scenario with full bundle, pricing, and compatibility', () => {
    const result = engine.evaluateIntent(primaryCodingIntent);

    assert.equal(result.status, 'SUCCESS');
    assert.ok(result.recommended_laptop);
    assert.equal(result.recommended_laptop!.product.sku, 'NX-LP-AERO14-01');

    // Check locked variant
    assert.ok(result.locked_variant);
    assert.equal(result.locked_variant!.variant_id, 'v_14_16_512_i5');

    // Check accessories attached
    assert.equal(result.accessories.length, 2);
    const mouseItem = result.accessories.find((a) => a.category === 'mouse');
    const bagItem = result.accessories.find((a) => a.category === 'bag');

    assert.ok(mouseItem, 'Mouse must be attached');
    assert.ok(bagItem, 'Bag must be attached');
    assert.equal(mouseItem!.sku, 'NX-MS-ERGO-01'); // Native Bluetooth
    assert.equal(bagItem!.sku, 'NX-BG-SLIM-01');   // 14" Slim backpack

    // Check financial arithmetic
    assert.equal(result.total_price_inr, 67297);
    assert.equal(result.budget_ceiling_inr, 70000);
    assert.equal(result.budget_margin_inr, 2703);
    assert.ok(result.total_price_inr <= 70000);

    // Check explanations, trade-offs, and rejections
    assert.ok(result.reasons.length >= 3);
    assert.ok(result.trade_offs.length >= 1);
    assert.ok(result.rejections.length >= 5); // Must contain rejections for over-budget, 8GB RAM, OOS laptops, etc.
    assert.ok(result.compatibility_checks.length >= 2);
    assert.equal(result.confidence_score, 1.0);
  });

  it('14. No valid products returns a clean NO_MATCH result (impossible RAM requirement)', () => {
    const impossibleIntent: CustomerIntent = {
      required_categories: ['laptop'],
      hard_constraints: {
        max_total_budget: 40000, // Budget 40k
        min_ram_gb: 32,          // 32GB RAM
        in_stock_only: true
      },
      soft_preferences: {
        weights: { portability: 0.4, battery: 0.35, longevity: 0.25 }
      }
    };

    const result = engine.evaluateIntent(impossibleIntent);
    assert.equal(result.status, 'NO_MATCH');
    assert.equal(result.recommended_laptop, null);
    assert.equal(result.locked_variant, null);
    assert.equal(result.total_price_inr, 0);
    assert.ok(result.rejections.length > 0);
    assert.ok(result.reasons[0].includes('No laptop in the catalog satisfied all hard constraints'));
  });

  it('15. Same input produces the exact same result (Determinism & Idempotence)', () => {
    const run1 = engine.evaluateIntent(primaryCodingIntent);
    const run2 = engine.evaluateIntent(primaryCodingIntent);

    assert.deepEqual(run1, run2, 'Engine outputs must be strictly deterministic and idempotent');
  });
});
