import type { Session, AuditEvent, PurchaseReview, ProductComparisonResult } from '../types/session.ts';
import type { AgentResponse } from '../types/agent.ts';
import type { CustomerIntent } from '../types/intent.ts';
import type { LaptopProduct } from '../types/catalog.ts';
import { type ICatalogRepository, getCatalogRepository } from '../repository/catalogRepository.ts';
import { checkCompatibility } from '../engine/compatibility.ts';
import { evaluateProactiveCrossSells } from '../engine/bundleEngine.ts';
import { AgentTools } from '../tools/agentTools.ts';
import { computeBasketHash } from '../utils/hash.ts';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private repo: ICatalogRepository;
  private tools: AgentTools;

  constructor(repo: ICatalogRepository = getCatalogRepository()) {
    this.repo = repo;
    this.tools = new AgentTools(repo);
  }

  public getOrCreateSession(sessionId?: string): Session {
    const id = sessionId || `ses_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let session = this.sessions.get(id);

    if (!session) {
      const now = new Date().toISOString();
      session = {
        session_id: id,
        created_at: now,
        updated_at: now,
        current_state: 'DISCOVERY',
        messages: [],
        current_intent: null,
        latest_recommendation: null,
        selected_accessory_skus: [],
        audit_events: []
      };
      this.sessions.set(id, session);
      this.addAuditEvent(id, 'SESSION_STARTED', { session_id: id });
    }

    return session;
  }

  public getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  public addAuditEvent(
    sessionId: string,
    type: AuditEvent['type'],
    payload?: Record<string, any>
  ): AuditEvent {
    const session = this.getOrCreateSession(sessionId);
    const event: AuditEvent = {
      event_id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      type,
      payload
    };
    session.audit_events.push(event);
    session.updated_at = event.timestamp;
    return event;
  }

  public recordUserMessage(sessionId: string, content: string): void {
    const session = this.getOrCreateSession(sessionId);
    session.messages.push({
      message_id: `msg_${Date.now()}_user`,
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    });
    this.addAuditEvent(sessionId, 'USER_MESSAGE_RECEIVED', { content });
  }

  public recordAgentResponse(sessionId: string, response: AgentResponse): void {
    const session = this.getOrCreateSession(sessionId);
    session.current_state = response.state;
    session.updated_at = new Date().toISOString();

    if (response.intent) {
      session.current_intent = response.intent;
    }

    if (response.recommendation) {
      session.latest_recommendation = response.recommendation;
      // Initialize selected accessories with all recommended accessories by default
      session.selected_accessory_skus = response.recommendation.accessories.map((a) => a.sku);
      // Invalidate any previous approval
      delete session.active_approval_id;
      delete session.active_basket_hash;
      delete session.current_order_id;
      this.addAuditEvent(sessionId, 'RECOMMENDATION_GENERATED', {
        laptop_sku: response.recommendation.recommended_laptop?.product.sku,
        variant_id: response.recommendation.locked_variant?.variant_id,
        total_price_inr: response.recommendation.total_price_inr,
        accessories: session.selected_accessory_skus
      });
    }

    if (response.state === 'CLARIFICATION_REQUIRED') {
      this.addAuditEvent(sessionId, 'CLARIFICATION_REQUESTED', {
        question: response.clarification_question
      });
    }

    session.messages.push({
      message_id: `msg_${Date.now()}_agent`,
      role: 'agent',
      content: response.explanation || response.clarification_question || 'How can I assist your workspace search?',
      timestamp: new Date().toISOString(),
      state: response.state,
      clarification_question: response.clarification_question
    });
  }

  /**
   * Toggles an accessory in the customer's cart.
   * Authoritative: Validates compatibility and recalculates cart totals on the backend.
   */
  public toggleAccessory(
    sessionId: string,
    accessorySku: string,
    included: boolean
  ): { success: boolean; session?: Session; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session || !session.latest_recommendation || !session.latest_recommendation.recommended_laptop) {
      return { success: false, error: 'No active recommendation found for this session.' };
    }

    const primarySku = session.latest_recommendation.recommended_laptop.product.sku;

    if (!included) {
      // Remove accessory
      session.selected_accessory_skus = session.selected_accessory_skus.filter((sku) => sku !== accessorySku);
      this.addAuditEvent(sessionId, 'ACCESSORY_REMOVED', { accessory_sku: accessorySku });
    } else {
      // Validate accessory SKU existence in catalog
      const accProd = this.repo.getProductBySku(accessorySku);
      if (!accProd) {
        return { success: false, error: `Accessory product "${accessorySku}" not found in catalog.` };
      }

      // Deterministically verify compatibility before including
      const compat = checkCompatibility(primarySku, accessorySku, this.repo, session.current_intent || undefined);
      if (!compat.compatible) {
        this.addAuditEvent(sessionId, 'INCOMPATIBLE_ACCESSORY_BLOCKED', {
          accessory_sku: accessorySku,
          primary_sku: primarySku,
          reason: compat.reason
        });
        return {
          success: false,
          error: `Accessory ${accessorySku} cannot be attached: ${compat.reason}`
        };
      }

      if (!session.selected_accessory_skus.includes(accessorySku)) {
        session.selected_accessory_skus.push(accessorySku);
        this.addAuditEvent(sessionId, 'ACCESSORY_SELECTED', { accessory_sku: accessorySku });
      }
    }

    // Authoritative Recalculation of Bundle Total
    const allSkus = [primarySku, ...session.selected_accessory_skus];
    const cart = this.tools.calculate_cart(allSkus);

    const budgetCeiling = session.latest_recommendation.budget_ceiling_inr;
    session.latest_recommendation.total_price_inr = cart.total_inr;
    session.latest_recommendation.budget_margin_inr = budgetCeiling - cart.total_inr;
    session.latest_recommendation.itemized_line_items = cart.items.map((it) => {
      const p = this.repo.getProductBySku(it.sku)!;
      return {
        sku: it.sku,
        name: it.name,
        category: p.category,
        price_inr: it.price_inr
      };
    });

    session.latest_recommendation.accessories = session.selected_accessory_skus.map((sku) => {
      const p = this.repo.getProductBySku(sku)!;
      return {
        sku: p.sku,
        name: p.name,
        category: p.category as 'mouse' | 'bag',
        price_inr: p.price_inr,
        stock_quantity: p.stock_quantity
      };
    });

    // Re-evaluate proactive add-ons with updated running total
    if (session.current_intent && session.latest_recommendation.recommended_laptop) {
      const laptop = session.latest_recommendation.recommended_laptop.product;
      const allMice = this.repo.getMice();
      const allBags = this.repo.getBags();
      const rawAddOns = evaluateProactiveCrossSells(laptop, session.current_intent, allMice, allBags);
      session.latest_recommendation.proactive_add_ons = rawAddOns.map((addon) => {
        const isSelected = session.selected_accessory_skus.includes(addon.sku);
        if (isSelected) return addon;
        const newTotal = cart.total_inr + addon.price_inr;
        const isWithin = budgetCeiling ? newTotal <= budgetCeiling : true;
        const delta = budgetCeiling && newTotal > budgetCeiling ? newTotal - budgetCeiling : undefined;
        return {
          ...addon,
          current_total_inr: cart.total_inr,
          new_total_inr: newTotal,
          is_within_budget: isWithin,
          budget_delta_inr: delta,
          state: isWithin ? 'ELIGIBLE_CROSS_SELL' : 'COMPATIBLE_BUT_OVER_BUDGET'
        };
      });
    }

    // Invalidate previous approval as basket contents changed
    delete session.active_approval_id;
    delete session.active_basket_hash;
    delete session.current_order_id;

    session.updated_at = new Date().toISOString();
    return { success: true, session };
  }

  /**
   * Compares the recommended candidate with an alternative SKU using strictly verified facts.
   */
  public compareProducts(sessionId: string, alternativeSku: string): ProductComparisonResult {
    const session = this.sessions.get(sessionId);
    if (!session || !session.latest_recommendation || !session.latest_recommendation.recommended_laptop) {
      throw new Error('No active recommendation to compare against.');
    }

    const primary = session.latest_recommendation.recommended_laptop.product;
    const locked = session.latest_recommendation.locked_variant!;
    const altProduct = this.repo.getProductBySku(alternativeSku);

    if (!altProduct || altProduct.category !== 'laptop') {
      throw new Error(`Alternative product "${alternativeSku}" is not a valid laptop in the catalog.`);
    }

    const alt = altProduct as LaptopProduct;

    // Check if alternative was in the engine's rejections log
    const rejection = session.latest_recommendation.rejections.find((r) => r.sku === alternativeSku);

    const differences: string[] = [];

    // Weight comparison
    const weightDiff = alt.weight_g - primary.weight_g;
    if (weightDiff !== 0) {
      differences.push(
        `${primary.name} (${(primary.weight_g / 1000).toFixed(2)}kg) is ${Math.abs(weightDiff)}g ${
          weightDiff > 0 ? 'lighter' : 'heavier'
        } than ${alt.name} (${(alt.weight_g / 1000).toFixed(2)}kg).`
      );
    }

    // Battery comparison
    const batteryDiff = primary.battery.capacity_wh - alt.battery.capacity_wh;
    if (batteryDiff !== 0) {
      differences.push(
        `${primary.name} features a ${primary.battery.capacity_wh}Wh battery (${Math.abs(batteryDiff)}Wh ${
          batteryDiff > 0 ? 'larger' : 'smaller'
        } than ${alt.name}'s ${alt.battery.capacity_wh}Wh).`
      );
    }

    // Price comparison
    const priceDiff = alt.price_inr - primary.price_inr;
    if (priceDiff !== 0) {
      differences.push(
        `${primary.name} is priced at ₹${primary.price_inr.toLocaleString('en-IN')} (₹${Math.abs(
          priceDiff
        ).toLocaleString('en-IN')} ${priceDiff > 0 ? 'more affordable' : 'more expensive'} than ${
          alt.name
        } @ ₹${alt.price_inr.toLocaleString('en-IN')}).`
      );
    }

    // Display comparison
    if (primary.display.size_inches !== alt.display.size_inches) {
      differences.push(
        `${primary.name} has a ${primary.display.size_inches}" display versus ${alt.name}'s ${alt.display.size_inches}" panel.`
      );
    }

    if (rejection) {
      differences.push(`Engine Exclusion Note: ${rejection.reason}`);
    }

    return {
      primary: {
        sku: primary.sku,
        name: primary.name,
        price_inr: primary.price_inr,
        weight_g: primary.weight_g,
        ram_summary: locked.ram_summary,
        storage_summary: locked.storage_summary,
        battery_wh: primary.battery.capacity_wh,
        screen_size_inch: primary.display.size_inches
      },
      alternative: {
        sku: alt.sku,
        name: alt.name,
        price_inr: alt.price_inr,
        weight_g: alt.weight_g,
        ram_summary: alt.ram.capacity_gb ? `${alt.ram.capacity_gb}GB ${alt.ram.type}` : 'Unspecified',
        storage_summary: `${alt.storage.capacity_gb}GB ${alt.storage.type}`,
        battery_wh: alt.battery.capacity_wh,
        screen_size_inch: alt.display.size_inches,
        rejection_reason: rejection?.reason
      },
      factual_differences: differences
    };
  }

  /**
   * Generates the immutable purchase review snapshot prior to gateway handoff.
   */
  public generatePurchaseReview(sessionId: string): PurchaseReview {
    const session = this.sessions.get(sessionId);
    if (!session || !session.latest_recommendation || !session.latest_recommendation.recommended_laptop) {
      throw new Error('Cannot review purchase: No active recommendation in session.');
    }

    const rec = session.latest_recommendation;
    const laptop = rec.recommended_laptop!.product;
    const locked = rec.locked_variant!;

    const selectedAccessories = session.selected_accessory_skus.map((sku) => {
      const prod = this.repo.getProductBySku(sku)!;
      const chk = rec.compatibility_checks.find((c) => c.accessory_sku === sku);
      return {
        sku: prod.sku,
        name: prod.name,
        category: prod.category,
        price_inr: prod.price_inr,
        stock: prod.stock_quantity,
        in_stock: prod.stock_quantity > 0,
        compatibility_status: chk ? chk.compatible : true,
        compatibility_reason: chk ? chk.reason : 'Verified compatible by engine.'
      };
    });

    const lineItems = [
      {
        sku: laptop.sku,
        name: `${laptop.name} (${locked.variant_id})`,
        category: 'laptop',
        price_inr: locked.price_inr
      },
      ...selectedAccessories.map((a) => ({
        sku: a.sku,
        name: a.name,
        category: a.category,
        price_inr: a.price_inr
      }))
    ];

    const finalTotal = lineItems.reduce((acc, item) => acc + item.price_inr, 0);
    const budgetCeiling = rec.budget_ceiling_inr;

    const basketHash = computeBasketHash({
      sessionId,
      intentId: session.current_intent?.intent_id,
      skus: lineItems.map((it) => it.sku),
      variantId: locked.variant_id,
      totalInr: finalTotal
    });
    session.active_basket_hash = basketHash;

    const isOverBudget = finalTotal > budgetCeiling;
    const overBudgetByInr = isOverBudget ? finalTotal - budgetCeiling : 0;
    const gateStatus = isOverBudget ? 'BLOCKED_OVER_BUDGET' : 'AUTHORIZED_PENDING_GATEWAY';

    this.addAuditEvent(sessionId, isOverBudget ? 'PURCHASE_REVIEW_BLOCKED_OVER_BUDGET' : 'PURCHASE_REVIEW_OPENED', {
      line_items_count: lineItems.length,
      final_total_inr: finalTotal,
      basket_hash: basketHash,
      budget_ceiling_inr: budgetCeiling,
      is_over_budget: isOverBudget,
      over_budget_by_inr: overBudgetByInr
    });

    return {
      session_id: sessionId,
      created_at: new Date().toISOString(),
      customer_budget_inr: budgetCeiling,
      final_total_inr: finalTotal,
      budget_margin_inr: budgetCeiling - finalTotal,
      basket_hash: basketHash,
      primary_product: {
        sku: laptop.sku,
        name: laptop.name,
        variant_id: locked.variant_id,
        price_inr: locked.price_inr,
        stock: laptop.stock_quantity,
        in_stock: laptop.stock_quantity > 0,
        ram_summary: locked.ram_summary,
        storage_summary: locked.storage_summary,
        weight_g: laptop.weight_g,
        battery_wh: laptop.battery.capacity_wh
      },
      accessories: selectedAccessories,
      line_items: lineItems,
      verified_trade_offs: rec.trade_offs,
      audit_events_count: session.audit_events.length,
      gate_status: gateStatus,
      is_over_budget: isOverBudget,
      over_budget_by_inr: overBudgetByInr
    };
  }
}

// Singleton instance
let defaultSessionManager: SessionManager | null = null;
export function getSessionManager(repo?: ICatalogRepository): SessionManager {
  if (!defaultSessionManager) {
    defaultSessionManager = new SessionManager(repo);
  }
  return defaultSessionManager;
}
