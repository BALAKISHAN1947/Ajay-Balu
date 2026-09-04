export interface DimensionMargins {
  length_margin_mm: number;
  width_margin_mm: number;
  height_margin_mm: number;
  buffer_applied_mm: number;
}

export interface CompatibilityResult {
  compatible: boolean;
  primary_sku: string;
  accessory_sku: string;
  accessory_category: 'bag' | 'mouse';
  reason: string;
  margins_mm?: DimensionMargins;
  port_evidence?: {
    laptop_usb_a_count: number;
    mouse_connection_used: 'bluetooth' | 'usb_a_dongle' | 'none';
    policy_enforced: string;
  };
}
