import type { Product, LaptopProduct, MouseProduct, BagProduct, ProductCategory } from '../types/catalog.ts';
import { ALL_PRODUCTS, LAPTOPS, MICE, BAGS } from '../data/catalog.ts';

export interface ProductFilters {
  category?: ProductCategory;
  max_price_inr?: number;
  in_stock_only?: boolean;
  active_only?: boolean;
}

export interface ICatalogRepository {
  getAllProducts(): Product[];
  getProductBySku(sku: string): Product | null;
  searchProducts(filters: ProductFilters): Product[];
  getLaptops(): LaptopProduct[];
  getMice(): MouseProduct[];
  getBags(): BagProduct[];
  getLaptopSpecs(sku: string): LaptopProduct | null;
  getMouseSpecs(sku: string): MouseProduct | null;
  getBagSpecs(sku: string): BagProduct | null;
  getSupportedCategories(): ProductCategory[];
  isCategorySupported(category: string): boolean;
}

export class InMemoryCatalogRepository implements ICatalogRepository {
  private products: Map<string, Product>;

  constructor(initialProducts: Product[] = ALL_PRODUCTS) {
    this.products = new Map();
    for (const p of initialProducts) {
      this.products.set(p.sku, p);
    }
  }

  getAllProducts(): Product[] {
    return Array.from(this.products.values());
  }

  getProductBySku(sku: string): Product | null {
    return this.products.get(sku) || null;
  }

  searchProducts(filters: ProductFilters): Product[] {
    return Array.from(this.products.values()).filter((p) => {
      if (filters.category && p.category !== filters.category) return false;
      if (filters.active_only !== false && !p.is_active) return false;
      if (filters.in_stock_only && p.stock_quantity <= 0) return false;
      if (filters.max_price_inr !== undefined && p.price_inr > filters.max_price_inr) return false;
      return true;
    });
  }

  getLaptops(): LaptopProduct[] {
    return Array.from(this.products.values()).filter(
      (p): p is LaptopProduct => p.category === 'laptop'
    );
  }

  getMice(): MouseProduct[] {
    return Array.from(this.products.values()).filter(
      (p): p is MouseProduct => p.category === 'mouse'
    );
  }

  getBags(): BagProduct[] {
    return Array.from(this.products.values()).filter(
      (p): p is BagProduct => p.category === 'bag'
    );
  }

  getLaptopSpecs(sku: string): LaptopProduct | null {
    const p = this.products.get(sku);
    if (p && p.category === 'laptop') {
      return p as LaptopProduct;
    }
    return null;
  }

  getMouseSpecs(sku: string): MouseProduct | null {
    const p = this.products.get(sku);
    if (p && p.category === 'mouse') {
      return p as MouseProduct;
    }
    return null;
  }

  getBagSpecs(sku: string): BagProduct | null {
    const p = this.products.get(sku);
    if (p && p.category === 'bag') {
      return p as BagProduct;
    }
    return null;
  }

  getSupportedCategories(): ProductCategory[] {
    return ['laptop', 'mouse', 'bag'];
  }

  isCategorySupported(category: string): boolean {
    if (!category || typeof category !== 'string') return false;
    const norm = category.toLowerCase().trim();
    if (norm === 'laptop' || norm === 'laptops' || norm === 'notebook' || norm === 'ultrabook') return true;
    if (norm === 'mouse' || norm === 'mice' || norm === 'trackpad') return true;
    if (norm === 'bag' || norm === 'bags' || norm === 'backpack' || norm === 'backpacks' || norm === 'sleeve' || norm === 'sleeves') return true;
    return false;
  }
}

let defaultRepoInstance: ICatalogRepository | null = null;

export function getCatalogRepository(): ICatalogRepository {
  if (!defaultRepoInstance) {
    defaultRepoInstance = new InMemoryCatalogRepository();
  }
  return defaultRepoInstance;
}
