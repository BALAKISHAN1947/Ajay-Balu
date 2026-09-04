import { AgentOrchestrator } from '../agent/agentOrchestrator.ts';
import { getCatalogRepository } from '../repository/catalogRepository.ts';
import { getSessionManager } from '../session/sessionManager.ts';
import { DeterministicNLUProvider } from '../llm/llmProvider.ts';

function printHeader(title: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

function printTurn(turnNum: number, speaker: string, text: string) {
  console.log(`\n[TURN ${turnNum}] ${speaker.toUpperCase()}:`);
  console.log(`"${text}"`);
}

function printSection(title: string) {
  console.log('\n--- ' + title + ' ' + '-'.repeat(Math.max(5, 75 - title.length)));
}

async function runCustomerDemo() {
  const repo = getCatalogRepository();
  const sessionManager = getSessionManager(repo);
  const nluProvider = new DeterministicNLUProvider();
  const orchestrator = new AgentOrchestrator(nluProvider, repo, sessionManager);

  const sessionId = `demo_ses_${Date.now()}`;

  printHeader('AGENTREADY — MILESTONE 3: CUSTOMER-FACING EXPERIENCE & SESSION GATE');
  console.log('Merchant Partner: Nexora Technologies (Indian D2C Electronics, Bengaluru)');
  console.log('Session ID:', sessionId);
  console.log('Architecture: Customer UI / Conversational Flow -> Agent API -> Decision Engine');

  // TURN 1: Initial Customer Request
  const query1 = 'I need a laptop for coding under ₹70,000. I travel every day, so I want something light with good battery life, at least 16GB RAM, and I also need a mouse and laptop bag.';
  printTurn(1, 'Customer', query1);

  const res1 = await orchestrator.processMessage(query1, sessionId);

  printSection('AGENT RESPONSE & VERIFIED RECOMMENDATION');
  console.log(res1.explanation);

  const rec = res1.recommendation!;
  printSection('AUTHORITATIVE BUNDLE STATE');
  rec.itemized_line_items.forEach((it) => {
    console.log(`• ${it.name.padEnd(45)} ₹${it.price_inr.toLocaleString('en-IN')}`);
  });
  console.log('  ' + '-'.repeat(55));
  console.log(`  Total Basket Price:                       ₹${rec.total_price_inr.toLocaleString('en-IN')}`);
  console.log(`  Customer Budget Ceiling:                  ₹${rec.budget_ceiling_inr.toLocaleString('en-IN')}`);
  console.log(`  Unused Budget Margin:                     ₹${rec.budget_margin_inr.toLocaleString('en-IN')} (Under Budget)`);

  // TURN 2: Why did you choose AeroBook?
  const query2 = 'Why did you choose AeroBook?';
  printTurn(2, 'Customer', query2);

  const res2 = await orchestrator.processMessage(query2, sessionId);
  printSection('AGENT GROUNDED EXPLANATION');
  console.log(res2.explanation);

  // TURN 3: Remove the mouse
  const query3 = 'Remove the mouse.';
  printTurn(3, 'Customer', query3);

  const res3 = await orchestrator.processMessage(query3, sessionId);
  printSection('UPDATED AUTHORITATIVE BUNDLE');
  console.log(res3.explanation);

  const recUpdated = res3.recommendation!;
  recUpdated.itemized_line_items.forEach((it) => {
    console.log(`• ${it.name.padEnd(45)} ₹${it.price_inr.toLocaleString('en-IN')}`);
  });
  console.log('  ' + '-'.repeat(55));
  console.log(`  Recalculated Basket Price:                ₹${recUpdated.total_price_inr.toLocaleString('en-IN')}`);
  console.log(`  Remaining Budget Margin:                  ₹${recUpdated.budget_margin_inr.toLocaleString('en-IN')} (Under Budget)`);

  // TURN 4: Review my purchase
  const query4 = 'Review my purchase.';
  printTurn(4, 'Customer', query4);

  const review = sessionManager.generatePurchaseReview(sessionId);
  printSection('IMMUTABLE PURCHASE REVIEW (MILESTONE 3 GATE)');
  console.log(`• Primary Product:   ${review.primary_product.name} (SKU: ${review.primary_product.sku}, Variant: ${review.primary_product.variant_id})`);
  console.log(`  - Price:           ₹${review.primary_product.price_inr.toLocaleString('en-IN')}`);
  console.log(`  - Stock Status:    ${review.primary_product.stock} units verified in warehouse`);
  console.log(`  - Verified Specs:  ${review.primary_product.ram_summary}, ${review.primary_product.storage_summary}, ${review.primary_product.battery_wh}Wh`);
  console.log(`• Accessories:`);
  review.accessories.forEach((a) => {
    console.log(`  - ${a.name} (₹${a.price_inr.toLocaleString('en-IN')}) — ${a.compatibility_reason}`);
  });
  console.log(`• Verified Total:    ₹${review.final_total_inr.toLocaleString('en-IN')} (Customer Budget: ₹${review.customer_budget_inr.toLocaleString('en-IN')})`);
  console.log(`• Session Audit ID:  ${review.session_id}`);
  console.log(`• Audit Events:      ${review.audit_events_count} logged events`);
  console.log(`• Gate Status:       ${review.gate_status}`);
  console.log(`\n[Action Button Placeholder]: [ Continue to Razorpay (Deferred to Milestone 4) ]`);

  printHeader('MILESTONE 3 CUSTOMER DEMONSTRATION COMPLETE');
}

runCustomerDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
