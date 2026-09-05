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
  private allProductsList: Product[];
  private laptopsList: LaptopProduct[];
  private miceList: MouseProduct[];
  private bagsList: BagProduct[];

  constructor(initialProducts: Product[] = ALL_PRODUCTS) {
    this.products = new Map();
    this.allProductsList = [];
    this.laptopsList = [];
    this.miceList = [];
    this.bagsList = [];

    for (const p of initialProducts) {
      this.products.set(p.sku, p);
      this.allProductsList.push(p);
      if (p.category === 'laptop') this.laptopsList.push(p as LaptopProduct);
      else if (p.category === 'mouse') this.miceList.push(p as MouseProduct);
      else if (p.category === 'bag') this.bagsList.push(p as BagProduct);
    }
  }

  getAllProducts(): Product[] {
    return this.allProductsList;
  }

  getProductBySku(sku: string): Product | null {
    return this.products.get(sku) || null;
  }

  searchProducts(filters: ProductFilters): Product[] {
    return this.allProductsList.filter((p) => {
      if (filters.category && p.category !== filters.category) return false;
      if (filters.active_only !== false && !p.is_active) return false;
      if (filters.in_stock_only && p.stock_quantity <= 0) return false;
      if (filters.max_price_inr !== undefined && p.price_inr > filters.max_price_inr) return false;
      return true;
    });
  }

  getLaptops(): LaptopProduct[] {
    return this.laptopsList;
  }

  getMice(): MouseProduct[] {
    return this.miceList;
  }

  getBags(): BagProduct[] {
    return this.bagsList;
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
