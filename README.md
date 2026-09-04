# AgentReady: Merchant AI Commerce Decision Engine & Razorpay Checkout

> **Track 01:** Razorpay AI Buildathon — AI Growth & Agentic Commerce  
> **Tagline:** Make merchants understandable, trustworthy and buyable to AI buyers.  
> **Merchant Partner:** Nexora Technologies (Indian D2C Electronics & Workspace Gear, Bengaluru)  
> **Milestone 4:** Real Razorpay Test-Mode Payment Integration & Authorization Gate — COMPLETE

---

## Core Architectural Principle

> **"LLM output is advisory and validated; deterministic services remain authoritative."**
> **"The frontend is NEVER authoritative for money, inventory, or order approval."**

In AgentReady, the LLM is **never** given authority over money, inventory, physical compatibility, or hard constraints. The LLM handles natural language understanding, intent extraction, ambiguity detection, and grounded verbal explanation. The deterministic decision engine and order manager remain 100% authoritative for constraint satisfaction, utility scoring, live stock validation, dimensional fitting, cart arithmetic, and Razorpay payment order generation.

---

## 1. System Architecture & Payment Lifecycle

```
   Natural-Language Customer Query (Web UI / Terminal)
                │
                ▼
   ┌──────────────────────────────────────────────┐
   │        Native HTTP API / Session Layer       │  (Node.js 22 HTTP Server / SessionManager)
   │  - POST /api/v1/agent/message                │  (Session Audit Logging: SESSION_STARTED, etc.)
   │  - Conversational Refinement & Justification │  (Why AeroBook?, Remove mouse, Review purchase)
   └──────────────────────┬───────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────┐
   │           LLM / NLU Intent Layer             │  (LLMProvider: Gemini / OpenAI / Deterministic)
   │  - Linguistic Normalization                  │  (70k -> 70000, 16 gigs -> 16GB, word numbers)
   │  - Contextual Category Isolation             │  ("backpack for laptop" -> isolates bag category)
   └──────────────────────┬───────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────┐
   │         Strict Intent Validation             │  (JSON schema validation, type checks)
   └──────────────────────┬───────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────┐
   │        Deterministic Decision Engine         │
   │   1. Hard Constraints Filter (Budget, RAM)   │
   │   2. Multi-Attribute Utility Scoring         │
   │   3. Immutable Variant Lock (SKU & Variant)  │
   │   4. 3D Bag Fit & Mouse Protocol Solver      │
   │   5. Authoritative Cart Summation            │
   └──────────────────────┬───────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────┐
   │           Customer Approval Gate             │  (POST /api/v1/checkout/approve)
   │   - Bound to exact SKUs & Variant IDs        │  (Deterministic Basket Hash SHA-256)
   │   - Revalidates live stock & prices          │
   └──────────────────────┬───────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────┐
   │       Authoritative Razorpay Service         │  (POST /api/v1/checkout/create-order)
   │   - Strictly rejects client-supplied amount  │  (Authoritative integer paise: ₹1 = 100 paise)
   │   - TEST MODE ONLY (rzp_test_... enforced)   │  (order_id returned to browser; secrets guarded)
   └──────────────────────┬───────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────┐
   │          Razorpay Checkout Modal             │  (Customer completes test payment)
   └──────────────────────┬───────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────┐
   │       Server-Side Verification & Webhook     │  (POST /api/v1/checkout/verify-payment)
   │   - HMAC-SHA256 signature verification       │  (POST /api/v1/webhooks/razorpay)
   │   - Idempotent stock decrement (exactly once)│  (Raw body verification + event ID deduplication)
   │   - PAYMENT_PENDING -> PAID -> COMPLETED     │
   └──────────────────────────────────────────────┘
```

---

## 2. Razorpay Test-Mode Payment Integration (Milestone 4)

### 2.1 Test Mode Policy & Security Guardrails
* **Test Mode Only**: The system strictly accepts Razorpay Test Keys starting with `rzp_test_`. Any attempt to configure a production key (`rzp_live_`) throws an immediate configuration exception and halts payment creation.
* **Simulated Test Payments**: In Test Mode, no real money moves. Real bank accounts are never debited.
* **Zero Secret Leakage**:
  * `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are never exposed to the frontend, never returned in API responses, never logged in terminal output, and never stored in audit logs.
  * `.env` is ignored by git in `.gitignore`. `.env.example` provides template placeholders only.

### 2.2 Authoritative Basket Calculation & INR $\rightarrow$ Paise
* **Client-Supplied Amount is Untrusted**: `req.body.amount` from client requests is strictly ignored. The backend always recalculates the authoritative total by querying the catalog repository for the active product and accessories.
* **Subunit Conversion (`inrToPaise`)**:
  * Razorpay Orders API requires amounts in currency subunits (paise).
  * For INR: ₹1 = 100 paise. (e.g. ₹67,297 $\rightarrow$ `6,729,700` paise).
  * Integer arithmetic is enforced with validation rejecting `NaN`, `Infinity`, negative numbers, non-integers, and out-of-bounds numbers.

### 2.3 Approval Binding & Deterministic Basket Hash
* Before an order can be created, the customer must pass the **Customer Approval Gate** (`POST /api/v1/checkout/approve`).
* The approval record is deterministically bound to:
  * `session_id` and `intent_id`
  * Exact sorted SKU list
  * Exact locked variant ID
  * Exact calculated INR total
  * Deterministic SHA-256 `basket_hash`
  * Approval timestamp
* **Stale Approval Invalidation**: If the customer toggles an accessory, changes product configuration, or catalog prices change, the approval is immediately invalidated and fresh review is required.

### 2.4 Internal Order State Machine
```
   PENDING_APPROVAL
          │ (POST /api/v1/checkout/approve)
          ▼
       APPROVED
          │ (POST /api/v1/checkout/create-order)
          ▼
   PAYMENT_PENDING ──────────────┐ (Modal closed / cancelled)
          │                      ▼
          │ (Signature verified) PAYMENT_CANCELLED (Basket preserved for retry)
          ▼
        PAID
          │ (Stock decremented exactly once)
          ▼
      COMPLETED
```
* **Backwards Guard**: Completed/Paid orders cannot transition backwards to `PAYMENT_CANCELLED` or `PAYMENT_FAILED`.

### 2.5 Server-Side Signature Verification
When the Razorpay Checkout modal finishes, it provides:
* `razorpay_payment_id`
* `razorpay_order_id`
* `razorpay_signature`

The backend verifies:
$$\text{HMAC-SHA256}(\text{razorpay\_order\_id} \parallel \text{"|"} \parallel \text{razorpay\_payment\_id}, \text{RAZORPAY\_KEY\_SECRET}) == \text{razorpay\_signature}$$
Using `crypto.timingSafeEqual` to prevent timing attacks. Only after server verification succeeds is the order marked `PAID` and `COMPLETED`.

### 2.6 Webhook Verification & Idempotency
* **Endpoint**: `POST /api/v1/webhooks/razorpay`
* **Raw Body Integrity**: Webhook signatures are computed directly over the unmodified raw bytes/buffer before any JSON parsing.
* **Idempotency**: Webhook deliveries are tracked via `x-razorpay-event-id`. Duplicate deliveries are acknowledged with 200 OK and ignored without duplicating stock decrements or order records.

---

## 3. Environment Variables Configuration

Create a `.env` file in the root directory (copied from `.env.example`):

```bash
# Razorpay Test Mode Credentials (get from dashboard.razorpay.com in Test Mode)
RAZORPAY_KEY_ID=rzp_test_your_key_id_here
RAZORPAY_KEY_SECRET=your_test_key_secret_here
RAZORPAY_WEBHOOK_SECRET=your_test_webhook_secret_here
PORT=3000
```

> **Note**: For automated tests, the test suite uses an isolated in-memory mock network boundary so tests run deterministically offline without requiring active external internet calls or live API keys.

---

## 4. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/agent/message` | Natural-language query, refines conversation, returns recommendation |
| `GET` | `/api/v1/session/:id` | Returns current session state and audit events |
| `POST` | `/api/v1/session/:id/accessory` | Toggles accessory with compatibility validation |
| `GET` | `/api/v1/session/:id/compare` | Compares primary recommendation with alternative SKU |
| `GET` | `/api/v1/session/:id/review` | Generates immutable purchase review snapshot and basket hash |
| `GET` | `/api/v1/session/:id/order` | Returns current internal order details (zero secrets) |
| `POST` | `/api/v1/checkout/approve` | Explicit customer approval gate with basket binding |
| `POST` | `/api/v1/checkout/create-order` | Revalidates stock & prices, converts to paise, creates Razorpay order |
| `POST` | `/api/v1/checkout/verify-payment` | Server-side HMAC-SHA256 payment signature verification |
| `POST` | `/api/v1/checkout/cancel` | Handles customer modal dismissal, preserves basket for retry |
| `POST` | `/api/v1/checkout/fail` | Handles failed transactions, preserves basket for retry |
| `POST` | `/api/v1/webhooks/razorpay` | Raw-body webhook verification with event deduplication |

---

## 5. Local Webhook Testing Guide

Because Razorpay cannot deliver webhooks to `localhost`, you can expose your local server using a secure development tunnel such as **zrok** or **ngrok**:

### Option A: Using zrok (Recommended by modern standards)
```bash
# 1. Start AgentReady server
npm start

# 2. In another terminal, create a temporary public tunnel
zrok reserve public 3000
zrok enable <token>
zrok share reserved <share-token>
```

### Option B: Using ngrok
```bash
ngrok http 3000
```

### Webhook Configuration in Razorpay Dashboard:
1. Navigate to **Razorpay Dashboard $\rightarrow$ Settings $\rightarrow$ Webhooks** (in **Test Mode**).
2. Add Webhook URL: `https://<tunnel-domain>/api/v1/webhooks/razorpay`
3. Secret: Enter the same secret set in your `RAZORPAY_WEBHOOK_SECRET`.
4. Active Events: Select `payment.captured`, `order.paid`, `payment.failed`.

---

## 6. Manual Test Flows

### Flow A: Successful Purchase Flow
1. Start server: `npm start`
2. Open browser at `http://localhost:3000`
3. Enter query:
   > *"I need a laptop for coding under ₹70,000. I travel every day, so I want something light with good battery life, at least 16GB RAM, and I also need a mouse and laptop bag."*
4. Click **"Review & Authorize Purchase"**.
5. Modal displays locked variant (AeroBook 14), compatible accessories (ErgoMouse + SlimBag), verified stock, and authorizable total: **₹67,297**.
6. Click **"Approve & Pay with Razorpay (Test Mode)"**.
7. Backend validates stock, computes basket hash, grants approval, and creates a Razorpay Test Mode Order.
8. Standard Razorpay modal opens.
9. Select Netbanking / Card / UPI in Test Mode and click **"Success"**.
10. Backend verifies signature via HMAC-SHA256. UI updates to **"Order confirmed"** displaying internal Order ID, Razorpay Order ID, Payment ID, and allocates inventory.

### Flow B: Customer Cancellation & Retry Flow
1. Follow Steps 1–7 above.
2. In the Razorpay modal, click the close button ($\times$) or cancel payment.
3. UI updates to: **"Payment was not completed. Your selected basket is preserved. You can retry."**
4. Click **"↻ Retry Payment"**.
5. Backend revalidates stock and live price, creates a fresh payment attempt, and re-opens checkout without duplicating any completed orders.

---

## 7. Automated Test Suite

AgentReady has **105 automated unit and integration tests** passing across **11 test suites** in **< 700ms**:

```bash
$ npm test

TAP version 13
# Subtest: Bundle and Soft Scoring Engine (5 tests) ................... OK
# Subtest: 3D Millimeter & Port Compatibility Engine (5 tests) ........ OK
# Subtest: Authoritative Currency Utility (INR <-> Paise) (7 tests) ... OK
# Subtest: Customer Experience, API & Session Gate (12 tests) ......... OK
# Subtest: Deterministic Decision Engine (3 tests) .................... OK
# Subtest: Golden Dataset Evaluation (16 tests) ....................... OK
# Subtest: Hard Constraint Filter Engine (6 tests) .................... OK
# Subtest: Milestone 2: Intent Extraction & Agent Pipeline (17 tests) . OK
# Subtest: Match State Distinction (6 tests) .......................... OK
# Subtest: Milestone 4: Razorpay Test-Mode Integration (22 tests) ..... OK
# Subtest: Regression: Production Bug Fixes (6 tests) ................. OK

# tests 105
# suites 11
# pass 105
# fail 0
# duration_ms 658.7685
```

### Typecheck Verification:
```bash
npx tsc --noEmit
# Exits with 0 errors
```

---

## 8. Known Limitations (Milestone 4 Boundary)
* Only **Razorpay Test Mode** is supported. Live production keys are strictly prohibited by architecture.
* Multi-tenant merchant accounts and subscription billing are intentionally deferred to future milestones.
* Order storage is managed in-memory with session persistence.
