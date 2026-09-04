export type ProductCategory = 'laptop' | 'mouse' | 'bag';

export const SUPPORTED_CATEGORIES: ProductCategory[] = ['laptop', 'mouse', 'bag'];

export interface ProductBase {
  sku: string;
  category: ProductCategory;
  brand: string;
  name: string;
  price_inr: number;
  stock_quantity: number;
  is_active: boolean;
  notes?: string;
}

export interface Dimensions3D {
  length: number;
  width: number;
  height: number;
}

export interface GPUInfo {
  vendor: 'NVIDIA' | 'AMD' | 'Intel' | 'Apple';
  model: string;
  vram_gb: number | null; // null for integrated
  type: 'dedicated' | 'integrated';
  is_dedicated?: boolean;
  memory_type?: string;
}

export interface LaptopProduct extends ProductBase {
  category: 'laptop';
  variant_id: string;
  dimensions_mm: Dimensions3D;
  weight_g: number;
  processor: {
    brand: string;
    model: string;
    generation: number;
    cores?: number;
  };
  gpu?: GPUInfo;
  ram: {
    capacity_gb: number | null; // null represents missing/unindexed attribute
    type: string;
    is_expandable: boolean;
  };
  storage: {
    capacity_gb: number;
    type: string;
    is_expandable: boolean;
  };
  display: {
    size_inches: number;
    resolution: string;
    brightness_nits: number | null; // null represents missing/unindexed attribute
    panel_type: string;
    refresh_rate_hz?: number;
  };
  battery: {
    capacity_wh: number;
    claimed_hours: number;
    fast_charging: boolean;
  };
  ports: {
    usb_a_count: number;
    usb_c_count: number;
    usb_c_charging: boolean;
    thunderbolt: boolean;
    hdmi_count: number;
    headphone_jack: boolean;
  };
  wireless: {
    bluetooth_version: string | null;
    wifi_standard: string;
  };
  os_support: string[];
  target_workload: string[];
}

export interface MouseProduct extends ProductBase {
  category: 'mouse';
  dimensions_mm: Dimensions3D;
  weight_g: number;
  bluetooth: boolean;
  bluetooth_version: string | null;
  wireless_2_4ghz_dongle: boolean;
  dongle_type: 'USB-A' | 'USB-C' | null;
  multi_device_pairing: number;
  battery: {
    type: string;
    capacity_mah: number | null;
    battery_life_days: number;
  };
}

export interface BagCompartmentDimensions {
  max_length: number;
  max_width: number;
  max_height: number;
}

export interface BagProduct extends ProductBase {
  category: 'bag';
  bag_type: 'backpack' | 'messenger' | 'sleeve';
  external_dimensions_mm: Dimensions3D;
  laptop_compartment_max_dimensions_mm: BagCompartmentDimensions;
  target_laptop_size_inches: number;
  weatherproof_rating: string;
  weight_empty_g: number;
  pass_through_strap: boolean;
}

export type Product = LaptopProduct | MouseProduct | BagProduct;
