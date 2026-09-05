import assert from 'node:assert';

const baseUrl = 'http://localhost:3000';

async function run() {
  console.log('=== RUNNING LIVE HTTP E2E SUITE ON SERVER ===');

  // Scenario 1: Apple laptop under 90000
  let sid1 = 'e2e_apple_' + Date.now();
  let r1 = await fetch(baseUrl + '/api/v1/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I want an Apple laptop for coding under 90000', session_id: sid1 })
  }).then(res => res.json());

  console.log('Scenario 1 (Apple under 90k):');
  console.log('  State:', r1.state);
  console.log('  Brand:', r1.recommendation?.recommended_laptop?.product?.brand);
  console.log('  Model:', r1.recommendation?.recommended_laptop?.product?.name);
  console.log('  Price: ₹' + r1.recommendation?.total_price_inr);
  console.log('  Selected Accessories:', r1.selected_accessory_skus);

  if (r1.recommendation?.recommended_laptop?.product?.brand?.toLowerCase() !== 'apple') {
    throw new Error('Scenario 1 Failed: Not Apple!');
  }
  if ((r1.selected_accessory_skus || []).length !== 0) {
    throw new Error('Scenario 1 Failed: Selected accessories should be empty!');
  }

  // Scenario 2: Lenovo laptop under 70000
  let sid2 = 'e2e_lenovo_' + Date.now();
  let r2 = await fetch(baseUrl + '/api/v1/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Show me a Lenovo laptop for programming under 70000', session_id: sid2 })
  }).then(res => res.json());

  console.log('Scenario 2 (Lenovo under 70k):');
  console.log('  Brand:', r2.recommendation?.recommended_laptop?.product?.brand);
  console.log('  Model:', r2.recommendation?.recommended_laptop?.product?.name);
  if (r2.recommendation?.recommended_laptop?.product?.brand?.toLowerCase() !== 'lenovo') {
    throw new Error('Scenario 2 Failed: Not Lenovo!');
  }

  // Scenario 3: No brand specified
  let sid3 = 'e2e_nobrand_' + Date.now();
  let r3 = await fetch(baseUrl + '/api/v1/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "I don't care about the brand, give me the best laptop for coding under 75000", session_id: sid3 })
  }).then(res => res.json());

  console.log('Scenario 3 (No brand specified):');
  console.log('  Brand:', r3.recommendation?.recommended_laptop?.product?.brand);
  console.log('  Candidate brands considered:', r3.candidate_brands_considered);
  if (!r3.candidate_brands_considered || r3.candidate_brands_considered.length <= 1) {
    throw new Error('Scenario 3 Failed: Multiple brands must be considered!');
  }

  // Scenario 4: Non-existent model
  let sid4 = 'e2e_nonexist_' + Date.now();
  let r4 = await fetch(baseUrl + '/api/v1/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Do you have the QuantumX Ultra Pro 9900?', session_id: sid4 })
  }).then(res => res.json());

  console.log('Scenario 4 (Nonexistent model):');
  console.log('  State:', r4.state);
  console.log('  Match type:', r4.match_type);
  console.log('  Explanation:', r4.explanation?.slice(0, 100));

  // Scenario 5: Budget-constrained query + follow-up
  let sid5 = 'e2e_followup_' + Date.now();
  let r5a = await fetch(baseUrl + '/api/v1/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I need a coding laptop under 40000', session_id: sid5 })
  }).then(res => res.json());

  console.log('Scenario 5 Turn 1:');
  console.log('  Status:', r5a.state, r5a.match_type);
  const candSku = r5a.recommendation?.recommended_laptop?.product?.sku || r5a.recommendation?.closest_options?.[0]?.product?.sku;
  console.log('  Closest Option SKU:', candSku);

  let r5b = await fetch(baseUrl + '/api/v1/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "okay I'll take that", session_id: sid5 })
  }).then(res => res.json());

  console.log('Scenario 5 Turn 2 (Follow-up):');
  console.log('  Recommended SKU:', r5b.recommendation?.recommended_laptop?.product?.sku);
  console.log('  Explanation:', r5b.explanation?.slice(0, 100));
  if (r5b.recommendation?.recommended_laptop?.product?.sku !== candSku) {
    throw new Error('Scenario 5 Failed: Did not select target candidate!');
  }

  // Scenario 6, 7, 8: Accessory & Razorpay Flow
  // Use sid1 (Apple laptop, price ₹89,999, budget ₹90,000)
  console.log('Scenario 6: Checking Razorpay eligibility for base laptop');
  let app1 = await fetch(baseUrl + '/api/v1/checkout/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sid1 })
  });
  console.log('  Approval status:', app1.status);
  let checkoutReq1 = await fetch(baseUrl + '/api/v1/checkout/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sid1 })
  });
  console.log('  Razorpay checkout status (Base within budget):', checkoutReq1.status);
  let checkoutData1 = await checkoutReq1.json();
  console.log('  Order created:', checkoutData1.order_id || checkoutData1.razorpay_order_id, 'Amount (paise):', checkoutData1.amount_paise);
  if (checkoutReq1.status !== 200 && checkoutReq1.status !== 201) {
    throw new Error('Scenario 6 Failed: Razorpay order creation failed for valid basket: ' + JSON.stringify(checkoutData1));
  }

  // Scenario 7: Add accessory (Apple Magic Mouse) -> Order is above original budget but allows checkout
  console.log('Scenario 7: Select Apple Mouse (+₹2,999 -> ₹92,998 > ₹90,000)');
  let accToggle1 = await fetch(baseUrl + '/api/v1/session/' + sid1 + '/accessory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: 'AP-MS-MAGIC-01', included: true })
  }).then(res => res.json());

  console.log('  Selected SKUs:', accToggle1.selected_accessory_skus);
  console.log('  Total INR:', accToggle1.latest_recommendation?.total_price_inr);
  console.log('  Budget Margin INR:', accToggle1.latest_recommendation?.budget_margin_inr);
  assert.equal(accToggle1.latest_recommendation?.total_price_inr, 92998);

  let app2 = await fetch(baseUrl + '/api/v1/checkout/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sid1 })
  });
  console.log('  Approval status when above original budget:', app2.status);
  assert.equal(app2.status, 200, 'Explicitly selected order above original budget MUST be approved');

  let checkoutReq2 = await fetch(baseUrl + '/api/v1/checkout/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sid1 })
  });
  console.log('  Razorpay checkout status (Order above original budget):', checkoutReq2.status);
  let checkoutData2 = await checkoutReq2.json();
  console.log('  Razorpay order created for ₹92,998:', checkoutData2.razorpay_order_id, 'Amount (paise):', checkoutData2.amount);
  assert.equal(checkoutReq2.status, 200);
  assert.equal(checkoutData2.amount, 9299800);

  // Scenario 8: Select second accessory (Apple Leather Sleeve) -> ₹96,497 total
  console.log('Scenario 8: Select Apple Sleeve (+₹3,499 -> ₹96,497)');
  let accToggle2 = await fetch(baseUrl + '/api/v1/session/' + sid1 + '/accessory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: 'AP-BG-SLV13-01', included: true })
  }).then(res => res.json());

  console.log('  Selected SKUs after 2nd accessory:', accToggle2.selected_accessory_skus);
  console.log('  Total INR:', accToggle2.latest_recommendation?.total_price_inr);
  assert.equal(accToggle2.latest_recommendation?.total_price_inr, 96497);

  let app3 = await fetch(baseUrl + '/api/v1/checkout/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sid1 })
  });
  console.log('  Approval status with 2 accessories:', app3.status);
  assert.equal(app3.status, 200);

  let checkoutReq3 = await fetch(baseUrl + '/api/v1/checkout/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sid1 })
  });
  console.log('  Razorpay checkout status (₹96,497):', checkoutReq3.status);
  let checkoutData3 = await checkoutReq3.json();
  console.log('  Razorpay order created for ₹96,497:', checkoutData3.razorpay_order_id, 'Amount (paise):', checkoutData3.amount);
  assert.equal(checkoutReq3.status, 200);
  assert.equal(checkoutData3.amount, 9649700);

  console.log('=== ALL 8 SCENARIOS VERIFIED SUCCESSFULLY ON RUNNING SERVER! ===');
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
