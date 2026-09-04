import type { LaptopProduct } from '../types/catalog.ts';
import type { CustomerIntent, SoftPreferenceWeights } from '../types/intent.ts';
import type { ScoredLaptop, ComponentScores } from '../types/recommendation.ts';

const DEFAULT_WEIGHTS: SoftPreferenceWeights = {
  portability: 0.40,
  battery: 0.35,
  longevity: 0.25
};

/**
 * Normalizes weight in grams to a score [0, 1].
 * Formula: 1100g = 1.0, 2400g = 0.0. Linear interpolation.
 */
export function calculatePortabilityScore(weight_g: number): number {
  const minWeight = 1100;
  const maxWeight = 2400;
  const clamped = Math.max(minWeight, Math.min(maxWeight, weight_g));
  return Number(((maxWeight - clamped) / (maxWeight - minWeight)).toFixed(4));
}

/**
 * Normalizes battery capacity in Wh to a score [0, 1].
 * Formula: 40Wh = 0.0, 75Wh = 1.0. Linear interpolation.
 */
export function calculateBatteryScore(capacity_wh: number): number {
  const minWh = 40;
  const maxWh = 75;
  const clamped = Math.max(minWh, Math.min(maxWh, capacity_wh));
  return Number(((clamped - minWh) / (maxWh - minWh)).toFixed(4));
}

/**
 * Calculates longevity and technical workload score [0, 1] based on CPU recency,
 * multi-core capacity for development/compilation, and expandability.
 */
export function calculateLongevityScore(laptop: LaptopProduct, targetWorkload?: string): number {
  let score = 0;

  // CPU generation recency and multi-core compilation capability (max 0.45)
  if (laptop.processor.generation >= 13 || (laptop.processor.brand === 'AMD' && laptop.processor.generation >= 7)) {
    score += 0.35;
    // Multi-core coding / compilation performance (P-series / H-series / 12+ cores)
    if (laptop.processor.cores && laptop.processor.cores >= 12) {
      score += 0.10;
    } else if (laptop.processor.model.includes('P') || laptop.processor.model.includes('H') || laptop.processor.model.includes('HS')) {
      score += 0.08;
    }
  } else if (laptop.processor.generation === 12 || (laptop.processor.brand === 'AMD' && laptop.processor.generation >= 5)) {
    score += 0.25;
  } else {
    score += 0.10;
  }

  // RAM Expandability / Modern Architecture (max 0.25)
  if (laptop.ram.capacity_gb === null) {
    score = Math.max(0.05, score - 0.20); // Unindexed/unverified RAM specification penalty
  } else if (laptop.ram.is_expandable) {
    score += 0.25;
  } else if ((laptop.ram.capacity_gb ?? 0) >= 16 && (laptop.ram.type.includes('5') || laptop.ram.type.includes('DDR5'))) {
    score += 0.18; // High speed DDR5/LPDDR5 base
  } else {
    score += 0.05;
  }

  // Storage Expandability (max 0.25)
  if (laptop.storage.is_expandable) {
    score += 0.25;
  } else {
    score += 0.10;
  }

  // Display code-editor productivity (2K+ resolution / 16:10 workspace) (max 0.05)
  if (laptop.display.resolution.includes('2240') || laptop.display.resolution.includes('2560') || laptop.display.resolution.includes('2880')) {
    score += 0.05;
  }

  return Number(Math.min(1.0, score).toFixed(4));
}

/**
 * Generates deterministic trade-off facts for a candidate laptop.
 */
export function identifyTradeOffs(laptop: LaptopProduct, intent: CustomerIntent): string[] {
  const tradeOffs: string[] = [];

  // Memory expansion trade-off
  // Bug 3 fix: When ram.capacity_gb is null, we must NOT assert RAM type or expandability.
  // All facts must be sourced from the product's own verified attributes.
  if (laptop.ram.capacity_gb === null) {
    tradeOffs.push(
      `RAM Verification Pending: RAM capacity is not indexed in the current catalog entry. Specification cannot be confirmed — verify with Nexora support before purchase.`
    );
  } else if (!laptop.ram.is_expandable) {
    tradeOffs.push(
      `Soldered ${laptop.ram.type} RAM: High memory bandwidth and low power draw, but cannot be expanded beyond ${laptop.ram.capacity_gb}GB post-purchase.`
    );
  } else {
    tradeOffs.push(
      `Expandable ${laptop.ram.type} RAM (${laptop.ram.capacity_gb}GB installed): Allows post-purchase upgrades, but slightly increases motherboard chassis thickness.`
    );
  }

  // Portability trade-off
  const prefWeight = intent.soft_preferences.max_preferred_weight_g ?? 1400;
  if (laptop.weight_g > prefWeight) {
    tradeOffs.push(
      `Travel Weight: Weighs ${(laptop.weight_g / 1000).toFixed(2)} kg, exceeding the preferred lightweight mobility target of ${(prefWeight / 1000).toFixed(2)} kg.`
    );
  }

  // Battery trade-off
  const prefBattery = intent.soft_preferences.min_preferred_battery_wh ?? 55;
  if (laptop.battery.capacity_wh < prefBattery) {
    tradeOffs.push(
      `Battery Capacity: ${laptop.battery.capacity_wh}Wh is below the preferred ${prefBattery}Wh target for uninterrupted travel coding.`
    );
  }

  // Missing catalog attribute warning
  if (laptop.display.brightness_nits === null) {
    tradeOffs.push(
      `Catalog Warning: Display brightness rating is unindexed in the catalog; outdoor readability is unverified.`
    );
  }

  // Port trade-off
  if (laptop.ports.usb_a_count === 0) {
    tradeOffs.push(
      `Port Protocol: Has 0 legacy USB-A ports; requires USB-C hubs or native Bluetooth accessories.`
    );
  } else if (laptop.ports.usb_a_count === 1) {
    tradeOffs.push(
      `Port Protocol: Single USB-A port; connecting a 2.4GHz dongle will consume all legacy USB-A connectivity.`
    );
  }

  return tradeOffs;
}

/**
 * Scores and ranks candidate laptops using explicit weights.
 */
export function scoreAndRankLaptops(
  laptops: LaptopProduct[],
  intent: CustomerIntent
): ScoredLaptop[] {
  const weights: SoftPreferenceWeights = {
    portability: intent.soft_preferences.weights?.portability ?? DEFAULT_WEIGHTS.portability,
    battery: intent.soft_preferences.weights?.battery ?? DEFAULT_WEIGHTS.battery,
    longevity: intent.soft_preferences.weights?.longevity ?? DEFAULT_WEIGHTS.longevity
  };

  const scored: ScoredLaptop[] = laptops.map((laptop) => {
    const sPort = calculatePortabilityScore(laptop.weight_g);
    const sBatt = calculateBatteryScore(laptop.battery.capacity_wh);
    const sLong = calculateLongevityScore(laptop, intent.target_workload);

    const componentScores: ComponentScores = {
      portability: Number((sPort * 100).toFixed(1)),
      battery: Number((sBatt * 100).toFixed(1)),
      longevity: Number((sLong * 100).toFixed(1))
    };

    const weightedScore =
      weights.portability * sPort +
      weights.battery * sBatt +
      weights.longevity * sLong;

    const totalScore = Number((weightedScore * 100).toFixed(2));
    const tradeOffs = identifyTradeOffs(laptop, intent);

    return {
      product: laptop,
      total_score: totalScore,
      component_scores: componentScores,
      trade_offs: tradeOffs
    };
  });

  // Sort descending by total score; tie-break deterministically by price (lower price first), then SKU
  scored.sort((a, b) => {
    if (b.total_score !== a.total_score) {
      return b.total_score - a.total_score;
    }
    if (a.product.price_inr !== b.product.price_inr) {
      return a.product.price_inr - b.product.price_inr;
    }
    return a.product.sku.localeCompare(b.product.sku);
  });

  return scored;
}
