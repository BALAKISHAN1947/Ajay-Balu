import type { BenchmarkIntent } from '../types/benchmark.ts';

export const BENCHMARK_INTENTS: BenchmarkIntent[] = [
  // ==========================================
  // GROUP 1: DEVELOPER / CODING (20 INTENTS)
  // ==========================================
  {
    benchmark_id: 'BENCH-DEV-01',
    natural_language_query: 'I need a coding laptop under ₹70,000 with at least 16GB RAM for software development.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: { weights: { portability: 0.35, battery: 0.35, longevity: 0.30 } },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'AeroBook 14 fits under 70k with 16GB RAM' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-02',
    natural_language_query: 'Looking for a developer notebook with 32GB RAM under 90k for heavy docker containers.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 90000, min_ram_gb: 32, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-PRO16-05', notes: 'WorkStation 16 fits 32GB RAM under 90k' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-03',
    natural_language_query: 'Need a fast machine for compiling Rust and C++ under 65k with 16 gigs ram and 512GB SSD.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 65000, min_ram_gb: 16, min_storage_gb: 512, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'AeroBook 14 or DevForge fits' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-04',
    natural_language_query: 'I want a laptop under 60k for web dev with at least 16GB RAM.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 60000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-FLEX14-11', notes: 'FlexBook 14 is priced at 59,999 with 16GB RAM' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-05',
    natural_language_query: 'Need a developer laptop under ₹68,000 with 1TB SSD and 16GB RAM.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 68000, min_ram_gb: 16, min_storage_gb: 1024, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CODE14-04', notes: 'CodeCraft 14 has 1TB SSD and 16GB RAM at 67,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-06',
    natural_language_query: 'I need an ultralight developer laptop under 70k with Ubuntu support and 16GB RAM.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: { weights: { portability: 0.5 } },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CARBON14-13', notes: 'CarbonCraft 14 at 69,499' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-07',
    natural_language_query: 'Need a coding laptop with 32GB RAM under 60k.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 60000, min_ram_gb: 32, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'BUDGET_MISMATCH', notes: 'No 32GB RAM laptop exists under 60k' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-08',
    natural_language_query: 'Looking for a coding notebook under 70k with 16GB RAM and Thunderbolt port for my eGPU.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'AeroBook has Thunderbolt' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-09',
    natural_language_query: 'Need a laptop for frontend React and mobile development with at least 16GB RAM under 65k.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 65000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-10',
    natural_language_query: 'I need a machine with expandable RAM under 65k and 16GB pre-installed for backend microservices.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 65000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-DEV15-02', notes: 'DevForge 15 has expandable DDR5 RAM' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-11',
    natural_language_query: 'Looking for AlphaBook 14 for coding with at least 16GB RAM.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'MISSING_ATTRIBUTE', target_sku: 'NX-LP-MINRAMMISS-14', notes: 'AlphaBook RAM is null in catalog v1.0' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-12',
    natural_language_query: 'Need a 15.6 inch developer laptop with 16GB RAM and Ryzen processor under 70k.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CODE15-15', notes: 'DevStation 15 at 68,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-13',
    natural_language_query: 'Developer machine under 65k with 16GB RAM and at least 60Wh battery.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 65000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: { min_preferred_battery_wh: 60 },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-14',
    natural_language_query: 'Need a coding laptop with 64GB RAM under 90k.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 90000, min_ram_gb: 64, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'RAM_MISMATCH', notes: 'Max RAM in catalog is 32GB' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-15',
    natural_language_query: 'I need a machine for Android app development and emulator under 70k with 16GB RAM.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-16',
    natural_language_query: 'Looking for a developer laptop under 72k with 16GB RAM and Ryzen 7.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 72000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CODE14-04' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-17',
    natural_language_query: 'Need a coding laptop strictly under 63,000 with 16GB RAM.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 63000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'AeroBook is 62,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-18',
    natural_language_query: 'I want a laptop for Python data analysis under 70k with 16GB RAM and 512GB SSD.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, min_storage_gb: 512, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-19',
    natural_language_query: 'Looking for an ultralight developer laptop under 70k that must weigh under 1.25kg.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, max_weight_g: 1250, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CARBON14-13', notes: 'CarbonCraft weighs 1210g at 69,499' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-DEV-20',
    natural_language_query: 'Need a developer laptop under 62k with 16GB RAM.',
    group: 'developer',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 62000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-FLEX14-11', notes: 'FlexBook 14 at 59,999' },
    benchmark_version: 'v1.0'
  },

  // ==========================================
  // GROUP 2: GAMING (15 INTENTS)
  // ==========================================
  {
    benchmark_id: 'BENCH-GAME-01',
    natural_language_query: 'I need an RTX 4060 laptop under ₹70,000 for gaming.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, gpu_model: 'RTX 4060', requires_dedicated_gpu: true, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'GPU_MISMATCH', notes: 'Only RTX 4060 in catalog is WorkStation 16 at 89,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-02',
    natural_language_query: 'Looking for a dedicated GPU gaming laptop under 70k with 16GB RAM.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, requires_dedicated_gpu: true, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-TITAN15-12', notes: 'Titan 15 has RTX 3050 at 69,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-03',
    natural_language_query: 'Need an RTX 4060 laptop under 90k with 32GB RAM for AAA gaming.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 90000, gpu_model: 'RTX 4060', min_ram_gb: 32, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-PRO16-05', notes: 'WorkStation 16 has RTX 4060 + 32GB RAM at 89,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-04',
    natural_language_query: 'I need an RTX 3050 laptop under 70k with high refresh display.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, gpu_model: 'RTX 3050', in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-TITAN15-12', notes: 'Titan 15 144Hz panel' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-05',
    natural_language_query: 'Looking for a gaming laptop with RTX 4070 under 80k.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 80000, gpu_model: 'RTX 4070', in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'GPU_MISMATCH', notes: 'No RTX 4070 exists in catalog' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-06',
    natural_language_query: 'Need a dedicated GPU laptop under 60k for esport games like Valorant and CS2.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 60000, requires_dedicated_gpu: true, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'PRICE_MISMATCH', notes: 'Cheapest dedicated GPU laptop is Titan 15 at 69,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-07',
    natural_language_query: 'I want a gaming machine with 8GB VRAM under 85k.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 85000, min_vram_gb: 8, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'PARTIAL', target_sku: 'NX-LP-PRO16-05', notes: 'WorkStation 16 has 8GB VRAM at 89,999 (within 20% budget overage)' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-08',
    natural_language_query: 'Looking for a dedicated GPU laptop with at least 4GB VRAM under 70,000.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_vram_gb: 4, requires_dedicated_gpu: true, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-TITAN15-12' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-09',
    natural_language_query: 'Need an RTX 4080 laptop under 1 lakh.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 100000, gpu_model: 'RTX 4080', in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'GPU_MISMATCH' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-10',
    natural_language_query: 'Looking for a gaming laptop with RTX 3050 and 16GB RAM under 68,000.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 68000, gpu_model: 'RTX 3050', in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'PARTIAL', target_sku: 'NX-LP-TITAN15-12', notes: 'Titan 15 is 69,999 (exceeds 68k by 1,999)' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-11',
    natural_language_query: 'Gaming laptop with at least 16GB RAM and dedicated Nvidia graphics under 75,000.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 75000, requires_dedicated_gpu: true, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-TITAN15-12' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-12',
    natural_language_query: 'I need an RTX 4060 laptop under 75,000.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 75000, gpu_model: 'RTX 4060', in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'PARTIAL', target_sku: 'NX-LP-PRO16-05', notes: 'WorkStation 16 is 89,999 (near budget range)' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-13',
    natural_language_query: 'Need a dedicated GPU laptop for flight simulator under 70k with at least 512GB SSD.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, requires_dedicated_gpu: true, min_storage_gb: 512, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-TITAN15-12' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-14',
    natural_language_query: 'Looking for a gaming laptop with 16GB VRAM under 90k.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 90000, min_vram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'GPU_MISMATCH' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-GAME-15',
    natural_language_query: 'Need a gaming laptop with dedicated GPU under 50k.',
    group: 'gaming',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 50000, requires_dedicated_gpu: true, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'PRICE_MISMATCH' },
    benchmark_version: 'v1.0'
  },

  // ==========================================
  // GROUP 3: STUDENT / BUDGET (15 INTENTS)
  // ==========================================
  {
    benchmark_id: 'BENCH-BUDGET-01',
    natural_language_query: 'I need a laptop for college under ₹45,000 for online classes and assignments.',
    group: 'student_budget',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 45000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CAMPUS-07', notes: 'Campus 14 at 42,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-02',
    natural_language_query: 'Need a cheap laptop under 30k for basic typing.',
    group: 'student_budget',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 30000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'PRICE_MISMATCH', notes: 'Lowest catalog price is 42,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-03',
    natural_language_query: 'Looking for a student laptop under 55k with 512GB SSD and decent battery.',
    group: 'student_budget',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 55000, min_storage_gb: 512, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-SLIM14-03', notes: 'SlimBook 14 at 52,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-04',
    natural_language_query: 'I need a laptop under 50k for school homework and browsing.',
    group: 'student_budget',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 50000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CAMPUS-07' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-05',
    natural_language_query: 'Looking for a laptop under 20k for simple browsing.',
    group: 'student_budget',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 20000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'PRICE_MISMATCH' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-06',
    natural_language_query: 'Need a budget student laptop under 55k with 16GB RAM for computer science.',
    group: 'student_budget',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 55000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'PARTIAL', target_sku: 'NX-LP-FLEX14-11', notes: 'FlexBook 14 has 16GB RAM at 59,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-07',
    natural_language_query: 'I need running shoes under 5000.',
    group: 'student_budget',
    expected_category: 'unsupported',
    expected_hard_constraints: { budget_max: 5000 },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'UNSUPPORTED_CATEGORY', expected_loss_reason: 'CATEGORY_MISMATCH', notes: 'Merchant sells only laptops, mice, bags' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-08',
    natural_language_query: 'Need a smartphone under 25k.',
    group: 'student_budget',
    expected_category: 'unsupported',
    expected_hard_constraints: { budget_max: 25000 },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'UNSUPPORTED_CATEGORY', expected_loss_reason: 'CATEGORY_MISMATCH' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-09',
    natural_language_query: 'Student laptop under 53,000 with 14 inch display.',
    group: 'student_budget',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 53000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-SLIM14-03' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-10',
    natural_language_query: 'I need a tablet for taking college notes under 30k.',
    group: 'student_budget',
    expected_category: 'unsupported',
    expected_hard_constraints: { budget_max: 30000 },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'UNSUPPORTED_CATEGORY', expected_loss_reason: 'CATEGORY_MISMATCH' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-11',
    natural_language_query: 'Need SwiftBook 14 for my college classes under 65,000.',
    group: 'student_budget',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 65000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'SwiftBook 14 (NX-LP-OOS-08) is out of stock in v1.0; AeroBook satisfies constraints' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-12',
    natural_language_query: 'Looking for a printer for home study under 10k.',
    group: 'student_budget',
    expected_category: 'unsupported',
    expected_hard_constraints: { budget_max: 10000 },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'UNSUPPORTED_CATEGORY', expected_loss_reason: 'CATEGORY_MISMATCH' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-13',
    natural_language_query: 'Student laptop with 8GB RAM and SSD under 45,000.',
    group: 'student_budget',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 45000, min_ram_gb: 8, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CAMPUS-07' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-14',
    natural_language_query: 'Budget laptop under 60k with 16GB RAM for engineering student.',
    group: 'student_budget',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 60000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-FLEX14-11' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BUDGET-15',
    natural_language_query: 'Looking for a drone for photography under 50k.',
    group: 'student_budget',
    expected_category: 'unsupported',
    expected_hard_constraints: { budget_max: 50000 },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'UNSUPPORTED_CATEGORY', expected_loss_reason: 'CATEGORY_MISMATCH' },
    benchmark_version: 'v1.0'
  },

  // ==========================================
  // GROUP 4: TRAVEL / PORTABILITY (10 INTENTS)
  // ==========================================
  {
    benchmark_id: 'BENCH-TRAV-01',
    natural_language_query: 'I travel every day and need an ultralight laptop under 1.25kg and under ₹70,000 with good battery life.',
    group: 'travel_portability',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, max_weight_g: 1250, in_stock_only: true },
    expected_soft_preferences: { weights: { portability: 0.5, battery: 0.3 } },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CARBON14-13', notes: 'CarbonCraft is 1210g at 69,499' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-TRAV-02',
    natural_language_query: 'Looking for a compact 13-inch laptop under 70k for business travel.',
    group: 'travel_portability',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, in_stock_only: true },
    expected_soft_preferences: { weights: { portability: 0.5 } },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-LITE13-06', notes: 'AirLite 13 at 66,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-TRAV-03',
    natural_language_query: 'Need an ultralight laptop under 1kg and under 60k.',
    group: 'travel_portability',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 60000, max_weight_g: 1000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'NO_RELEVANT_PRODUCT', notes: 'No laptop under 1.0kg in catalog' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-TRAV-04',
    natural_language_query: 'I commute daily on metro and need a 14 inch laptop under 1.35kg with 16GB RAM under 65k.',
    group: 'travel_portability',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 65000, max_weight_g: 1350, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'AeroBook is 1280g at 62,999' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-TRAV-05',
    natural_language_query: 'Need a travel laptop with at least 10 hours battery life under 70,000.',
    group: 'travel_portability',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, in_stock_only: true },
    expected_soft_preferences: { min_preferred_battery_wh: 55 },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-TRAV-06',
    natural_language_query: 'Looking for an ultra-portable laptop under 68,000 with USB-C charging.',
    group: 'travel_portability',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 68000, in_stock_only: true },
    expected_soft_preferences: { weights: { portability: 0.45 } },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-TRAV-07',
    natural_language_query: 'I need a machine that weighs under 1.4kg with 16GB RAM under 70k for remote travel.',
    group: 'travel_portability',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, max_weight_g: 1400, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-TRAV-08',
    natural_language_query: 'Travel laptop under 65k with 13 inch screen and 16GB RAM.',
    group: 'travel_portability',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 65000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: { weights: { portability: 0.5 } },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'AirLite 13 is 66,999; AeroBook 14 fits under 65k' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-TRAV-09',
    natural_language_query: 'Need an ultralight laptop under 1.2kg with dedicated graphics under 75k.',
    group: 'travel_portability',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 75000, max_weight_g: 1200, requires_dedicated_gpu: true, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'NO_RELEVANT_PRODUCT', notes: 'Dedicated GPU laptops are heavy (>2kg)' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-TRAV-10',
    natural_language_query: 'Lightweight travel laptop under 70k with 16GB RAM and long battery life for international flights.',
    group: 'travel_portability',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: { weights: { portability: 0.45, battery: 0.35 } },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CARBON14-13' },
    benchmark_version: 'v1.0'
  },

  // ==========================================
  // GROUP 5: CREATOR / CREATIVE WORK (10 INTENTS)
  // ==========================================
  {
    benchmark_id: 'BENCH-CREAT-01',
    natural_language_query: 'I need a workstation laptop for 4K video editing and color grading with 32GB RAM under 90,000.',
    group: 'creator',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 90000, min_ram_gb: 32, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-PRO16-05', notes: 'WorkStation 16 has OLED 450-nit display and 32GB RAM' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-CREAT-02',
    natural_language_query: 'Looking for a creator laptop with high brightness display of at least 400 nits and 16GB RAM under 70,000.',
    group: 'creator',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'AeroBook 14 has 400 nits brightness' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-CREAT-03',
    natural_language_query: 'Need EdgeBook 14 for outdoor photo editing with verified 400 nits brightness.',
    group: 'creator',
    expected_category: 'laptop',
    expected_hard_constraints: { in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'EdgeBook 14 (NX-LP-EDGE14-10) brightness is null in catalog v1.0; AeroBook has verified 400 nits' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-CREAT-04',
    natural_language_query: 'I need an OLED screen laptop under 90k for graphic design.',
    group: 'creator',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 90000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-PRO16-05' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-CREAT-05',
    natural_language_query: 'Creator laptop under 60k with 100% sRGB display and 16GB RAM for Photoshop.',
    group: 'creator',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 60000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-FLEX14-11' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-CREAT-06',
    natural_language_query: 'Need a laptop for 3D animation and Blender rendering with dedicated GPU and 32GB RAM under 80k.',
    group: 'creator',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 80000, min_ram_gb: 32, requires_dedicated_gpu: true, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'PARTIAL', target_sku: 'NX-LP-PRO16-05', notes: 'WorkStation 16 is 89,999 (near 80k budget)' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-CREAT-07',
    natural_language_query: 'Looking for a creator laptop with 1TB SSD and 16GB RAM under 68,000 for music production.',
    group: 'creator',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 68000, min_ram_gb: 16, min_storage_gb: 1024, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CODE14-04' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-CREAT-08',
    natural_language_query: 'Need a 4K OLED laptop with 64GB RAM under 90k.',
    group: 'creator',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 90000, min_ram_gb: 64, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'LOST', expected_loss_reason: 'RAM_MISMATCH' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-CREAT-09',
    natural_language_query: 'Creator laptop under 70k with 16GB RAM and high-resolution screen above 1080p.',
    group: 'creator',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'AeroBook has 2240x1400 panel' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-CREAT-10',
    natural_language_query: 'I need a machine for video editing with 8GB VRAM dedicated GPU under 90,000.',
    group: 'creator',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 90000, min_vram_gb: 8, requires_dedicated_gpu: true, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-PRO16-05' },
    benchmark_version: 'v1.0'
  },

  // ==========================================
  // GROUP 6: OFFICE / WORKSPACE (10 INTENTS)
  // ==========================================
  {
    benchmark_id: 'BENCH-OFFICE-01',
    natural_language_query: 'I need an ergonomic Bluetooth mouse under 2000 for office work.',
    group: 'office_workspace',
    expected_category: 'mouse',
    expected_hard_constraints: { budget_max: 2000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-MS-ERGO-01', notes: 'Precision M30 at 1,799' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-OFFICE-02',
    natural_language_query: 'Need a silent wireless mouse under 1600 that does not click loudly.',
    group: 'office_workspace',
    expected_category: 'mouse',
    expected_hard_constraints: { budget_max: 1600, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-MS-SILENT-03', notes: 'SilentPro S20 at 1,499' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-OFFICE-03',
    natural_language_query: 'Looking for a basic wireless mouse under 1000 for spreadsheet work.',
    group: 'office_workspace',
    expected_category: 'mouse',
    expected_hard_constraints: { budget_max: 1000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-MS-DONGLE-02', notes: 'OfficeClick D10 at 899' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-OFFICE-04',
    natural_language_query: 'Need a protective laptop sleeve under 1500 for a 14-inch laptop.',
    group: 'office_workspace',
    expected_category: 'bag',
    expected_hard_constraints: { budget_max: 1500, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-BG-SLV14-03', notes: 'Urban Protective Sleeve 14 at 1,299' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-OFFICE-05',
    natural_language_query: 'Looking for a commuter backpack under 2600 that holds a 14 inch notebook.',
    group: 'office_workspace',
    expected_category: 'bag',
    expected_hard_constraints: { budget_max: 2600, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-BG-SLIM-01', notes: 'Commuter Slim Backpack at 2,499' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-OFFICE-06',
    natural_language_query: 'Need a large transit backpack under 3500 for a 16 inch workstation laptop.',
    group: 'office_workspace',
    expected_category: 'bag',
    expected_hard_constraints: { budget_max: 3500, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-BG-TOUR-02', notes: 'Voyager Transit Backpack 16 at 3,299' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-OFFICE-07',
    natural_language_query: 'I need an office keyboard under 1500.',
    group: 'office_workspace',
    expected_category: 'unsupported',
    expected_hard_constraints: { budget_max: 1500 },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'UNSUPPORTED_CATEGORY', expected_loss_reason: 'CATEGORY_MISMATCH', notes: 'Keyboards not sold' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-OFFICE-08',
    natural_language_query: 'Looking for Nexora BasicClick mouse under 700 with verified dongle connection.',
    group: 'office_workspace',
    expected_category: 'mouse',
    expected_hard_constraints: { budget_max: 700, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-MS-AMBIG-05', notes: 'BasicClick B1 is 699; has ambiguous dongle_type in catalog v1.0' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-OFFICE-09',
    natural_language_query: 'Need a leather briefcase for 15 inch laptop under 4500.',
    group: 'office_workspace',
    expected_category: 'bag',
    expected_hard_constraints: { budget_max: 4500, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-BG-TOUR-02', notes: 'Executive Leather Briefcase (NX-BG-OOS-05) is out of stock in v1.0; Voyager backpack fits' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-OFFICE-10',
    natural_language_query: 'I need an external monitor under 15,000.',
    group: 'office_workspace',
    expected_category: 'unsupported',
    expected_hard_constraints: { budget_max: 15000 },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'UNSUPPORTED_CATEGORY', expected_loss_reason: 'CATEGORY_MISMATCH' },
    benchmark_version: 'v1.0'
  },

  // ==========================================
  // GROUP 7: COMPARISON / DECISION (10 INTENTS)
  // ==========================================
  {
    benchmark_id: 'BENCH-COMP-01',
    natural_language_query: 'Compare AeroBook 14 and DevForge 15 for software engineering.',
    group: 'comparison',
    expected_category: 'laptop',
    expected_hard_constraints: { in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'Valid side-by-side comparison' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-COMP-02',
    natural_language_query: 'Which is better for travel: AeroBook 14 or DevForge 15?',
    group: 'comparison',
    expected_category: 'laptop',
    expected_hard_constraints: { in_stock_only: true },
    expected_soft_preferences: { weights: { portability: 0.5 } },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-COMP-03',
    natural_language_query: 'Compare Titan 15 and WorkStation 16 for gaming and creative work.',
    group: 'comparison',
    expected_category: 'laptop',
    expected_hard_constraints: { in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-PRO16-05' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-COMP-04',
    natural_language_query: 'Which should I buy between SlimBook 14 and Campus 14 for basic college tasks under 55k?',
    group: 'comparison',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 55000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-SLIM14-03' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-COMP-05',
    natural_language_query: 'AeroBook 14 vs CarbonCraft 14: which has better battery and portability under 70k?',
    group: 'comparison',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, in_stock_only: true },
    expected_soft_preferences: { weights: { portability: 0.5 } },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CARBON14-13' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-COMP-06',
    natural_language_query: 'Compare CodeCraft 14 and DevStation 15 for heavy multitasking.',
    group: 'comparison',
    expected_category: 'laptop',
    expected_hard_constraints: { in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CODE14-04' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-COMP-07',
    natural_language_query: 'Can I get something cheaper than AeroBook 14?',
    group: 'comparison',
    expected_category: 'laptop',
    expected_hard_constraints: { in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-FLEX14-11', notes: 'Downsell to FlexBook 14' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-COMP-08',
    natural_language_query: 'Why is DevForge 15 heavier than AeroBook 14?',
    group: 'comparison',
    expected_category: 'laptop',
    expected_hard_constraints: { in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-COMP-09',
    natural_language_query: 'Compare AirLite 13 vs AeroBook 14 for traveling developer.',
    group: 'comparison',
    expected_category: 'laptop',
    expected_hard_constraints: { in_stock_only: true },
    expected_soft_preferences: { weights: { portability: 0.5 } },
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-COMP-10',
    natural_language_query: 'Which is faster for compilation: Intel i5-13500H in DevForge or Ryzen 7 in CodeCraft?',
    group: 'comparison',
    expected_category: 'laptop',
    expected_hard_constraints: { in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: [],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-DEV15-02' },
    benchmark_version: 'v1.0'
  },

  // ==========================================
  // GROUP 8: BUNDLE / ACCESSORY (10 INTENTS)
  // ==========================================
  {
    benchmark_id: 'BENCH-BNDL-01',
    natural_language_query: 'I need a laptop, wireless mouse, and protective bag under ₹70,000 for coding.',
    group: 'bundle_accessory',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: ['mouse', 'bag'],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'AeroBook (62,999) + mouse (1,799) + sleeve (1,299) = 66,097 <= 70k' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BNDL-02',
    natural_language_query: 'Need a laptop and mouse under 70k with at least 16GB RAM.',
    group: 'bundle_accessory',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: ['mouse'],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BNDL-03',
    natural_language_query: 'Looking for a laptop and backpack under 68,000 with 16GB RAM for commute.',
    group: 'bundle_accessory',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 68000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: ['bag'],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'AeroBook (62,999) + Slim Backpack (2,499) = 65,498 <= 68k' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BNDL-04',
    natural_language_query: 'I need CarbonCraft 14 with a wireless mouse under 70,000.',
    group: 'bundle_accessory',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 70000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: ['mouse'],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-AERO14-01', notes: 'CarbonCraft + mouse exceeds 70k; AeroBook + mouse satisfies bundle under 70k' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BNDL-05',
    natural_language_query: 'Need a wireless mouse and laptop bag together under 4000.',
    group: 'bundle_accessory',
    expected_category: 'mouse',
    expected_hard_constraints: { budget_max: 4000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: ['mouse', 'bag'],
    expected_decision_characteristics: { expected_outcome: 'WON', notes: 'Accessory only bundle' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BNDL-06',
    natural_language_query: 'I need a laptop and bag under 65,000 with 16GB RAM.',
    group: 'bundle_accessory',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 65000, min_ram_gb: 16, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: ['bag'],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-FLEX14-11', notes: 'FlexBook 14 (59,999) + sleeve (1,299) = 61,298 <= 65k' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BNDL-07',
    natural_language_query: 'Developer bundle: laptop with 32GB RAM + mouse + backpack under 95,000.',
    group: 'bundle_accessory',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 95000, min_ram_gb: 32, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: ['mouse', 'bag'],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-PRO16-05', notes: 'WorkStation (89,999) + mouse (1,799) + transit bag (3,299) = 95,097 (tight) or sleeve' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BNDL-08',
    natural_language_query: 'Need a 13-inch laptop and matching compact sleeve under 68,000.',
    group: 'bundle_accessory',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 68000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: ['bag'],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-LITE13-06', notes: 'AirLite 13 (66,999) + UltraCompact Sleeve 13 (1,099) = 68,098 (near) or AeroBook' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BNDL-09',
    natural_language_query: 'Need an ultralight laptop and Bluetooth mouse under 72,000 for business travel.',
    group: 'bundle_accessory',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 72000, max_weight_g: 1300, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: ['mouse'],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CARBON14-13', notes: 'CarbonCraft (69,499) + SilentPro S20 (1,499) = 70,998 <= 72k' },
    benchmark_version: 'v1.0'
  },
  {
    benchmark_id: 'BENCH-BNDL-10',
    natural_language_query: 'Student bundle: budget laptop under 50k with mouse and backpack under 50k total.',
    group: 'bundle_accessory',
    expected_category: 'laptop',
    expected_hard_constraints: { budget_max: 50000, in_stock_only: true },
    expected_soft_preferences: {},
    requested_accessories: ['mouse', 'bag'],
    expected_decision_characteristics: { expected_outcome: 'WON', target_sku: 'NX-LP-CAMPUS-07', notes: 'Campus 14 (42,999) + mouse (899) + backpack (2,499) = 46,397 <= 50k' },
    benchmark_version: 'v1.0'
  }
];
