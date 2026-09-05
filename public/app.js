// AgentReady Customer Client Application
// Architecture: Customer UI -> Agent API -> Decision Engine
// Authoritative: UI contains ZERO business rules or price calculations.

let currentSessionId = `ses_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
let currentRecommendation = null;
let authoritativeSelectedSkus = [];

// DOM Elements
const sessionIdDisplay = document.getElementById('session-id-display');
const resetSessionBtn = document.getElementById('reset-session-btn');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const agentStatusBadge = document.getElementById('agent-status-badge');
const clarificationBanner = document.getElementById('clarification-banner');
const clarificationText = document.getElementById('clarification-text');

// Recommendation Panel Elements
const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading-state');
const recommendationCard = document.getElementById('recommendation-card');
const noMatchCard = document.getElementById('no-match-card');
const noMatchExplanation = document.getElementById('no-match-explanation');
const noCategoryCard = document.getElementById('no-category-card');
const noCategoryExplanation = document.getElementById('no-category-explanation');
const noCategoryTitle = document.getElementById('no-category-title');
const engineStatusTag = document.getElementById('engine-status-tag');
const confidenceIndicator = document.getElementById('confidence-indicator');
const confidenceScore = document.getElementById('confidence-score');

// Product Fields
const productName = document.getElementById('product-name');
const productSku = document.getElementById('product-sku');
const productVariant = document.getElementById('product-variant');
const productPrice = document.getElementById('product-price');
const stockBadge = document.getElementById('stock-badge');
const specRam = document.getElementById('spec-ram');
const specStorage = document.getElementById('spec-storage');
const specWeight = document.getElementById('spec-weight');
const specBattery = document.getElementById('spec-battery');
const specGpu = document.getElementById('spec-gpu');
const proactiveAddonsSection = document.getElementById('proactive-addons-section');
const proactiveAddonsList = document.getElementById('proactive-addons-list');
const rationaleList = document.getElementById('rationale-list');
const tradeOffsList = document.getElementById('trade-offs-list');
const rejectionsList = document.getElementById('rejections-list');
const accessoriesList = document.getElementById('accessories-list');
const bundleLineItems = document.getElementById('bundle-line-items');
const bundleTotalPrice = document.getElementById('bundle-total-price');
const customerBudgetVal = document.getElementById('customer-budget-val');
const budgetMarginVal = document.getElementById('budget-margin-val');
const compareBtn = document.getElementById('compare-btn');
const authorizeBtn = document.getElementById('authorize-btn');

// Modals
const compareModal = document.getElementById('compare-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const compareBody = document.getElementById('compare-body');
const reviewOverlay = document.getElementById('review-overlay');
const closeReviewBtn = document.getElementById('close-review-btn');
const reviewContent = document.getElementById('review-content');
const reviewSessionId = document.getElementById('review-session-id');

// Milestone 4: Razorpay Checkout Elements
const proceedPaymentBtn = document.getElementById('proceed-payment-btn');
const retryPaymentBtn = document.getElementById('retry-payment-btn');
const paymentActionBox = document.getElementById('payment-action-box');
const paymentStatusCard = document.getElementById('payment-status-card');
const paymentStatusIcon = document.getElementById('payment-status-icon');
const paymentStatusTitle = document.getElementById('payment-status-title');
const paymentStatusDesc = document.getElementById('payment-status-desc');
const paymentDetailsBox = document.getElementById('payment-details-box');
const paymentRetryWrap = document.getElementById('payment-retry-wrap');
const orderRefId = document.getElementById('order-ref-id');
const razorpayRefId = document.getElementById('razorpay-ref-id');
const paymentRefId = document.getElementById('payment-ref-id');
const orderAmountPaid = document.getElementById('order-amount-paid');
const orderFinalStatus = document.getElementById('order-final-status');
const gateStatusText = document.getElementById('gate-status-text');

// Initialize Session
function initSession() {
  sessionIdDisplay.textContent = currentSessionId;
  agentStatusBadge.textContent = 'Ready';
}
initSession();

resetSessionBtn.addEventListener('click', () => {
  currentSessionId = `ses_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  currentRecommendation = null;
  authoritativeSelectedSkus = [];
  sessionIdDisplay.textContent = currentSessionId;
  chatMessages.innerHTML = '';
  appendAgentMessage('New session started. Describe your workspace requirements to begin.', 'Ready');
  showEmptyState();
  clarificationBanner.classList.add('hidden');
});

// Quick Prompts
document.querySelectorAll('.quick-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const query = e.target.getAttribute('data-query');
    if (query) {
      chatInput.value = query;
      submitUserQuery(query);
    }
  });
});

// Chat Form Submission
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  submitUserQuery(text);
});

async function submitUserQuery(text) {
  appendUserMessage(text);
  chatInput.value = '';
  chatInput.disabled = true;
  sendBtn.disabled = true;

  setAgentState('THINKING', 'Understanding your request...');
  showLoadingState();

  // Temporary in-chat processing indicator (Understanding your requirements… / Understanding your request...)
  const procMsg = document.createElement('div');
  procMsg.className = 'message agent-message processing-msg';
  procMsg.innerHTML = `
    <div class="message-meta">
      <span class="agent-avatar">AI</span>
      <span class="sender-name">Shopping Assistant • Analyzing</span>
      <span class="time-stamp">Just now</span>
    </div>
    <div class="message-body" style="display: flex; align-items: center; gap: 0.5rem; color: #38bdf8;">
      <span class="inline-spinner"></span>
      <span class="proc-text">Understanding your request...</span>
    </div>
  `;
  chatMessages.appendChild(procMsg);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const procTextEl = procMsg.querySelector('.proc-text');
  const loadingTitleEl = document.querySelector('.loading-title');

  const updateStage = (stageText) => {
    if (procTextEl) procTextEl.textContent = stageText;
    if (loadingTitleEl) loadingTitleEl.textContent = stageText;
    setAgentState('THINKING', stageText);
  };

  // Checking the verified catalog... (Checking Nexora’s catalog…)
  const timer1 = setTimeout(() => updateStage('Checking the verified catalog...'), 450);
  // Comparing available options… (Comparing available options...)
  const timer2 = setTimeout(() => updateStage('Comparing available options...'), 950);

  const startTime = Date.now();

  try {
    const res = await fetch('/api/v1/agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: currentSessionId,
        message: text,
        t1_frontend_start: startTime
      })
    });

    if (!res.ok) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      procMsg.remove();
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    // Real processing completed; target response latency ~2s (bounded: 1600 - elapsed)
    clearTimeout(timer1);
    clearTimeout(timer2);
    if (procMsg.parentNode) {
      procMsg.remove();
    }

    handleAgentResponse(data);
  } catch (err) {
    clearTimeout(timer1);
    clearTimeout(timer2);
    if (procMsg.parentNode) {
      procMsg.remove();
    }
    appendAgentMessage(`Error processing request: ${err.message}`, 'Error');
    setAgentState('ERROR', 'System Error');
    showEmptyState();
  } finally {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

function handleAgentResponse(data) {
  // Sync single authoritative accessory selection state from backend response (Bug 3)
  if (Array.isArray(data.selected_accessory_skus)) {
    authoritativeSelectedSkus = data.selected_accessory_skus;
  } else if (Array.isArray(data.recommendation?.accessories)) {
    authoritativeSelectedSkus = data.recommendation.accessories.map((a) => a.sku);
  } else {
    authoritativeSelectedSkus = [];
  }

  if (data.state === 'CLARIFICATION_REQUIRED') {
    setAgentState('CLARIFICATION', 'Needs Input');
    clarificationBanner.classList.remove('hidden');
    clarificationText.textContent = data.clarification_question || 'Please specify additional details.';
    appendAgentMessage(data.clarification_question || 'I need clarification to proceed.', 'Clarification Needed');
    showEmptyState();
    return;
  }

  clarificationBanner.classList.add('hidden');

  if (data.state === 'NO_CATEGORY_MATCH') {
    setAgentState('NO_CATEGORY_MATCH', 'Unsupported Category');
    appendAgentMessage(data.explanation || 'Our verified catalog does not carry that product category.', 'Unsupported Category');
    showNoCategoryMatchState(data.explanation, data.unsupported_category);
    return;
  }

  if (data.state === 'NO_PRODUCT_MATCH' || data.state === 'NO_MATCH') {
    setAgentState('NO_MATCH', 'Zero Matches');
    appendAgentMessage(data.explanation || 'No candidates met all hard constraints.', 'No Match');
    showNoMatchState(data.explanation);
    return;
  }

  if (data.state === 'PARTIAL_MATCH' && data.recommendation) {
    currentRecommendation = data.recommendation;
    setAgentState('PARTIAL_MATCH', 'Partial Match');
    appendAgentMessage(data.explanation || 'Partial match available.', 'Partial Match');
    renderRecommendation(data.recommendation);
    return;
  }

  if ((data.state === 'VALID_MATCH' || data.state === 'RECOMMENDATION_READY') && data.recommendation) {
    currentRecommendation = data.recommendation;
    setAgentState('RECOMMENDED', 'Matched');
    appendAgentMessage(data.explanation || 'Verified recommendation ready.', 'Recommendation Ready');
    renderRecommendation(data.recommendation);
    return;
  }

  if (data.state === 'INVALID_BUDGET_INPUT') {
    setAgentState('ERROR', 'Invalid Budget');
    appendAgentMessage(data.explanation || 'Please provide a valid positive budget.', 'Invalid Budget Input');
    showEmptyState();
    return;
  }

  if (data.state === 'ERROR') {
    setAgentState('ERROR', 'Validation Error');
    const msg = data.errors ? data.errors.join(', ') : 'An unexpected error occurred.';
    appendAgentMessage(`Validation Error: ${msg}`, 'Error');
    showEmptyState();
  }
}

function renderRecommendation(rec) {
  emptyState.classList.add('hidden');
  loadingState.classList.add('hidden');
  noMatchCard.classList.add('hidden');
  noCategoryCard.classList.add('hidden');
  recommendationCard.classList.remove('hidden');

  engineStatusTag.textContent = 'Active Recommendation Locked';

  const laptop = rec.recommended_laptop.product;
  const locked = rec.locked_variant;

  // Precise factual verification status (no arbitrary percentages)
  confidenceIndicator.classList.remove('hidden');
  if (rec.match_type === 'PARTIAL_MATCH') {
    confidenceScore.textContent = 'Partial Match • Budget Exceeded';
  } else if (laptop.ram.capacity_gb === null) {
    confidenceScore.textContent = 'Hard Constraints Verified • RAM Not Verified';
  } else if (rec.accessories && rec.accessories.length > 0) {
    confidenceScore.textContent = 'Hard Constraints & Compatibility Verified';
  } else {
    confidenceScore.textContent = 'Hard Constraints Verified';
  }

  productName.textContent = laptop.name;
  productSku.textContent = laptop.sku;
  productVariant.textContent = locked.variant_id;
  productPrice.textContent = locked.price_inr.toLocaleString('en-IN');
  stockBadge.textContent = `${laptop.stock_quantity} units available`;

  // Specification facts with verification tags
  specRam.textContent = locked.ram_summary;
  const specRamTag = document.getElementById('spec-ram-tag');
  if (specRamTag) {
    if (laptop.ram.capacity_gb === null) {
      specRamTag.textContent = 'NOT VERIFIED';
      specRamTag.className = 'spec-tag unverified';
    } else {
      specRamTag.textContent = 'VERIFIED';
      specRamTag.className = 'spec-tag verified';
    }
  }

  specStorage.textContent = locked.storage_summary;
  // Bug guard: weight_g must be a finite number
  const weightKg = (typeof laptop.weight_g === 'number' && isFinite(laptop.weight_g))
    ? (laptop.weight_g / 1000).toFixed(2) : 'Unknown';
  specWeight.textContent = `${weightKg} kg`;
  specBattery.textContent = `${laptop.battery.capacity_wh}Wh (~${laptop.battery.claimed_hours} hrs)`;

  if (specGpu) {
    if (laptop.gpu) {
      if (laptop.gpu.is_dedicated) {
        specGpu.textContent = `${laptop.gpu.model} (${laptop.gpu.vram_gb}GB GDDR6)`;
      } else {
        specGpu.textContent = `${laptop.gpu.model} (Integrated)`;
      }
    } else {
      specGpu.textContent = 'Integrated Graphics';
    }
  }

  // Rationale
  rationaleList.innerHTML = '';
  // Bug 1 fix: field is total_score, not final_score
  const totalScore = rec.recommended_laptop.total_score;
  const safeScore = (typeof totalScore === 'number' && isFinite(totalScore)) ? totalScore : 0;
  // Bug 2 fix: processor field is .cores, not .cores_physical
  const coreCount = (typeof laptop.processor.cores === 'number') ? laptop.processor.cores : '?';
  // Bug 4/6 fix: budget_margin can be negative in PARTIAL_MATCH; show actual margin sign clearly
  const margin = rec.budget_margin_inr;
  const marginLabel = (typeof margin === 'number' && isFinite(margin))
    ? (margin >= 0
        ? `₹${margin.toLocaleString('en-IN')} under budget`
        : `₹${Math.abs(margin).toLocaleString('en-IN')} over budget`)
    : 'Budget margin unavailable';
  const reasons = [
    `Highest-scoring hard-constraint match — deterministic utility score: ${safeScore.toFixed(2)}/100`,
    `Processor: ${coreCount}-core ${laptop.processor.model} (Gen ${laptop.processor.generation})`,
    `Weight: ${weightKg} kg — within preferred mobility envelope`,
    `Price: ₹${locked.price_inr.toLocaleString('en-IN')} — ${marginLabel}`
  ];
  reasons.forEach((r) => {
    const li = document.createElement('li');
    li.textContent = r;
    rationaleList.appendChild(li);
  });

  // Trade-offs
  tradeOffsList.innerHTML = '';
  if (rec.trade_offs && rec.trade_offs.length > 0) {
    rec.trade_offs.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      tradeOffsList.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'None identified for this configuration.';
    tradeOffsList.appendChild(li);
  }

  // Rejections
  rejectionsList.innerHTML = '';
  const topRejections = rec.rejections.slice(0, 3);
  topRejections.forEach((rej) => {
    const div = document.createElement('div');
    div.className = 'rejection-item';
    div.innerHTML = `<div><strong>${rej.name || rej.sku}</strong> — Rule: <code>${rej.rule}</code></div><div class="rejection-reason">${rej.reason}</div>`;
    rejectionsList.appendChild(div);
  });

  // Accessories
  renderAccessories(rec.accessories, rec.compatibility_checks);

  // Proactive Add-Ons
  renderProactiveAddOns(rec.proactive_add_ons, rec.accessories);

  // Bundle Summary
  updateBundleSummary(rec.itemized_line_items, rec.total_price_inr, rec.budget_ceiling_inr, rec.budget_margin_inr);
}

function renderProactiveAddOns(proactiveAddOns, currentAccessories) {
  if (!proactiveAddonsSection || !proactiveAddonsList) return;

  if (!proactiveAddOns || proactiveAddOns.length === 0) {
    proactiveAddonsSection.classList.add('hidden');
    proactiveAddonsList.innerHTML = '';
    return;
  }

  const currentSkus = (currentAccessories || []).map((a) => a.sku);
  const availableAddOns = proactiveAddOns.filter((a) => !currentSkus.includes(a.sku));

  if (availableAddOns.length === 0) {
    proactiveAddonsSection.classList.add('hidden');
    proactiveAddonsList.innerHTML = '';
    return;
  }

  proactiveAddonsSection.classList.remove('hidden');
  proactiveAddonsList.innerHTML = '';

  const eligible = availableAddOns.filter(
    (a) => a.state === 'ELIGIBLE_CROSS_SELL' || (a.is_within_budget && !a.state)
  );
  const overBudget = availableAddOns.filter(
    (a) => a.state === 'COMPATIBLE_BUT_OVER_BUDGET' || (!a.is_within_budget && a.budget_delta_inr)
  );

  const elHeader = document.createElement('div');
  elHeader.className = 'addon-subheading';
  elHeader.style.cssText = 'font-size: 0.85rem; font-weight: 700; color: #38bdf8; margin: 0.5rem 0 0.25rem; text-transform: uppercase; letter-spacing: 0.5px;';
  elHeader.textContent = 'Recommended for Your Setup';
  proactiveAddonsList.appendChild(elHeader);

  availableAddOns.forEach((addon) => {
    const isChecked = authoritativeSelectedSkus.includes(addon.sku);
    const card = document.createElement('div');
    card.className = 'accessory-card';
    card.innerHTML = `
      <div class="accessory-left" style="width: 100%;">
        <input type="checkbox" class="accessory-checkbox proactive-checkbox" data-sku="${addon.sku}" ${isChecked ? 'checked' : ''} id="proactive-${addon.sku}" />
        <div class="accessory-info" style="width: 100%;">
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <label for="proactive-${addon.sku}" class="accessory-name" style="font-weight: 700;">${addon.name}</label>
            <span style="font-weight: 700; font-size: 0.88rem; color: #38bdf8;">+₹${addon.price_inr.toLocaleString('en-IN')}</span>
          </div>
          <span class="accessory-compat-proof">✓ ${addon.compatibility_reason}</span>
          <span class="accessory-hint" style="font-size:0.75rem; color:#94a3b8; display:block; margin-top:2px;">${addon.relevance_reason}</span>
        </div>
      </div>
    `;

    const checkbox = card.querySelector('.proactive-checkbox');
    checkbox.addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      await toggleAccessoryBackend(addon.sku, isChecked, checkbox);
    });

    proactiveAddonsList.appendChild(card);
  });
}

function renderAccessories(accessories, checks) {
  accessoriesList.innerHTML = '';
  if (!accessories || accessories.length === 0) {
    accessoriesList.innerHTML = '<p class="accessory-hint">No accessories required for this request.</p>';
    return;
  }

  accessories.forEach((acc) => {
    const chk = (checks || []).find((c) => c.accessory_sku === acc.sku);
    const isChecked = authoritativeSelectedSkus.includes(acc.sku);
    const card = document.createElement('div');
    card.className = 'accessory-card';
    card.innerHTML = `
      <div class="accessory-left">
        <input type="checkbox" class="accessory-checkbox" data-sku="${acc.sku}" ${isChecked ? 'checked' : ''} id="acc-${acc.sku}" />
        <div class="accessory-info">
          <label for="acc-${acc.sku}" class="accessory-name">${acc.name}</label>
          <span class="accessory-meta">SKU: ${acc.sku} • Stock: ${acc.stock_quantity}</span>
          <span class="accessory-compat-proof">✓ ${chk ? chk.reason : 'Verified Compatible'}</span>
        </div>
      </div>
      <div class="accessory-price">₹${acc.price_inr.toLocaleString('en-IN')}</div>
    `;

    const checkbox = card.querySelector('.accessory-checkbox');
    checkbox.addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      await toggleAccessoryBackend(acc.sku, isChecked, checkbox);
    });

    accessoriesList.appendChild(card);
  });
}

async function toggleAccessoryBackend(sku, included, checkboxEl) {
  try {
    const res = await fetch(`/api/v1/session/${currentSessionId}/accessory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, included })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Compatibility Enforcement: ${data.error}`);
      checkboxEl.checked = !included; // Revert checkbox
      return;
    }

    const rec = data.latest_recommendation;
    currentRecommendation = rec;
    authoritativeSelectedSkus = Array.isArray(data.selected_accessory_skus)
      ? data.selected_accessory_skus
      : (rec.accessories || []).map((a) => a.sku);
    renderAccessories(rec.accessories, rec.compatibility_checks || []);
    renderProactiveAddOns(rec.proactive_add_ons, rec.accessories);
    updateBundleSummary(rec.itemized_line_items, rec.total_price_inr, rec.budget_ceiling_inr, rec.budget_margin_inr);
    // Clear any stale payment status card when basket changes
    if (paymentStatusCard) paymentStatusCard.classList.add('hidden');
    if (paymentRetryWrap) paymentRetryWrap.classList.add('hidden');

    const hasLimit = rec.budget_ceiling_inr !== undefined && rec.budget_ceiling_inr !== null && rec.budget_ceiling_inr > 0 && isFinite(rec.budget_ceiling_inr);
    const isAboveBudget = hasLimit && rec.total_price_inr > rec.budget_ceiling_inr;
    const delta = hasLimit ? Math.abs(rec.total_price_inr - rec.budget_ceiling_inr) : 0;
    if (isAboveBudget) {
      appendAgentMessage(
        `Added to your selected order. Order total: ₹${rec.total_price_inr.toLocaleString('en-IN')} (Your selected order is ₹${delta.toLocaleString('en-IN')} above your original budget).`,
        'Order Updated'
      );
    } else {
      appendAgentMessage(`Added to your selected order. Order total: ₹${rec.total_price_inr.toLocaleString('en-IN')}`, 'Order Updated');
    }
  } catch (err) {
    alert(`Failed to update accessory: ${err.message}`);
    checkboxEl.checked = !included;
  }
}

function updateBundleSummary(lineItems, total, budget, margin) {
  bundleLineItems.innerHTML = '';
  lineItems.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'bundle-line-item';
    row.innerHTML = `<span>${it.name}</span><strong>₹${it.price_inr.toLocaleString('en-IN')}</strong>`;
    bundleLineItems.appendChild(row);
  });

  const hasBudget = budget !== undefined && budget !== null && budget > 0 && isFinite(budget);
  bundleTotalPrice.textContent = `₹${total.toLocaleString('en-IN')}`;
  customerBudgetVal.textContent = hasBudget ? `₹${budget.toLocaleString('en-IN')}` : 'Flexible';

  const isAboveBudget = hasBudget && total > budget;
  const delta = hasBudget ? Math.abs(total - budget) : 0;
  
  if (isAboveBudget) {
    budgetMarginVal.textContent = `₹${delta.toLocaleString('en-IN')} above original budget`;
    budgetMarginVal.className = 'cyan-text';
  } else {
    budgetMarginVal.textContent = 'Within original budget ✓';
    budgetMarginVal.className = 'green-text';
  }

  const actionNote = document.getElementById('purchase-action-note') || document.querySelector('.action-note');
  const authBtnText = document.getElementById('authorize-btn-text') || authorizeBtn;
  if (authBtnText) authBtnText.textContent = 'Review & Pay with Razorpay →';

  const overbudgetBox = document.getElementById('overbudget-action-box');
  if (overbudgetBox) {
    if (isAboveBudget) {
      overbudgetBox.classList.remove('hidden');
      overbudgetBox.innerHTML = `
        <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 6px; padding: 0.75rem 1rem; margin-top: 0.75rem; font-size: 0.85rem; color: #bae6fd;">
          Your selected order is ₹${delta.toLocaleString('en-IN')} above your original budget.
        </div>
      `;
    } else {
      overbudgetBox.classList.add('hidden');
      overbudgetBox.innerHTML = '';
    }
  }

  // Once products are explicitly selected, checkout is immediately available for valid orders
  authorizeBtn.disabled = false;
  authorizeBtn.classList.remove('disabled');
  authorizeBtn.style.opacity = '1';
  authorizeBtn.style.cursor = 'pointer';
  if (actionNote) {
    actionNote.textContent = '';
    actionNote.style.color = '';
  }
}

window.handleInlineRemoveAccessory = async function (sku) {
  const checkboxEl = document.querySelector(`.accessory-checkbox[data-sku="${sku}"]`);
  await toggleAccessoryBackend(sku, false, checkboxEl || { checked: false });
};

// Compare Action
compareBtn.addEventListener('click', async () => {
  const altSku = 'NX-LP-DEVPRO15-09'; // DevForge 15 benchmark alternative
  try {
    const res = await fetch(`/api/v1/session/${currentSessionId}/compare?alternative_sku=${altSku}`);
    if (!res.ok) {
      const err = await res.json();
      alert(`Comparison error: ${err.error}`);
      return;
    }
    const data = await res.json();
    renderCompareModal(data);
  } catch (err) {
    alert(`Could not load comparison: ${err.message}`);
  }
});

function renderCompareModal(data) {
  const primaryWeightKg = (typeof data.primary.weight_g === 'number' && isFinite(data.primary.weight_g))
    ? (data.primary.weight_g / 1000).toFixed(2) : 'N/A';
  const altWeightKg = (typeof data.alternative.weight_g === 'number' && isFinite(data.alternative.weight_g))
    ? (data.alternative.weight_g / 1000).toFixed(2) : 'N/A';

  compareBody.innerHTML = `
    <div class="compare-grid">
      <div class="compare-card winner">
        <span class="badge verified-badge">SELECTED CANDIDATE</span>
        <h4 class="compare-card-title">${data.primary.name}</h4>
        <p class="mono">${data.primary.sku}</p>
        <div style="margin-top: 0.5rem; font-size: 0.85rem;">
          <div>Price: <strong>₹${data.primary.price_inr.toLocaleString('en-IN')}</strong></div>
          <div>Weight: <strong>${primaryWeightKg} kg</strong></div>
          <div>Battery: <strong>${data.primary.battery_wh} Wh</strong></div>
          <div>Screen: <strong>${data.primary.screen_size_inch}"</strong></div>
        </div>
      </div>
      <div class="compare-card">
        <span class="badge category-badge">ALTERNATIVE</span>
        <h4 class="compare-card-title">${data.alternative.name}</h4>
        <p class="mono">${data.alternative.sku}</p>
        <div style="margin-top: 0.5rem; font-size: 0.85rem;">
          <div>Price: <strong>₹${data.alternative.price_inr.toLocaleString('en-IN')}</strong></div>
          <div>Weight: <strong>${altWeightKg} kg</strong></div>
          <div>Battery: <strong>${data.alternative.battery_wh} Wh</strong></div>
          <div>Screen: <strong>${data.alternative.screen_size_inch}"</strong></div>
        </div>
      </div>
    </div>
    <h4 class="subhead">Verified Factual Differences:</h4>
    <ul class="diff-list">
      ${data.factual_differences.map((d) => `<li>${d}</li>`).join('')}
    </ul>
  `;
  compareModal.classList.remove('hidden');
}

closeModalBtn.addEventListener('click', () => {
  compareModal.classList.add('hidden');
});

// Purchase Authorization Review Action
authorizeBtn.addEventListener('click', async () => {
  try {
    const res = await fetch(`/api/v1/session/${currentSessionId}/review`);
    if (!res.ok) {
      const err = await res.json();
      alert(`Review error: ${err.error}`);
      return;
    }
    const data = await res.json();
    renderPurchaseReview(data);
  } catch (err) {
    alert(`Could not generate review: ${err.message}`);
  }
});

function renderPurchaseReview(review) {
  reviewSessionId.textContent = review.session_id;

  const budgetCeil = review.customer_budget_inr;
  const hasBudgetLimit = budgetCeil !== undefined && budgetCeil !== null && budgetCeil > 0 && isFinite(budgetCeil);
  const isAboveBudget = hasBudgetLimit && review.final_total_inr > budgetCeil;
  const delta = hasBudgetLimit ? Math.abs(review.final_total_inr - budgetCeil) : 0;
  const budgetMarginDisplay = isAboveBudget
    ? `<span class="cyan-text">₹${delta.toLocaleString('en-IN')} Above Original Budget</span>`
    : `<span class="green-text">Within Original Budget ✓</span>`;

  const infoBanner = isAboveBudget ? `
    <div class="order-budget-info-banner" style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 1rem; color: #bae6fd; font-size: 0.9rem;">
      Your selected order is ₹${delta.toLocaleString('en-IN')} above your original budget.
    </div>
  ` : '';

  reviewContent.innerHTML = `
    ${infoBanner}
    <div style="background: #090d16; padding: 1.25rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
      <h4 style="font-size: 1.1rem; color: #fff; margin-bottom: 0.5rem;">${review.primary_product.name}</h4>
      <div style="display: flex; gap: 1rem; font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.75rem;">
        <span>SKU: <strong class="mono" style="color:#fff;">${review.primary_product.sku}</strong></span>
        <span>Variant: <strong class="mono" style="color:#fff;">${review.primary_product.variant_id}</strong></span>
        <span>Stock: <strong class="green-text">${review.primary_product.stock} units verified</strong></span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; font-size: 0.8rem; background: #111827; padding: 0.75rem; border-radius: 6px;">
        <div>Memory: <strong>${review.primary_product.ram_summary}</strong></div>
        <div>Storage: <strong>${review.primary_product.storage_summary}</strong></div>
        <div>Battery: <strong>${review.primary_product.battery_wh}Wh</strong></div>
      </div>
    </div>

    <h4 class="subhead" style="margin-top: 1rem;">Selected Order Items:</h4>
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      ${review.accessories.length > 0 ? review.accessories.map((a) => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: #111827; padding: 0.6rem 0.85rem; border-radius: 6px; font-size: 0.85rem;">
          <div>
            <strong>${a.name}</strong> <span class="mono" style="font-size: 0.75rem; color: #64748b;">(${a.sku})</span>
            <div style="font-size: 0.75rem; color: #a7f3d0;">✓ ${a.compatibility_reason}</div>
          </div>
          <strong>₹${a.price_inr.toLocaleString('en-IN')}</strong>
        </div>
      `).join('') : '<p class="accessory-hint">No additional accessories selected.</p>'}
    </div>

    <div style="margin-top: 1rem; padding: 1rem; background: #111827; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);">
      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <span style="font-size: 1.1rem; font-weight: 700;">Order Total:</span>
        <span style="font-size: 1.6rem; font-weight: 800; color: #10b981;">₹${review.final_total_inr.toLocaleString('en-IN')}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem;">
        <span>Original Budget: ${hasBudgetLimit ? `₹${budgetCeil.toLocaleString('en-IN')}` : 'Flexible'}</span>
        ${budgetMarginDisplay}
      </div>
    </div>
  `;

  reviewOverlay.classList.remove('hidden');

  // Reset payment UI state
  paymentStatusCard.classList.add('hidden');
  paymentActionBox.classList.remove('hidden');
  paymentRetryWrap.classList.add('hidden');
  paymentDetailsBox.classList.add('hidden');

  gateStatusText.textContent = 'AUTHORIZED_PENDING_GATEWAY';
  gateStatusText.className = 'green-text';
  paymentActionBox.innerHTML = `
    <button id="proceed-payment-btn" class="btn-razorpay">
      <span class="razorpay-icon">⚡</span>
      <span id="proceed-payment-text">Approve &amp; Pay with Razorpay (Test Mode)</span>
    </button>
    <div class="test-mode-note">
      🔒 <strong>Simulated Razorpay Test Mode:</strong> No real money moves. Key prefix: <code class="mono">rzp_test_...</code>
    </div>
  `;
  const newProceedBtn = document.getElementById('proceed-payment-btn');
  if (newProceedBtn) {
    newProceedBtn.addEventListener('click', handleProceedPayment);
  }
}

closeReviewBtn.addEventListener('click', () => {
  reviewOverlay.classList.add('hidden');
});

// Milestone 4 Payment UI Helper
function updatePaymentState(state, desc, details) {
  paymentStatusCard.classList.remove('hidden');
  paymentStatusDesc.textContent = desc;

  switch (state) {
    case 'CHECKOUT_LOADING':
    case 'VALIDATING':
      paymentStatusIcon.textContent = '⏳';
      paymentStatusTitle.textContent = 'Validating purchase...';
      paymentDetailsBox.classList.add('hidden');
      paymentRetryWrap.classList.add('hidden');
      paymentActionBox.classList.add('hidden');
      break;
    case 'GATE_AUTHORIZED':
      paymentStatusIcon.textContent = '⚡';
      paymentStatusTitle.textContent = 'Order authorized';
      paymentDetailsBox.classList.add('hidden');
      paymentRetryWrap.classList.add('hidden');
      paymentActionBox.classList.add('hidden');
      break;
    case 'RAZORPAY_ORDER_CREATED':
    case 'OPENING':
      paymentStatusIcon.textContent = '⚡';
      paymentStatusTitle.textContent = 'Launching Razorpay Checkout...';
      paymentDetailsBox.classList.add('hidden');
      paymentRetryWrap.classList.add('hidden');
      paymentActionBox.classList.add('hidden');
      break;
    case 'PAYMENT_IN_PROGRESS':
    case 'PENDING':
      paymentStatusIcon.textContent = '💳';
      paymentStatusTitle.textContent = 'Payment in progress...';
      paymentDetailsBox.classList.add('hidden');
      paymentRetryWrap.classList.add('hidden');
      paymentActionBox.classList.add('hidden');
      break;
    case 'VERIFYING':
      paymentStatusIcon.textContent = '🔐';
      paymentStatusTitle.textContent = 'Verifying payment...';
      paymentDetailsBox.classList.add('hidden');
      paymentRetryWrap.classList.add('hidden');
      paymentActionBox.classList.add('hidden');
      break;
    case 'PAYMENT_SUCCESS':
    case 'CONFIRMED':
      paymentStatusIcon.textContent = '✅';
      paymentStatusTitle.textContent = 'PAYMENT SUCCESSFUL ✓';
      paymentStatusDesc.textContent = 'Your order has been authorized successfully.';
      gateStatusText.textContent = 'PAID_AND_COMPLETED';
      gateStatusText.className = 'green-text';
      if (details) {
        orderRefId.textContent = details.internal_order_id || '--';
        razorpayRefId.textContent = details.razorpay_order_id || '--';
        paymentRefId.textContent = details.payment_id || '--';
        orderAmountPaid.textContent = `₹${details.amount}`;
        orderFinalStatus.textContent = 'Paid';
        orderFinalStatus.className = 'status-pill completed';
        paymentDetailsBox.classList.remove('hidden');
      }
      paymentRetryWrap.classList.add('hidden');
      paymentActionBox.classList.add('hidden');
      appendAgentMessage(
        `🎉 **Order Confirmed!**\n\nYour purchase has been verified and confirmed.\n\n• **Order ID:** \`${details?.internal_order_id}\`\n• **Razorpay Order:** \`${details?.razorpay_order_id}\`\n• **Payment ID:** \`${details?.payment_id}\`\n• **Amount:** ₹${details?.amount}\n\nInventory allocation complete. Thank you for your purchase!`,
        'Checkout System'
      );
      break;
    case 'CANCELLED':
      paymentStatusIcon.textContent = '⚠️';
      paymentStatusTitle.textContent = 'Payment cancelled';
      paymentDetailsBox.classList.add('hidden');
      paymentRetryWrap.classList.remove('hidden');
      paymentActionBox.classList.add('hidden');
      break;
    case 'PAYMENT_FAILED':
    case 'FAILED':
      paymentStatusIcon.textContent = '❌';
      paymentStatusTitle.textContent = 'Payment failed';
      paymentDetailsBox.classList.add('hidden');
      paymentRetryWrap.classList.remove('hidden');
      paymentActionBox.classList.add('hidden');
      break;
  }
}

// Payment Initiation & Razorpay Checkout Modal
async function handleProceedPayment() {
  // Clear any previous error or retry UI
  paymentRetryWrap.classList.add('hidden');
  paymentDetailsBox.classList.add('hidden');

  const btn = document.getElementById('proceed-payment-btn') || proceedPaymentBtn;
  if (btn) {
    btn.disabled = true;
    const btnText = btn.querySelector('#proceed-payment-text') || btn;
    btnText.textContent = 'Preparing secure Razorpay checkout...';
  }
  updatePaymentState('CHECKOUT_LOADING', 'Preparing secure Razorpay checkout...');

  try {
    // Step 1: Customer Approval Gate
    const approveRes = await fetch('/api/v1/checkout/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: currentSessionId })
    });
    const approveData = await approveRes.json();
    if (!approveRes.ok || !approveData.success) {
      updatePaymentState('PAYMENT_FAILED', approveData.error || 'Authorization failed. Please try again.');
      return;
    }

    updatePaymentState('GATE_AUTHORIZED', 'Order authorized by customer.');

    // Step 2: Create Authoritative Razorpay Order
    updatePaymentState('RAZORPAY_ORDER_CREATED', 'Authoritative order created. Launching Razorpay Checkout...');
    const orderRes = await fetch('/api/v1/checkout/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: currentSessionId })
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok || !orderData.razorpay_order_id) {
      updatePaymentState('PAYMENT_FAILED', orderData.error || 'Failed to create payment order.');
      return;
    }

    // Clear any previous error state before opening Razorpay checkout
    paymentRetryWrap.classList.add('hidden');
    updatePaymentState('PAYMENT_IN_PROGRESS', 'Waiting for customer interaction in Razorpay modal...');

    // Step 3: Configure Razorpay Checkout
    const options = {
      key: orderData.razorpay_key_id,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: 'Nexora Technologies',
      description: 'Deterministic AI Workspace Bundle',
      order_id: orderData.razorpay_order_id,
      handler: async function (response) {
        updatePaymentState('VERIFYING', 'Modal submitted payment. Verifying signature on server...');
        try {
          const verifyRes = await fetch('/api/v1/checkout/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: currentSessionId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          const verifyData = await verifyRes.json();
          if (!verifyRes.ok || !verifyData.success) {
            updatePaymentState('PAYMENT_FAILED', verifyData.error || 'Signature verification rejected by server.');
            return;
          }

          updatePaymentState('PAYMENT_SUCCESS', 'Your order has been authorized successfully.', {
            internal_order_id: orderData.internal_order_id,
            razorpay_order_id: response.razorpay_order_id,
            payment_id: response.razorpay_payment_id,
            amount: (orderData.amount / 100).toLocaleString('en-IN'),
            status: 'Paid'
          });
        } catch (err) {
          updatePaymentState('PAYMENT_FAILED', `Verification error: ${err.message}`);
        }
      },
      modal: {
        ondismiss: async function () {
          try {
            await fetch('/api/v1/checkout/cancel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: currentSessionId, reason: 'Modal closed by customer' })
            });
          } catch {}
          updatePaymentState('CANCELLED', 'Payment was not completed. Your selected basket is preserved. You can retry.');
        }
      },
      prefill: {
        name: 'Test Customer',
        email: 'customer@nexora.example',
        contact: '9876543210'
      },
      theme: {
        color: '#0284c7'
      }
    };

    if (typeof window.Razorpay === 'function') {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', async function (response) {
        try {
          await fetch('/api/v1/checkout/fail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: currentSessionId,
              reason: response.error?.description || 'Transaction declined'
            })
          });
        } catch {}
        updatePaymentState('PAYMENT_FAILED', 'Payment failed. Your selected basket is preserved.');
      });
      rzp.open();
    } else {
      // In non-browser environments or when checkout.js is offline
      updatePaymentState('PAYMENT_FAILED', 'Razorpay Checkout script could not be loaded. Please check network connection.');
    }
  } catch (err) {
    updatePaymentState('PAYMENT_FAILED', `Checkout initiation error: ${err.message}`);
  }
}

function handleRetryPayment() {
  paymentStatusCard.classList.add('hidden');
  paymentActionBox.classList.remove('hidden');
  paymentRetryWrap.classList.add('hidden');
  const btn = document.getElementById('proceed-payment-btn') || proceedPaymentBtn;
  if (btn) {
    btn.disabled = false;
    const btnText = btn.querySelector('#proceed-payment-text') || btn;
    btnText.textContent = 'Review & Pay with Razorpay';
  }
}

proceedPaymentBtn.addEventListener('click', handleProceedPayment);
retryPaymentBtn.addEventListener('click', handleRetryPayment);

// UI State Helpers
function setAgentState(state, label) {
  agentStatusBadge.textContent = label;
  agentStatusBadge.className = `status-badge ${String(state || '').toLowerCase()}`;
}

function showEmptyState() {
  emptyState.classList.remove('hidden');
  loadingState.classList.add('hidden');
  recommendationCard.classList.add('hidden');
  noMatchCard.classList.add('hidden');
  noCategoryCard.classList.add('hidden');
  if (proactiveAddonsSection) proactiveAddonsSection.classList.add('hidden');
  confidenceIndicator.classList.add('hidden');
  engineStatusTag.textContent = 'Deterministic Engine Standby';
}

function showLoadingState() {
  emptyState.classList.add('hidden');
  loadingState.classList.remove('hidden');
  recommendationCard.classList.add('hidden');
  noMatchCard.classList.add('hidden');
  noCategoryCard.classList.add('hidden');
  if (proactiveAddonsSection) proactiveAddonsSection.classList.add('hidden');
  engineStatusTag.textContent = 'Engine Evaluating Candidates...';
}

function showNoMatchState(explanation) {
  emptyState.classList.add('hidden');
  loadingState.classList.add('hidden');
  recommendationCard.classList.add('hidden');
  noMatchCard.classList.remove('hidden');
  noCategoryCard.classList.add('hidden');
  if (proactiveAddonsSection) proactiveAddonsSection.classList.add('hidden');
  noMatchExplanation.textContent = explanation;
  engineStatusTag.textContent = 'Deterministic Engine: No Match';
  confidenceIndicator.classList.add('hidden');
}

function showNoCategoryMatchState(explanation, category) {
  emptyState.classList.add('hidden');
  loadingState.classList.add('hidden');
  recommendationCard.classList.add('hidden');
  noMatchCard.classList.add('hidden');
  noCategoryCard.classList.remove('hidden');
  if (proactiveAddonsSection) proactiveAddonsSection.classList.add('hidden');
  if (category) {
    noCategoryTitle.textContent = `Unsupported Category: "${category}"`;
  }
  noCategoryExplanation.textContent = explanation || 'Our verified catalog does not carry this product category.';
  engineStatusTag.textContent = 'Catalog Scope Boundary: Category Not Carried';
  confidenceIndicator.classList.add('hidden');
}

function appendUserMessage(text) {
  const msg = document.createElement('div');
  msg.className = 'message user-message';
  msg.innerHTML = `
    <div class="message-meta">
      <span class="sender-name">Customer</span>
      <span class="time-stamp">Just now</span>
    </div>
    <div class="message-body"><p>${escapeHtml(text)}</p></div>
  `;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendAgentMessage(text, tag = 'Agent') {
  const msg = document.createElement('div');
  msg.className = 'message agent-message';
  msg.innerHTML = `
    <div class="message-meta">
      <span class="agent-avatar">AI</span>
      <span class="sender-name">Shopping Assistant • ${tag}</span>
      <span class="time-stamp">Just now</span>
    </div>
    <div class="message-body">${formatMarkdown(text)}</div>
  `;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const s = typeof str === 'string' ? str : String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMarkdown(str) {
  if (str === null || str === undefined) return '';
  const s = typeof str === 'string' ? str : String(str);
  let formatted = escapeHtml(s);
  // Bold
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Bullets
  formatted = formatted.replace(/^• (.*)$/gm, '<li style="margin-left: 1rem;">$1</li>');
  // Line breaks
  formatted = formatted.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');
  return `<p>${formatted}</p>`;
}

// ============================================================================
// MILESTONE 5: MERCHANT REVENUE INTELLIGENCE DASHBOARD LOGIC
// ============================================================================

// Navigation Elements
const navBtnCustomer = document.getElementById('nav-btn-customer');
const navBtnMerchant = document.getElementById('nav-btn-merchant');
const customerView = document.getElementById('customer-view');
const merchantView = document.getElementById('merchant-view');

// Merchant Control Elements
const runBenchmarkBtn = document.getElementById('run-benchmark-btn');
const runExperimentBtn = document.getElementById('run-experiment-btn');
const activeCatalogVersionPill = document.getElementById('active-catalog-version-pill');
const lastRunTimestamp = document.getElementById('last-run-timestamp');

// Overview Metric Elements
const mMetricReadinessScore = document.getElementById('m-metric-readiness-score');
const mMetricTotalIntents = document.getElementById('m-metric-total-intents');
const mMetricSupportedSub = document.getElementById('m-metric-supported-sub');
const mMetricMatchRate = document.getElementById('m-metric-match-rate');
const mMetricConstraintAdherence = document.getElementById('m-metric-constraint-adherence');
const mMetricCheckoutReady = document.getElementById('m-metric-checkout-ready');
const mMetricCatalogCoverage = document.getElementById('m-metric-catalog-coverage');
const mMetricOpportunityValue = document.getElementById('m-metric-opportunity-value');

// Tallies
const tallyWon = document.getElementById('tally-won');
const tallyPartial = document.getElementById('tally-partial');
const tallyLost = document.getElementById('tally-lost');
const tallyUnsupported = document.getElementById('tally-unsupported');

// Containers
const highLevelFailureContainer = document.getElementById('high-level-failure-container');
const opportunitiesContainer = document.getElementById('opportunities-container');
const lossReasonsContainer = document.getElementById('loss-reasons-container');
const intentGroupFilter = document.getElementById('intent-group-filter');
const intentsTableBody = document.getElementById('intents-table-body');
const fixesContainer = document.getElementById('fixes-container');
const experimentResultsWrap = document.getElementById('experiment-results-wrap');

// Drilldown Modal Elements
const drilldownModal = document.getElementById('drilldown-modal');
const closeDrilldownBtn = document.getElementById('close-drilldown-btn');
const drilldownTitle = document.getElementById('drilldown-title');
const drilldownBody = document.getElementById('drilldown-body');

// Benchmark State Machine (IDLE | RUNNING | COMPLETED | FAILED)
let benchmarkState = 'IDLE';
let latestBenchmarkSummary = null;
let lastCompletedBenchmarkSummary = null;
let benchmarkFailureDetails = null;
let currentFixes = [];
let currentComparison = null;
let merchantDataLoaded = false;
let isBenchmarkRunning = false;
let isExperimentRunning = false;
let isResetting = false;
let benchmarkStatusDesc = '';
const benchmarkStatusBanner = document.getElementById('benchmark-status-banner');

// Safe Numeric Formatting Utilities (distinguishes valid number, 0, and unavailable/null/undefined)
function isNumeric(val) {
  return typeof val === 'number' && !isNaN(val) && isFinite(val);
}

function formatPercent(val, decimals = 1, isRatio = false) {
  if (!isNumeric(val)) return '—';
  const num = isRatio ? val * 100 : val;
  return `${num.toFixed(decimals)}%`;
}

function formatScore(val, max = 100) {
  if (!isNumeric(val)) return '—';
  return max ? `${Math.round(val)} / ${max}` : `${Math.round(val)}`;
}

function formatInr(num) {
  if (!isNumeric(num)) return '—';
  if (num === 0) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(num);
}

function formatScoreDelta(m) {
  if (!m || !isNumeric(m.delta)) return '<span class="delta-pill neutral">0 pts</span>';
  const delta = m.delta;
  const sign = delta > 0 ? '+' : '';
  const cls = delta > 0 ? 'positive' : (delta < 0 ? 'lost' : 'neutral');
  return `<span class="delta-pill ${cls}">${sign}${delta} pts</span>`;
}

function formatPctDelta(m, noImprovementNote = null) {
  if (!m || !isNumeric(m.delta)) return '<span class="delta-pill neutral">0.0%</span>';
  const deltaPct = m.delta * 100;
  const sign = deltaPct > 0 ? '+' : '';
  const formatted = `${sign}${deltaPct.toFixed(1)}%`;
  const cls = deltaPct > 0 ? 'positive' : (deltaPct < 0 ? 'lost' : 'neutral');
  const pill = `<span class="delta-pill ${cls}">${formatted}</span>`;
  if (deltaPct === 0 && noImprovementNote) {
    return `${pill}<span style="font-size:0.72rem;color:#94a3b8;display:block;margin-top:0.2rem;">${noImprovementNote}</span>`;
  }
  return pill;
}

// Format Group Name
function formatGroupName(group) {
  const map = {
    developer: 'Developer / Coding',
    gaming: 'Gaming',
    student_budget: 'Student / Budget',
    travel_portability: 'Travel / Portability',
    creator: 'Creator / Workstation',
    office_workspace: 'Office / Workspace',
    comparison: 'Comparison',
    bundle_accessory: 'Bundle / Accessory'
  };
  return map[group] || group || 'General';
}

// Render Benchmark Status Banner (IDLE | RUNNING | COMPLETED | FAILED)
function renderBenchmarkStatus() {
  if (!benchmarkStatusBanner) return;

  if (benchmarkState === 'IDLE') {
    benchmarkStatusBanner.innerHTML = `
      <div class="benchmark-status-card not-run">
        <div class="status-indicator">⚪ Benchmark Status: <strong>IDLE</strong></div>
        <div class="status-desc">Run the 100-intent benchmark to evaluate AI buyer readiness.</div>
      </div>
    `;
  } else if (benchmarkState === 'RUNNING') {
    const desc = benchmarkStatusDesc || "Evaluating 100 controlled buyer intents...";
    benchmarkStatusBanner.innerHTML = `
      <div class="benchmark-status-card running">
        <div class="status-indicator">⏳ Benchmark Status: <strong>RUNNING</strong></div>
        <div class="status-desc">${escapeHtml(desc)}</div>
        <div class="benchmark-progress-bar"><div class="benchmark-progress-indeterminate"></div></div>
      </div>
    `;
  } else if (benchmarkState === 'COMPLETED') {
    const s = latestBenchmarkSummary || lastCompletedBenchmarkSummary;
    const timeStr = s?.timestamp ? new Date(s.timestamp).toLocaleTimeString() : 'Just now';
    benchmarkStatusBanner.innerHTML = `
      <div class="benchmark-status-card completed">
        <div class="status-indicator">✓ Benchmark Status: <strong>COMPLETED</strong></div>
        <div class="status-desc" style="font-size: 0.95rem; font-weight: 600; color: #6ee7b7; margin-bottom: 0.25rem;">
          Baseline benchmark completed — 100/100 intents evaluated.
        </div>
        <div style="font-size: 0.8rem; color: var(--text-secondary);">
          Catalog: <strong>${escapeHtml(s?.catalog_version || 'Catalog Version A')}</strong> • Benchmark: <strong>${escapeHtml(s?.benchmark_version || 'v1.0')}</strong> • Completed at ${timeStr}
        </div>
      </div>
    `;
  } else if (benchmarkState === 'FAILED') {
    const f = benchmarkFailureDetails || {};
    const reasonText = f.reason || f.error || 'Benchmark validation or execution failure';
    const prevText = lastCompletedBenchmarkSummary
      ? `Previous valid baseline preserved: <strong>${escapeHtml(lastCompletedBenchmarkSummary.catalog_version)}</strong> (${new Date(lastCompletedBenchmarkSummary.timestamp).toLocaleTimeString()})`
      : 'No previous baseline exists.';

    benchmarkStatusBanner.innerHTML = `
      <div class="benchmark-status-card failed">
        <div class="status-indicator">❌ Benchmark Status: <strong>FAILED</strong></div>
        <div class="status-desc" style="font-weight: 600; color: #fca5a5; margin-bottom: 0.25rem;">
          Benchmark failed. No new benchmark result was committed.
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.4rem;">
          ${escapeHtml(prevText)}
        </div>
        <details style="margin-top: 0.4rem; font-size: 0.78rem;">
          <summary style="cursor: pointer; color: #fca5a5; font-weight: 600;">View Technical Error Details</summary>
          <div style="font-size: 0.75rem; padding: 0.5rem; background: rgba(0,0,0,0.35); border: 1px solid rgba(239,68,68,0.3); border-radius: 4px; margin-top: 0.35rem; font-family: monospace; color: #fca5a5; word-break: break-word;">
            ${escapeHtml(reasonText)}
          </div>
        </details>
      </div>
    `;
  }
}

// Reset Overview Metrics on IDLE or uninitialized state
function resetOverviewMetrics() {
  if (mMetricReadinessScore) mMetricReadinessScore.textContent = '—';
  if (mMetricTotalIntents) mMetricTotalIntents.textContent = '—';
  if (mMetricSupportedSub) mMetricSupportedSub.textContent = 'Benchmark not run';
  if (mMetricMatchRate) mMetricMatchRate.textContent = '—';
  if (mMetricConstraintAdherence) mMetricConstraintAdherence.textContent = '—';
  if (mMetricCheckoutReady) mMetricCheckoutReady.textContent = '—';
  if (mMetricCatalogCoverage) mMetricCatalogCoverage.textContent = '—';
  if (mMetricOpportunityValue) mMetricOpportunityValue.textContent = '—';

  if (tallyWon) tallyWon.textContent = '—';
  if (tallyPartial) tallyPartial.textContent = '—';
  if (tallyLost) tallyLost.textContent = '—';
  if (tallyUnsupported) tallyUnsupported.textContent = '—';

  if (highLevelFailureContainer) {
    highLevelFailureContainer.innerHTML = '<div class="empty-state-notice">Benchmark not run. Click "Run 100-Intent Benchmark" to populate the AI Buyer Failure Map.</div>';
  }
  if (opportunitiesContainer) {
    opportunitiesContainer.innerHTML = '<div class="empty-state-notice">Benchmark not run. Click "Run 100-Intent Benchmark" to view prioritized commerce opportunities.</div>';
  }
  if (lossReasonsContainer) {
    lossReasonsContainer.innerHTML = '<div class="empty-state-notice">Benchmark not run. Click "Run 100-Intent Benchmark" to see failure taxonomy breakdown.</div>';
  }
  if (intentsTableBody) {
    intentsTableBody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 2rem; color: var(--text-muted);">Benchmark not run. Click "Run 100-Intent Benchmark" to populate buyer intent telemetry.</td></tr>';
  }
  if (lastRunTimestamp) {
    lastRunTimestamp.textContent = 'Status: Benchmark not run';
  }
}

// Tab Switching
if (navBtnCustomer && navBtnMerchant) {
  navBtnCustomer.addEventListener('click', () => {
    navBtnCustomer.classList.add('active');
    navBtnMerchant.classList.remove('active');
    customerView.classList.remove('hidden');
    merchantView.classList.add('hidden');
  });

  navBtnMerchant.addEventListener('click', () => {
    navBtnMerchant.classList.add('active');
    navBtnCustomer.classList.remove('active');
    customerView.classList.add('hidden');
    merchantView.classList.remove('hidden');

    if (!merchantDataLoaded) {
      loadMerchantDashboard();
    }
  });
}

// Load Merchant Dashboard
async function loadMerchantDashboard() {
  try {
    if (lastRunTimestamp) lastRunTimestamp.textContent = 'Fetching benchmark telemetry...';
    const res = await fetch('/api/v1/merchant/benchmark/latest');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();

    if (data.status === 'NOT_RUN' || !data.summary) {
      benchmarkState = 'IDLE';
      latestBenchmarkSummary = null;
      lastCompletedBenchmarkSummary = null;
      renderBenchmarkStatus();
      resetOverviewMetrics();
      await loadCatalogFixes();
      merchantDataLoaded = true;
      return;
    }

    const summary = data.summary;
    benchmarkState = 'COMPLETED';
    latestBenchmarkSummary = summary;
    lastCompletedBenchmarkSummary = summary;
    merchantDataLoaded = true;

    renderBenchmarkStatus();
    renderOverviewMetrics(summary);
    renderLossTaxonomy(summary.loss_reasons_breakdown);
    renderIntentsTable(summary.results, intentGroupFilter ? intentGroupFilter.value : 'all');
    await loadCatalogFixes();

    if (lastRunTimestamp) {
      const time = new Date(summary.timestamp).toLocaleTimeString();
      lastRunTimestamp.textContent = `Status: COMPLETED • Last Evaluated: ${time}`;
    }
  } catch (err) {
    console.error('[Merchant] Failed to load latest benchmark:', err);
    benchmarkState = 'IDLE';
    renderBenchmarkStatus();
    resetOverviewMetrics();
    if (lastRunTimestamp) lastRunTimestamp.textContent = 'Status: Ready to evaluate';
  }
}

// Render Overview Metrics
function renderOverviewMetrics(summary) {
  if (!summary) return;

  if (mMetricReadinessScore) {
    const score = isNumeric(summary.ai_buyer_readiness_score)
      ? summary.ai_buyer_readiness_score
      : (isNumeric(summary.readiness_score) ? summary.readiness_score : null);
    mMetricReadinessScore.textContent = score !== null ? `${Math.round(score)}` : '—';
  }
  if (mMetricTotalIntents) {
    mMetricTotalIntents.textContent = isNumeric(summary.total_intents) ? `${summary.total_intents}` : '—';
  }
  if (mMetricSupportedSub) {
    const supported = isNumeric(summary.supported_intents) ? summary.supported_intents : '—';
    const unsupported = isNumeric(summary.unsupported_intents) ? summary.unsupported_intents : '—';
    mMetricSupportedSub.textContent = `${supported} Supported • ${unsupported} Out of Scope`;
  }
  if (mMetricMatchRate) {
    const match = isNumeric(summary.product_match_rate) ? summary.product_match_rate : summary.intent_match_rate;
    mMetricMatchRate.textContent = formatPercent(match, 1, true);
  }
  if (mMetricConstraintAdherence) {
    mMetricConstraintAdherence.textContent = formatPercent(summary.hard_constraint_adherence, 1, true);
  }
  if (mMetricCheckoutReady) {
    mMetricCheckoutReady.textContent = formatPercent(summary.checkout_ready_rate, 1, true);
  }
  if (mMetricCatalogCoverage) {
    const coverage = isNumeric(summary.catalog_coverage)
      ? summary.catalog_coverage
      : (summary.readiness_components?.catalog_coverage ?? ((summary.supported_intents && summary.total_intents) ? summary.supported_intents / summary.total_intents : null));
    mMetricCatalogCoverage.textContent = formatPercent(coverage, 1, true);
  }
  if (mMetricOpportunityValue) {
    const oppVal = summary.modeled_catalog_opportunity_value_inr ?? summary.modeled_catalog_opportunity ?? summary.catalog_attributed_opportunity_value_inr ?? summary.opportunity_value_inr;
    mMetricOpportunityValue.textContent = formatInr(oppVal);
  }

  // Tallies
  if (tallyWon) tallyWon.textContent = isNumeric(summary.won_count) ? summary.won_count : '—';
  if (tallyPartial) tallyPartial.textContent = isNumeric(summary.partial_count) ? summary.partial_count : '—';
  if (tallyLost) tallyLost.textContent = isNumeric(summary.lost_count) ? summary.lost_count : '—';
  if (tallyUnsupported) tallyUnsupported.textContent = isNumeric(summary.unsupported_intents) ? summary.unsupported_intents : '—';

  if (activeCatalogVersionPill) {
    activeCatalogVersionPill.textContent = summary.catalog_version || 'Catalog Version A (Baseline)';
  }

  // Render Failure Map & Top Commerce Opportunities
  renderHighLevelFailureMap(summary.high_level_failure_map);
  renderTopCommerceOpportunities(summary.top_commerce_opportunities);
}

// Render High-Level AI Buyer Failure Map ("Where AI Buyer Requests Fail")
function renderHighLevelFailureMap(failureMap) {
  if (!highLevelFailureContainer) return;
  if (!failureMap || (Array.isArray(failureMap) ? failureMap.length === 0 : Object.keys(failureMap).length === 0)) {
    highLevelFailureContainer.innerHTML = '<div class="empty-state-notice">Benchmark not run. Click "Run 100-Intent Benchmark" to populate the AI Buyer Failure Map.</div>';
    return;
  }

  const rawList = Array.isArray(failureMap) ? failureMap : Object.values(failureMap);
  const failureCategories = rawList.filter((cat) => cat && (cat.affected_intents_count || 0) > 0);
  failureCategories.sort((a, b) => (b.affected_intents_count || 0) - (a.affected_intents_count || 0));

  if (failureCategories.length === 0) {
    highLevelFailureContainer.innerHTML = '<div class="empty-state-notice" style="color: #6ee7b7;">✓ Zero AI buyer failures detected. All evaluated intents served successfully.</div>';
    return;
  }

  highLevelFailureContainer.innerHTML = failureCategories.map((cat) => {
    const oppVal = cat.modeled_opportunity_value_inr || 0;
    const pctVal = cat.benchmark_percentage ?? cat.percentage_of_benchmark ?? (cat.affected_intents_count || 0);
    const pctFormatted = formatPercent(pctVal, 1, false);
    const examples = (cat.representative_examples || []).slice(0, 2);
    const examplesHtml = examples.length > 0
      ? `<div class="failure-examples" style="margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid rgba(255,255,255,0.05);font-size:0.75rem;color:var(--text-muted);">
           <span style="display:block;margin-bottom:0.25rem;color:var(--text-secondary);font-weight:600;">Representative buyer queries:</span>
           ${examples.map((ex) => `<div style="margin-bottom:0.2rem;font-style:italic;">&ldquo;${escapeHtml(ex)}&rdquo;</div>`).join('')}
         </div>`
      : '';

    const barWidth = isNumeric(pctVal) ? Math.min(100, Math.max(8, pctVal)) : 8;

    return `
      <div class="failure-map-card">
        <div class="failure-card-header">
          <span class="failure-type-pill" style="font-weight:700;font-size:0.78rem;background:rgba(239,68,68,0.15);color:#fca5a5;padding:0.2rem 0.6rem;border-radius:4px;border:1px solid rgba(239,68,68,0.3);">${escapeHtml(cat.failure_type || 'FAILURE')}</span>
          <span class="failure-count-badge" style="font-size:0.8rem;color:#fff;font-weight:600;">${cat.affected_intents_count ?? 0} intents (${pctFormatted})</span>
        </div>
        <p class="failure-card-desc" style="font-size:0.82rem;color:var(--text-secondary);margin:0.5rem 0;line-height:1.4;">${escapeHtml(cat.description || '')}</p>
        <div class="loss-bar-wrap" style="margin:0.5rem 0;">
          <div class="loss-bar-fill" style="width: ${barWidth}%;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;margin-top:0.4rem;">
          <span style="color:var(--text-secondary);">Modeled Opportunity: <strong style="color:var(--accent-amber);">${formatInr(oppVal)}</strong></span>
          <span style="font-size:0.7rem;color:var(--text-muted);font-style:italic;">Modeled from verified benchmark values</span>
        </div>
        ${examplesHtml}
      </div>
    `;
  }).join('');
}

// Render Top AI Commerce Opportunities
function renderTopCommerceOpportunities(opportunities) {
  if (!opportunitiesContainer) return;
  if (!opportunities || opportunities.length === 0) {
    opportunitiesContainer.innerHTML = '<div class="empty-state-notice">Benchmark not run. Click "Run 100-Intent Benchmark" to view prioritized commerce opportunities.</div>';
    return;
  }

  opportunitiesContainer.innerHTML = opportunities.map((opp, idx) => {
    const rank = opp.rank ?? (idx + 1);
    const priority = opp.severity || opp.priority_level || 'HIGH PRIORITY';
    const affectedCount = opp.affected_intent_count ?? opp.affected_intents_count ?? 0;
    const field = opp.affected_catalog_field || 'specifications';
    const action = opp.recommended_merchant_action || opp.merchant_action || 'Review catalog metadata';
    const oppVal = opp.modeled_opportunity_value_inr ?? 0;

    return `
      <div class="opportunity-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;">
          <span style="font-size:0.75rem;font-weight:800;background:rgba(245,158,11,0.18);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);padding:0.2rem 0.6rem;border-radius:4px;letter-spacing:0.04em;">PRIORITY #${rank} • ${escapeHtml(priority)}</span>
          <span style="font-size:0.75rem;font-weight:600;background:rgba(239,68,68,0.15);color:#fca5a5;padding:0.15rem 0.5rem;border-radius:4px;border:1px solid rgba(239,68,68,0.3);">${escapeHtml(opp.failure_type || 'FAILURE')}</span>
        </div>
        <h4 style="margin:0 0 0.5rem 0;font-size:0.95rem;color:#fff;font-weight:600;">${escapeHtml(opp.title)}</h4>
        
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:0.5rem;background:rgba(0,0,0,0.2);padding:0.6rem;border-radius:6px;margin-bottom:0.75rem;font-size:0.8rem;">
          <div>
            <span style="display:block;font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Affected Intents</span>
            <strong style="color:#fff;font-size:0.95rem;">${affectedCount} intents</strong>
          </div>
          <div>
            <span style="display:block;font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Modeled Opportunity</span>
            <strong style="color:var(--accent-amber);font-size:0.95rem;">${formatInr(oppVal)}</strong>
          </div>
          <div>
            <span style="display:block;font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">Affected Field</span>
            <code style="color:#38bdf8;font-size:0.78rem;">${escapeHtml(field)}</code>
          </div>
        </div>

        <div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:6px;padding:0.6rem;margin-bottom:0.75rem;font-size:0.8rem;">
          <strong style="color:#38bdf8;display:block;margin-bottom:0.2rem;text-transform:uppercase;font-size:0.7rem;letter-spacing:0.04em;">Recommended Merchant Action:</strong>
          <span style="color:var(--text-secondary);">${escapeHtml(action)}</span>
        </div>

        <div style="display:flex;gap:0.5rem;align-items:center;">
          <button class="btn-opp-inspect" data-field="${escapeHtml(field)}" style="background:rgba(255,255,255,0.08);border:1px solid var(--border-subtle);color:#fff;padding:0.4rem 0.75rem;border-radius:6px;font-size:0.75rem;cursor:pointer;">Inspect Intents</button>
          <button class="btn-opp-fix" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#6ee7b7;padding:0.4rem 0.75rem;border-radius:6px;font-size:0.75rem;cursor:pointer;font-weight:600;">View Proposed Fix</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach handlers
  opportunitiesContainer.querySelectorAll('.btn-opp-inspect').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tableWrap = document.querySelector('.intents-table-wrap');
      if (tableWrap) tableWrap.scrollIntoView({ behavior: 'smooth' });
    });
  });

  opportunitiesContainer.querySelectorAll('.btn-opp-fix').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fixesSec = document.getElementById('catalog-fixes-section');
      if (fixesSec) fixesSec.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// Render Loss Taxonomy
function renderLossTaxonomy(breakdown) {
  if (!lossReasonsContainer) return;
  if (!breakdown) {
    lossReasonsContainer.innerHTML = '<div class="empty-state-notice">Run benchmark to see failure taxonomy breakdown...</div>';
    return;
  }

  const reasons = (Array.isArray(breakdown) ? breakdown : Object.values(breakdown)).filter((r) => r && (r.count || 0) > 0);
  reasons.sort((a, b) => (b.count || 0) - (a.count || 0));

  if (reasons.length === 0) {
    lossReasonsContainer.innerHTML = '<div class="empty-state-notice">No catalog loss reasons recorded.</div>';
    return;
  }

  const headerHtml = `
    <div class="loss-taxonomy-header" style="margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06);">
      <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
        <h4 style="margin: 0; font-size: 0.95rem; color: #fff; font-weight: 600;">Loss Reason Occurrences</h4>
        <span style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;">A buyer intent may contribute more than one loss reason.</span>
      </div>
    </div>
  `;

  const cardsHtml = reasons.map((r) => {
    const title = r.label || r.title || r.name || r.code || 'Loss Reason';
    const pctVal = isNumeric(r.pct_of_lost) ? r.pct_of_lost : (isNumeric(r.percentage) ? r.percentage : 0);
    const pctFormatted = formatPercent(pctVal, 1, false);
    const oppVal = r.catalog_attributed_opportunity_inr ?? r.opportunity_value_inr ?? r.opportunity_inr ?? 0;
    const barWidth = Math.min(100, Math.max(5, pctVal));

    return `
      <div class="loss-reason-card">
        <div class="loss-card-header">
          <span class="loss-card-title">${escapeHtml(title)}</span>
          <span class="loss-card-count">${r.count} occurrence${r.count !== 1 ? 's' : ''} (${pctFormatted})</span>
        </div>
        <div class="loss-bar-wrap">
          <div class="loss-bar-fill" style="width: ${barWidth}%;"></div>
        </div>
        <div class="loss-card-footer">
          <span>Code: <code>${escapeHtml(r.code || '')}</code></span>
          <span>Catalog-Attributed Opportunity: <strong>${formatInr(oppVal)}</strong></span>
        </div>
      </div>
    `;
  }).join('');

  lossReasonsContainer.innerHTML = headerHtml + cardsHtml;
}

// Render Intents Table
function renderIntentsTable(results, filterGroup = 'all') {
  if (!intentsTableBody) return;
  if (!results || results.length === 0) {
    intentsTableBody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 2rem; color: var(--text-muted);">Benchmark not run. Click "Run 100-Intent Benchmark" to populate buyer intent telemetry.</td></tr>';
    return;
  }

  const filtered = filterGroup === 'all'
    ? results
    : results.filter((r) => {
        const g = r.group || r.intent?.group || r.intent?.customer_workload_group;
        return g === filterGroup;
      });

  if (filtered.length === 0) {
    intentsTableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 2rem; color: var(--text-muted);">No intents found for workload group "${escapeHtml(filterGroup)}".</td></tr>`;
    return;
  }

  intentsTableBody.innerHTML = filtered.map((r) => {
    const oppType = r.status || r.opportunity_type || 'LOST';
    const statusClass = String(oppType).toLowerCase();
    const groupName = r.group || r.intent?.group || r.intent?.customer_workload_group || 'general';
    const queryText = r.query || r.intent?.natural_language_query || r.intent?.raw_query || '';
    const matchedSku = r.matched_sku || r.matched_product_sku;
    const closestSku = r.closest_sku || r.closest_product_sku;
    const skuDisplay = matchedSku
      ? `<strong>${escapeHtml(matchedSku)}</strong>`
      : (closestSku ? `<span style="color: var(--text-muted);">${escapeHtml(closestSku)} (Closest)</span>` : '—');
    const failureType = r.high_level_failure_type || (r.loss_reason_code ? 'CONSTRAINT_FAILURE' : '—');
    const reasonCode = r.loss_reason_code ? `<code style="font-size:0.75rem;color:#fca5a5;">${escapeHtml(r.loss_reason_code)}</code>` : '';
    const oppNumber = r.modeled_opportunity_value_inr ?? r.catalog_attributed_opportunity_inr ?? r.opportunity_value_inr ?? 0;
    const oppValue = oppNumber > 0 ? formatInr(oppNumber) : '—';

    return `
      <tr>
        <td class="mono">${escapeHtml(r.benchmark_id)}</td>
        <td><span class="group-tag">${escapeHtml(formatGroupName(groupName))}</span></td>
        <td style="max-width: 260px;" title="${escapeHtml(queryText)}">${escapeHtml(queryText)}</td>
        <td><span class="status-badge-table ${statusClass}">${escapeHtml(oppType)}</span></td>
        <td>${skuDisplay}</td>
        <td>
          <div style="font-weight:600;font-size:0.8rem;color:#fca5a5;">${escapeHtml(failureType)}</div>
          ${reasonCode}
        </td>
        <td style="font-weight: 600; color: ${oppNumber > 0 ? 'var(--accent-amber)' : 'inherit'};">${oppValue}</td>
        <td>
          <button class="btn-inspect" data-intent-id="${escapeHtml(r.benchmark_id)}">Inspect</button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach inspection handlers
  intentsTableBody.querySelectorAll('.btn-inspect').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-intent-id');
      if (id) openDrilldownModal(id);
    });
  });
}

// Workload Filter Event
if (intentGroupFilter) {
  intentGroupFilter.addEventListener('change', () => {
    const summary = latestBenchmarkSummary || lastCompletedBenchmarkSummary;
    if (summary && summary.results) {
      renderIntentsTable(summary.results, intentGroupFilter.value);
    }
  });
}

// Load Prioritized Catalog Fixes
async function loadCatalogFixes() {
  if (!fixesContainer) return;
  try {
    const res = await fetch('/api/v1/merchant/catalog/fixes');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    currentFixes = [...(data.pending || []), ...(data.approved || [])];

    if (currentFixes.length === 0) {
      fixesContainer.innerHTML = '<div class="empty-state-notice">No catalog fixes discovered.</div>';
      return;
    }

    // Sort by priority score descending
    currentFixes.sort((a, b) => b.priority_score - a.priority_score);

    fixesContainer.innerHTML = currentFixes.map((fix, idx) => {
      const isApproved = fix.status === 'APPROVED';
      const actionButton = isApproved
        ? `<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
             <button class="btn-approve approved" disabled>✓ Approved</button>
             <button class="btn-isolated-experiment" data-fix-id="${escapeHtml(fix.fix_id)}" style="background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);color:#38bdf8;padding:0.4rem 0.75rem;border-radius:6px;font-size:0.78rem;font-weight:600;cursor:pointer;">⚡ Run 1-Fix Experiment (${escapeHtml(fix.fix_id)})</button>
           </div>`
        : `<button class="btn-approve" data-fix-id="${escapeHtml(fix.fix_id)}">Approve Change</button>`;

      const currentValText = fix.current_value === null ? 'null (missing)' : String(fix.current_value);
      const proposedValText = String(fix.proposed_value);
      const brandName = fix.brand || 'Nexora';
      const cleanProductName = fix.product_name ? fix.product_name.replace(new RegExp('^' + brandName + '\\s+', 'i'), '') : 'Product';
      const source = fix.source_label || fix.verification_source || 'Unverified';
      // Distinguish Manufacturer-Verified from Synthetic demo data
      const sourceStatus = fix.source_status || 'UNVERIFIED';
      const sourceStatusBadge = sourceStatus === 'MERCHANT_VERIFIED'
        ? '<span style="display:inline-block;font-size:0.72rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:4px;background:rgba(16,185,129,0.15);color:#6ee7b7;border:1px solid rgba(16,185,129,0.3);margin-left:0.5rem;">✓ Manufacturer Verified</span>'
        : '<span style="display:inline-block;font-size:0.72rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:4px;background:rgba(245,158,11,0.12);color:#fcd34d;border:1px solid rgba(245,158,11,0.3);margin-left:0.5rem;">⚠ Synthetic Demo Source</span>';
      const count = fix.affected_intents_count || fix.affected_intent_count || 0;
      // opportunity_value_inr is dynamically aggregated from actual benchmark results (not hardcoded)
      const oppValue = fix.opportunity_value_inr || fix.catalog_attributed_opportunity_value_inr || 0;
      const eligibilityNotice = count > 0
        ? `Affected benchmark intents: <strong>${count}</strong>`
        : `<span style="color:#fcd34d;">This approved fix has no affected benchmark intents, so a buyer-outcome improvement is not expected.</span>`;

      return `
        <div class="fix-card" id="fix-card-${escapeHtml(fix.fix_id)}">
          <div class="fix-header">
            <div class="fix-title-wrap">
              <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.25rem;">
                <span class="mono" style="font-size:0.75rem;font-weight:800;color:#38bdf8;background:rgba(56,189,248,0.12);padding:0.15rem 0.45rem;border-radius:4px;border:1px solid rgba(56,189,248,0.3);">${escapeHtml(fix.fix_id)}</span>
                <span style="font-size:0.72rem;font-weight:700;background:rgba(79,70,229,0.2);color:#a5b4fc;border:1px solid rgba(79,70,229,0.4);padding:0.15rem 0.5rem;border-radius:4px;">Brand: ${escapeHtml(brandName)}</span>
                <span class="fix-sku-tag">SKU: ${escapeHtml(fix.sku)}</span>
              </div>
              <h4 style="font-size:1.05rem;color:#fff;margin:0.2rem 0;">${escapeHtml(cleanProductName)}</h4>
            </div>
            <span class="fix-priority-badge">Priority: ${fix.priority_score.toFixed(0)}</span>
          </div>
          <div class="fix-body">
            <div style="font-size:0.8rem; margin-bottom: 0.5rem; display:flex; flex-direction:column; gap:0.25rem; background:rgba(255,255,255,0.03); padding:0.6rem; border-radius:6px;">
              <div><strong style="color:#cbd5e1;">Problem:</strong> <span style="color:#f87171;">${escapeHtml(fix.discovered_problem || fix.issue_type || 'Missing Specification')}</span></div>
              <div><strong style="color:#cbd5e1;">Affected Catalog Field:</strong> <code style="color:#38bdf8;">${escapeHtml(fix.field_path)}</code></div>
              <div><strong style="color:#cbd5e1;">Expected Outcome:</strong> <span style="color:#34d399;">${escapeHtml(fix.expected_effect || 'Converts unserved buyer intents to qualified matches')}</span></div>
              <div><strong style="color:#cbd5e1;">Approval State:</strong> <span style="color:${isApproved ? '#34d399' : '#fbbf24'};">${isApproved ? 'Approved by Merchant' : 'Requires Explicit Merchant Approval'}</span></div>
            </div>
            <div class="fix-diff-row">
              <span class="fix-old-val">${escapeHtml(currentValText)}</span>
              <span class="fix-arrow">→</span>
              <span class="fix-new-val">${escapeHtml(proposedValText)}</span>
            </div>
            <div class="fix-source-box">
              <strong style="color: #38bdf8;">Evidence Source:</strong> ${escapeHtml(source)}${sourceStatusBadge}
            </div>
          </div>
          <div class="fix-footer">
            <div class="fix-impact">
              ${eligibilityNotice} • Modeled Catalog Opportunity: <strong>${formatInr(oppValue)}</strong>
            </div>
            ${actionButton}
          </div>
        </div>
      `;
    }).join('');

    // Attach approve handlers
    fixesContainer.querySelectorAll('.btn-approve:not(.approved)').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fixId = btn.getAttribute('data-fix-id');
        if (fixId) await approveCatalogFix(fixId, btn);
      });
    });

    // Attach 1-fix isolated experiment handlers
    fixesContainer.querySelectorAll('.btn-isolated-experiment').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fixId = btn.getAttribute('data-fix-id');
        if (fixId) await runSingleFixExperiment(fixId, btn);
      });
    });
  } catch (err) {
    console.error('[Merchant] Failed to load catalog fixes:', err);
    fixesContainer.innerHTML = '<div class="empty-state-notice">Failed to load catalog fixes.</div>';
  }
}

// Approve Catalog Fix
async function approveCatalogFix(fixId, buttonElem) {
  try {
    buttonElem.disabled = true;
    buttonElem.textContent = 'Approving...';

    const res = await fetch('/api/v1/merchant/catalog/fixes/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fix_id: fixId })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log('[Merchant] Fix approved:', data);

    // Refresh fixes list
    await loadCatalogFixes();

    // Show prompt to run isolated experiment
    if (experimentResultsWrap) {
      experimentResultsWrap.innerHTML = `
        <div class="empty-state-notice" style="border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.05);">
          <strong style="color: #6ee7b7;">✓ Action "${escapeHtml(fixId)}" Approved!</strong><br/>
          Click <strong>"⚡ Run 1-Fix Experiment (${escapeHtml(fixId)})"</strong> on the action card below to evaluate against pristine Catalog A.
        </div>
      `;
    }
  } catch (err) {
    console.error('[Merchant] Approval failed:', err);
    alert(`Approval failed: ${err.message}`);
    buttonElem.disabled = false;
    buttonElem.textContent = 'Approve Change';
  }
}

// Run Isolated One-Fix Experiment (Clean Causal Demonstration)
async function runSingleFixExperiment(fixId, buttonElem) {
  if (isExperimentRunning) return;
  if (!lastCompletedBenchmarkSummary) {
    alert('Precondition Required: Run a successful baseline benchmark first.');
    return;
  }

  const startTime = Date.now();

  try {
    isExperimentRunning = true;
    if (buttonElem) {
      buttonElem.disabled = true;
      buttonElem.innerHTML = '<span>⏳ Running controlled experiment...</span>';
    }
    if (experimentResultsWrap) {
      experimentResultsWrap.innerHTML = `
        <div class="empty-state-notice" style="border-color: rgba(56, 189, 248, 0.35); background: rgba(56, 189, 248, 0.05); color: #bae6fd;">
          ⏳ <strong>Running Causal 1-Fix Experiment (${escapeHtml(fixId)})...</strong><br/>
          Evaluating identical 100 buyer intents against isolated Version B (Catalog Version A + ${escapeHtml(fixId)}).
          <div class="benchmark-progress-bar" style="margin-top: 1rem;"><div class="benchmark-progress-indeterminate"></div></div>
        </div>
      `;
    }

    const res = await fetch('/api/v1/merchant/experiment/isolated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fix_id: fixId })
    });

    const compData = await res.json();
    if (!res.ok) {
      throw new Error(compData.error || `HTTP ${res.status}`);
    }

    // Enforce minimum visible display duration of ~1500ms
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, 1500 - elapsed);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    currentComparison = compData;
    renderExperimentComparison(compData);

    const expSec = document.getElementById('experiment-section');
    if (expSec) expSec.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error('[Merchant] Isolated experiment failed:', err);
    if (experimentResultsWrap) {
      experimentResultsWrap.innerHTML = `
        <div class="empty-state-notice" style="border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.05); color: #fca5a5;">
          ❌ <strong>Isolated Experiment Run Blocked:</strong> ${escapeHtml(err.message)}
        </div>
      `;
    }
    alert(`Isolated experiment failed: ${err.message}`);
  } finally {
    isExperimentRunning = false;
    if (buttonElem) {
      buttonElem.disabled = false;
      buttonElem.textContent = `⚡ Run 1-Fix Experiment (${fixId})`;
    }
  }
}

// Run 100-Intent Benchmark (with visible loading state & minimum display duration)
if (runBenchmarkBtn) {
  runBenchmarkBtn.addEventListener('click', async () => {
    if (isBenchmarkRunning) return;

    let phaseTimer = null;
    const startTime = Date.now();

    try {
      isBenchmarkRunning = true;
      runBenchmarkBtn.disabled = true;
      runBenchmarkBtn.innerHTML = '<span>⏳ Evaluating 100 Buyer Intents...</span>';

      benchmarkState = 'RUNNING';
      benchmarkStatusDesc = 'Evaluating 100 controlled buyer intents...';
      if (lastRunTimestamp) lastRunTimestamp.textContent = 'Status: Evaluating 100 buyer intents...';
      renderBenchmarkStatus();

      // PHASE A: VALIDATE DATASET
      const valRes = await fetch('/api/v1/merchant/benchmark/validate');
      const valData = await valRes.json();

      if (!valRes.ok || valData.status !== 'VALID') {
        benchmarkState = 'FAILED';
        benchmarkFailureDetails = valData;
        renderBenchmarkStatus();
        if (lastRunTimestamp) lastRunTimestamp.textContent = 'Status: FAILED (Validation error)';
        alert(`Benchmark validation failed: ${valData.reason || valData.error || 'Invalid benchmark data'}`);
        return;
      }

      // PHASE B: EXECUTE BENCHMARK
      const res = await fetch('/api/v1/merchant/benchmark/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog_version: 'Catalog-v1.0-Baseline' })
      });

      const data = await res.json();
      if (!res.ok || data.status === 'INVALID_BENCHMARK_DATA') {
        benchmarkState = 'FAILED';
        benchmarkFailureDetails = data;
        renderBenchmarkStatus();
        if (lastRunTimestamp) lastRunTimestamp.textContent = 'Status: FAILED';
        alert(`Benchmark execution failed: ${data.reason || data.error || 'Execution error'}`);
        return;
      }

      // Enforce MINIMUM visible processing duration of ~1500ms
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1500 - elapsed);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      // COMPLETED
      benchmarkState = 'COMPLETED';
      benchmarkFailureDetails = null;
      latestBenchmarkSummary = data.summary;
      lastCompletedBenchmarkSummary = data.summary;

      renderBenchmarkStatus();
      renderOverviewMetrics(data.summary);
      renderLossTaxonomy(data.summary.loss_reasons_breakdown);
      renderIntentsTable(data.summary.results, intentGroupFilter ? intentGroupFilter.value : 'all');
      await loadCatalogFixes();

      if (lastRunTimestamp) {
        lastRunTimestamp.textContent = `Status: COMPLETED • Evaluated: ${new Date().toLocaleTimeString()}`;
      }
    } catch (err) {
      console.error('[Merchant] Benchmark run failed:', err);
      benchmarkState = 'FAILED';
      benchmarkFailureDetails = { reason: err.message };
      renderBenchmarkStatus();
      if (lastRunTimestamp) lastRunTimestamp.textContent = 'Status: FAILED';
      alert(`Benchmark execution failed: ${err.message}`);
    } finally {
      if (phaseTimer) clearTimeout(phaseTimer);
      isBenchmarkRunning = false;
      runBenchmarkBtn.disabled = false;
      runBenchmarkBtn.innerHTML = '<span>▶ Run 100-Intent Benchmark</span>';
    }
  });
}

// Reset / Start Clean One-Fix Experiment
const resetExperimentBtn = document.getElementById('reset-experiment-btn');
if (resetExperimentBtn) {
  resetExperimentBtn.addEventListener('click', async () => {
    if (isResetting) return;
    const startTime = Date.now();

    try {
      isResetting = true;
      resetExperimentBtn.disabled = true;
      resetExperimentBtn.innerHTML = '<span>⏳ Resetting experiment...</span>';

      const res = await fetch('/api/v1/merchant/experiment/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      currentComparison = null;

      // Reload fixes list from server so approved actions return to pending
      await loadCatalogFixes();

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 400 - elapsed);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      if (experimentResultsWrap) {
        experimentResultsWrap.innerHTML = `
          <div class="empty-state-notice" style="border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.05); color: #bae6fd;">
            <strong style="color: #38bdf8;">✓ Experiment State Reset</strong><br/>
            Catalog Version A (Baseline) is preserved and immutable.<br/>
            Select exactly <strong>ONE</strong> approved fix above and click <strong>"⚡ Run 1-Fix Experiment"</strong> to start a clean causal evaluation.
          </div>
        `;
      }
    } catch (err) {
      console.error('[Merchant] Experiment reset failed:', err);
      alert(`Reset failed: ${err.message}`);
    } finally {
      isResetting = false;
      resetExperimentBtn.disabled = false;
      resetExperimentBtn.innerHTML = '<span>🔄 Reset / Start New Experiment</span>';
    }
  });
}

// Render Before / After Comparison
function renderExperimentComparison(comparison) {
  if (!experimentResultsWrap || !comparison) return;

  const metrics = comparison.metrics || {};
  // intent_transitions from the server is already filtered to ACTUAL outcome changes only (LOST->WON, PARTIAL->WON)
  const outcomeTransitions = (comparison.intent_transitions || []).filter(
    (t) => (t.before_outcome || t.before_status) !== (t.after_outcome || t.after_status)
  );
  const hasOutcomeChanges = comparison.has_outcome_changes === true || outcomeTransitions.length > 0;
  const deltaSources = comparison.opportunity_value_delta_sources || [];

  const readinessScore = metrics.ai_buyer_readiness_score || { before: 0, after: 0, delta: 0 };
  const constraintAdherence = metrics.hard_constraint_adherence || { before: 0, after: 0, delta: 0 };
  const matchRate = metrics.product_match_rate || metrics.intent_match_rate || { before: 0, after: 0, delta: 0 };
  const coverage = metrics.catalog_coverage || { before: 0.9, after: 0.9, delta: 0 };
  const compatibility = metrics.compatibility_success_rate || { before: 0, after: 0, delta: 0 };
  const checkoutReady = metrics.checkout_ready_rate || { before: 0, after: 0, delta: 0 };
  const crossSell = metrics.simulated_cross_sell_acceptance_rate || { before: 0, after: 0, delta: 0 };
  const oppValue = metrics.modeled_catalog_opportunity_value_inr || metrics.catalog_attributed_opportunity_value_inr || { before: 0, after: 0, delta: 0 };
  const wonCount = metrics.won_count || { before: 0, after: 0, delta: 0 };
  const lostCount = metrics.lost_count || { before: 0, after: 0, delta: 0 };

  // Opportunity value delta label — NEVER says "Recovered" without an actual outcome change
  let oppValueDeltaCell = '';
  const oppDelta = oppValue.delta;
  if (oppDelta === 0) {
    oppValueDeltaCell = '<span class="delta-pill neutral">₹0 (No change in modeled opportunity value)</span>';
  } else if (!hasOutcomeChanges) {
    const sign = oppDelta > 0 ? '+' : '';
    oppValueDeltaCell = `
      <span class="delta-pill neutral" title="Attribution-only change">${sign}${formatInr(Math.abs(oppDelta))}</span>
      <span style="font-size:0.75rem;font-weight:600;color:#fcd34d;display:block;margin-top:0.25rem;">
        Modeled Catalog Opportunity Shift
      </span>
      <span style="font-size:0.72rem;color:#cbd5e1;display:block;margin-top:0.2rem;">
        Opportunity attribution changed because the closest candidate/basket valuation changed, but no buyer moved from LOST/PARTIAL to WON.
        ${deltaSources.length > 0 ? 'See reconciliation table below for per-intent breakdown.' : ''}
      </span>`;
  } else {
    const sign = oppDelta > 0 ? '+' : '';
    oppValueDeltaCell = `
      <span class="delta-pill positive">${sign}${formatInr(Math.abs(oppDelta))}</span>
      <span style="font-size:0.75rem;font-weight:600;color:#6ee7b7;display:block;margin-top:0.25rem;">
        Modeled Opportunity Value for Newly Won Intents (${outcomeTransitions.length} transition${outcomeTransitions.length !== 1 ? 's' : ''})
      </span>
      <span style="font-size:0.72rem;color:#94a3b8;display:block;margin-top:0.2rem;">
        Modeled from verified benchmark/catalog values; not actual revenue.
      </span>`;
  }

  // Experiment metadata: exact fix ID as plain string (NEVER raw HTML tags)
  const exactFixId = comparison.approved_fix_id || (comparison.approved_fixes_applied || [])[0] || 'FIX-ISOLATED';
  const versionBLabel = escapeHtml(comparison.catalog_version_b || comparison.enriched_catalog_version || 'Catalog Version B');
  const versionALabel = escapeHtml(comparison.catalog_version_a || comparison.baseline_catalog_version || 'Catalog Version A');

  // Zero-outcome change notice — honest explanation
  const outcomeSummaryBanner = !hasOutcomeChanges
    ? `<div style="margin-bottom:1rem;padding:0.85rem 1.1rem;border-radius:6px;border:1px solid rgba(245,158,11,0.35);background:rgba(245,158,11,0.07);color:#fcd34d;font-size:0.875rem;line-height:1.45;">
        <strong>0 verified intent transitions</strong><br/>
        The selected catalog change altered modeled opportunity attribution but did not change buyer outcomes in this benchmark.<br/>
        <span style="font-size:0.78rem;color:#cbd5e1;display:block;margin-top:0.3rem;">
          All 100 buyer intents produced the same WON / PARTIAL / LOST outcomes in both Catalog Version A and Version B.
        </span>
      </div>`
    : `<div style="margin-bottom:1rem;padding:0.85rem 1.1rem;border-radius:6px;border:1px solid rgba(16,185,129,0.35);background:rgba(16,185,129,0.07);color:#6ee7b7;font-size:0.875rem;">
        <strong>${outcomeTransitions.length} verified intent transition${outcomeTransitions.length !== 1 ? 's' : ''}</strong> between Catalog Version A and Version B.
        All verified outcome transitions are listed below.
      </div>`;

  experimentResultsWrap.innerHTML = `
    <!-- Visual Causal Narrative Flow -->
    <div style="margin-bottom:1.25rem;padding:1rem 1.25rem;border-radius:8px;border:1px solid rgba(56,189,248,0.25);background:rgba(56,189,248,0.04);display:flex;align-items:center;justify-content:center;gap:2rem;flex-wrap:wrap;font-size:0.85rem;">
      <div style="text-align:center;">
        <span style="font-size:0.7rem;color:var(--text-muted);display:block;text-transform:uppercase;font-weight:700;letter-spacing:0.04em;">Baseline</span>
        <strong style="color:#fff;font-size:1rem;letter-spacing:0.05em;">CATALOG A</strong>
        <div style="font-size:0.75rem;color:#94a3b8;margin-top:0.2rem;">${versionALabel}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;color:#38bdf8;text-align:center;">
        <span style="font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">↓ ONE APPROVED CATALOG CHANGE ↓</span>
        <code class="mono" style="font-size:0.9rem;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.35);padding:0.25rem 0.75rem;border-radius:4px;color:#38bdf8;margin-top:0.35rem;display:inline-block;font-weight:700;">${escapeHtml(exactFixId)}</code>
        <span style="font-size:0.72rem;color:#bae6fd;margin-top:0.2rem;">(isolated one-fix causal experiment)</span>
        <span style="font-size:0.7rem;color:#94a3b8;margin-top:0.35rem;letter-spacing:0.04em;font-weight:600;">↓ SAME 100 CONTROLLED INTENTS ↓</span>
      </div>
      <div style="text-align:center;">
        <span style="font-size:0.7rem;color:var(--text-muted);display:block;text-transform:uppercase;font-weight:700;letter-spacing:0.04em;">Enriched</span>
        <strong style="color:#6ee7b7;font-size:1rem;letter-spacing:0.05em;">CATALOG B</strong>
        <div style="font-size:0.75rem;color:#6ee7b7;margin-top:0.2rem;">${versionBLabel}</div>
      </div>
    </div>

    ${outcomeSummaryBanner}

    <!-- Comparison Table -->
    <table class="comparison-table">
      <thead>
        <tr>
          <th>Metric Name</th>
          <th>Catalog Version A (Baseline)</th>
          <th>Catalog Version B (Enriched)</th>
          <th>Change (Delta)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background: rgba(56,189,248,0.04);">
          <td>
            <strong style="color:#38bdf8;">AI Buyer Readiness Score</strong>
            <span style="font-size:0.72rem;color:#94a3b8;display:block;">(35% Match + 25% Adherence + 25% Checkout + 15% Coverage)</span>
          </td>
          <td><strong style="font-size:1.05rem;">${formatScore(readinessScore.before)}</strong></td>
          <td><strong style="font-size:1.05rem;color:#6ee7b7;">${formatScore(readinessScore.after)}</strong></td>
          <td>${formatScoreDelta(readinessScore)}</td>
        </tr>
        <tr>
          <td><strong>Intent Match Rate</strong> (excludes out of scope)</td>
          <td>${formatPercent(matchRate.before, 1, true)}</td>
          <td><strong>${formatPercent(matchRate.after, 1, true)}</strong></td>
          <td>${formatPctDelta(matchRate, !hasOutcomeChanges ? 'No measurable intent-match improvement.' : null)}</td>
        </tr>
        <tr>
          <td><strong>Hard Constraint Adherence</strong></td>
          <td>${formatPercent(constraintAdherence.before, 1, true)}</td>
          <td><strong>${formatPercent(constraintAdherence.after, 1, true)}</strong></td>
          <td>${formatPctDelta(constraintAdherence, null)}</td>
        </tr>
        <tr>
          <td><strong>Checkout-Ready Rate</strong></td>
          <td>${formatPercent(checkoutReady.before, 1, true)}</td>
          <td><strong>${formatPercent(checkoutReady.after, 1, true)}</strong></td>
          <td>${formatPctDelta(checkoutReady, !hasOutcomeChanges ? 'No measurable checkout-readiness improvement.' : null)}</td>
        </tr>
        <tr>
          <td><strong>Catalog Coverage</strong></td>
          <td>${formatPercent(coverage.before, 1, true)}</td>
          <td><strong>${formatPercent(coverage.after, 1, true)}</strong></td>
          <td>${formatPctDelta(coverage, null)}</td>
        </tr>
        <tr>
          <td><strong>Compatibility Success Rate</strong></td>
          <td>${formatPercent(compatibility.before, 1, true)}</td>
          <td><strong>${formatPercent(compatibility.after, 1, true)}</strong></td>
          <td>${formatPctDelta(compatibility, !hasOutcomeChanges && compatibility.delta > 0 ? 'Compatibility improved in the controlled benchmark, but no additional buyer intent reached WON.' : null)}</td>
        </tr>
        <tr>
          <td><strong>Simulated Cross-Sell Acceptance</strong></td>
          <td>${formatPercent(crossSell.before, 1, true)}</td>
          <td><strong>${formatPercent(crossSell.after, 1, true)}</strong></td>
          <td>${formatPctDelta(crossSell, null)}</td>
        </tr>
        <tr>
          <td>
            <strong>Modeled Catalog Opportunity Value</strong>
            <span style="font-size:0.72rem;color:#94a3b8;display:block;">Modeled from verified benchmark/catalog values; not actual revenue.</span>
          </td>
          <td>${formatInr(oppValue.before)}</td>
          <td><strong>${formatInr(oppValue.after)}</strong></td>
          <td>${oppValueDeltaCell}</td>
        </tr>
        <tr>
          <td><strong>Simulated Outcomes Count</strong></td>
          <td>${wonCount.before} WON • ${lostCount.before} LOST</td>
          <td><strong>${wonCount.after} WON • ${lostCount.after} LOST</strong></td>
          <td>
            <span class="delta-pill ${wonCount.delta > 0 ? 'positive' : 'neutral'}">${wonCount.delta >= 0 ? '+' : ''}${wonCount.delta} WON</span>
            <span class="delta-pill ${lostCount.delta < 0 ? 'positive' : 'neutral'}">${lostCount.delta} LOST</span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Opportunity Value Reconciliation (only shown when delta exists) -->
    ${deltaSources.length > 0 ? `
    <div class="section-title-wrap" style="margin-top:1rem;">
      <h4 style="font-size:1rem;color:#fff;margin:0;">Opportunity Value Attribution Change — Per-Intent Reconciliation</h4>
      <span class="section-subtitle">
        Every benchmark row where catalog-attributed opportunity value changed between Version A and Version B.
        ${!hasOutcomeChanges ? '<strong style="color:#fcd34d;">No buyer outcome improved — this is a basket-valuation attribution difference only.</strong>' : ''}
      </span>
    </div>
    <div style="overflow-x:auto;margin-bottom:1rem;">
      <table class="comparison-table" style="font-size:0.8rem;">
        <thead><tr>
          <th>Benchmark ID</th><th>Query</th>
          <th>Before Outcome</th><th>After Outcome</th>
          <th>Version A Value</th><th>Version B Value</th><th>Delta</th><th>Reason</th>
        </tr></thead>
        <tbody>
          ${deltaSources.map((ds) => `
            <tr>
              <td class="mono" style="font-size:0.72rem;">${escapeHtml(ds.benchmark_id)}</td>
              <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(ds.query)}">&ldquo;${escapeHtml(ds.query)}&rdquo;</td>
              <td><span class="status-badge-table ${String(ds.before_outcome).toLowerCase()}">${escapeHtml(ds.before_outcome)}</span></td>
              <td><span class="status-badge-table ${String(ds.after_outcome).toLowerCase()}">${escapeHtml(ds.after_outcome)}</span></td>
              <td>${formatInr(ds.before_opportunity_inr)}</td>
              <td>${formatInr(ds.after_opportunity_inr)}</td>
              <td><span class="delta-pill ${ds.delta_inr > 0 ? 'positive' : 'neutral'}">${ds.delta_inr >= 0 ? '+' : ''}${formatInr(ds.delta_inr)}</span></td>
              <td style="font-size:0.72rem;color:#94a3b8;">${escapeHtml(ds.reason)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Verified Intent Transitions: ACTUAL outcome changes only (LOST->WON, PARTIAL->WON) -->
    <div class="section-title-wrap" style="margin-top:1rem;">
      <h4 style="font-size:1.05rem;color:#fff;margin:0;">Verified Intent Transitions (${outcomeTransitions.length} Outcome Change${outcomeTransitions.length !== 1 ? 's' : ''})</h4>
      <span class="section-subtitle">
        Intents whose <strong>outcome</strong> changed between Catalog Version A and Version B (e.g. LOST → WON or PARTIAL → WON).
        Unchanged outcomes (e.g. WON → WON) are strictly not counted.
      </span>
    </div>
    <div class="transitions-grid">
      ${outcomeTransitions.length === 0
        ? `<div class="empty-state-notice" style="grid-column:1/-1;">
             0 verified intent transitions recorded. All 100 buyer intents produced the same outcome in both catalog versions.
             <br/><span style="color:#94a3b8;font-size:0.8rem;">If you expected transitions, verify that the approved fix resolves a hard constraint that blocked a LOST intent. SKU-only upgrades are excluded by design.</span>
           </div>`
        : outcomeTransitions.map((t) => {
            const beforeOutcome = t.before_outcome || t.before_status || 'LOST';
            const afterOutcome = t.after_outcome || t.after_status || 'WON';
            const beforeCls = String(beforeOutcome).toLowerCase();
            const afterCls = String(afterOutcome).toLowerCase();
            const causedBy = t.caused_by_fix_id ? `<div style="font-size:0.72rem;color:#94a3b8;">Caused by: <span class="mono">${escapeHtml(t.caused_by_fix_id)}</span></div>` : '';
            return `
              <div class="transition-card">
                <div class="transition-badge-row">
                  <span class="mono" style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(t.benchmark_id)}</span>
                  <span class="status-badge-table ${beforeCls}">${escapeHtml(beforeOutcome)}</span>
                  <span style="color:var(--text-muted);">→</span>
                  <span class="status-badge-table ${afterCls}">${escapeHtml(afterOutcome)}</span>
                </div>
                <div style="font-weight:600;color:#fff;">&ldquo;${escapeHtml(t.query)}&rdquo;</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);">
                  Matched SKU: <strong style="color:#6ee7b7;">${escapeHtml(t.after_sku || '—')}</strong>
                </div>
                <div style="font-size:0.78rem;color:#94a3b8;background:rgba(255,255,255,0.03);padding:0.4rem 0.6rem;border-radius:4px;">
                  ${escapeHtml(t.reason_improved || t.reason || '')}
                </div>
                ${causedBy}
              </div>
            `;
          }).join('')}
    </div>
  `;
}

// Drilldown Modal Inspector: "Why Did We Lose This Buyer?"
async function openDrilldownModal(intentId) {
  if (!drilldownModal || !drilldownBody || !drilldownTitle) return;

  try {
    drilldownTitle.textContent = `Query Forensics & Catalog Evidence: ${intentId}`;
    drilldownBody.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Loading query forensics telemetry...</div>';
    drilldownModal.classList.remove('hidden');

    const res = await fetch(`/api/v1/merchant/benchmark/intents/${encodeURIComponent(intentId)}`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const result = await res.json();

    const statusText = result.status || result.opportunity_type || 'LOST';
    const statusClass = String(statusText).toLowerCase();
    const groupName = result.group || result.intent?.group || result.intent?.customer_workload_group || 'general';
    const queryText = result.query || result.intent?.natural_language_query || result.intent?.raw_query || '';
    const oppValueNum = result.modeled_opportunity_value_inr ?? result.catalog_attributed_opportunity_inr ?? result.opportunity_value_inr ?? 0;
    const verifiedPriceNum = result.verified_price_inr ?? null;
    const failureType = result.high_level_failure_type || (result.loss_reason_code ? 'CONSTRAINT_FAILURE' : 'NONE');
    const recommendedAction = result.recommended_catalog_action || 'Review catalog specifications to ensure qualifying products are discoverable.';

    // Structured Interpretation
    const si = result.structured_interpretation || {};
    const siRows = [
      si.workload_intent ? `<div><strong>Workload:</strong> <span>${escapeHtml(si.workload_intent)}</span></div>` : '',
      si.hard_budget_inr ? `<div><strong>Max Budget:</strong> <span>${formatInr(si.hard_budget_inr)}</span></div>` : '',
      si.min_ram_gb ? `<div><strong>Min RAM:</strong> <span>${si.min_ram_gb} GB</span></div>` : '',
      si.min_storage_gb ? `<div><strong>Min Storage:</strong> <span>${si.min_storage_gb} GB</span></div>` : '',
      si.gpu_requirement ? `<div><strong>GPU Required:</strong> <span>${escapeHtml(si.gpu_requirement)}</span></div>` : '',
      si.brand_preference ? `<div><strong>Brand Preference:</strong> <span>${escapeHtml(si.brand_preference)}</span></div>` : '',
      si.weight_preference ? `<div><strong>Portability:</strong> <span>${escapeHtml(si.weight_preference)}</span></div>` : ''
    ].filter(Boolean);

    const unmetList = (result.unmet_constraints && result.unmet_constraints.length > 0)
      ? result.unmet_constraints.map((c) => `<li style="color: #f87171;">${escapeHtml(c)}</li>`).join('')
      : '<li style="color: var(--text-muted);">None (Hard constraints satisfied)</li>';

    const tradeOffsList = (result.trade_offs && result.trade_offs.length > 0)
      ? result.trade_offs.map((t) => `<li>${escapeHtml(t)}</li>`).join('')
      : '<li style="color: var(--text-muted);">No trade-offs required.</li>';

    drilldownBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <!-- STEP 1: BUYER REQUEST -->
        <div style="background: var(--bg-base); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem; flex-wrap:wrap; gap:0.5rem;">
            <span style="font-size:0.75rem; font-weight:800; color:#38bdf8; letter-spacing:0.04em;">1. BUYER REQUEST</span>
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <span class="group-tag" style="font-size:0.75rem;">${escapeHtml(formatGroupName(groupName))}</span>
              <span class="status-badge-table ${statusClass}" style="font-size:0.8rem; padding:0.2rem 0.6rem;">${escapeHtml(statusText)}</span>
            </div>
          </div>
          <div style="font-size: 1.05rem; font-weight: 600; color: #fff; line-height: 1.4;">
            &ldquo;${escapeHtml(queryText)}&rdquo;
          </div>
        </div>

        <!-- STEP 2: WHAT AI UNDERSTOOD -->
        <div style="background: rgba(56,189,248,0.04); border: 1px solid rgba(56,189,248,0.2); border-radius: var(--radius-md); padding: 0.9rem;">
          <div style="font-size:0.75rem; font-weight:800; color:#38bdf8; letter-spacing:0.04em; margin-bottom:0.5rem;">2. WHAT AI UNDERSTOOD (STRUCTURED EXTRACTION)</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.4rem; font-size: 0.8rem; color: var(--text-secondary);">
            ${siRows.length > 0 ? siRows.join('') : '<div>Standard natural language query parameters</div>'}
          </div>
        </div>

        <!-- STEP 3: WHAT CATALOG PROVIDED -->
        <div style="background: var(--bg-base); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.9rem;">
          <div style="font-size:0.75rem; font-weight:800; color:#cbd5e1; letter-spacing:0.04em; margin-bottom:0.4rem;">3. WHAT CATALOG PROVIDED (EVALUATED EVIDENCE)</div>
          ${result.closest_product_sku ? `
            <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:0.5rem;">
              <div style="font-weight:700; color:#fff; font-size:0.95rem;">${escapeHtml(result.closest_product_name || result.closest_product_sku)}</div>
              <div style="font-size:0.82rem; color:var(--text-secondary);">Verified Price: <strong style="color:#6ee7b7;">${verifiedPriceNum ? formatInr(verifiedPriceNum) : '—'}</strong></div>
            </div>
            <div class="mono" style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">SKU: ${escapeHtml(result.closest_product_sku)}</div>
          ` : '<div style="color:var(--text-muted); font-size:0.85rem;">No qualifying catalog SKU matched.</div>'}
        </div>

        <!-- STEP 4: WHAT FAILED & STEP 5: WHY -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <!-- STEP 4: WHAT FAILED -->
          <div style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-md); padding: 0.9rem;">
            <div style="font-size:0.75rem; font-weight:800; color:#f87171; letter-spacing:0.04em; margin-bottom:0.4rem;">4. WHAT FAILED (UNSATISFIED CONSTRAINTS)</div>
            <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.82rem; display: flex; flex-direction: column; gap: 0.3rem;">
              ${unmetList}
            </ul>
          </div>

          <!-- STEP 5: WHY -->
          <div style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-md); padding: 0.9rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
              <span style="font-size:0.75rem; font-weight:800; color:#f87171; letter-spacing:0.04em;">5. WHY (FAILURE REASON)</span>
              ${result.loss_reason_code ? `<code style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; padding: 0.15rem 0.4rem; border-radius: 4px; font-size:0.72rem;">${escapeHtml(result.loss_reason_code)}</code>` : ''}
            </div>
            <p style="margin: 0; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.4;">
              ${escapeHtml(result.loss_reason_description || result.explanation || 'Did not meet customer specifications.')}
            </p>
          </div>
        </div>

        <!-- STEP 6: MODELED OPPORTUNITY -->
        <div style="background: rgba(245, 158, 11, 0.06); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: var(--radius-md); padding: 0.9rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <div style="font-size:0.75rem; font-weight:800; color:#fbbf24; letter-spacing:0.04em; margin-bottom:0.2rem;">6. MODELED OPPORTUNITY</div>
            <span style="font-size:0.72rem; color:var(--text-muted);">Modeled from verified benchmark/catalog values; not actual revenue.</span>
          </div>
          <div style="font-size: 1.15rem; font-weight: 700; color: var(--accent-amber);">
            ${formatInr(oppValueNum)}
          </div>
        </div>

        <!-- STEP 7: RECOMMENDED FIX -->
        <div style="background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.25); border-radius: var(--radius-md); padding: 0.9rem;">
          <div style="font-size:0.75rem; font-weight:800; color:#6ee7b7; letter-spacing:0.04em; margin-bottom:0.3rem;">7. RECOMMENDED FIX</div>
          <div style="font-size: 0.85rem; color: #fff; line-height: 1.4;">
            ${escapeHtml(recommendedAction)}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('[Merchant] Failed to load intent details:', err);
    drilldownBody.innerHTML = `<div style="padding: 2rem; color: #f87171;">Failed to load intent details: ${escapeHtml(err.message)}</div>`;
  }
}

// Close Drilldown Modal
if (closeDrilldownBtn) {
  closeDrilldownBtn.addEventListener('click', () => {
    if (drilldownModal) drilldownModal.classList.add('hidden');
  });
}

if (drilldownModal) {
  drilldownModal.addEventListener('click', (e) => {
    if (e.target === drilldownModal) {
      drilldownModal.classList.add('hidden');
    }
  });
}
