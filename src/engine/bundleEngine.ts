import type { LaptopProduct, MouseProduct, BagProduct } from '../types/catalog.ts';
import type { CustomerIntent } from '../types/intent.ts';
import type { BundleItem, RejectionLog, ProactiveAddOn } from '../types/recommendation.ts';
import type { CompatibilityResult } from '../types/compatibility.ts';
import { checkLaptopBagCompatibility, checkLaptopMouseCompatibility } from './compatibility.ts';

export interface BundleResult {
  success: boolean;
  selected_laptop: LaptopProduct;
  selected_accessories: BundleItem[];
  itemized_line_items: Array<{ sku: string; name: string; price_inr: number }>;
  total_price_inr: number;
  budget_ceiling_inr: number;
  budget_margin_inr: number;
  compatibility_evidence: CompatibilityResult[];
  accessory_rejections: RejectionLog[];
  failure_reason?: string;
}

export function buildDeterministicBundle(
  laptop: LaptopProduct,
  intent: CustomerIntent,
  mice: MouseProduct[],
  bags: BagProduct[]
): BundleResult {
  const budgetCeiling = intent.hard_constraints.max_total_budget ?? 70000;
  const compatibilityEvidence: CompatibilityResult[] = [];
  const accessoryRejections: RejectionLog[] = [];
  const selectedAccessories: BundleItem[] = [];

  const requiresMouse = intent.required_categories.includes('mouse');
  const requiresBag = intent.required_categories.includes('bag');

  let runningTotal = laptop.price_inr;

  // 1. Evaluate and select Mouse if required
  let selectedMouse: MouseProduct | null = null;
  if (requiresMouse) {
    const candidateMice = mice.filter((m) => m.is_active && m.stock_quantity > 0);

    // Score/sort mice: prefer Bluetooth, then multi-device productivity pairing, then price
    const sortedMice = [...candidateMice].sort((a, b) => {
      // Prioritize Bluetooth
      if (a.bluetooth && !b.bluetooth) return -1;
      if (!a.bluetooth && b.bluetooth) return 1;
      // Prioritize multi-device pairing for developer workflow (e.g. 3 devices > 2 devices)
      if (a.multi_device_pairing !== b.multi_device_pairing) {
        return b.multi_device_pairing - a.multi_device_pairing;
      }
      // Then prioritize price ascending for budget safety
      return a.price_inr - b.price_inr;
    });

    for (const mouse of sortedMice) {
      const compat = checkLaptopMouseCompatibility(laptop, mouse, intent);
      compatibilityEvidence.push(compat);

      if (!compat.compatible) {
        accessoryRejections.push({
          sku: mouse.sku,
          name: mouse.name,
          category: 'mouse',
          rule: 'MOUSE_COMPATIBILITY',
          actual: compat.port_evidence?.policy_enforced ?? 'INCOMPATIBLE',
          required: 'COMPATIBLE',
          reason: compat.reason
        });
        continue;
      }

      // Check if mouse alone exceeds remaining budget
      if (runningTotal + mouse.price_inr > budgetCeiling) {
        accessoryRejections.push({
          sku: mouse.sku,
          name: mouse.name,
          category: 'mouse',
          rule: 'BUNDLE_BUDGET_EXCEEDED',
          actual: runningTotal + mouse.price_inr,
          required: `<= ${budgetCeiling}`,
          reason: `Adding ${mouse.name} (₹${mouse.price_inr}) pushes total to ₹${runningTotal + mouse.price_inr}, exceeding budget of ₹${budgetCeiling}.`
        });
        continue;
      }

      selectedMouse = mouse;
      break;
    }

    if (!selectedMouse) {
      return {
        success: false,
        selected_laptop: laptop,
        selected_accessories: [],
        itemized_line_items: [],
        total_price_inr: runningTotal,
        budget_ceiling_inr: budgetCeiling,
        budget_margin_inr: budgetCeiling - runningTotal,
        compatibility_evidence: compatibilityEvidence,
        accessory_rejections: accessoryRejections,
        failure_reason: `No compatible in-stock mouse found within budget limit (₹${budgetCeiling}).`
      };
    }

    runningTotal += selectedMouse.price_inr;
    selectedAccessories.push({
      sku: selectedMouse.sku,
      category: 'mouse',
      name: selectedMouse.name,
      price_inr: selectedMouse.price_inr,
      compatibility_evidence: compatibilityEvidence.find((c) => c.accessory_sku === selectedMouse!.sku)?.reason
    });
  }

  // 2. Evaluate and select Bag if required
  let selectedBag: BagProduct | null = null;
  if (requiresBag) {
    const candidateBags = bags.filter((b) => b.is_active && b.stock_quantity > 0);

    // Sort bags: prefer style matching user preference (e.g. backpack), then price
    const preferredStyle = intent.soft_preferences.preferred_bag_type ?? 'backpack';
    const sortedBags = [...candidateBags].sort((a, b) => {
      const aPref = a.bag_type === preferredStyle ? 1 : 0;
      const bPref = b.bag_type === preferredStyle ? 1 : 0;
      if (aPref !== bPref) return bPref - aPref;
      return a.price_inr - b.price_inr;
    });

    for (const bag of sortedBags) {
      const compat = checkLaptopBagCompatibility(laptop, bag);
      compatibilityEvidence.push(compat);

      if (!compat.compatible) {
        accessoryRejections.push({
          sku: bag.sku,
          name: bag.name,
          category: 'bag',
          rule: 'BAG_DIMENSIONAL_FIT',
          actual: JSON.stringify(compat.margins_mm),
          required: 'All margins >= 0',
          reason: compat.reason
        });
        continue;
      }

      // Check if bag exceeds remaining budget
      if (runningTotal + bag.price_inr > budgetCeiling) {
        accessoryRejections.push({
          sku: bag.sku,
          name: bag.name,
          category: 'bag',
          rule: 'BUNDLE_BUDGET_EXCEEDED',
          actual: runningTotal + bag.price_inr,
          required: `<= ${budgetCeiling}`,
          reason: `Adding ${bag.name} (₹${bag.price_inr}) pushes total to ₹${runningTotal + bag.price_inr}, exceeding budget of ₹${budgetCeiling}.`
        });
        continue;
      }

      selectedBag = bag;
      break;
    }

    if (!selectedBag) {
      return {
        success: false,
        selected_laptop: laptop,
        selected_accessories: [],
        itemized_line_items: [],
        total_price_inr: runningTotal,
        budget_ceiling_inr: budgetCeiling,
        budget_margin_inr: budgetCeiling - runningTotal,
        compatibility_evidence: compatibilityEvidence,
        accessory_rejections: accessoryRejections,
        failure_reason: `No compatible in-stock bag found that physically fits ${laptop.name} within remaining budget.`
      };
    }

    runningTotal += selectedBag.price_inr;
    selectedAccessories.push({
      sku: selectedBag.sku,
      category: 'bag',
      name: selectedBag.name,
      price_inr: selectedBag.price_inr,
      compatibility_evidence: compatibilityEvidence.find((c) => c.accessory_sku === selectedBag!.sku)?.reason
    });
  }

  // 3. Final calculations
  const itemized = [
    { sku: laptop.sku, name: laptop.name, price_inr: laptop.price_inr },
    ...selectedAccessories.map((a) => ({ sku: a.sku, name: a.name, price_inr: a.price_inr }))
  ];

  return {
    success: true,
    selected_laptop: laptop,
    selected_accessories: selectedAccessories,
    itemized_line_items: itemized,
    total_price_inr: runningTotal,
    budget_ceiling_inr: budgetCeiling,
    budget_margin_inr: budgetCeiling - runningTotal,
    compatibility_evidence: compatibilityEvidence,
    accessory_rejections: accessoryRejections
  };
}

/**
 * PRODUCT TRUST PRINCIPLE (Track 01):
 * "Revenue optimization must never override customer intent, hard constraints, compatibility, factual grounding or explicit approval."
 *
 * The agent should increase basket value only through genuinely relevant, compatible, and properly disclosed products.
 * Never use fake urgency, fake scarcity, irrelevant add-ons, forced bundles, hidden price expansion, or automatic budget increases.
 */

export function evaluateProactiveCrossSells(
  laptop: LaptopProduct,
  intent: CustomerIntent,
  mice: MouseProduct[],
  bags: BagProduct[]
): ProactiveAddOn[] {
  const addOns: ProactiveAddOn[] = [];
  const maxBudget = intent.hard_constraints.max_total_budget;

  // 1. Evaluate mouse if not already explicitly required
  if (!intent.required_categories.includes('mouse')) {
    const candidateMice = mice.filter((m) => m.is_active && m.stock_quantity > 0);
    const sortedMice = [...candidateMice].sort((a, b) => {
      if (a.bluetooth && !b.bluetooth) return -1;
      if (!a.bluetooth && b.bluetooth) return 1;
      return a.price_inr - b.price_inr;
    });

    // Find compatible candidates
    const compatibleMice: Array<{ mouse: MouseProduct; reason: string }> = [];
    for (const mouse of sortedMice) {
      const compat = checkLaptopMouseCompatibility(laptop, mouse, intent);
      if (compat.compatible) {
        compatibleMice.push({ mouse, reason: compat.reason });
      }
    }

    if (compatibleMice.length > 0) {
      // Prioritize in-budget candidate if one exists
      const inBudgetMouse = maxBudget
        ? compatibleMice.find((c) => laptop.price_inr + c.mouse.price_inr <= maxBudget)
        : compatibleMice[0];

      const selected = inBudgetMouse || compatibleMice[0];
      const mouse = selected.mouse;
      const newTotal = laptop.price_inr + mouse.price_inr;
      const isWithinBudget = maxBudget ? newTotal <= maxBudget : true;
      const budgetDelta = maxBudget && newTotal > maxBudget ? newTotal - maxBudget : undefined;
      const state = isWithinBudget ? 'ELIGIBLE_CROSS_SELL' : 'COMPATIBLE_BUT_OVER_BUDGET';

      let relevanceReason = 'Ergonomic wireless navigation for daily productivity.';
      if (laptop.ports.usb_a_count <= 1 && mouse.bluetooth) {
        relevanceReason = `Bluetooth compatible; avoids consuming the laptop's ${laptop.ports.usb_a_count === 0 ? 'zero' : 'only'} USB-A port.`;
      } else if (intent.target_workload === 'gaming') {
        relevanceReason = 'High-precision low-latency tracking for responsive gaming and multitasking.';
      }

      addOns.push({
        sku: mouse.sku,
        name: mouse.name,
        category: 'mouse',
        price_inr: mouse.price_inr,
        current_total_inr: laptop.price_inr,
        new_total_inr: newTotal,
        incremental_value_inr: mouse.price_inr,
        is_within_budget: isWithinBudget,
        budget_delta_inr: budgetDelta,
        state,
        compatibility_reason: selected.reason,
        relevance_reason: relevanceReason
      });
    }
  }

  // 2. Evaluate bag if not already explicitly required
  if (!intent.required_categories.includes('bag')) {
    const candidateBags = bags.filter((b) => b.is_active && b.stock_quantity > 0);
    const sortedBags = [...candidateBags].sort((a, b) => a.price_inr - b.price_inr);

    const compatibleBags: Array<{ bag: BagProduct; reason: string }> = [];
    for (const bag of sortedBags) {
      const compat = checkLaptopBagCompatibility(laptop, bag);
      if (compat.compatible) {
        compatibleBags.push({ bag, reason: compat.reason });
      }
    }

    if (compatibleBags.length > 0) {
      // Prioritize in-budget candidate if one exists
      const inBudgetBag = maxBudget
        ? compatibleBags.find((c) => laptop.price_inr + c.bag.price_inr <= maxBudget)
        : compatibleBags[0];

      const selected = inBudgetBag || compatibleBags[0];
      const bag = selected.bag;
      const newTotal = laptop.price_inr + bag.price_inr;
      const isWithinBudget = maxBudget ? newTotal <= maxBudget : true;
      const budgetDelta = maxBudget && newTotal > maxBudget ? newTotal - maxBudget : undefined;
      const state = isWithinBudget ? 'ELIGIBLE_CROSS_SELL' : 'COMPATIBLE_BUT_OVER_BUDGET';

      const relevanceReason = `Verified dimensional fit (${laptop.dimensions_mm.length}x${laptop.dimensions_mm.width}mm) for laptop compartment protection.`;

      addOns.push({
        sku: bag.sku,
        name: bag.name,
        category: 'bag',
        price_inr: bag.price_inr,
        current_total_inr: laptop.price_inr,
        new_total_inr: newTotal,
        incremental_value_inr: bag.price_inr,
        is_within_budget: isWithinBudget,
        budget_delta_inr: budgetDelta,
        state,
        compatibility_reason: selected.reason,
        relevance_reason: relevanceReason
      });
    }
  }

  return addOns;
}
