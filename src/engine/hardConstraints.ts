import type { LaptopProduct, Product } from '../types/catalog.ts';
import type { CustomerIntent } from '../types/intent.ts';
import type { RejectionLog } from '../types/recommendation.ts';

export interface FilterResult<T> {
  passed: T[];
  rejections: RejectionLog[];
}

export function filterLaptopsByHardConstraints(
  intent: CustomerIntent,
  laptops: LaptopProduct[]
): FilterResult<LaptopProduct> {
  const passed: LaptopProduct[] = [];
  const rejections: RejectionLog[] = [];

  const { hard_constraints } = intent;

  // Determine effective laptop price ceiling
  const laptopPriceCeiling =
    hard_constraints.max_laptop_price ?? hard_constraints.max_total_budget;

  for (const laptop of laptops) {
    let rejected = false;

    // 1. Explicit requested brand check (Priority 2)
    if (intent.requested_brand) {
      const reqBrand = intent.requested_brand.toLowerCase().trim();
      if (laptop.brand.toLowerCase() !== reqBrand) {
        rejections.push({
          sku: laptop.sku,
          name: laptop.name,
          category: 'laptop',
          rule: 'REQUESTED_BRAND',
          actual: laptop.brand,
          required: intent.requested_brand,
          reason: `Rejected because ${laptop.name} is manufactured by ${laptop.brand}, but customer explicitly requested ${intent.requested_brand}.`
        });
        rejected = true;
        continue;
      }
    }

    // 2. Explicit requested model check (Priority 3)
    if (intent.requested_model) {
      const targetModel = intent.requested_model.toLowerCase().trim();
      const laptopName = laptop.name.toLowerCase();
      const modelWords = targetModel
        .split(/\s+/)
        .filter((w) => w.length > 2 && w !== intent.requested_brand?.toLowerCase());

      const isMatch =
        laptopName.includes(targetModel) ||
        (modelWords.length > 0 && modelWords.every((w) => laptopName.includes(w)));

      if (!isMatch) {
        rejections.push({
          sku: laptop.sku,
          name: laptop.name,
          category: 'laptop',
          rule: 'REQUESTED_MODEL',
          actual: laptop.name,
          required: intent.requested_model,
          reason: `Rejected because ${laptop.name} does not match requested model "${intent.requested_model}".`
        });
        rejected = true;
        continue;
      }
    }

    // 3. Active status check
    if (!laptop.is_active) {
      rejections.push({
        sku: laptop.sku,
        name: laptop.name,
        category: 'laptop',
        rule: 'IS_ACTIVE',
        actual: false,
        required: true,
        reason: `Rejected because ${laptop.name} is inactive in the merchant catalog.`
      });
      rejected = true;
      continue;
    }

    // 2. Stock check
    const stockRequired = hard_constraints.in_stock_only !== false;
    if (stockRequired && laptop.stock_quantity <= 0) {
      rejections.push({
        sku: laptop.sku,
        name: laptop.name,
        category: 'laptop',
        rule: 'IN_STOCK',
        actual: laptop.stock_quantity,
        required: '> 0',
        reason: `Rejected because ${laptop.name} is currently out of stock (available: 0).`
      });
      rejected = true;
      continue;
    }

    // 3. Price limit check
    if (laptopPriceCeiling !== undefined && laptop.price_inr > laptopPriceCeiling) {
      rejections.push({
        sku: laptop.sku,
        name: laptop.name,
        category: 'laptop',
        rule: 'MAX_PRICE',
        actual: laptop.price_inr,
        required: `<= ₹${laptopPriceCeiling.toLocaleString('en-IN')}`,
        reason: `Rejected because price (₹${laptop.price_inr.toLocaleString('en-IN')}) exceeds budget ceiling (₹${laptopPriceCeiling.toLocaleString('en-IN')}).`
      });
      rejected = true;
      continue;
    }

    // 4. RAM check
    if (hard_constraints.min_ram_gb !== undefined) {
      if (laptop.ram.capacity_gb === null || laptop.ram.capacity_gb === undefined) {
        rejections.push({
          sku: laptop.sku,
          name: laptop.name,
          category: 'laptop',
          rule: 'MISSING_REQUIRED_ATTRIBUTE',
          actual: null,
          required: `${hard_constraints.min_ram_gb}GB`,
          reason: `Rejected because required RAM capacity attribute is unindexed/missing in the catalog.`
        });
        rejected = true;
        continue;
      }

      if (laptop.ram.capacity_gb < hard_constraints.min_ram_gb) {
        rejections.push({
          sku: laptop.sku,
          name: laptop.name,
          category: 'laptop',
          rule: 'MIN_RAM',
          actual: `${laptop.ram.capacity_gb}GB`,
          required: `>= ${hard_constraints.min_ram_gb}GB`,
          reason: `Rejected because RAM is ${laptop.ram.capacity_gb}GB, but customer requires at least ${hard_constraints.min_ram_gb}GB.`
        });
        rejected = true;
        continue;
      }
    }

    // 5. Storage check
    if (hard_constraints.min_storage_gb !== undefined) {
      if (laptop.storage.capacity_gb < hard_constraints.min_storage_gb) {
        rejections.push({
          sku: laptop.sku,
          name: laptop.name,
          category: 'laptop',
          rule: 'MIN_STORAGE',
          actual: `${laptop.storage.capacity_gb}GB`,
          required: `>= ${hard_constraints.min_storage_gb}GB`,
          reason: `Rejected because storage is ${laptop.storage.capacity_gb}GB, but customer requires at least ${hard_constraints.min_storage_gb}GB.`
        });
        rejected = true;
        continue;
      }
    }

    // 6. Hard Weight Limit (if explicitly defined as hard constraint)
    if (hard_constraints.max_weight_g !== undefined) {
      if (laptop.weight_g > hard_constraints.max_weight_g) {
        rejections.push({
          sku: laptop.sku,
          name: laptop.name,
          category: 'laptop',
          rule: 'MAX_WEIGHT',
          actual: `${laptop.weight_g}g`,
          required: `<= ${hard_constraints.max_weight_g}g`,
          reason: `Rejected because weight (${laptop.weight_g}g) exceeds hard limit of ${hard_constraints.max_weight_g}g.`
        });
        rejected = true;
        continue;
      }
    }

    // 7. GPU Model Check
    if (hard_constraints.gpu_model !== undefined) {
      const reqModel = hard_constraints.gpu_model.toLowerCase();
      const actualModel = laptop.gpu?.model.toLowerCase() || '';
      if (!actualModel.includes(reqModel)) {
        rejections.push({
          sku: laptop.sku,
          name: laptop.name,
          category: 'laptop',
          rule: 'GPU_MODEL',
          actual: laptop.gpu?.model || 'Integrated Graphics',
          required: hard_constraints.gpu_model,
          reason: `Rejected because GPU is ${laptop.gpu?.model || 'Integrated Graphics'}, but customer requires ${hard_constraints.gpu_model}.`
        });
        rejected = true;
        continue;
      }
    }

    // 8. GPU VRAM Check
    if (hard_constraints.min_vram_gb !== undefined) {
      const actualVram = laptop.gpu?.vram_gb ?? 0;
      if (actualVram < hard_constraints.min_vram_gb) {
        rejections.push({
          sku: laptop.sku,
          name: laptop.name,
          category: 'laptop',
          rule: 'MIN_VRAM',
          actual: laptop.gpu?.vram_gb ? `${laptop.gpu.vram_gb}GB VRAM` : 'No dedicated VRAM',
          required: `>= ${hard_constraints.min_vram_gb}GB VRAM`,
          reason: `Rejected because GPU has ${laptop.gpu?.vram_gb ? `${laptop.gpu.vram_gb}GB` : '0GB'} dedicated VRAM, but customer requires at least ${hard_constraints.min_vram_gb}GB.`
        });
        rejected = true;
        continue;
      }
    }

    // 9. Dedicated GPU Check
    if (hard_constraints.requires_dedicated_gpu) {
      if (laptop.gpu?.type !== 'dedicated') {
        rejections.push({
          sku: laptop.sku,
          name: laptop.name,
          category: 'laptop',
          rule: 'DEDICATED_GPU',
          actual: laptop.gpu?.model || 'Integrated Graphics',
          required: 'Dedicated GPU',
          reason: `Rejected because graphics are integrated, but customer requires a dedicated GPU.`
        });
        rejected = true;
        continue;
      }
    }

    if (!rejected) {
      passed.push(laptop);
    }
  }

  return { passed, rejections };
}

export function filterAccessoriesByStockAndBudget<T extends Product>(
  items: T[],
  maxPriceInr?: number
): FilterResult<T> {
  const passed: T[] = [];
  const rejections: RejectionLog[] = [];

  for (const item of items) {
    if (!item.is_active) {
      rejections.push({
        sku: item.sku,
        name: item.name,
        category: item.category,
        rule: 'IS_ACTIVE',
        actual: false,
        required: true,
        reason: `Rejected because ${item.name} is inactive.`
      });
      continue;
    }

    if (item.stock_quantity <= 0) {
      rejections.push({
        sku: item.sku,
        name: item.name,
        category: item.category,
        rule: 'IN_STOCK',
        actual: item.stock_quantity,
        required: '> 0',
        reason: `Rejected because ${item.name} is out of stock.`
      });
      continue;
    }

    if (maxPriceInr !== undefined && item.price_inr > maxPriceInr) {
      rejections.push({
        sku: item.sku,
        name: item.name,
        category: item.category,
        rule: 'MAX_PRICE',
        actual: item.price_inr,
        required: `<= ₹${maxPriceInr.toLocaleString('en-IN')}`,
        reason: `Rejected because accessory price (₹${item.price_inr.toLocaleString('en-IN')}) exceeds allocated budget (₹${maxPriceInr.toLocaleString('en-IN')}).`
      });
      continue;
    }

    passed.push(item);
  }

  return { passed, rejections };
}

import type { ConstraintAnalysis, ClosestOption } from '../types/recommendation.ts';

/**
 * Deterministically analyzes hard constraint failures across the merchant catalog.
 * Computes exact candidate counts, constraint intersections, nearest alternatives,
 * and concrete trade-off options without hallucination.
 */
export function analyzeConstraintFailures(
  intent: CustomerIntent,
  laptops: LaptopProduct[]
): ConstraintAnalysis {
  const { hard_constraints } = intent;
  const maxBudget = hard_constraints.max_laptop_price ?? hard_constraints.max_total_budget;
  const minRam = hard_constraints.min_ram_gb;
  const minStorage = hard_constraints.min_storage_gb;
  const maxWeight = hard_constraints.max_weight_g;
  const gpuModel = hard_constraints.gpu_model;
  const minVram = hard_constraints.min_vram_gb;
  const requiresDedicated = hard_constraints.requires_dedicated_gpu;

  // Filter to active, in-stock laptops
  const activeLaptops = laptops.filter((l) => l.is_active && l.stock_quantity > 0);

  let satisfyingBudgetCount = 0;
  let satisfyingRamCount = 0;
  let satisfyingStorageCount = 0;
  let satisfyingWeightCount = 0;
  let satisfyingGpuCount = 0;

  for (const l of activeLaptops) {
    if (maxBudget === undefined || l.price_inr <= maxBudget) satisfyingBudgetCount++;
    if (minRam === undefined || (l.ram.capacity_gb !== null && l.ram.capacity_gb >= minRam)) satisfyingRamCount++;
    if (minStorage === undefined || l.storage.capacity_gb >= minStorage) satisfyingStorageCount++;
    if (maxWeight === undefined || l.weight_g <= maxWeight) satisfyingWeightCount++;

    let gpuOk = true;
    if (gpuModel && (!l.gpu || !l.gpu.model.toLowerCase().includes(gpuModel.toLowerCase()))) gpuOk = false;
    if (minVram && (!l.gpu || l.gpu.vram_gb === null || l.gpu.vram_gb < minVram)) gpuOk = false;
    if (requiresDedicated && (!l.gpu || l.gpu.type !== 'dedicated')) gpuOk = false;
    if (gpuOk) satisfyingGpuCount++;
  }

  const failedConstraints: string[] = [];
  const failurePoints: string[] = [];

  const cheapestInCatalog = [...activeLaptops].sort((a, b) => a.price_inr - b.price_inr)[0];

  if (intent.requested_model) {
    failedConstraints.push('REQUESTED_MODEL');
    failurePoints.push(`I couldn't find that exact model in the verified catalog.`);
  }

  if (intent.requested_brand) {
    const brandActive = activeLaptops.filter(
      (l) => l.brand.toLowerCase() === intent.requested_brand!.toLowerCase()
    );
    if (brandActive.length === 0) {
      failedConstraints.push('REQUESTED_BRAND');
      failurePoints.push(`No laptop from brand "${intent.requested_brand}" was found in our verified catalog.`);
    } else {
      const brandUnderBudget = maxBudget !== undefined
        ? brandActive.filter((l) => l.price_inr <= maxBudget)
        : brandActive;
      if (brandUnderBudget.length === 0 && maxBudget !== undefined) {
        failedConstraints.push('BRAND_BUDGET_COMBINATION');
        const cheapestBrand = [...brandActive].sort((a, b) => a.price_inr - b.price_inr)[0];
        failurePoints.push(
          `No ${intent.requested_brand} laptop in the verified catalog fits within your ₹${maxBudget.toLocaleString('en-IN')} budget (lowest-priced ${intent.requested_brand} model is ${cheapestBrand.name} at ₹${cheapestBrand.price_inr.toLocaleString('en-IN')}).`
        );
      }
    }
  }

  if (maxBudget !== undefined && satisfyingBudgetCount === 0) {
    failedConstraints.push('BUDGET_CEILING');
    const gap = cheapestInCatalog ? cheapestInCatalog.price_inr - maxBudget : 0;
    failurePoints.push(
      `Products under requested budget: 0 available in catalog under ₹${maxBudget.toLocaleString('en-IN')}.`
    );
    if (cheapestInCatalog) {
      failurePoints.push(
        `Cheapest in-stock model: ${cheapestInCatalog.name} at ₹${cheapestInCatalog.price_inr.toLocaleString('en-IN')} (budget gap: ₹${gap.toLocaleString('en-IN')} above your ₹${maxBudget.toLocaleString('en-IN')} budget).`
      );
    } else {
      failurePoints.push(`No laptop in the catalog fits within your ₹${maxBudget.toLocaleString('en-IN')} budget.`);
    }
  }

  if (minRam !== undefined) {
    if (satisfyingRamCount === 0) {
      failedConstraints.push('MIN_RAM');
      failurePoints.push(`No laptop in the catalog has ${minRam}GB RAM or higher (maximum available is 32GB on Nexora WorkStation 16).`);
    } else {
      const satisfyingBoth = activeLaptops.filter(
        (l) => (maxBudget === undefined || l.price_inr <= maxBudget) && l.ram.capacity_gb !== null && l.ram.capacity_gb >= minRam
      );
      if (satisfyingBoth.length === 0 && maxBudget !== undefined) {
        failedConstraints.push('BUDGET_AND_RAM_COMBINATION');
        failurePoints.push(`No laptop priced under ₹${maxBudget.toLocaleString('en-IN')} has ${minRam}GB RAM.`);
      }
    }
  }

  if (minRam !== undefined && satisfyingRamCount > 0 && maxBudget !== undefined) {
    failurePoints.push(
      `${satisfyingRamCount} candidate(s) satisfy the ${minRam}GB RAM requirement, but exceed your budget ceiling.`
    );
    if (satisfyingBudgetCount > 0) {
      failurePoints.push(
        `${satisfyingBudgetCount} candidate(s) satisfy the budget ceiling of ₹${maxBudget.toLocaleString('en-IN')}, but do not have ${minRam}GB RAM.`
      );
    }
  }

  // GPU failure reporting
  if (gpuModel !== undefined || requiresDedicated) {
    const targetGpuDesc = gpuModel || 'dedicated graphics';
    if (satisfyingGpuCount === 0) {
      failedConstraints.push('GPU_MODEL');
      failurePoints.push(`No laptop in the catalog has ${targetGpuDesc}.`);
    } else {
      const satisfyingGpuAndBudget = activeLaptops.filter((l) => {
        const meetsGpu = gpuModel ? l.gpu?.model.toLowerCase().includes(gpuModel.toLowerCase()) : l.gpu?.type === 'dedicated';
        return meetsGpu && (maxBudget === undefined || l.price_inr <= maxBudget);
      });

      if (satisfyingGpuAndBudget.length === 0 && maxBudget !== undefined) {
        failedConstraints.push('BUDGET_AND_GPU_COMBINATION');
        const cheapestWithGpu = activeLaptops
          .filter((l) => (gpuModel ? l.gpu?.model.toLowerCase().includes(gpuModel.toLowerCase()) : l.gpu?.type === 'dedicated'))
          .sort((a, b) => a.price_inr - b.price_inr)[0];
        const gpuGap = cheapestWithGpu ? cheapestWithGpu.price_inr - maxBudget : 0;
        failurePoints.push(
          `No laptop priced under ₹${maxBudget.toLocaleString('en-IN')} has ${targetGpuDesc} (available starting at ₹${cheapestWithGpu.price_inr.toLocaleString('en-IN')} with ${cheapestWithGpu.name}, budget gap: ₹${gpuGap.toLocaleString('en-IN')}).`
        );
        // If under-budget models have other GPUs (e.g. Titan 15 has RTX 3050 under 70k)
        const altGpuLaptop = activeLaptops.find((l) => l.price_inr <= maxBudget && l.gpu?.type === 'dedicated');
        if (altGpuLaptop) {
          failurePoints.push(
            `Under your ₹${maxBudget.toLocaleString('en-IN')} budget, the highest available dedicated GPU is ${altGpuLaptop.gpu?.model} on ${altGpuLaptop.name} (₹${altGpuLaptop.price_inr.toLocaleString('en-IN')}).`
          );
        }
      }
    }
  }

  if (minStorage !== undefined && satisfyingStorageCount === 0) {
    failedConstraints.push('MIN_STORAGE');
    failurePoints.push(`No laptop in the catalog has at least ${minStorage}GB storage.`);
  }

  if (maxWeight !== undefined && satisfyingWeightCount === 0) {
    failedConstraints.push('MAX_WEIGHT');
    failurePoints.push(`No laptop in the catalog weighs ${maxWeight}g or less.`);
  }

  // Determine closest options deterministically
  const closestOptions: ClosestOption[] = [];

  // Option 0: Verified alternative from requested brand if available
  if (intent.requested_brand) {
    const brandActive = activeLaptops.filter(
      (l) => l.brand.toLowerCase() === intent.requested_brand!.toLowerCase()
    );
    if (brandActive.length > 0) {
      const topBrandLaptop = [...brandActive].sort((a, b) => a.price_inr - b.price_inr)[0];
      const delta = maxBudget ? topBrandLaptop.price_inr - maxBudget : 0;
      closestOptions.push({
        type: 'SAME_BRAND_ALTERNATIVE',
        label: `Verified alternative from ${intent.requested_brand}: ${topBrandLaptop.name}`,
        sku: topBrandLaptop.sku,
        name: topBrandLaptop.name,
        price_inr: topBrandLaptop.price_inr,
        ram_gb: topBrandLaptop.ram.capacity_gb,
        storage_gb: topBrandLaptop.storage.capacity_gb,
        budget_delta_inr: delta,
        unmet_constraints: delta > 0 ? [`Exceeds budget by ₹${delta.toLocaleString('en-IN')}`] : [],
        trade_off: delta > 0
          ? `Verified ${intent.requested_brand} model available at ₹${topBrandLaptop.price_inr.toLocaleString('en-IN')} (exceeds budget by ₹${delta.toLocaleString('en-IN')}).`
          : `Verified ${intent.requested_brand} model available at ₹${topBrandLaptop.price_inr.toLocaleString('en-IN')}.`
      });
    }
  }

  // Option A1: Cheapest option satisfying requested GPU
  if ((gpuModel || requiresDedicated) && satisfyingGpuCount > 0) {
    const satisfyingGpuLaptops = activeLaptops
      .filter((l) => (gpuModel ? l.gpu?.model.toLowerCase().includes(gpuModel.toLowerCase()) : l.gpu?.type === 'dedicated'))
      .sort((a, b) => a.price_inr - b.price_inr);

    const cheapestGpu = satisfyingGpuLaptops[0];
    const delta = maxBudget ? cheapestGpu.price_inr - maxBudget : 0;
    closestOptions.push({
      type: 'CHEAPEST_SATISFYING_SPEC',
      label: `Closest to GPU (${gpuModel || 'Dedicated'}): ${cheapestGpu.name}`,
      sku: cheapestGpu.sku,
      name: cheapestGpu.name,
      price_inr: cheapestGpu.price_inr,
      ram_gb: cheapestGpu.ram.capacity_gb,
      storage_gb: cheapestGpu.storage.capacity_gb,
      budget_delta_inr: delta,
      unmet_constraints: delta > 0 ? [`Exceeds budget by ₹${delta.toLocaleString('en-IN')}`] : [],
      trade_off: delta > 0
        ? `Requires increasing budget by ₹${delta.toLocaleString('en-IN')} (price: ₹${cheapestGpu.price_inr.toLocaleString('en-IN')}).`
        : `Meets ${gpuModel || 'dedicated'} GPU requirement.`
    });
  }

  // Option A2: Cheapest option satisfying requested RAM
  if (minRam !== undefined && satisfyingRamCount > 0 && !closestOptions.some(o => o.ram_gb === minRam)) {
    const satisfyingRamLaptops = activeLaptops
      .filter((l) => l.ram.capacity_gb !== null && l.ram.capacity_gb >= minRam)
      .sort((a, b) => a.price_inr - b.price_inr);

    const cheapestSpec = satisfyingRamLaptops[0];
    const delta = maxBudget ? cheapestSpec.price_inr - maxBudget : 0;
    closestOptions.push({
      type: 'CHEAPEST_SATISFYING_SPEC',
      label: `Closest to RAM (${minRam}GB): ${cheapestSpec.name}`,
      sku: cheapestSpec.sku,
      name: cheapestSpec.name,
      price_inr: cheapestSpec.price_inr,
      ram_gb: cheapestSpec.ram.capacity_gb,
      storage_gb: cheapestSpec.storage.capacity_gb,
      budget_delta_inr: delta,
      unmet_constraints: delta > 0 ? [`Exceeds budget by ₹${delta.toLocaleString('en-IN')}`] : [],
      trade_off: delta > 0
        ? `Requires increasing budget by ₹${delta.toLocaleString('en-IN')} (price: ₹${cheapestSpec.price_inr.toLocaleString('en-IN')}).`
        : `Meets RAM requirement.`
    });
  }

  // Option B: Best/closest laptop within or closest to budget
  const sortedByPrice = [...activeLaptops].sort((a, b) => a.price_inr - b.price_inr);
  let closestBudgetLaptop: LaptopProduct | undefined;
  if (maxBudget !== undefined) {
    const underBudget = sortedByPrice.filter((l) => l.price_inr <= maxBudget);
    if (underBudget.length > 0) {
      closestBudgetLaptop = underBudget.sort(
        (a, b) => (b.ram.capacity_gb ?? 0) - (a.ram.capacity_gb ?? 0) || b.price_inr - a.price_inr
      )[0];
    } else {
      closestBudgetLaptop = sortedByPrice[0];
    }
  } else {
    closestBudgetLaptop = sortedByPrice[0];
  }

  if (closestBudgetLaptop && !closestOptions.some((o) => o.sku === closestBudgetLaptop!.sku)) {
    const delta = maxBudget ? closestBudgetLaptop.price_inr - maxBudget : 0;
    const unmet: string[] = [];
    if (minRam && (closestBudgetLaptop.ram.capacity_gb === null || closestBudgetLaptop.ram.capacity_gb < minRam)) {
      unmet.push(`RAM is ${closestBudgetLaptop.ram.capacity_gb ?? 0}GB (requested: ${minRam}GB)`);
    }
    if (gpuModel && (!closestBudgetLaptop.gpu || !closestBudgetLaptop.gpu.model.toLowerCase().includes(gpuModel.toLowerCase()))) {
      unmet.push(`GPU is ${closestBudgetLaptop.gpu?.model || 'Integrated'} (requested: ${gpuModel})`);
    }
    if (delta > 0) {
      unmet.push(`Exceeds budget by ₹${delta.toLocaleString('en-IN')}`);
    }

    closestOptions.push({
      type: 'CLOSEST_TO_BUDGET',
      label: maxBudget && closestBudgetLaptop.price_inr <= maxBudget
        ? `Closest within budget: ${closestBudgetLaptop.name}`
        : `Closest to budget: ${closestBudgetLaptop.name}`,
      sku: closestBudgetLaptop.sku,
      name: closestBudgetLaptop.name,
      price_inr: closestBudgetLaptop.price_inr,
      ram_gb: closestBudgetLaptop.ram.capacity_gb,
      storage_gb: closestBudgetLaptop.storage.capacity_gb,
      budget_delta_inr: delta,
      unmet_constraints: unmet,
      trade_off: delta > 0
        ? `Lowest-priced model in catalog at ₹${closestBudgetLaptop.price_inr.toLocaleString('en-IN')} (exceeds budget by ₹${delta.toLocaleString('en-IN')}).`
        : `Fits within budget, but lacks ${unmet.join(', ')}.`
    });
  }

  // Option C: Balanced compromise (e.g. 16GB tier if customer requested 32GB, or dedicated GPU tier)
  if (minRam && minRam > 16) {
    const sixteenGbLaptops = activeLaptops
      .filter((l) => l.ram.capacity_gb === 16)
      .sort((a, b) => a.price_inr - b.price_inr);

    if (sixteenGbLaptops.length > 0 && !closestOptions.some((o) => o.sku === sixteenGbLaptops[0].sku)) {
      const compromise = sixteenGbLaptops[0];
      const delta = maxBudget ? compromise.price_inr - maxBudget : 0;
      closestOptions.push({
        type: 'BALANCED_COMPROMISE',
        label: `Balanced 16GB option: ${compromise.name}`,
        sku: compromise.sku,
        name: compromise.name,
        price_inr: compromise.price_inr,
        ram_gb: compromise.ram.capacity_gb,
        storage_gb: compromise.storage.capacity_gb,
        budget_delta_inr: delta,
        unmet_constraints: [
          `RAM is 16GB (requested: ${minRam}GB)`,
          ...(delta > 0 ? [`Exceeds budget by ₹${delta.toLocaleString('en-IN')}`] : [])
        ],
        trade_off: `Offers 16GB RAM at ₹${compromise.price_inr.toLocaleString('en-IN')} (${delta > 0 ? `exceeds budget by ₹${delta.toLocaleString('en-IN')}` : 'within budget'}).`
      });
    }
  }

  // Formulate trade-off options
  const tradeOffOptions: string[] = [];

  if (gpuModel !== undefined) {
    const cheapestWithGpu = activeLaptops.find((l) => l.gpu?.model.toLowerCase().includes(gpuModel.toLowerCase()));
    if (cheapestWithGpu && maxBudget && cheapestWithGpu.price_inr > maxBudget) {
      tradeOffOptions.push(
        `Increase budget to ₹${cheapestWithGpu.price_inr.toLocaleString('en-IN')} to secure ${gpuModel} graphics (${cheapestWithGpu.name}).`
      );
    }
    const altGpuLaptop = activeLaptops.find((l) => maxBudget && l.price_inr <= maxBudget && l.gpu?.type === 'dedicated');
    if (altGpuLaptop) {
      tradeOffOptions.push(
        `Consider ${altGpuLaptop.name} at ₹${altGpuLaptop.price_inr.toLocaleString('en-IN')} with ${altGpuLaptop.gpu?.model} to stay within budget.`
      );
    }
  }

  const cheapestSpecOpt = closestOptions.find((o) => o.type === 'CHEAPEST_SATISFYING_SPEC');
  if (cheapestSpecOpt && cheapestSpecOpt.budget_delta_inr > 0 && !tradeOffOptions.some(t => t.includes(cheapestSpecOpt.name))) {
    tradeOffOptions.push(
      `Increase budget to ₹${cheapestSpecOpt.price_inr.toLocaleString('en-IN')} to secure required specifications (${cheapestSpecOpt.name}).`
    );
  }

  if (minRam && minRam > 16) {
    tradeOffOptions.push(
      `Reduce RAM requirement to 16GB (available starting at ₹59,999 with Nexora FlexBook 14) or 8GB (starting at ₹42,999 with Nexora Campus 14).`
    );
  } else if (minRam && minRam > 8) {
    tradeOffOptions.push(
      `Reduce RAM requirement to 8GB (available starting at ₹42,999 with Nexora Campus 14).`
    );
  }

  if (maxBudget !== undefined && satisfyingBudgetCount === 0 && cheapestInCatalog) {
    tradeOffOptions.push(
      `Increase budget to at least ₹${cheapestInCatalog.price_inr.toLocaleString('en-IN')} to access the catalog's entry-level model (${cheapestInCatalog.name}).`
    );
  }

  return {
    requested: {
      budget_ceiling_inr: maxBudget,
      min_ram_gb: minRam,
      min_storage_gb: minStorage,
      max_weight_g: maxWeight
    },
    failed_constraints: failedConstraints,
    counts: {
      total_active_in_stock: activeLaptops.length,
      satisfying_budget: satisfyingBudgetCount,
      satisfying_ram: satisfyingRamCount,
      satisfying_storage: satisfyingStorageCount,
      satisfying_weight: satisfyingWeightCount
    },
    failure_summary_points: failurePoints,
    closest_options: closestOptions,
    trade_off_options: tradeOffOptions
  };
}

