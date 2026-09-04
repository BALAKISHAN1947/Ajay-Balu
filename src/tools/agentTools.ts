import type { Product, LaptopProduct, ProductCategory } from '../types/catalog.ts';
import type { CompatibilityResult } from '../types/compatibility.ts';
import type { CustomerIntent } from '../types/intent.ts';
import { type ICatalogRepository, getCatalogRepository } from '../repository/catalogRepository.ts';
import { checkCompatibility } from '../engine/compatibility.ts';

export interface SearchProductsParams {
  category?: ProductCategory;
  max_price_inr?: number;
  in_stock_only?: boolean;
  min_ram_gb?: number;
}

export interface StockPriceResult {
  valid: boolean;
  items: Array<{
    sku: string;
    name: string;
    stock: number;
    price_inr: number;
    in_stock: boolean;
  }>;
}

export interface CartCalculationResult {
  subtotal_inr: number;
  total_inr: number;
  items: Array<{
    sku: string;
    name: string;
    price_inr: number;
  }>;
}

export class AgentTools {
  private repo: ICatalogRepository;

  constructor(repo: ICatalogRepository = getCatalogRepository()) {
    this.repo = repo;
  }

  /**
   * Tool 1: search_products
   * Deterministically queries the catalog with filter parameters.
   */
  public search_products(filters: SearchProductsParams): Product[] {
    let results = this.repo.searchProducts({
      category: filters.category,
      max_price_inr: filters.max_price_inr,
      in_stock_only: filters.in_stock_only
    });

    if (filters.min_ram_gb !== undefined) {
      results = results.filter((p) => {
        if (p.category === 'laptop') {
          const lp = p as LaptopProduct;
          return lp.ram.capacity_gb !== null && lp.ram.capacity_gb >= filters.min_ram_gb!;
        }
        return true;
      });
    }

    return results;
  }

  /**
   * Tool 2: get_product_details
   * Retrieves complete immutable spec sheet for a single SKU.
   */
  public get_product_details(sku: string): Product {
    const product = this.repo.getProductBySku(sku);
    if (!product) {
      throw new Error(`Product with SKU "${sku}" not found in catalog.`);
    }
    return product;
  }

  /**
   * Tool 3: check_compatibility
   * Evaluates physical clearance or protocol constraints between a laptop and accessory.
   */
  public check_compatibility(
    primarySku: string,
    accessorySku: string,
    intent?: CustomerIntent
  ): CompatibilityResult {
    return checkCompatibility(primarySku, accessorySku, this.repo, intent);
  }

  /**
   * Tool 4: check_stock_and_price
   * Atomically verifies real-time stock and unit prices.
   */
  public check_stock_and_price(skus: string[]): StockPriceResult {
    let allValid = true;
    const items = skus.map((sku) => {
      const p = this.repo.getProductBySku(sku);
      if (!p) {
        allValid = false;
        return { sku, name: 'Unknown', stock: 0, price_inr: 0, in_stock: false };
      }
      const inStock = p.stock_quantity > 0 && p.is_active;
      if (!inStock) allValid = false;
      return {
        sku: p.sku,
        name: p.name,
        stock: p.stock_quantity,
        price_inr: p.price_inr,
        in_stock: inStock
      };
    });

    return { valid: allValid, items };
  }

  /**
   * Tool 5: calculate_cart
   * Deterministically calculates line items and total order value without LLM hallucination.
   */
  public calculate_cart(skus: string[]): CartCalculationResult {
    const items: Array<{ sku: string; name: string; price_inr: number }> = [];
    let total = 0;

    for (const sku of skus) {
      const p = this.repo.getProductBySku(sku);
      if (!p) {
        throw new Error(`Cannot calculate cart: SKU "${sku}" does not exist.`);
      }
      items.push({ sku: p.sku, name: p.name, price_inr: p.price_inr });
      total += p.price_inr;
    }

    return {
      subtotal_inr: total,
      total_inr: total,
      items
    };
  }
}
