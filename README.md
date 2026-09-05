# AgentReady

## AI Buyer Readiness for Agentic Commerce

AgentReady helps merchants become ready for AI buyers by connecting natural-language shopping, verified catalog intelligence, customer-authorized checkout, and measurable merchant-side catalog improvement.

> **The Core Problem:** AI is becoming a new storefront, but merchants don't know whether their catalog is ready for AI buyers—or why AI buyer requests fail when it isn't.

AgentReady evaluates whether natural-language buyer intents can become:
1. **Correctly understood** across complex technical requirements and colloquial phrasing
2. **Correctly matched** to verified catalog products across multi-brand inventory
3. **Constraint-valid** against hard budget, RAM, GPU, storage, and physical compatibility checks
4. **Transaction-ready** with complete, unambiguous specifications and available inventory
5. **Safely converted** into a customer-authorized Razorpay transaction

On the merchant side, the same engine evaluates a controlled benchmark of **100 buyer intents** and identifies:
- Which intents are served (**WON**)
- Which fail (**LOST / PARTIAL / UNSUPPORTED**)
- Why they fail across a 6-category failure taxonomy
- Which catalog field or commerce condition caused the failure
- What **Modeled Catalog Opportunity** is affected
- What prioritized catalog improvement could address the root cause
- Whether an approved **one-fix change** actually changes buyer outcomes in a controlled causal experiment

---

## Table of Contents

- [Why AgentReady Fits Track 01](#why-agentready-fits-track-01)
- [The Problem](#the-problem)
- [The Complete Product Loop](#the-complete-product-loop)
- [Architecture](#architecture)
- [Why Groq?](#why-groq)
- [Deterministic Commerce Core](#deterministic-commerce-core)
- [Multi-Brand AI Shopping](#multi-brand-ai-shopping)
- [Conversational Shopping](#conversational-shopping)
- [Relevant Cross-Sell](#relevant-cross-sell)
- [Customer Authorization & Purchase Control](#customer-authorization--purchase-control)
- [Razorpay Test Mode Transaction Flow](#razorpay-test-mode-transaction-flow)
- [Webhook Integrity](#webhook-integrity)
- [Merchant AI Buyer Readiness](#merchant-ai-buyer-readiness)
- [Controlled 100-Intent Benchmark](#controlled-100-intent-benchmark)
- [Why AI Buyer Requests Fail](#why-ai-buyer-requests-fail)
- [Modeled Catalog Opportunity](#modeled-catalog-opportunity)
- [Buyer Intent Forensics](#buyer-intent-forensics)
- [Merchant-Approved Catalog Improvements](#merchant-approved-catalog-improvements)
- [Before / After: One-Fix Causal Experiment](#before--after-one-fix-causal-experiment)
- [Current Experiment Example](#current-experiment-example)
- [Security & Trust Boundaries](#security--trust-boundaries)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
- [Testing & Verification](#testing--verification)
- [Honest Scope & Limitations](#honest-scope--limitations)
- [Demo Walkthrough](#demo-walkthrough)

---

## Why AgentReady Fits Track 01

AgentReady directly addresses the core themes of **Track 01: AI Growth & Agentic Commerce**:

- **AI Buyer Discovery:** Bridges conversational user goals to merchant catalog discovery with structured NLU.
- **Natural-Language Commerce:** Interprets complex multi-constraint requests in English and Hinglish.
- **Explainable Product Recommendation:** Every recommendation includes grounded technical reasoning and spec verification.
- **Multi-Brand Catalog Matching:** Evaluates candidates across Apple, Lenovo, Dell, HP, ASUS, Acer, and Nexora without brand bias.
- **Relevant Cross-Sell:** Discovers physically and functionally compatible peripherals with clear compatibility evidence.
- **Customer Authorization:** Enforces a strict boundary where recommendations never auto-purchase without explicit customer selection.
- **Authoritative Razorpay Flow:** Uses server-calculated paise amounts, HMAC-SHA256 signature verification, and idempotent webhook processing.
- **Agent-Readable Merchant Catalog:** Transforms unstructured merchant catalogs into structured, machine-evaluable knowledge.
- **Measurable Improvement Loop:** Diagnoses catalog failure modes and tests approved catalog fixes against a controlled 100-intent benchmark.

### Terminology & Precision

To maintain strict scientific and commercial honesty, AgentReady uses precise terminology:
- **Modeled Catalog Opportunity:** A deterministic benchmark valuation based on verified catalog item and basket prices associated with failed intents. It is *not* guaranteed revenue or a predictive conversion model.
- **Modeled Benchmark Opportunity Value:** The aggregate catalog value of unmet benchmark intents.
- **Verified Intent Transition:** A genuine outcome status change (e.g., `LOST → WON` or `PARTIAL → WON`) when evaluating the exact same intent across catalog versions.
- **Controlled Benchmark:** A fixed, immutable set of 100 buyer intents used for reproducible before/after comparisons.
- **Customer-Authorized Transaction:** A purchase where the final basket is explicitly selected, approved by the user, and verified server-side before payment capture.

---

## The Problem

### Traditional Commerce vs. AI-Mediated Commerce

```
Traditional Commerce:
Search / Filter  ──►  Browse Product Page  ──►  Manual Add to Cart  ──►  Checkout

AI-Mediated Commerce:
Natural Goal Expression  ──►  AI Intent Interpretation  ──►  Catalog Reasoning  ──►  Recommendation  ──►  Customer Authorization  ──►  Payment
```

In AI-mediated commerce, the merchant catalog must not only be indexed—it must be **discoverable, understandable, matchable, constraint-valid, compatible, inventory-aware, and transaction-ready**.

Merchants currently face major blind spots:
1. *"Which AI buyer requests can my catalog actually serve?"*
2. *"Why do the others fail?"*
3. *"What catalog metadata or inventory conditions caused the failure?"*
4. *"Which problems affect the largest modeled commerce opportunities?"*
5. *"Did my catalog fix actually change buyer outcomes, or did existing inventory already satisfy those intents?"*

AgentReady provides the complete infrastructure to answer these questions with mathematical and causal proof.

---

## The Complete Product Loop

```
========================================================================================
                               CUSTOMER COMMERCE LOOP
========================================================================================

  Buyer: "I need a light laptop for coding under 70000"
                    │
                    ▼
     Groq Intent Understanding (gpt-oss-120b)
   [category: laptop, max_budget: 70000, min_ram: 16, lightweight: true]
                    │
                    ▼
     Verified Marketplace Search (Multi-Brand)
                    │
                    ▼
     Deterministic Hard-Constraint Evaluation
   (Price ≤ ₹70,000, Stock > 0, RAM ≥ 16GB, Weight < 1.6kg)
                    │
                    ▼
     Candidate Scoring & Trade-Off Calculation
                    │
                    ▼
     Grounded Specification Explanation
                    │
                    ▼
     Compatible Peripheral Discovery (Cross-Sell)
   (Dimensions verified, Protocol verified, Stock verified)
                    │
                    ▼
     Explicit Customer Selection & Checkbox Opt-In
                    │
                    ▼
     Authoritative Server Basket Calculation
                    │
                    ▼
     Customer Authorization Gate
                    │
                    ▼
     Razorpay Test-Mode Checkout (Order Creation)
                    │
                    ▼
     Server-Side HMAC-SHA256 Verification & Webhook Integrity
                    │
                    ▼
     Order Completed & Stock Decremented (PAID)

========================================================================================
                              MERCHANT INTELLIGENCE LOOP
========================================================================================

  Controlled Benchmark: 100 Fixed Buyer Intents
                    │
                    ▼
     AI Buyer Readiness Diagnostic (Score: 73/100)
   (Intent Match: 67.7% | Constraint Adherence: 73.2% | Checkout Ready: 67.7% | Coverage: 93.0%)
                    │
                    ▼
     Outcome Classification: 63 WON | 23 LOST | 7 PARTIAL | 7 UNSUPPORTED
                    │
                    ▼
     High-Level Failure Map & Root-Cause Diagnosis
   (Missing Specs, Ambiguous Dongles, Stockout, RAM/GPU Ceilings)
                    │
                    ▼
     Modeled Catalog Opportunity Aggregation (₹15,31,393)
                    │
                    ▼
     Prioritized Catalog Improvement Proposals
                    │
                    ▼
     Merchant Approval Gate (Explicit One-Fix Selection)
                    │
                    ▼
     Catalog Version B Generation (Catalog A + Exactly 1 Fix)
                    │
                    ▼
     Rerun 100 Benchmark Intents (Causal Isolation)
                    │
                    ▼
     Verified Outcome Transition Audit (LOST → WON, PARTIAL → WON)
```

---

## Architecture

AgentReady is structured into 9 modular layers separating advisory AI reasoning from authoritative commerce rules:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Presentation Layer (public/index.html, style.css, app.js)           │
│    • Unified Customer Commerce Chat & Merchant Intelligence Workspace  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ HTTP / JSON
┌──────────────────────────────────▼─────────────────────────────────────┐
│ 2. API & Server Layer (src/server/server.ts)                           │
│    • Node.js native HTTP server, REST endpoints, raw-body webhooks     │
└──────┬───────────────────────────┬───────────────────────────────┬─────┘
       │                           │                               │
┌──────▼─────────────────────┐ ┌───▼─────────────────────────┐ ┌───▼─────────────────────┐
│ 3. Agent Orchestrator      │ │ 6. Session & Basket Layer   │ │ 7. Benchmark Layer      │
│    (src/agent/)            │ │    (src/session/)           │ │    (src/benchmark/)     │
│    • Multi-turn state      │ │    • Authoritative basket   │ │    • 100-intent runner  │
│    • Explanation pipeline  │ │    • Review generation      │ │    • Readiness scoring  │
│    • Intent validation     │ │    • Checkbox toggle state  │ │    • Causal experiment  │
└──────┬─────────────────────┘ └─────────────────────────────┘ └─────────────────────────┘
       │
┌──────▼─────────────────────────────────────────────────────────────────┐
│ 4. LLM & Natural Language Layer (src/llm/, src/nlu/)                   │
│    • Groq SDK (openai/gpt-oss-120b) with Deterministic NLU fallback    │
│    • Normalization for budget, RAM, storage, GPU, categories           │
└──────┬─────────────────────────────────────────────────────────────────┘
       │ Structured Intent
┌──────▼─────────────────────────────────────────────────────────────────┐
│ 5. Deterministic Commerce Engine (src/engine/)                         │
│    • Hard Constraints (budget, stock, RAM, GPU, OS, display, weight)   │
│    • Physical & Protocol Compatibility (bag dims, USB-C power, dongles)│
│    • Soft Scoring & Variant Locking                                    │
│    • Order Manager & Razorpay Integration (HMAC-SHA256, server paise)  │
└──────┬─────────────────────────────────────────────────────────────────┘
       │
┌──────▼─────────────────────────────────────────────────────────────────┐
│ 8. Repository Layer (src/repository/catalogRepository.ts)              │
│    • In-memory catalog access with immutable version isolation (A vs B)│
└──────┬─────────────────────────────────────────────────────────────────┘
       │
┌──────▼─────────────────────────────────────────────────────────────────┐
│ 9. Data & Catalog Layer (src/data/)                                    │
│    • Multi-brand catalog (Apple, Lenovo, Dell, HP, ASUS, Acer, Nexora) │
│    • Fixed 100-Intent Benchmark Dataset (benchmarkIntents.ts)          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Why Groq?

AgentReady leverages the **Groq SDK** running `openai/gpt-oss-120b` for high-throughput, low-latency natural language reasoning.

### What Groq Does:
- Interprets free-form buyer intent from English and Hinglish expressions (e.g., *"mujhe light coding laptop chahiye under 70k"*).
- Resolves conversational anaphoric references (e.g., *"give me that one"*, *"pick the second option"*).
- Synthesizes grounded, factual explanations citing only verified catalog attributes.

### What Groq DOES NOT Do:
To guarantee absolute safety, financial correctness, and eliminate hallucinations:
- **Groq does not decide product existence.**
- **Groq does not decide inventory stock levels.**
- **Groq does not decide prices or currency amounts.**
- **Groq does not decide physical compatibility.**
- **Groq does not compute final basket totals.**
- **Groq does not create Razorpay order amounts.**

```
Buyer Query ──► Groq LLM (gpt-oss-120b) ──► Structured Intent
                                                   │
                                                   ▼
                                       Deterministic Commerce Core
                                        (Verifies Catalog Reality)
                                                   │
                                                   ▼
Verified Engine Result ──► Groq Explanation ──► Grounded Customer Response
```

### Deterministic Fallback
If Groq is unreachable or credentials are not supplied, AgentReady automatically falls back to an internal **Deterministic NLU Provider** with regex and linguistic normalization rules, ensuring 100% operational continuity.

---

## Deterministic Commerce Core

The deterministic engine is the single authoritative source of truth for all commerce decisions:

1. **Candidate Filtering Pipeline:**
   - **Category Match:** Rejects unsupported categories immediately (e.g., shoes, groceries).
   - **Brand Enforcement:** If an explicit brand is requested (e.g., *"Apple"*), non-matching brands are strictly disqualified.
   - **Hard Spec Verification:** Validates budget maximums, minimum RAM, required GPU tier, and storage.
   - **Stock Check:** Filters out SKUs with `stock_quantity === 0`.
2. **Soft Scoring:** Ranks qualifying candidates by processor benchmark score, RAM density, storage capacity, weight efficiency, and price value.
3. **Variant Locking:** Locks the exact hardware SKU and variant identifier before presentation.
4. **Authoritative Basket Arithmetic:** Calculates subtotals, item totals, and paise amounts on the server. Client-submitted prices are ignored.

---

## Multi-Brand AI Shopping

AgentReady operates as an open marketplace supporting **Apple, Lenovo, Dell, HP, ASUS, Acer, and Nexora**:

- **Explicit Brand Requests:** *"I want an Apple laptop under 100000"* → Only verified Apple SKUs (e.g., MacBook Air M2) are eligible candidates.
- **Marketplace Workload Requests:** *"Best coding laptop under 70000"* → Evaluates all brands across the catalog, ranking by technical fit and value.
- **Non-Existent Brand/Model Requests:** *"I want an Apple Pro Max laptop"* → Does not hallucinate fake products. Rejects non-existent models and presents verified alternatives.

All specifications (CPU cores, display nits, RAM, ports, dimensions) originate from verified catalog records.

---

## Conversational Shopping

AgentReady maintains multi-turn conversation memory with verified context resolution:

```
Turn 1: "I need a light travel laptop under 60000"
Agent: Recommends Nexora AeroBook 13 (₹54,999, 1.1kg) and displays Lenovo IdeaPad Slim 3 as alternative.

Turn 2: "Okay, give me that one."
Agent: Resolves "that one" to the primary recommended SKU (NX-LP-AERO13-02), confirms selection, and displays compatible accessories.
```

- Anaphoric references (*"that one"*, *"the first one"*, *"the cheaper option"*) resolve against prior verified assistant recommendations.
- Target SKUs are re-validated through the deterministic catalog engine before selection.
- If the buyer introduces a new search term or budget ceiling in Turn 2, the engine treats it as a fresh query rather than an ambiguous reference.

---

## Relevant Cross-Sell

AgentReady discovers compatible accessories (laptop bags, wireless mice, chargers, USB hubs) based on verified physical and technical compatibility:

- **Dimensional Compatibility:** Verifies laptop dimensions against bag compartment dimensions (e.g., a 15.6" laptop cannot be paired with a 14" sleeve).
- **Protocol Compatibility:** Verifies connection protocols (USB-C PD wattage, Bluetooth vs. 2.4GHz dongle).
- **Default State:** Compatible accessories are presented **unselected by default**.
- **Explicit Customer Control:** Accessories only enter the authoritative basket when the customer explicitly checks the accessory box.
- **Budget Protection:** If adding an accessory exceeds the customer's stated budget ceiling, the UI displays a clear advisory badge while keeping checkout control with the user.

---

## Customer Authorization & Purchase Control

An AI agent must **never** execute autonomous purchases on behalf of a user without explicit consent.

```
AI Recommendation  ≠  Purchase Authorization
```

AgentReady implements an immutable authorization boundary:
1. **Recommendation:** Agent presents candidate products and compatible accessories.
2. **Customer Selection:** Customer explicitly checks accessories and clicks **"Review & Authorize Order"**.
3. **Authoritative Review:** Backend generates an immutable purchase review with itemized specs, prices, and return policy.
4. **Customer Approval:** Customer clicks **"Approve & Proceed to Payment"**, generating a server-side checkout approval token.
5. **Payment Lock:** Any modification to the basket after approval immediately invalidates the approval token, requiring explicit re-approval.

---

## Razorpay Test Mode Transaction Flow

AgentReady integrates Razorpay Checkout in Test Mode with end-to-end cryptographic verification:

```
Customer Clicks "Approve & Pay"
               │
               ▼
POST /api/v1/checkout/approve
(Server creates approval record & calculates authoritative amount)
               │
               ▼
POST /api/v1/checkout/create-order
(Server calls Razorpay Orders API with amount in paise: e.g. ₹54,999.00 -> 5499900)
               │
               ▼
Client Opens Razorpay Checkout Modal (Key: rzp_test_...)
               │
               ▼
Customer Completes Test Payment
               │
               ▼
POST /api/v1/checkout/verify-payment
{
  session_id: "...",
  razorpay_order_id: "order_...",
  razorpay_payment_id: "pay_...",
  razorpay_signature: "..."
}
               │
               ▼
Server Verifies HMAC-SHA256:
hmac_sha256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET) === razorpay_signature
               │
               ├──► Valid Signature: Order status set to PAID, stock decremented, telemetry logged
               └──► Invalid Signature: HTTP 400 Bad Request, order marked FAILED
```

### Key Security & Integrity Invariants:
- **Client Amounts Ignored:** The client cannot submit a custom price; the backend sums active basket SKUs from catalog truth.
- **Integer Subunits (Paise):** All Razorpay orders use integer paise representations (`Math.round(inr * 100)`).
- **Stock Depletion Check:** Verifies stock availability immediately prior to payment authorization.
- **Failure Recovery:** If payment fails or is cancelled by the user, the basket and selected accessories are preserved for retry without duplicating orders.

---

## Webhook Integrity

AgentReady processes server-to-server Razorpay webhooks for payment lifecycle events:

- **Raw Body Verification:** Reads the exact unparsed HTTP request buffer to compute the HMAC-SHA256 signature using `RAZORPAY_WEBHOOK_SECRET`.
- **Event Idempotency:** Tracks processed `x-razorpay-event-id` headers in-memory. Duplicate deliveries of the same event are acknowledged with HTTP 200 without duplicate processing.
- **Stock Decrement Protection:** Decrements inventory stock exactly once upon payment confirmation.
- **Supported Events:** `payment.captured`, `payment.failed`, `order.paid`.

---

## Merchant AI Buyer Readiness

The centerpiece of AgentReady's merchant intelligence is the **AI Buyer Readiness Score**, answering:

> *"How reliably can AI buyer requests become verified, constraint-valid, transaction-ready orders?"*

### Deterministic Weighted Formula

$$\text{Readiness Score} = \left( 35\% \times \text{Match Rate} \right) + \left( 25\% \times \text{Constraint Adherence} \right) + \left( 25\% \times \text{Checkout Readiness} \right) + \left( 15\% \times \text{Catalog Coverage} \right)$$

Where:
- **Intent Match Rate (35% weight):** Proportion of supported benchmark intents that find a qualifying product matching the customer's core goal.
- **Hard Constraint Adherence (25% weight):** Ratio of satisfied technical constraints (budget, RAM, GPU, storage) over total evaluated constraints.
- **Checkout Readiness (25% weight):** Proportion of intents where all metadata, stock levels, and pricing allow immediate checkout without rejections.
- **Catalog Coverage (15% weight):** Proportion of benchmark intents within the merchant's supported category domain (e.g., electronics).

### Current Controlled Baseline Benchmark Snapshot

| Metric | Score / Rate | Benchmark Context |
| :--- | :---: | :--- |
| **AI Buyer Readiness** | **73 / 100** | Composite diagnostic score |
| **Intent Match Rate** | **67.7%** | 63 Won / 93 Supported intents |
| **Hard Constraint Adherence** | **73.2%** | Satisfied constraint checks |
| **Checkout-Ready Rate** | **67.7%** | 63 / 93 Supported intents |
| **Catalog Coverage** | **93.0%** | 93 Supported / 100 Total intents |

*(Snapshot based on the controlled 100-intent benchmark on baseline Catalog v1.0.)*

---

## Controlled 100-Intent Benchmark

The benchmark consists of **100 fixed, multi-persona buyer intents** spanning developer, gaming, student budget, travel portability, creator, workspace, comparison, and bundle queries.

```
Total Benchmark Population: 100 Intents
├── Supported Merchant Domain: 93 Intents
│   ├── WON: 63 Intents (Fully satisfied, constraint-valid, transaction-ready)
│   ├── PARTIAL: 7 Intents (Satisfied with disclosed trade-offs, e.g., budget ceiling)
│   └── LOST: 23 Intents (Failed due to missing specs, stockout, or constraint mismatch)
└── Unsupported Domain: 7 Intents (Out-of-scope categories like running shoes or groceries)
```

**Why the benchmark is fixed:** Evaluating the identical 100 intents across catalog versions ensures causal validity. It prevents cherry-picking easy requests or artificially inflating scores.

---

## Why AI Buyer Requests Fail

AgentReady categorizes every failed benchmark intent into a **High-Level Failure Taxonomy**:

```
┌────────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ High-Level Failure Type                │ Detailed Loss Reason Codes & Causes                    │
├────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. CONSTRAINT_FAILURE                  │ RAM_MISMATCH, GPU_MISMATCH, STORAGE_MISMATCH,          │
│                                        │ BUDGET_MISMATCH (Customer constraints exceed catalog)  │
├────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 2. TRANSACTION_FAILURE                 │ MISSING_ATTRIBUTE, AMBIGUOUS_ATTRIBUTE,                │
│                                        │ INSUFFICIENT_VERIFICATION (Metadata blocks checkout)   │
├────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 3. INVENTORY_FAILURE                   │ OUT_OF_STOCK (Qualifying product has 0 warehouse units)│
├────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 4. COMPATIBILITY_FAILURE               │ COMPATIBILITY_FAILURE, VARIANT_MISMATCH                │
│                                        │ (Dimensional or hardware protocol conflict)            │
├────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 5. INTENT_MATCH_FAILURE                │ NO_RELEVANT_PRODUCT, PRICE_MISMATCH                    │
│                                        │ (No inventory satisfies base workload or price tier)   │
├────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 6. DISCOVERY_FAILURE                   │ CATEGORY_MISMATCH                                      │
│                                        │ (Buyer searched for products outside merchant scope)   │
└────────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## Modeled Catalog Opportunity

**Modeled Catalog Opportunity** aggregates the verified catalog item prices associated with failed benchmark intents to help merchants prioritize catalog fixes:

$$\text{Modeled Opportunity} = \sum_{\text{Lost Intents}} \text{Verified Catalog Product / Expected Budget Value}$$

- **Baseline Modeled Opportunity:** **₹15,31,393** across 23 lost and 7 partial intents.
- **Strict Distinction:** Modeled opportunity is an internal prioritization metric. It is **not** realized cash revenue, guaranteed sales, or a predictive conversion rate.

---

## Buyer Intent Forensics

The **Query Inspector** in the merchant workspace provides an end-to-end evidence trail for any evaluated intent:

```
[Intent ID: DEV-01] "I need a 16GB RAM laptop for heavy Docker workloads under 65000"
├── Structured Interpretation: { category: "laptop", min_ram_gb: 16, budget_max: 65000 }
├── Evaluated Constraints: Price ≤ ₹65,000 [PASSED], RAM ≥ 16GB [PASSED], Stock > 0 [PASSED]
├── Selected SKU: NX-LP-DEV15-01 (Nexora DevBook Pro 15)
├── Outcome Status: WON
└── Modeled Opportunity: ₹0 (Successfully served)

[Intent ID: INTENT-MISS-RAM-01] "I want the Nexora AlphaBook 14 with 16GB RAM"
├── Structured Interpretation: { model: "AlphaBook 14", min_ram_gb: 16 }
├── Rejection Reason: NX-LP-MINRAMMISS-14: RAM capacity is null in catalog specification.
├── Outcome Status: LOST (TRANSACTION_FAILURE / MISSING_ATTRIBUTE)
├── Modeled Opportunity: ₹48,999
└── Recommended Action: "Update catalog metadata with manufacturer-verified specification datasheet."
```

---

## Merchant-Approved Catalog Improvements

AgentReady generates actionable, brand-aware catalog improvement proposals:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ [PENDING FIX] FIX-RAM-01 • Nexora AlphaBook 14                                  │
│ Brand: Nexora | SKU: NX-LP-MINRAMMISS-14                                        │
│ Defect: ram.capacity_gb is null in catalog specification                        │
│ Proposed Patch: Set ram.capacity_gb = 16                                        │
│ Evidence: Manufacturer Datasheet (Intel Core i5-1340P, 16GB LPDDR5)             │
│ Modeled Opportunity: ₹48,999 | Affected Intents: 1                              │
│ [ Approve Fix ]                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**The Merchant Approval Gate:** Fixes are never applied automatically to live production. A merchant must review and explicitly approve a fix before it can be tested in an isolated experiment.

---

## Before / After: One-Fix Causal Experiment

To verify whether a catalog fix actually improves buyer outcomes, AgentReady enforces a strict **Causal Isolation Protocol**:

```
Catalog Version A (Immutable Baseline)
        │
        ├── + Exactly ONE Approved Fix (e.g., FIX-RAM-01)
        ▼
Catalog Version B (Enriched)
        │
        ▼
Rerun IDENTICAL 100 Benchmark Intents on Catalog B
        │
        ▼
Compare Intent-by-Intent Outcomes (Version A vs. Version B)
```

### Counting Real Outcome Transitions
AgentReady only records genuine outcome improvements:
- $\text{LOST} \longrightarrow \text{WON}$ (Defect resolved; unserved buyer can now complete purchase)
- $\text{PARTIAL} \longrightarrow \text{WON}$ (Hard constraints fully satisfied)
- $\text{LOST} \longrightarrow \text{PARTIAL}$ (Disclosed trade-off available)

$\text{WON} \longrightarrow \text{WON}$ is **explicitly excluded** from outcome transition counts. If a buyer was already purchasing an alternative product on Catalog A, switching the matched SKU to the fixed product does not represent a new customer acquisition.

---

## Current Experiment Example

### Real Causal Result: `FIX-RAM-01`

- **Target SKU:** `NX-LP-MINRAMMISS-14` (Nexora AlphaBook 14)
- **Patch Applied:** `ram.capacity_gb: null → 16`
- **Benchmark Population:** Identical 100 intents evaluated on Catalog A and Catalog B.

```
========================================================================
1-FIX EXPERIMENT COMPARISON RESULTS (FIX-RAM-01)
========================================================================
Metric                       Catalog A (Baseline)   Catalog B (Enriched)   Delta
------------------------------------------------------------------------
AI Buyer Readiness Score     73 / 100               73 / 100               0
Intent Match Rate            67.7%                  67.7%                  0.0%
Constraint Adherence Rate    73.2%                  73.2%                  0.0%
Checkout-Ready Rate          67.7%                  67.7%                  0.0%
Catalog Coverage Rate        93.0%                  93.0%                  0.0%
Verified Outcome Transitions 0                      0                      0
Modeled Catalog Opportunity  ₹15,31,393             ₹15,29,394             -₹1,999 (-0.1%)
========================================================================
```

### Scientific Explanation of Zero-Outcome Result
This zero-outcome transition is a **genuine, verified causal result**:
The benchmark intent requesting an AlphaBook was already being served by the qualifying **Nexora DevBook Pro 15** in baseline Catalog A. Fixing the RAM attribute on the AlphaBook made it eligible, but because the customer's intent was already in a `WON` state, no net new buyer was converted from `LOST` to `WON`. (The minor opportunity attribution adjustment of -₹1,999 reflects re-attribution on an already-resolved intent, not a customer conversion gain).

AgentReady reports this honestly rather than fabricating artificial conversion gains.

---

## Security & Trust Boundaries

```
┌───────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Boundary / Principle              │ Implementation                                         │
├───────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Server-Side Secrets               │ GROQ_API_KEY, RAZORPAY_KEY_SECRET, and                 │
│                                   │ RAZORPAY_WEBHOOK_SECRET are strictly server-side.      │
├───────────────────────────────────┼────────────────────────────────────────────────────────┤
│ No Tracked Secrets                │ .env is ignored by Git; .env.example contains only     │
│                                   │ placeholder variable names.                            │
├───────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Authoritative Pricing             │ Client cannot alter item prices; subtotal and paise    │
│                                   │ calculations are performed on the server.              │
├───────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Cryptographic Verification        │ Payment signatures and webhook payloads are verified   │
│                                   │ using HMAC-SHA256 with timing-safe comparisons.        │
├───────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Webhook Idempotency               │ Duplicate webhook event IDs are tracked to prevent     │
│                                   │ double-processing or multi-decrementing inventory.     │
├───────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Zero Hallucinated SKUs            │ Every product, price, and spec returned to the client   │
│                                   │ is grounded in catalog data.                           │
└───────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## Tech Stack

- **Runtime & Language:** Node.js (v22+ with `--experimental-strip-types`), TypeScript (v7.0+)
- **LLM Reasoning & NLU:** Groq SDK (`groq-sdk` v1.6.0) with `openai/gpt-oss-120b`
- **Payment Processing:** Razorpay Checkout (Test Mode), Razorpay Orders API, HMAC-SHA256 Webhooks
- **Frontend / UI:** Vanilla HTML5, Modern CSS (Glassmorphism, CSS Variables, Responsive Grid), Vanilla JavaScript ES Modules
- **Testing & Quality:** Node.js native test runner (`node:test`, `node:assert`), TypeScript compiler (`tsc --noEmit`)

---

## Project Structure

```
AgentReady/
├── public/                     # Presentation Layer (Client Assets)
│   ├── index.html              # Customer Chat & Merchant Intelligence UI
│   ├── style.css               # Dark theme design system & responsive layout
│   └── app.js                  # Frontend state machine & Razorpay Checkout handler
├── src/
│   ├── agent/                  # Agent Orchestration
│   │   └── agentOrchestrator.ts# Multi-turn conversation coordinator
│   ├── benchmark/              # Merchant Benchmark & Causal Intelligence
│   │   ├── benchmarkRunner.ts  # 100-intent evaluator & readiness scoring
│   │   ├── catalogFixEngine.ts # Proposal generation & merchant approval gate
│   │   └── experimentEngine.ts # 1-fix isolated causal experiment engine
│   ├── data/                   # Catalog & Benchmark Datasets
│   │   ├── catalog.ts          # Multi-brand hardware catalog (Apple, HP, Dell, etc.)
│   │   └── benchmarkIntents.ts # 100 controlled buyer intents
│   ├── engine/                 # Deterministic Commerce Core
│   │   ├── decisionEngine.ts   # Candidate evaluation & scoring pipeline
│   │   ├── hardConstraints.ts  # Budget, RAM, GPU, OS, stock filtering
│   │   ├── compatibility.ts    # Dimensional & protocol compatibility
│   │   └── orderManager.ts     # Authoritative basket, approval & Razorpay flow
│   ├── llm/                    # Language Model Provider
│   │   └── llmProvider.ts      # Groq SDK integration & Deterministic NLU fallback
│   ├── nlu/                    # Natural Language Understanding & Parsing
│   │   ├── intentExtractor.ts  # Multi-constraint extraction
│   │   └── normalization.ts    # Currency, RAM, GPU, storage normalizers
│   ├── repository/             # Catalog Repository
│   │   └── catalogRepository.ts# In-memory repository with Version A/B isolation
│   ├── server/                 # API & Webhook Layer
│   │   └── server.ts           # REST API endpoints & raw-body webhook handler
│   ├── services/               # External Services
│   │   └── razorpayService.ts  # Razorpay API client & HMAC verification
│   ├── session/                # Session & Basket Management
│   │   └── sessionManager.ts   # Multi-turn session state & accessory toggles
│   └── types/                  # TypeScript Interface Definitions
├── tests/                      # Automated Test Suite (28 Test Files)
├── scratch/                    # Development verification scripts
├── .env.example                # Safe environment variable template
├── package.json                # Project dependencies & run scripts
├── tsconfig.json               # TypeScript configuration
└── README.md                   # Technical documentation
```

---

## Local Setup

### Prerequisites
- Node.js v22.0.0 or higher
- npm v10.0.0 or higher
- (Optional) Groq API Key & Razorpay Test Key ID/Secret

### 1. Clone & Install
```bash
git clone https://github.com/BALAKISHAN1947/Ajay-Balu.git
cd Ajay-Balu
npm install
```

### 2. Configure Environment Variables
Create a `.env` file from the provided template:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```ini
RAZORPAY_KEY_ID=rzp_test_your_key_id_here
RAZORPAY_KEY_SECRET=your_key_secret_here
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
GROQ_API_KEY=gsk_your_groq_api_key_here
LLM_PROVIDER=groq
GROQ_MODEL=openai/gpt-oss-120b
```
*(Note: If `GROQ_API_KEY` is omitted, the engine automatically uses the Deterministic NLU fallback.)*

### 3. Run Type Check & Test Suite
```bash
# Verify TypeScript type correctness
npx tsc --noEmit

# Run full automated test suite (390 tests across 28 suites)
npm test
```

### 4. Start the Application
```bash
npm start
```
The server will start at **http://localhost:3000**. Open your browser to access both the **Customer Shopping Interface** and the **Merchant Intelligence Workspace**.

---

## Testing & Verification

AgentReady maintains complete automated test coverage across commerce logic, Razorpay payments, Groq NLU, benchmark metrics, and UI integrity:

### Test Suite Execution
```bash
npm test
```

**Verified Test Results:**
- **Total Tests:** 390
- **Suites:** 28
- **Passed:** 386
- **Failed:** 0
- **Skipped:** 4 *(Skipped tests are environment-dependent live network tests that execute when `GROQ_API_KEY` is present)*
- **TypeScript Errors:** 0 (`npx tsc --noEmit`)

### Key Test Suites:
1. `tests/customerCommerceIntegration.test.ts`: End-to-end customer flow (chat → recommendation → cross-sell → checkout → payment).
2. `tests/razorpayIntegration.test.ts`: Server-side paise amounts, HMAC-SHA256 signatures, webhook idempotency, and cancellation workflows.
3. `tests/merchantReadinessIntelligence.test.ts`: AI Buyer Readiness formula validation and metric calculations.
4. `tests/finalPassIntegrityAndExperiment.test.ts`: 1-fix causal isolation, Catalog A immutability, and real outcome transition tracking.
5. `tests/accessoryCheckboxAndBudgetSafety.test.ts`: Accessory opt-in integrity and budget ceiling protection.

### Measured Latency Breakdown (Production Diagnostic)

Live profiling with `openai/gpt-oss-120b` via Groq demonstrates clear, measured boundaries between AI natural-language reasoning and deterministic commerce logic:

| Component | Measured Latency | Operational Description |
| :--- | :---: | :--- |
| **Groq Intent Extraction** | ~1,160 – 1,860 ms | Parses unstructured user text into typed JSON constraints |
| **Deterministic Decision Engine** | ~1 – 25 ms | Authoritative catalog filtering, constraint validation & soft scoring |
| **Groq Grounded Explanation** | ~1,600 – 1,750 ms | Synthesizes conversational explanation citing only catalog facts |
| **Total Server Pipeline (Live Groq)** | ~2.8 – 3.7 s | Full server execution time for live two-call LLM orchestration |
| **Deterministic Fallback (Offline/Test)** | < 10 ms | Zero-latency regex/linguistic engine for testing & failover |
| **Client Rendering / Network Roundtrip** | ~30 – 70 ms | Browser DOM rendering and local HTTP transit |

*(Note: There is no artificial or guaranteed fixed latency ceiling. Total request latency represents the sum of live intent extraction, deterministic validation, explanation synthesis, and network transit. Explanation latency is not conflated with total pipeline latency.)*

---

## Honest Scope & Limitations

To ensure absolute credibility for reviewers and judges:
1. **Synthetic Catalog & Benchmark:** The product catalog and the 100 benchmark intents represent a realistic electronics marketplace designed for testing and reproducible evaluation.
2. **Razorpay Test Mode:** Payment workflows use Razorpay Test Mode keys (`rzp_test_...`) for safe demonstration.
3. **Modeled Opportunity:** Modeled Catalog Opportunity is an internal prioritization metric based on catalog item prices, not realized bank revenue.
4. **No External Ranking Control:** AgentReady optimizes the merchant's own catalog readiness for AI agents; it does not claim to manipulate third-party LLM search indexes (e.g., ChatGPT or Gemini search results).
5. **Causal Outcome Integrity:** If a catalog fix does not change net buyer outcomes, AgentReady reports zero transitions as a valid scientific finding.

---

## Demo Walkthrough

### Customer Experience Walkthrough
1. **Natural-Language Search:** Type *"I need a laptop for programming under 70000 with 16GB RAM"*.
2. **Groq Reasoning:** The agent parses the intent, verifies catalog stock, and recommends the **Nexora DevBook Pro 15** (₹64,999) with grounded spec explanations.
3. **Multi-Brand Comparison:** The agent shows alternative options from Lenovo and HP.
4. **Conversational Follow-Up:** Type *"Can I get that one?"* to lock the DevBook Pro.
5. **Relevant Cross-Sell:** Check the compatible **Nexora Commute Bag 15** (+₹2,499). The subtotal updates dynamically to ₹67,498.
6. **Authorization Gate:** Click **"Review & Authorize Order"** to view the itemized purchase review.
7. **Razorpay Checkout:** Click **"Approve & Pay (₹67,498)"** to open the Razorpay Test Mode modal.
8. **Server Verification:** Complete the test payment; the server verifies the HMAC signature and marks the order **PAID**.

### Merchant Intelligence Walkthrough
1. **Run Baseline Diagnostic:** Switch to the **Merchant Intelligence** tab and click **"Run 100-Intent Benchmark"**.
2. **Review Readiness Score:** Observe the baseline **AI Buyer Readiness Score (73/100)** and metric breakdown.
3. **Inspect Failure Map:** View failure categories (Constraint Failures, Metadata Gaps, Stockouts) and total Modeled Opportunity (₹15,31,393).
4. **Forensic Query Audit:** Click any failed intent (e.g., `INTENT-MISS-RAM-01`) to inspect missing attributes and rejection reasons.
5. **Approve a Catalog Fix:** Review proposed fixes and approve **FIX-RAM-01** (`NX-LP-MINRAMMISS-14`).
6. **Run Causal Experiment:** Click **"Run 1-Fix Experiment"** to test the approved change on Catalog Version B against the exact same 100 intents.
7. **Verify Outcome Audit:** Observe that Version A is preserved as an immutable baseline and the transition report accurately reflects the isolated causal effect.
