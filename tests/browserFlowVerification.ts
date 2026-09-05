import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = 'http://localhost:3000';

async function testLiveFlow() {
  console.log('=== LIVE BROWSER FLOW VERIFICATION (SECTION 14) ===');

  // 1. Static asset verification: check forbidden phrases
  const appJs = fs.readFileSync(path.join(process.cwd(), 'public', 'app.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');

  assert.ok(!appJs.includes('These accessories are optional'), 'Forbidden phrase: "These accessories are optional" must not exist');
  assert.ok(!appJs.includes('Remove an accessory to continue within your budget'), 'Forbidden phrase: "Remove an accessory to continue within your budget" must not exist');
  assert.ok(!appJs.includes('Increase Budget'), 'Forbidden CTA: "Increase Budget" must not exist');
  assert.ok(!indexHtml.includes('Increase Budget'), 'Forbidden CTA: "Increase Budget" must not exist in index.html');
  assert.ok(appJs.includes('Your selected order is ₹'), 'Informational budget line must exist in app.js');
  assert.ok(appJs.includes('above your original budget'), 'Informational budget text must exist in app.js');
  console.log('✔ Static asset check: All forbidden phrases absent; neutral budget info present.');

  // 2. Query live server: Customer: "I want an Apple laptop for coding under 90000"
  const sessionId = 'browser_live_test_' + Date.now();
  const agentRes = await fetch(`${baseUrl}/api/v1/agent/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'I want an Apple laptop for coding under 90000',
      session_id: sessionId
    })
  });
  assert.strictEqual(agentRes.status, 200);
  const agentData = await agentRes.json() as any;

  // 3. Verify primary recommendation and accessories initially unchecked
  assert.strictEqual(agentData.recommendation.recommended_laptop.product.brand, 'Apple');
  assert.strictEqual(agentData.recommendation.recommended_laptop.product.name, 'Apple MacBook Air 13 M2');
  assert.strictEqual(agentData.recommendation.total_price_inr, 89999);
  assert.deepStrictEqual(agentData.selected_accessory_skus, []);
  console.log('✔ Recommendation: Apple MacBook Air 13 M2 (₹89,999), selected accessories initially []');

  // Verify proactive add-ons are Apple-specific
  const addOns = agentData.recommendation.proactive_add_ons || [];
  const mouse = addOns.find((a: any) => a.sku === 'AP-MS-MAGIC-01' || a.category === 'mouse');
  const sleeve = addOns.find((a: any) => a.sku === 'AP-BG-SLV13-01' || a.category === 'bag');
  assert.ok(mouse, 'Apple Magic Mouse must be recommended');
  assert.ok(sleeve, 'Apple Leather Sleeve must be recommended');
  console.log('✔ Recommended accessories: Apple Magic Bluetooth Mouse & Apple Leather Sleeve');

  // 4. Select Apple Magic Bluetooth Mouse
  const toggle1Res = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: mouse.sku, included: true })
  });
  assert.strictEqual(toggle1Res.status, 200);
  const toggle1Data = await toggle1Res.json() as any;
  assert.deepStrictEqual(toggle1Data.selected_accessory_skus, [mouse.sku]);
  assert.strictEqual(toggle1Data.latest_recommendation.total_price_inr, 92998);
  console.log('✔ Selected Apple Magic Mouse: Total = ₹92,998 (Order above original budget of ₹90,000)');

  // 5. Select Apple Leather Sleeve
  const toggle2Res = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: sleeve.sku, included: true })
  });
  assert.strictEqual(toggle2Res.status, 200);
  const toggle2Data = await toggle2Res.json() as any;
  assert.deepStrictEqual(toggle2Data.selected_accessory_skus, [mouse.sku, sleeve.sku]);
  assert.strictEqual(toggle2Data.latest_recommendation.total_price_inr, 96497);
  console.log('✔ Selected Apple Leather Sleeve: Total = ₹96,497 (₹6,497 above original budget)');

  // 6. Review order gate status: must NOT be BLOCKED_OVER_BUDGET
  const reviewRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);
  assert.strictEqual(reviewRes.status, 200);
  const reviewData = await reviewRes.json() as any;
  assert.strictEqual(reviewData.gate_status, 'AUTHORIZED_PENDING_GATEWAY');
  assert.strictEqual(reviewData.is_over_budget, true);
  assert.strictEqual(reviewData.over_budget_by_inr, 6497);
  assert.strictEqual(reviewData.final_total_inr, 96497);
  assert.strictEqual(reviewData.customer_budget_inr, 90000);
  console.log('✔ Review endpoint: gate_status = AUTHORIZED_PENDING_GATEWAY, is_over_budget = true (informational)');

  // 7. Approve purchase: customer explicitly chose the order
  const approveRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
  assert.strictEqual(approveRes.status, 200);
  const approveData = await approveRes.json() as any;
  assert.ok(approveData.approval.approval_id);
  console.log('✔ Order approval successful: Approval ID =', approveData.approval.approval_id);

  // 8. Create Razorpay order: creates Test Mode order for ₹96,497 (9649700 paise)
  const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
  assert.strictEqual(orderRes.status, 200);
  const orderData = await orderRes.json() as any;
  assert.ok(orderData.razorpay_order_id.startsWith('order_'));
  assert.strictEqual(orderData.amount, 9649700);
  assert.strictEqual(orderData.currency, 'INR');
  console.log('✔ Razorpay order created in Test Mode:');
  console.log('   Razorpay Order ID:', orderData.razorpay_order_id);
  console.log('   Amount in Paise:', orderData.amount, '(₹96,497.00)');
  console.log('   Key ID:', orderData.key_id);

  // 9. Razorpay Payment Callback: simulate customer completing payment in Razorpay modal
  const crypto = await import('node:crypto');
  const paymentId = `pay_live_test_${Date.now()}`;
  const secret = process.env.RAZORPAY_KEY_SECRET || 'test_secret_for_verification';
  const validSignature = crypto.default
    .createHmac('sha256', secret)
    .update(`${orderData.razorpay_order_id}|${paymentId}`)
    .digest('hex');

  const verifyRes = await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      razorpay_order_id: orderData.razorpay_order_id,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature
    })
  });
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json() as any;
  assert.strictEqual(verifyData.success, true);
  assert.ok(verifyData.status === 'COMPLETED' || verifyData.status === 'PAID');
  console.log('✔ Razorpay signature verification succeeded:');
  console.log('   Payment ID:', paymentId);
  console.log('   Status:', verifyData.status);

  // 10. Confirm invalid signature is strictly rejected on a pending session
  const badSessionId = 'bad_sig_test_' + Date.now();
  await fetch(`${baseUrl}/api/v1/agent/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I want an Apple laptop', session_id: badSessionId })
  });
  await fetch(`${baseUrl}/api/v1/checkout/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: badSessionId })
  });
  const badOrderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: badSessionId })
  });
  const badOrderData = await badOrderRes.json() as any;

  const badVerifyRes = await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: badSessionId,
      razorpay_order_id: badOrderData.razorpay_order_id,
      razorpay_payment_id: paymentId,
      razorpay_signature: 'invalid_tampered_signature'
    })
  });
  assert.strictEqual(badVerifyRes.status, 400);
  console.log('✔ Invalid payment signature strictly rejected with HTTP 400');

  console.log('=== ALL STEPS OF LIVE BROWSER VERIFICATION (SECTION 14) PASSED! ===');
}

testLiveFlow().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
