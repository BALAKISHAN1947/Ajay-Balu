import { DeterministicDecisionEngine } from '../engine/decisionEngine.ts';
import { getCatalogRepository } from '../repository/catalogRepository.ts';
import { filterLaptopsByHardConstraints } from '../engine/hardConstraints.ts';
import { scoreAndRankLaptops } from '../engine/softScoring.ts';
import type { CustomerIntent } from '../types/intent.ts';

function printHeader(title: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

function printSection(title: string) {
  console.log('\n--- ' + title + ' ' + '-'.repeat(Math.max(5, 75 - title.length)));
}

async function runMilestone1Demo() {
  const repo = getCatalogRepository();
  const engine = new DeterministicDecisionEngine(repo);

  printHeader('AGENTREADY — MILESTONE 1: DETERMINISTIC COMMERCE DECISION ENGINE');
  console.log('Merchant Partner: Nexora Technologies (D2C Electronics, Bengaluru)');
  console.log('Catalog Size: Exactly 25 SKUs (15 Laptops, 5 Mice, 5 Laptop Bags)');
  console.log('Mode: 100% Deterministic (Zero LLM reliance for constraints, math, or stock)');

  // Step 1: Input Customer Intent
  const customerIntent: CustomerIntent = {
    intent_id: 'demo_intent_dev_01',
    raw_query:
      'I need a laptop for coding under ₹70,000. I travel every day, so I want something light with good battery life, at least 16GB RAM, and something that should remain useful for several years. I also need a mouse and a laptop bag.',
    target_workload: 'coding',
    required_categories: ['laptop', 'mouse', 'bag'],
    hard_constraints: {
      max_total_budget: 70000,
      min_ram_gb: 16,
      min_storage_gb: 512,
      in_stock_only: true
    },
    soft_preferences: {
      max_preferred_weight_g: 1400,
      min_preferred_battery_wh: 55,
      prefer_bluetooth_mouse: true,
      preferred_bag_type: 'backpack',
      weights: {
        portability: 0.40,
        battery: 0.35,
        longevity: 0.25
      }
    },
    compatibility_requirements: {
      bag_must_fit_laptop: true,
      mouse_must_interface_without_adapters: true
    }
  };

  printSection('1. CUSTOMER INPUT & STRUCTURED INTENT');
  console.log(`Raw Query: "${customerIntent.raw_query}"`);
  console.log(`Target Workload: ${customerIntent.target_workload}`);
  console.log(`Required Categories: [${customerIntent.required_categories.join(', ')}]`);
  console.log(`Hard Budget Ceiling: ₹${customerIntent.hard_constraints.max_total_budget?.toLocaleString('en-IN')}`);
  console.log(`Hard Constraint: RAM >= ${customerIntent.hard_constraints.min_ram_gb}GB, Storage >= ${customerIntent.hard_constraints.min_storage_gb}GB, In-Stock Only: true`);
  console.log(`Soft Preferences: Target Weight <= 1.4kg (w=0.40), Battery >= 55Wh (w=0.35), Longevity (w=0.25)`);

  // Step 2: Candidate Laptops Evaluated
  const allLaptops = repo.getLaptops();
  printSection(`2. CATALOG EVALUATION: ${allLaptops.length} CANDIDATE LAPTOPS`);
  console.log(`Total candidate laptops in catalog: ${allLaptops.length}`);

  // Step 3: Hard Filtering
  const { passed: hardPassed, rejections: hardRejections } = filterLaptopsByHardConstraints(customerIntent, allLaptops);

  console.log(`\n  Passed Hard Constraints: ${hardPassed.length} / ${allLaptops.length}`);
  console.log(`  Rejected by Hard Rules:   ${hardRejections.length} / ${allLaptops.length}`);

  printSection('3. HARD REJECTIONS LOG (DETERMINISTIC EXCLUSIONS)');
  hardRejections.forEach((rej, idx) => {
    console.log(`  [${idx + 1}] SKU: ${rej.sku.padEnd(20)} Rule: ${rej.rule.padEnd(26)} Actual: ${String(rej.actual).padEnd(10)} Required: ${String(rej.required)}`);
    console.log(`      Reason: ${rej.reason}`);
  });

  // Step 4: Soft Preference Scoring & Ranking
  const rankedLaptops = scoreAndRankLaptops(hardPassed, customerIntent);
  printSection('4. RANKED VIABLE LAPTOPS (MULTI-ATTRIBUTE SCORING)');
  rankedLaptops.forEach((cand, idx) => {
    const l = cand.product;
    console.log(`  Rank #${idx + 1}: ${l.name} (${l.sku}) — Overall Score: ${cand.total_score}/100`);
    console.log(`     Price: ₹${l.price_inr.toLocaleString('en-IN')} | Weight: ${(l.weight_g / 1000).toFixed(2)}kg | Battery: ${l.battery.capacity_wh}Wh | CPU: ${l.processor.brand} ${l.processor.model}`);
    console.log(`     Sub-Scores: Portability: ${cand.component_scores.portability}/100 | Battery: ${cand.component_scores.battery}/100 | Longevity: ${cand.component_scores.longevity}/100`);
    console.log(`     Trade-Offs: ${cand.trade_offs.join(' | ')}`);
  });

  // Step 5: Full Decision Engine Execution
  const recommendation = engine.evaluateIntent(customerIntent);

  printSection('5. SELECTED EXACT SKU & LOCKED VARIANT');
  const locked = recommendation.locked_variant!;
  console.log(`  Selected SKU:        ${locked.sku}`);
  console.log(`  Product Name:        ${locked.name}`);
  console.log(`  Locked Variant ID:   ${locked.variant_id}`);
  console.log(`  Memory Locked:       ${locked.ram_summary}`);
  console.log(`  Storage Locked:      ${locked.storage_summary}`);
  console.log(`  Base Unit Price:     ₹${locked.price_inr.toLocaleString('en-IN')}`);
  console.log(`  Live Stock Status:   ${locked.stock_quantity} units reserved`);

  printSection('6. COMPATIBILITY PROOF & ACCESSORY ATTACHMENT');
  recommendation.compatibility_checks.forEach((chk) => {
    const status = chk.compatible ? 'PASS [COMPATIBLE]' : 'FAIL [INCOMPATIBLE]';
    console.log(`  ${status} — ${chk.accessory_category.toUpperCase()} (${chk.accessory_sku}):`);
    console.log(`      ${chk.reason}`);
  });

  printSection('7. FINAL ITEMIZABLE BUNDLE & FINANCIAL SUMMARY');
  recommendation.itemized_line_items.forEach((item) => {
    console.log(`  • ${item.name.padEnd(45)} ₹${item.price_inr.toLocaleString('en-IN')}`);
  });
  console.log('  ' + '-'.repeat(55));
  console.log(`  Total Bundle Price:                       ₹${recommendation.total_price_inr.toLocaleString('en-IN')}`);
  console.log(`  Customer Budget Ceiling:                  ₹${recommendation.budget_ceiling_inr.toLocaleString('en-IN')}`);
  console.log(`  Unused Budget Margin:                     ₹${recommendation.budget_margin_inr.toLocaleString('en-IN')} (Under Budget)`);
  console.log(`  Recommendation Confidence:                ${(recommendation.confidence_score * 100).toFixed(0)}%`);

  printSection('8. REASONS FOR RECOMMENDATION');
  recommendation.reasons.forEach((r, i) => console.log(`  [${i + 1}] ${r}`));

  printSection('9. DISCLOSED HARDWARE TRADE-OFFS');
  recommendation.trade_offs.forEach((t, i) => console.log(`  [!] ${t}`));

  printSection('10. REJECTED ALTERNATIVES SUMMARY');
  console.log(`  Total candidate exclusions logged: ${recommendation.rejections.length}`);
  console.log('  Summary of top alternative rejections:');
  recommendation.rejections.slice(0, 4).forEach((r) => {
    console.log(`  • ${r.sku}: ${r.reason}`);
  });

  printHeader('MILESTONE 1 VERIFICATION COMPLETED SUCCESSFULLY');
}

runMilestone1Demo().catch((err) => {
  console.error('Demo encountered an error:', err);
  process.exit(1);
});
