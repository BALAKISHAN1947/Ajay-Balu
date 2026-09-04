export interface CatalogIssue {
  sku: string;
  category: 'laptop' | 'mouse' | 'bag';
  field: string;
  issue_type: 'MISSING_ATTRIBUTE' | 'AMBIGUOUS_VALUE' | 'OUT_OF_STOCK';
  description: string;
}

export const INTENTIONAL_CATALOG_ISSUES: CatalogIssue[] = [
  {
    sku: 'NX-LP-EDGE14-10',
    category: 'laptop',
    field: 'display.brightness_nits',
    issue_type: 'MISSING_ATTRIBUTE',
    description: 'Display brightness in nits is null; AI buyer cannot evaluate outdoor display quality.'
  },
  {
    sku: 'NX-LP-MINRAMMISS-14',
    category: 'laptop',
    field: 'ram.capacity_gb',
    issue_type: 'MISSING_ATTRIBUTE',
    description: 'RAM capacity is null; hard constraint engine must fail safe and reject.'
  },
  {
    sku: 'NX-MS-AMBIG-05',
    category: 'mouse',
    field: 'dongle_type',
    issue_type: 'AMBIGUOUS_VALUE',
    description: 'Dongle connection type is null; compatibility engine cannot verify port protocol.'
  },
  {
    sku: 'NX-LP-OOS-08',
    category: 'laptop',
    field: 'stock_quantity',
    issue_type: 'OUT_OF_STOCK',
    description: 'Popular ultralight laptop has 0 stock; tests stock filter.'
  },
  {
    sku: 'NX-MS-OOS-04',
    category: 'mouse',
    field: 'stock_quantity',
    issue_type: 'OUT_OF_STOCK',
    description: 'High-end mouse has 0 stock; tests accessory stock filter.'
  },
  {
    sku: 'NX-BG-OOS-05',
    category: 'bag',
    field: 'stock_quantity',
    issue_type: 'OUT_OF_STOCK',
    description: 'Leather briefcase has 0 stock; tests bag stock filter.'
  }
];
