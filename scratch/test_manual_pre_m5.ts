async function runManualTests() {
  const base = 'http://localhost:3000/api/v1';

  console.log('==================================================');
  console.log('RUNNING MANUAL TESTS A THROUGH G (PRE-MILESTONE 5)');
  console.log('==================================================\n');

  // Test A: "I need a laptop under ₹70,000."
  const sesA = 'ses_man_a_' + Date.now();
  console.log('--- TEST A: "I need a laptop under ₹70,000." ---');
  const resA = await fetch(base + '/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sesA, message: 'I need a laptop under ₹70,000.' })
  });
  const dA = await resA.json();
  console.log('State:', dA.state);
  console.log('Recommended laptop:', dA.recommendation?.recommended_laptop?.product?.name, '@ ₹' + dA.recommendation?.recommended_laptop?.product?.price_inr);
  console.log('Basket total:', '₹' + dA.recommendation?.total_price_inr, '(Budget: ₹' + dA.recommendation?.budget_ceiling_inr + ')');
  console.log('Proactive add-ons:');
  dA.recommendation?.proactive_add_ons?.forEach((addon: any) => {
    console.log(`  - [${addon.state}] ${addon.name}: +₹${addon.price_inr}, New total: ₹${addon.new_total_inr}${addon.budget_delta_inr ? `, Over budget: ₹${addon.budget_delta_inr}` : ''}`);
  });
  console.log('');

  // Test B: "I need a laptop and mouse under ₹70,000."
  console.log('--- TEST B: "I need a laptop and mouse under ₹70,000." ---');
  const resB = await fetch(base + '/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I need a laptop and mouse under ₹70,000.' })
  });
  const dB = await resB.json();
  console.log('State:', dB.state);
  console.log('Recommended laptop:', dB.recommendation?.recommended_laptop?.product?.name, '@ ₹' + dB.recommendation?.recommended_laptop?.product?.price_inr);
  console.log('Line items in bundle:');
  dB.recommendation?.itemized_line_items?.forEach((it: any) => console.log(`  - ${it.name} [₹${it.price_inr}]`));
  console.log('Total basket price:', '₹' + dB.recommendation?.total_price_inr, 'Budget ceiling: ₹' + dB.recommendation?.budget_ceiling_inr);
  console.log('Strictly within ₹70,000 budget:', dB.recommendation?.total_price_inr <= 70000);
  console.log('');

  // Test C: "I need a laptop under ₹70,000 and I can spend ₹72,000 if needed."
  console.log('--- TEST C: "I need a laptop under ₹70,000 and I can spend ₹72,000 if needed." ---');
  const resC = await fetch(base + '/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I need a laptop under ₹70,000 and I can spend ₹72,000 if needed.' })
  });
  const dC = await resC.json();
  console.log('State:', dC.state);
  console.log('Recommended laptop:', dC.recommendation?.recommended_laptop?.product?.name, '@ ₹' + dC.recommendation?.recommended_laptop?.product?.price_inr);
  console.log('Authoritative budget ceiling:', '₹' + dC.recommendation?.budget_ceiling_inr);
  console.log('Proactive add-ons:');
  dC.recommendation?.proactive_add_ons?.forEach((addon: any) => {
    console.log(`  - [${addon.state}] ${addon.name}: +₹${addon.price_inr}, New total: ₹${addon.new_total_inr}${addon.budget_delta_inr ? `, Over budget: ₹${addon.budget_delta_inr}` : ''}`);
  });
  console.log('');

  // Test D: "I need a laptop for ₹0."
  console.log('--- TEST D: "I need a laptop for ₹0." ---');
  const resD = await fetch(base + '/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I need a laptop for ₹0.' })
  });
  const dD = await resD.json();
  console.log('State:', dD.state);
  console.log('Explanation:', dD.explanation);
  console.log('No recommendation generated:', dD.recommendation === undefined || dD.recommendation === null);
  console.log('');

  // Test E: "I need a laptop for -₹500."
  console.log('--- TEST E: "I need a laptop for -₹500." ---');
  const resE = await fetch(base + '/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I need a laptop for -₹500.' })
  });
  const dE = await resE.json();
  console.log('State:', dE.state);
  console.log('Explanation:', dE.explanation);
  console.log('No recommendation generated:', dE.recommendation === undefined || dE.recommendation === null);
  console.log('');

  // Test F: "Add a compatible mouse." (in session from Test A)
  console.log('--- TEST F: "Add a compatible mouse." (Follow-up to Test A) ---');
  const resF = await fetch(base + '/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sesA, message: 'Add a compatible mouse.' })
  });
  const dF = await resF.json();
  console.log('State:', dF.state);
  console.log('Explanation:', dF.explanation?.split('\n')[0]);
  console.log('Updated Line items:');
  dF.recommendation?.itemized_line_items?.forEach((it: any) => console.log(`  - ${it.name} [₹${it.price_inr}]`));
  console.log('Updated Total:', '₹' + dF.recommendation?.total_price_inr);
  console.log('');

  // Test G: "Remove the mouse." (in session from Test F)
  console.log('--- TEST G: "Remove the mouse." (Follow-up to Test F) ---');
  const resG = await fetch(base + '/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sesA, message: 'Remove the mouse.' })
  });
  const dG = await resG.json();
  console.log('State:', dG.state);
  console.log('Explanation:', dG.explanation);
  console.log('Line items after removal:');
  dG.recommendation?.itemized_line_items?.forEach((it: any) => console.log(`  - ${it.name} [₹${it.price_inr}]`));
  console.log('Total after removal:', '₹' + dG.recommendation?.total_price_inr);
  console.log('Returned to base laptop price:', dG.recommendation?.total_price_inr === dA.recommendation?.recommended_laptop?.product?.price_inr);
  console.log('');
}

runManualTests().catch(console.error);
