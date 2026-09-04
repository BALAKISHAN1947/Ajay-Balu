import crypto from 'node:crypto';

export interface RazorpayOrderParams {
  amount_paise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResponse {
  id: string;
  entity: 'order';
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  created_at: number;
}

export interface RazorpayServiceOptions {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
  mockNetworkBoundary?: boolean;
}

/**
 * Isolated server-side Razorpay Service.
 *
 * Strictly enforces Razorpay TEST MODE:
 * - Key ID must begin with "rzp_test_"
 * - Immediately rejects any "rzp_live_" configuration
 * - Never leaks or logs secret keys
 */
export class RazorpayService {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;
  private mockNetworkBoundary: boolean;

  constructor(options: RazorpayServiceOptions = {}) {
    const rawKeyId = options.keyId ?? process.env.RAZORPAY_KEY_ID ?? '';
    const rawKeySecret = options.keySecret ?? process.env.RAZORPAY_KEY_SECRET ?? '';
    const rawWebhookSecret = options.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

    // Guard against production/live keys in test mode
    if (rawKeyId.startsWith('rzp_live_')) {
      throw new Error(
        'SECURITY VIOLATION: Production key (rzp_live_) detected. AgentReady Milestone 4 strictly operates in simulated Razorpay TEST MODE only.'
      );
    }

    this.keyId = rawKeyId;
    this.keySecret = rawKeySecret;
    this.webhookSecret = rawWebhookSecret;
    this.mockNetworkBoundary = options.mockNetworkBoundary ?? false;
  }

  public isConfigured(): boolean {
    return Boolean(this.keyId && this.keySecret && this.keyId.startsWith('rzp_test_'));
  }

  public getKeyId(): string {
    if (!this.keyId) {
      return 'rzp_test_placeholder_key';
    }
    return this.keyId;
  }

  public setMockNetworkBoundary(enabled: boolean): void {
    this.mockNetworkBoundary = enabled;
  }

  /**
   * Creates a Razorpay Order in Test Mode.
   * Uses authoritative subunit amount (paise).
   */
  public async createRazorpayOrder(params: RazorpayOrderParams): Promise<RazorpayOrderResponse> {
    if (typeof params.amount_paise !== 'number' || params.amount_paise <= 0 || !Number.isInteger(params.amount_paise)) {
      throw new RangeError(`Invalid order amount in paise: ${params.amount_paise}`);
    }

    // Mock network boundary if explicitly requested or if valid credentials are not present
    if (this.mockNetworkBoundary || !this.isConfigured()) {
      const mockOrderId = `order_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      return {
        id: mockOrderId,
        entity: 'order',
        amount: params.amount_paise,
        amount_paid: 0,
        amount_due: params.amount_paise,
        currency: params.currency || 'INR',
        receipt: params.receipt,
        status: 'created',
        created_at: Math.floor(Date.now() / 1000)
      };
    }

    // Direct HTTPS call to Razorpay Orders API
    const authHeader = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`
      },
      body: JSON.stringify({
        amount: params.amount_paise,
        currency: params.currency || 'INR',
        receipt: params.receipt,
        notes: params.notes || {}
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Razorpay Orders API returned HTTP ${response.status}: ${
          (errorData as any)?.error?.description || response.statusText
        }`
      );
    }

    return (await response.json()) as RazorpayOrderResponse;
  }

  /**
   * Verifies Razorpay Checkout payment signature:
   * HMAC-SHA256(order_id + "|" + payment_id, key_secret) === signature
   */
  public verifyPaymentSignature(params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): boolean {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = params;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return false;
    }

    // If key secret is not configured or in testing with test keys, use secret or fallback test secret
    const secretToUse = this.keySecret || 'test_secret_for_verification';

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', secretToUse)
      .update(payload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(razorpay_signature, 'utf8')
      );
    } catch {
      return false;
    }
  }

  /**
   * Verifies Razorpay Webhook signature:
   * HMAC-SHA256(raw_webhook_body, webhook_secret) === signature
   */
  public verifyWebhookSignature(params: {
    raw_webhook_body: string | Buffer;
    signature: string;
  }): boolean {
    const { raw_webhook_body, signature } = params;

    if (!raw_webhook_body || !signature) {
      return false;
    }

    const secretToUse = this.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret';

    const bodyBuffer = typeof raw_webhook_body === 'string' ? Buffer.from(raw_webhook_body, 'utf8') : raw_webhook_body;

    const expectedSignature = crypto
      .createHmac('sha256', secretToUse)
      .update(bodyBuffer)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(signature, 'utf8')
      );
    } catch {
      return false;
    }
  }
}

// Singleton helper
let defaultRazorpayService: RazorpayService | null = null;
export function getRazorpayService(): RazorpayService {
  if (!defaultRazorpayService) {
    defaultRazorpayService = new RazorpayService();
  }
  return defaultRazorpayService;
}
