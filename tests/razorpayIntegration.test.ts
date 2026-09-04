/**
 * Milestone 4: Razorpay Test-Mode Payment Integration & Security Test Suite
 *
 * Automated verification of:
 * - Approval binding to exact basket & hash
 * - Authoritative backend pricing (client amount ignored)
 * - INR <-> paise conversion
 * - Price & stock change gates
 * - Server-side HMAC-SHA256 signature verification
 * - Webhook processing with raw body verification and event-id idempotency
 * - State machine transitions & failure/cancellation preservation
 * - Prevention of duplicate stock decrements & completed order duplication
 * - Zero secrets in frontend assets and API responses
 * - Complete audit event lifecycle trail
 *
 * [NOTE: Mocked Network Boundary]
 * When live Razorpay network credentials are not configured, RazorpayService
 * uses the isolated mock network boundary for order creation.
 */

import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server/server.ts';
import { getSessionManager, SessionManager } from '../src/session/sessionManager.ts';
import { getCatalogRepository, InMemoryCatalogRepository } from '../src/repository/catalogRepository.ts';
import { OrderManager } from '../src/engine/orderManager.ts';
import { RazorpayService } from '../src/services/razorpayService.ts';
import { inrToPaise } from '../src/utils/currency.ts';
import type { LaptopProduct } from '../src/types/catalog.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

describe('Milestone 4: Real Razorpay Test-Mode Integration & Authorization Gate', () => {
  let server: any;
  let baseUrl: string;
  let repo: InMemoryCatalogRepository;
  let sessionManager: SessionManager;
  let razorpayService: RazorpayService;
  let orderManager: OrderManager;

  const TEST_KEY_ID = 'rzp_test_mock_agentready_key';
  const TEST_KEY_SECRET = 'secret_test_key_agentready_buildathon';
  const TEST_WEBHOOK_SECRET = 'secret_test_webhook_agentready';

  before(async () => {
    repo = new InMemoryCatalogRepository();
    sessionManager = new SessionManager(repo);
    razorpayService = new RazorpayService({
      keyId: TEST_KEY_ID,
      keySecret: TEST_KEY_SECRET,
      webhookSecret: TEST_WEBHOOK_SECRET,
      mockNetworkBoundary: true // Mock network boundary for deterministic offline testing
    });
    orderManager = new OrderManager(repo, razorpayService);

    server = createServer({
      sessionManager,
      orderManager,
      razorpayService
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // Helper to establish a primary coding session with recommendation
  async function setupPrimarySession(sessionId: string) {
    const res = await fetch(`${baseUrl}/api/v1/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: 'I need a coding laptop under 70k with 16GB RAM, mouse and bag'
      })
    });
    assert.equal(res.status, 200);
    return await res.json() as any;
  }

  // 1. Create order without approval -> rejected
  it('1. Create order without approval is strictly rejected with 400', async () => {
    const sessionId = 'test_m4_no_appr';
    await setupPrimarySession(sessionId);

    const res = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    assert.equal(res.status, 400);
    const data = await res.json() as any;
    assert.ok(data.error.toLowerCase().includes('approval required'));
  });

  // 2. Approval + unchanged basket -> accepted
  it('2. Approval with unchanged basket creates valid Razorpay Test Mode order', async () => {
    const sessionId = 'test_m4_valid_appr';
    await setupPrimarySession(sessionId);

    // Explicit approval
    const apprRes = await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(apprRes.status, 200);
    const apprData = await apprRes.json() as any;
    assert.equal(apprData.success, true);
    assert.ok(apprData.approval.approval_id);
    assert.ok(apprData.approval.basket_hash);

    // Create Razorpay order
    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    assert.equal(orderRes.status, 200);
    const orderData = await orderRes.json() as any;
    assert.ok(orderData.internal_order_id);
    assert.ok(orderData.razorpay_order_id.startsWith('order_test_'));
    assert.equal(orderData.razorpay_key_id, TEST_KEY_ID);
    assert.equal(orderData.currency, 'INR');
    assert.equal(orderData.amount, 6729700); // Authoritative paise
  });

  // 3. Modified basket + old approval -> rejected
  it('3. Modified basket invalidates old approval and blocks order creation', async () => {
    const sessionId = 'test_m4_mod_basket';
    await setupPrimarySession(sessionId);

    // Approve initial basket (₹67,297)
    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    // Remove the mouse accessory -> basket changes to ₹65,498
    const toggleRes = await fetch(`${baseUrl}/api/v1/session/${sessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'NX-MS-ERGO-01', included: false })
    });
    assert.equal(toggleRes.status, 200);

    // Attempt to create order using old approval
    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    assert.equal(orderRes.status, 400);
    const errData = await orderRes.json() as any;
    assert.ok(
      errData.error.toLowerCase().includes('approval required') ||
      errData.error.toLowerCase().includes('changed')
    );
  });

  // 4. Client-supplied amount cannot override backend total
  it('4. Client-supplied amount is completely ignored in favor of backend calculation', async () => {
    const sessionId = 'test_m4_tamper_amt';
    await setupPrimarySession(sessionId);

    // Approve
    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    // Malicious client attempts to pass amount = 100 INR (10000 paise)
    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, amount: 100 })
    });

    assert.equal(orderRes.status, 200);
    const orderData = await orderRes.json() as any;
    // Must strictly equal authoritative total ₹67,297 (6,729,700 paise), not 100
    assert.equal(orderData.amount, 6729700);
  });

  // 5. INR to paise conversion
  it('5. inrToPaise correctly calculates integer subunit representation', () => {
    assert.equal(inrToPaise(67297), 6729700);
    assert.equal(inrToPaise(49999), 4999900);
    assert.throws(() => inrToPaise(-100));
    assert.throws(() => inrToPaise(NaN));
  });

  // 6. Razorpay order amount equals authoritative backend total
  it('6. Razorpay order amount strictly matches catalog item sum in paise', async () => {
    const sessionId = 'test_m4_auth_paise';
    await setupPrimarySession(sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    const internalOrder = orderManager.getOrder(orderData.internal_order_id)!;
    assert.equal(orderData.amount, internalOrder.amount_paise);
    assert.equal(internalOrder.amount_inr * 100, internalOrder.amount_paise);
  });

  // 7. Price change blocks payment
  it('7. Catalog price change after approval blocks payment and requires re-approval', async () => {
    const sessionId = 'test_m4_price_chg';
    await setupPrimarySession(sessionId);

    // Approve
    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    // Simulate price change in catalog warehouse (e.g. flash sale or price bump)
    const laptopProd = repo.getProductBySku('NX-LP-AERO14-01') as LaptopProduct;
    const origPrice = laptopProd.price_inr;
    laptopProd.price_inr = 64999; // Bump price by ₹2,000

    try {
      const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });

      assert.equal(orderRes.status, 400);
      const errData = await orderRes.json() as any;
      assert.ok(errData.error.toLowerCase().includes('price changed'));
    } finally {
      laptopProd.price_inr = origPrice; // Restore
    }
  });

  // 8. Stock change blocks payment
  it('8. Stock depletion after approval blocks payment without substitution', async () => {
    const sessionId = 'test_m4_stock_deplete';
    await setupPrimarySession(sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    // Simulate mouse going out of stock
    const mouseProd = repo.getProductBySku('NX-MS-ERGO-01')!;
    const origStock = mouseProd.stock_quantity;
    mouseProd.stock_quantity = 0;

    try {
      const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });

      assert.equal(orderRes.status, 400);
      const errData = await orderRes.json() as any;
      assert.ok(errData.error.toLowerCase().includes('out of stock'));
    } finally {
      mouseProd.stock_quantity = origStock; // Restore
    }
  });

  // 9. Valid payment signature accepted
  it('9. Server accepts valid HMAC-SHA256 signature and completes order', async () => {
    const sessionId = 'test_m4_valid_sig';
    await setupPrimarySession(sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    const paymentId = `pay_test_${Date.now()}`;
    const payload = `${orderData.razorpay_order_id}|${paymentId}`;
    const validSignature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(payload)
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

    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json() as any;
    assert.equal(verifyData.success, true);
    assert.equal(verifyData.status, 'COMPLETED');

    const internalOrder = orderManager.getOrder(orderData.internal_order_id)!;
    assert.equal(internalOrder.status, 'COMPLETED');
    assert.equal(internalOrder.stock_decremented, true);
  });

  // 10. Invalid payment signature rejected
  it('10. Server strictly rejects invalid payment signature with 400', async () => {
    const sessionId = 'test_m4_invalid_sig';
    await setupPrimarySession(sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    const verifyRes = await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: orderData.razorpay_order_id,
        razorpay_payment_id: 'pay_test_forged',
        razorpay_signature: 'forged_bogus_signature_abc123'
      })
    });

    assert.equal(verifyRes.status, 400);
    const verifyData = await verifyRes.json() as any;
    assert.equal(verifyData.status, 'PAYMENT_FAILED');
  });

  // 11. Browser success callback alone cannot mark PAID
  it('11. Browser claim of success without valid server verification cannot mark order PAID', async () => {
    const sessionId = 'test_m4_browser_claim';
    await setupPrimarySession(sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    // Direct check: internal order is PAYMENT_PENDING
    const internalOrder = orderManager.getOrder(orderData.internal_order_id)!;
    assert.equal(internalOrder.status, 'PAYMENT_PENDING');

    // Missing signature payload
    const bogusRes = await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: orderData.razorpay_order_id,
        razorpay_payment_id: 'pay_unverified'
        // No signature
      })
    });
    assert.equal(bogusRes.status, 400);
    assert.notEqual(internalOrder.status, 'PAID');
    assert.notEqual(internalOrder.status, 'COMPLETED');
  });

  // 12. Invalid webhook signature rejected
  it('12. Webhook with invalid HMAC signature is rejected with 400', async () => {
    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_mock_123' } } }
    });

    const res = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': 'invalid_webhook_signature_123'
      },
      body: rawPayload
    });

    assert.equal(res.status, 400);
    const data = await res.json() as any;
    assert.ok(data.error.includes('Invalid webhook signature'));
  });

  // 13. Valid webhook accepted
  it('13. Webhook with valid HMAC-SHA256 signature is processed and finalizes order', async () => {
    const sessionId = 'test_m4_webhook_valid';
    await setupPrimarySession(sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    const rawWebhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_captured_999',
            order_id: orderData.razorpay_order_id,
            amount: orderData.amount,
            status: 'captured'
          }
        }
      }
    });

    const validWebhookSig = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(rawWebhookPayload, 'utf8'))
      .digest('hex');

    const res = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': validWebhookSig,
        'X-Razorpay-Event-Id': 'evt_hook_test_01'
      },
      body: rawWebhookPayload
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.success, true);
    assert.equal(data.processed, true);

    const internalOrder = orderManager.getOrder(orderData.internal_order_id)!;
    assert.equal(internalOrder.status, 'COMPLETED');
  });

  // 14. Duplicate webhook ignored
  it('14. Duplicate webhook delivery with same event ID is safely ignored without re-processing', async () => {
    const rawWebhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_test_dup' } } }
    });

    const validWebhookSig = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(rawWebhookPayload, 'utf8'))
      .digest('hex');

    const eventId = 'evt_duplicate_id_555';

    // First delivery
    const res1 = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': validWebhookSig,
        'X-Razorpay-Event-Id': eventId
      },
      body: rawWebhookPayload
    });
    assert.equal(res1.status, 200);

    // Second duplicate delivery
    const res2 = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': validWebhookSig,
        'X-Razorpay-Event-Id': eventId
      },
      body: rawWebhookPayload
    });

    assert.equal(res2.status, 200);
    const data2 = await res2.json() as any;
    assert.equal(data2.processed, false);
    assert.ok(data2.message.includes('Duplicate'));
  });

  // 15. Payment cancellation preserves basket
  it('15. Customer cancelling checkout transitions order to PAYMENT_CANCELLED and preserves basket', async () => {
    const sessionId = 'test_m4_cancel';
    await setupPrimarySession(sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    const cancelRes = await fetch(`${baseUrl}/api/v1/checkout/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, reason: 'Dismissed modal' })
    });

    assert.equal(cancelRes.status, 200);
    const cancelData = await cancelRes.json() as any;
    assert.equal(cancelData.status, 'PAYMENT_CANCELLED');

    // Session basket is preserved
    const session = sessionManager.getSession(sessionId)!;
    assert.ok(session.latest_recommendation);
    assert.equal(session.selected_accessory_skus.length, 2);
  });

  // 16. Payment failure preserves basket
  it('16. Payment failure transitions order to PAYMENT_FAILED and preserves basket', async () => {
    const sessionId = 'test_m4_fail';
    await setupPrimarySession(sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    const failRes = await fetch(`${baseUrl}/api/v1/checkout/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, reason: 'Card declined' })
    });

    assert.equal(failRes.status, 200);
    const failData = await failRes.json() as any;
    assert.equal(failData.status, 'PAYMENT_FAILED');

    const session = sessionManager.getSession(sessionId)!;
    assert.ok(session.latest_recommendation);
    assert.equal(session.selected_accessory_skus.length, 2);
  });

  // 17. Retry does not duplicate completed order
  it('17. Retry flow after cancellation creates a fresh pending order without duplicating completed orders', async () => {
    const sessionId = 'test_m4_retry';
    await setupPrimarySession(sessionId);

    // Initial approval and order
    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const order1Res = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const order1Data = await order1Res.json() as any;

    // Customer cancels
    await fetch(`${baseUrl}/api/v1/checkout/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const order1 = orderManager.getOrder(order1Data.internal_order_id)!;
    assert.equal(order1.status, 'PAYMENT_CANCELLED');

    // Customer retries: re-approve and create fresh order
    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const order2Res = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const order2Data = await order2Res.json() as any;

    assert.notEqual(order1Data.internal_order_id, order2Data.internal_order_id);
    const order2 = orderManager.getOrder(order2Data.internal_order_id)!;
    assert.equal(order2.status, 'PAYMENT_PENDING');
  });

  // 18. Stock not decremented twice
  it('18. Stock is decremented exactly once and cannot be decremented twice on duplicate confirmation', async () => {
    const sessionId = 'test_m4_stock_once';
    await setupPrimarySession(sessionId);

    const laptop = repo.getProductBySku('NX-LP-AERO14-01')!;
    const stockBefore = laptop.stock_quantity;

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    const paymentId = `pay_stock_test_${Date.now()}`;
    const payload = `${orderData.razorpay_order_id}|${paymentId}`;
    const validSignature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(payload)
      .digest('hex');

    // Confirm once
    await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: orderData.razorpay_order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature
      })
    });

    assert.equal(laptop.stock_quantity, stockBefore - 1);

    // Confirm duplicate
    await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: orderData.razorpay_order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature
      })
    });

    // Stock must remain stockBefore - 1, not decremented twice!
    assert.equal(laptop.stock_quantity, stockBefore - 1);
  });

  // 19. PAID cannot transition backwards
  it('19. Completed/Paid order cannot transition backwards to cancelled or failed', async () => {
    const sessionId = 'test_m4_backwards_guard';
    await setupPrimarySession(sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    const paymentId = `pay_completed_${Date.now()}`;
    const payload = `${orderData.razorpay_order_id}|${paymentId}`;
    const validSignature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(payload)
      .digest('hex');

    await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: orderData.razorpay_order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature
      })
    });

    // Attempt to cancel
    const cancelRes = await fetch(`${baseUrl}/api/v1/checkout/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(cancelRes.status, 400);

    // Attempt to fail
    const failRes = await fetch(`${baseUrl}/api/v1/checkout/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    assert.equal(failRes.status, 400);

    const internalOrder = orderManager.getOrder(orderData.internal_order_id)!;
    assert.equal(internalOrder.status, 'COMPLETED');
  });

  // 20. Secrets absent from frontend assets
  it('20. Secrets are strictly absent from public client-side JavaScript and HTML assets', () => {
    const publicFiles = fs.readdirSync(PUBLIC_DIR);
    for (const file of publicFiles) {
      if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
        const content = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
        assert.equal(
          content.includes('RAZORPAY_KEY_SECRET'),
          false,
          `Secret name leaked in ${file}`
        );
        assert.equal(
          content.includes('RAZORPAY_WEBHOOK_SECRET'),
          false,
          `Webhook secret leaked in ${file}`
        );
        assert.equal(
          content.includes(TEST_KEY_SECRET),
          false,
          `Secret value leaked in ${file}`
        );
        assert.equal(
          content.includes(TEST_WEBHOOK_SECRET),
          false,
          `Webhook secret value leaked in ${file}`
        );
      }
    }
  });

  // 21. Secrets absent from API responses
  it('21. Secrets are strictly absent from checkout API response payloads', async () => {
    const sessionId = 'test_m4_no_leak_api';
    await setupPrimarySession(sessionId);

    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderText = await orderRes.text();

    assert.equal(orderText.includes(TEST_KEY_SECRET), false);
    assert.equal(orderText.includes(TEST_WEBHOOK_SECRET), false);
    assert.equal(orderText.includes('key_secret'), false);
    assert.equal(orderText.includes('webhook_secret'), false);
  });

  // 22. Payment audit events recorded
  it('22. Complete payment lifecycle audit trail is recorded in session telemetry', async () => {
    const sessionId = 'test_m4_audit_trail';
    await setupPrimarySession(sessionId);

    // 1. Review
    await fetch(`${baseUrl}/api/v1/session/${sessionId}/review`);

    // 2. Approve
    await fetch(`${baseUrl}/api/v1/checkout/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    // 3. Create Order
    const orderRes = await fetch(`${baseUrl}/api/v1/checkout/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    const orderData = await orderRes.json() as any;

    // 4. Verify Payment
    const paymentId = `pay_audit_${Date.now()}`;
    const payload = `${orderData.razorpay_order_id}|${paymentId}`;
    const validSignature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(payload)
      .digest('hex');

    await fetch(`${baseUrl}/api/v1/checkout/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        razorpay_order_id: orderData.razorpay_order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature
      })
    });

    const session = sessionManager.getSession(sessionId)!;
    const eventTypes = session.audit_events.map((e) => e.type);

    assert.ok(eventTypes.includes('PURCHASE_REVIEW_OPENED'));
    assert.ok(eventTypes.includes('PURCHASE_APPROVED'));
    assert.ok(eventTypes.includes('CHECKOUT_VALIDATION_STARTED'));
    assert.ok(eventTypes.includes('RAZORPAY_ORDER_CREATED'));
    assert.ok(eventTypes.includes('PAYMENT_STARTED'));
    assert.ok(eventTypes.includes('PAYMENT_SIGNATURE_VERIFIED'));
    assert.ok(eventTypes.includes('ORDER_PAID'));
    assert.ok(eventTypes.includes('ORDER_CONFIRMED'));
  });
});
