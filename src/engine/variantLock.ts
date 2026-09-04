import type { LaptopProduct } from '../types/catalog.ts';
import type { LockedVariant } from '../types/recommendation.ts';

/**
 * Locks the exact selected laptop SKU and variant, producing an immutable
 * specification record that guarantees price, configuration, and stock integrity.
 */
export function lockLaptopVariant(laptop: LaptopProduct): LockedVariant {
  const ramSummary = laptop.ram.capacity_gb !== null
    ? `${laptop.ram.capacity_gb}GB ${laptop.ram.type} (${laptop.ram.is_expandable ? 'Expandable' : 'Soldered'})`
    : 'RAM not verified';

  const storageSummary = `${laptop.storage.capacity_gb >= 1024 ? `${laptop.storage.capacity_gb / 1024}TB` : `${laptop.storage.capacity_gb}GB`} ${laptop.storage.type}`;

  return {
    sku: laptop.sku,
    variant_id: laptop.variant_id,
    name: laptop.name,
    price_inr: laptop.price_inr,
    stock_quantity: laptop.stock_quantity,
    ram_summary: ramSummary,
    storage_summary: storageSummary
  };
}
