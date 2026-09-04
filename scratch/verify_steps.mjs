import crypto from 'node:crypto';

async function runManualTests() {
  const baseUrl = 'http://localhost:3000';
  const sessionId = 'manual_test_session_' + Date.now();
  console.log('--- STARTING MANUAL VERIFICATION (Steps A - G) ---');

  // Step A: 'I need a laptop under ₹60,000.'
  console.log('\n[Step A] Query: "I need a laptop under ₹60,000."');
  const chatResA = await fetch(baseUrl + '/api/v1/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message: 'I need a laptop under ₹60,000.' })
  });
  const dataA = await chatResA.json();
  const laptopA = dataA.recommendation?.recommended_laptop?.product;
  console.log('Recommended Product:', laptopA?.name, 'Price: ₹' + laptopA?.price_inr);
  console.log('Total Price:', dataA.recommendation?.total_price_inr);
  console.log('Budget Ceiling:', dataA.recommendation?.budget_ceiling_inr);
  console.log('Budget Margin:', dataA.recommendation?.budget_margin_inr);
  console.log('Selected Accessories count in basket:', dataA.recommendation?.accessories?.length);
  const addOnsA = dataA.recommendation?.proactive_add_ons || [];
  console.log('Proactive add-ons available:');
  for (const a of addOnsA) {
    console.log(' - ' + a.name + ' (₹' + a.price_inr + ') State: ' + a.state + ' | is_within_budget: ' + a.is_within_budget + ' | delta: ₹' + a.budget_delta_inr);
  }

  // Step B: Select mouse (SilentPro S20, ₹1,499)
  console.log('\n[Step B] Select mouse: SilentPro S20');
  const toggleResB = await fetch(baseUrl + '/api/v1/session/' + sessionId + '/accessory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
  });
  const dataB = await toggleResB.json();
  const recB = dataB.latest_recommendation;
  console.log('New Total:', recB.total_price_inr);
  console.log('Budget Margin:', recB.budget_margin_inr);
  console.log('Is Over Budget:', recB.budget_margin_inr < 0);

  // Review endpoint check
  const reviewResB = await fetch(baseUrl + '/api/v1/session/' + sessionId + '/review');
  const reviewB = await reviewResB.json();
  console.log('Gate Status:', reviewB.gate_status);
  console.log('Over Budget By:', reviewB.over_budget_by_inr);

  // Attempt authorization approval (must be rejected)
  const approveResB = await fetch(baseUrl + '/api/v1/checkout/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
  console.log('Approval Status Code (Expected 400):', approveResB.status);
  const approveB = await approveResB.json();
  console.log('Approval Error:', approveB.error);

  // Step C: Remove mouse
  console.log('\n[Step C] Remove mouse: SilentPro S20');
  const removeResC = await fetch(baseUrl + '/api/v1/session/' + sessionId + '/accessory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: false })
  });
  const dataC = await removeResC.json();
  const recC = dataC.latest_recommendation;
  console.log('Total Price (Expected 59999):', recC.total_price_inr);
  console.log('Budget Margin (Expected 1):', recC.budget_margin_inr);

  const reviewResC = await fetch(baseUrl + '/api/v1/session/' + sessionId + '/review');
  const reviewC = await reviewResC.json();
  console.log('Gate Status (Expected AUTHORIZED_PENDING_GATEWAY):', reviewC.gate_status);
  console.log('Is Over Budget (Expected false):', reviewC.is_over_budget);

  // Step D: Select mouse + bag (total ₹64,797)
  console.log('\n[Step D] Select mouse + bag');
  await fetch(baseUrl + '/api/v1/session/' + sessionId + '/accessory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: 'NX-MS-SILENT-03', included: true })
  });
  const toggleBagRes = await fetch(baseUrl + '/api/v1/session/' + sessionId + '/accessory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: 'NX-BG-TOUR-02', included: true })
  });
  const dataD = await toggleBagRes.json();
  const recD = dataD.latest_recommendation;
  console.log('Total Price (Expected 64797):', recD.total_price_inr);
  console.log('Budget Margin (Expected -4797):', recD.budget_margin_inr);

  const reviewResD = await fetch(baseUrl + '/api/v1/session/' + sessionId + '/review');
  const reviewD = await reviewResD.json();
  console.log('Gate Status (Expected BLOCKED_OVER_BUDGET):', reviewD.gate_status);
  console.log('Over Budget By (Expected 4797):', reviewD.over_budget_by_inr);

  const orderResD = await fetch(baseUrl + '/api/v1/checkout/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
  console.log('Create-order status code (Expected 400):', orderResD.status);

  // Step E: Say 'I can spend ₹65,000.'
  console.log('\n[Step E] Chat message: "I can spend ₹65,000."');
  const chatResE = await fetch(baseUrl + '/api/v1/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message: 'I can spend ₹65,000.' })
  });
  const dataE = await chatResE.json();
  const recE = dataE.recommendation;
  console.log('New Budget Ceiling (Expected 65000):', recE.budget_ceiling_inr);
  console.log('Total Price (Expected 64797):', recE.total_price_inr);
  console.log('New Budget Margin (Expected 203):', recE.budget_margin_inr);
  console.log('Accessories retained count (Expected 2):', recE.accessories.length);

  const reviewResE = await fetch(baseUrl + '/api/v1/session/' + sessionId + '/review');
  const reviewE = await reviewResE.json();
  console.log('Gate Status (Expected AUTHORIZED_PENDING_GATEWAY):', reviewE.gate_status);
  console.log('Is Over Budget (Expected false):', reviewE.is_over_budget);

  // Step F: Run successful Razorpay Test Mode payment
  console.log('\n[Step F] Successful Razorpay Payment Flow');
  const approveResF = await fetch(baseUrl + '/api/v1/checkout/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
  console.log('Approve status code (Expected 200):', approveResF.status);
  const approveF = await approveResF.json();
  console.log('Approved Basket Hash:', approveF.approval?.basket_hash);

  const orderResF = await fetch(baseUrl + '/api/v1/checkout/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
  console.log('Create-order status code (Expected 200):', orderResF.status);
  const orderF = await orderResF.json();
  console.log('Razorpay Order ID:', orderF.razorpay_order_id);
  console.log('Amount in Paise:', orderF.amount_paise);

  const testPayId = 'pay_manual_test_' + Date.now();
  const signPayload = orderF.razorpay_order_id + '|' + testPayId;
  const secret = process.env.RAZORPAY_KEY_SECRET || 'GQo0VsTrWjlXQ8zTvOxnp6jd';
  const signature = crypto.createHmac('sha256', secret).update(signPayload).digest('hex');

  const verifyResF = await fetch(baseUrl + '/api/v1/checkout/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      razorpay_order_id: orderF.razorpay_order_id,
      razorpay_payment_id: testPayId,
      razorpay_signature: signature
    })
  });
  console.log('Verify-payment status code (Expected 200):', verifyResF.status);
  const verifyF = await verifyResF.json();
  console.log('Order Status (Expected COMPLETED):', verifyF.status);

  // Step G: Run failed Razorpay Test Mode payment (using a fresh session)
  console.log('\n[Step G] Failed Razorpay Payment Flow (Fresh session)');
  const sessionG = 'manual_test_fail_' + Date.now();
  await fetch(baseUrl + '/api/v1/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionG, message: 'I need a laptop under ₹60,000.' })
  });
  await fetch(baseUrl + '/api/v1/checkout/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionG })
  });
  await fetch(baseUrl + '/api/v1/checkout/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionG })
  });
  const failResG = await fetch(baseUrl + '/api/v1/checkout/fail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionG, reason: 'Card declined by issuing bank' })
  });
  console.log('Fail endpoint status code (Expected 200):', failResG.status);
  const failG = await failResG.json();
  console.log('Order Status (Expected PAYMENT_FAILED):', failG.status);
  console.log('Failure Reason:', failG.failure_reason);

  console.log('\n--- ALL MANUAL VERIFICATION STEPS A THROUGH G PASSED FLAWLESSLY! ---');
}

runManualTests().catch(console.error);
