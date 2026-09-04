import type { ProductCategory } from '../types/catalog.ts';

export interface ExpectedIntentFields {
  required_categories: ProductCategory[];
  budget_ceiling?: number;
  is_hard_ceiling?: boolean;
  min_ram_gb?: number;
  min_storage_gb?: number;
  target_workload?: string;
  is_ambiguous?: boolean;
  expect_clarification?: boolean;
}

export interface GoldenTestCase {
  id: string;
  description: string;
  query: string;
  expected: ExpectedIntentFields;
}

export const GOLDEN_DATASET: GoldenTestCase[] = [
  {
    id: 'GOLDEN_01',
    description: 'Primary coding bundle query with explicit budget and specs',
    query: 'I need a laptop for coding under ₹70,000. I travel every day, so I want something light with good battery life, at least 16GB RAM, and I also need a mouse and laptop bag.',
    expected: {
      required_categories: ['laptop', 'mouse', 'bag'],
      budget_ceiling: 70000,
      is_hard_ceiling: true,
      min_ram_gb: 16,
      target_workload: 'coding',
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_02',
    description: 'Shorthand "k" budget and "gigs" RAM expression',
    query: 'Looking for a coding notebook under 65k with at least 16 gigs ram',
    expected: {
      required_categories: ['laptop'],
      budget_ceiling: 65000,
      is_hard_ceiling: true,
      min_ram_gb: 16,
      target_workload: 'coding',
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_03',
    description: 'Word-form currency expression "seventy thousand"',
    query: 'I want a lightweight developer laptop under seventy thousand with min 16GB RAM',
    expected: {
      required_categories: ['laptop'],
      budget_ceiling: 70000,
      is_hard_ceiling: true,
      min_ram_gb: 16,
      target_workload: 'coding',
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_04',
    description: 'Storage constraint specified with 512GB SSD',
    query: 'Need a laptop under 68k with 16GB RAM and 512GB SSD for programming',
    expected: {
      required_categories: ['laptop'],
      budget_ceiling: 68000,
      is_hard_ceiling: true,
      min_ram_gb: 16,
      min_storage_gb: 512,
      target_workload: 'coding',
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_05',
    description: '1TB Terabyte storage expression',
    query: 'Laptop under 70k with at least 1TB storage and 16GB RAM for software dev',
    expected: {
      required_categories: ['laptop'],
      budget_ceiling: 70000,
      is_hard_ceiling: true,
      min_ram_gb: 16,
      min_storage_gb: 1024,
      target_workload: 'coding',
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_06',
    description: 'Ambiguous generic query without budget or technical constraints',
    query: 'I need a laptop for work',
    expected: {
      required_categories: ['laptop'],
      is_ambiguous: true,
      expect_clarification: true
    }
  },
  {
    id: 'GOLDEN_07',
    description: 'Ambiguous query with zero product category specified',
    query: 'Show me something under 50k',
    expected: {
      required_categories: [],
      budget_ceiling: 50000,
      is_ambiguous: true,
      expect_clarification: true
    }
  },
  {
    id: 'GOLDEN_08',
    description: 'Soft preference "around 60k" must not become hard ceiling',
    query: 'Looking for a machine around 60k with good battery and 16GB RAM',
    expected: {
      required_categories: ['laptop'],
      budget_ceiling: 60000,
      is_hard_ceiling: false,
      min_ram_gb: 16,
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_09',
    description: 'Strict hard weight limit expression',
    query: 'I need a laptop under 70k that must be under 1.4kg with 16GB RAM',
    expected: {
      required_categories: ['laptop'],
      budget_ceiling: 70000,
      is_hard_ceiling: true,
      min_ram_gb: 16,
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_10',
    description: 'Impossible constraint (35k budget + 32GB RAM)',
    query: 'I need a laptop under 35k with at least 32GB RAM',
    expected: {
      required_categories: ['laptop'],
      budget_ceiling: 35000,
      is_hard_ceiling: true,
      min_ram_gb: 32,
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_11',
    description: 'Mouse-only request with Bluetooth preference',
    query: 'I need a Bluetooth wireless mouse under 2000',
    expected: {
      required_categories: ['mouse'],
      budget_ceiling: 2000,
      is_hard_ceiling: true,
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_12',
    description: 'Bag-only request with backpack preference',
    query: 'Looking for a backpack for my laptop under 3000',
    expected: {
      required_categories: ['bag'],
      budget_ceiling: 3000,
      is_hard_ceiling: true,
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_13',
    description: 'Accessory bundle request (mouse and bag)',
    query: 'I need a wireless mouse and a laptop bag under 4000',
    expected: {
      required_categories: ['mouse', 'bag'],
      budget_ceiling: 4000,
      is_hard_ceiling: true,
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_14',
    description: 'High-budget 90k workstation request',
    query: 'I need a high-power laptop under 90k with 32GB RAM for docker and coding',
    expected: {
      required_categories: ['laptop'],
      budget_ceiling: 90000,
      is_hard_ceiling: true,
      min_ram_gb: 32,
      target_workload: 'coding',
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_15',
    description: 'Non-critical missing detail does NOT block search',
    query: 'Need a coding laptop under 65k with 16GB RAM and good battery',
    expected: {
      required_categories: ['laptop'],
      budget_ceiling: 65000,
      is_hard_ceiling: true,
      min_ram_gb: 16,
      target_workload: 'coding',
      expect_clarification: false
    }
  },
  {
    id: 'GOLDEN_16',
    description: 'Comma-separated currency with "gigs" RAM and SSD',
    query: 'Give me a machine with 16 gigs of RAM, 512 gig ssd, under ₹65,000 for development',
    expected: {
      required_categories: ['laptop'],
      budget_ceiling: 65000,
      is_hard_ceiling: true,
      min_ram_gb: 16,
      min_storage_gb: 512,
      target_workload: 'coding',
      expect_clarification: false
    }
  }
];
