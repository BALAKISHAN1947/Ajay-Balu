import { AgentOrchestrator } from '../agent/agentOrchestrator.ts';
import { getCatalogRepository } from '../repository/catalogRepository.ts';
import { DeterministicNLUProvider } from '../llm/llmProvider.ts';

function printHeader(title: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

function printSection(title: string) {
  console.log('\n--- ' + title + ' ' + '-'.repeat(Math.max(5, 75 - title.length)));
}

async function runAgentDemo() {
  const repo = getCatalogRepository();
  const nluProvider = new DeterministicNLUProvider();
  const orchestrator = new AgentOrchestrator(nluProvider, repo);

  printHeader('AGENTREADY — MILESTONE 2: NATURAL-LANGUAGE COMMERCE AGENT DEMO');
  console.log('Merchant Partner: Nexora Technologies (Indian D2C Electronics, Bengaluru)');
  console.log('Architecture: LLM NLU Interface + Authoritative Deterministic Engine');

  const customerQuery =
    'I need a laptop for coding under ₹70,000. I travel every day, so I want something light with good battery life, at least 16GB RAM, and I also need a mouse and laptop bag.';

  printSection('1. RAW CUSTOMER MESSAGE');
  console.log(`"${customerQuery}"`);

  // Run the agent orchestrator
  const response = await orchestrator.processMessage(customerQuery);

  printSection('2. EXTRACTED & VALIDATED CUSTOMER INTENT (NLU)');
  const intent = response.intent!;
  console.log('JSON Intent Payload:');
  console.log(JSON.stringify(intent, null, 2));

  printSection('3. HARD CONSTRAINTS (DETERMINISTIC BOUNDARIES)');
  console.log(`• Maximum Total Budget:      ₹${intent.hard_constraints.max_total_budget?.toLocaleString('en-IN')}`);
  console.log(`• Minimum RAM Required:      ${intent.hard_constraints.min_ram_gb}GB`);
  console.log(`• Required Categories:       [${intent.required_categories.join(', ')}]`);
  console.log(`• In-Stock Enforced:         ${intent.hard_constraints.in_stock_only}`);

  printSection('4. SOFT PREFERENCES (WEIGHTED UTILITY FACTORS)');
  console.log(`• Mobility Target Weight:    <= ${(intent.soft_preferences.max_preferred_weight_g ?? 1400) / 1000} kg (Weight: ${intent.soft_preferences.weights.portability})`);
  console.log(`• Battery Target Capacity:   >= ${intent.soft_preferences.min_preferred_battery_wh ?? 55}Wh (Weight: ${intent.soft_preferences.weights.battery})`);
  console.log(`• Longevity & Architecture:  (Weight: ${intent.soft_preferences.weights.longevity})`);
  console.log(`• Accessory Preferences:     Bluetooth Mouse: ${intent.soft_preferences.prefer_bluetooth_mouse ?? true}, Bag: ${intent.soft_preferences.preferred_bag_type ?? 'backpack'}`);

  const rec = response.recommendation!;

  printSection(`5. DETERMINISTIC REJECTIONS LOG (${rec.rejections.length} EXCLUSIONS)`);
  rec.rejections.slice(0, 5).forEach((rej, idx) => {
    console.log(`  [${idx + 1}] SKU: ${rej.sku.padEnd(20)} Rule: ${rej.rule.padEnd(26)} Actual: ${String(rej.actual).padEnd(10)} Required: ${String(rej.required)}`);
    console.log(`      Reason: ${rej.reason}`);
  });

  printSection('6. WINNING PRIMARY LAPTOP (LOCKED VARIANT)');
  const locked = rec.locked_variant!;
  console.log(`• Model:             ${locked.name} (${locked.sku})`);
  console.log(`• Locked Variant:    ${locked.variant_id}`);
  console.log(`• Verified Memory:   ${locked.ram_summary}`);
  console.log(`• Verified Storage:  ${locked.storage_summary}`);
  console.log(`• Chassis Weight:    ${(rec.recommended_laptop!.product.weight_g / 1000).toFixed(2)} kg`);
  console.log(`• Base Unit Price:   ₹${locked.price_inr.toLocaleString('en-IN')}`);
  console.log(`• Inventory Stock:   ${locked.stock_quantity} units available`);

  printSection('7. COMPATIBLE ACCESSORY SELECTIONS & PROOF');
  rec.compatibility_checks.forEach((chk) => {
    const status = chk.compatible ? 'PASS [COMPATIBLE]' : 'FAIL [INCOMPATIBLE]';
    console.log(`• ${status} — ${chk.accessory_category.toUpperCase()} (${chk.accessory_sku}):`);
    console.log(`    ${chk.reason}`);
  });

  printSection('8. GROUNDED HARDWARE TRADE-OFFS');
  rec.trade_offs.forEach((t) => console.log(`• ${t}`));

  printSection('9. FINAL BUNDLE BREAKDOWN & TOTAL ARITHMETIC');
  rec.itemized_line_items.forEach((item) => {
    console.log(`• ${item.name.padEnd(45)} ₹${item.price_inr.toLocaleString('en-IN')}`);
  });
  console.log('  ' + '-'.repeat(55));
  console.log(`  Total Basket Price:                       ₹${rec.total_price_inr.toLocaleString('en-IN')}`);
  console.log(`  Customer Budget Ceiling:                  ₹${rec.budget_ceiling_inr.toLocaleString('en-IN')}`);
  console.log(`  Unused Budget Margin:                     ₹${rec.budget_margin_inr.toLocaleString('en-IN')} (Under Budget)`);
  console.log(`  Engine Decision Confidence:               ${(rec.confidence_score * 100).toFixed(0)}%`);

  printSection('10. GROUNDED LLM EXPLANATION (VERIFIED FACTS ONLY)');
  console.log(response.explanation);

  printHeader('MILESTONE 2 DEMONSTRATION COMPLETE');
}

runAgentDemo().catch((err) => {
  console.error('Agent demo error:', err);
  process.exit(1);
});
