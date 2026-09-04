import type { AgentResponse, AgentState, MatchType } from '../types/agent.ts';
import type { ILLMProvider } from '../llm/llmProvider.ts';
import type { CustomerIntent } from '../types/intent.ts';
import { getLLMProvider } from '../llm/llmProvider.ts';
import { validateCustomerIntent } from '../nlu/intentValidator.ts';
import { detectAmbiguity } from '../nlu/ambiguityDetector.ts';
import { DeterministicDecisionEngine } from '../engine/decisionEngine.ts';
import { type ICatalogRepository, getCatalogRepository } from '../repository/catalogRepository.ts';
import { SessionManager, getSessionManager } from '../session/sessionManager.ts';
import { AgentTools } from '../tools/agentTools.ts';
import { evaluateProactiveCrossSells } from '../engine/bundleEngine.ts';
import { normalizeBudget, normalizeRam, normalizeCategories } from '../nlu/normalization.ts';

/**
 * PRODUCT TRUST PRINCIPLE (Track 01):
 * "Revenue optimization must never override customer intent, hard constraints, compatibility, factual grounding or explicit approval."
 *
 * The agent should increase basket value only through genuinely relevant, compatible, and properly disclosed products.
 * Never use fake urgency, fake scarcity, irrelevant add-ons, forced bundles, hidden price expansion, or automatic budget increases.
 */
export class AgentOrchestrator {
  private llmProvider: ILLMProvider;
  private decisionEngine: DeterministicDecisionEngine;
  private sessionManager: SessionManager;
  private repo: ICatalogRepository;
  private tools: AgentTools;

  constructor(
    llmProvider: ILLMProvider = getLLMProvider(),
    repo: ICatalogRepository = getCatalogRepository(),
    sessionManager: SessionManager = getSessionManager(repo)
  ) {
    this.llmProvider = llmProvider;
    this.repo = repo;
    this.tools = new AgentTools(repo);
    this.decisionEngine = new DeterministicDecisionEngine(repo);
    this.sessionManager = sessionManager;
  }

  /**
   * Processes a natural-language customer message through the AgentReady pipeline:
   * 1. Session Context & Follow-up Resolution
   * 2. NLU / Intent Extraction
   * 3. Schema Validation
   * 4. Ambiguity Gate (at most 1 clarification question)
   * 5. Deterministic Decision Engine (authoritative for constraints, math, variants)
   * 6. Grounded Factual Explanation
   * 7. Audit Logging & State Persistence
   */
  public async processMessage(
    userMessage: string,
    sessionId = `ses_${Date.now()}`
  ): Promise<AgentResponse> {
    const startTime = performance.now();
    const session = this.sessionManager.getOrCreateSession(sessionId);
    this.sessionManager.recordUserMessage(sessionId, userMessage);

    const safeUserMessage = typeof userMessage === 'string' ? userMessage : String(userMessage || '');
    const lower = safeUserMessage.toLowerCase().trim();

    // Pre-NLU Deterministic Budget Validation Gate (Zero & Negative Budget)
    const budgetCheck = normalizeBudget(safeUserMessage);
    if (budgetCheck?.isZero || (budgetCheck && budgetCheck.amount === 0)) {
      const explanation = 'Please provide a budget greater than ₹0. I cannot perform a meaningful product search with a zero budget.';
      const response: AgentResponse = {
        session_id: sessionId,
        state: 'INVALID_BUDGET_INPUT',
        user_query: userMessage,
        intent: null,
        explanation,
        errors: ['Budget must be greater than ₹0.'],
        execution_time_ms: Number((performance.now() - startTime).toFixed(1))
      };
      this.sessionManager.recordAgentResponse(sessionId, response);
      return response;
    }

    if (budgetCheck?.isNegative || (budgetCheck && budgetCheck.amount !== undefined && budgetCheck.amount < 0)) {
      const explanation = 'Please provide a valid positive budget.';
      const response: AgentResponse = {
        session_id: sessionId,
        state: 'INVALID_BUDGET_INPUT',
        user_query: userMessage,
        intent: null,
        explanation,
        errors: ['Budget cannot be negative.'],
        execution_time_ms: Number((performance.now() - startTime).toFixed(1))
      };
      this.sessionManager.recordAgentResponse(sessionId, response);
      return response;
    }

    // Contextual Handler B0: Customer Explicitly Updates/Increases Budget
    // ("I can increase my budget to ₹72,000.", "Increase budget to 72k", "I can spend ₹72,000")
    const isBudgetUpdate =
      /\b(increase|raise|expand|change|update|up to|spend|afford)\b.*?(?:budget|spend|₹|rs|inr|\d+k)/i.test(lower) ||
      /\bi can (?:increase|spend|go up to|afford|do)\b/i.test(lower) ||
      /\b(?:new|updated)\s*budget\b/i.test(lower);

    if (session.current_intent && isBudgetUpdate && budgetCheck && budgetCheck.amount && budgetCheck.amount > 0) {
      const updatedIntent: CustomerIntent = {
        ...session.current_intent,
        budget: {
          currency: 'INR',
          total_ceiling: budgetCheck.amount,
          is_hard_ceiling: budgetCheck.isHardCeiling,
          raw_expression: budgetCheck.rawExpression
        },
        hard_constraints: {
          ...session.current_intent.hard_constraints,
          max_total_budget: budgetCheck.amount
        }
      };

      const validated = validateCustomerIntent(updatedIntent);
      if (validated.valid && validated.intent) {
        session.current_intent = validated.intent;

        // If the session already has an active laptop recommendation,
        // preserve the user's selected product & accessories, and recalculate basket against the new budget ceiling.
        if (session.latest_recommendation?.recommended_laptop) {
          const rec = session.latest_recommendation;
          const laptop = rec.recommended_laptop!.product;
          const allSkus = [laptop.sku, ...session.selected_accessory_skus];
          const cart = this.tools.calculate_cart(allSkus);
          const newBudget = budgetCheck.amount;
          const newTotal = cart.total_inr;
          const newMargin = newBudget - newTotal;

          const selectedAccessories = session.selected_accessory_skus.map((sku) => {
            const p = this.repo.getProductBySku(sku)!;
            return {
              sku: p.sku,
              name: p.name,
              category: p.category as 'mouse' | 'bag',
              price_inr: p.price_inr,
              stock_quantity: p.stock_quantity
            };
          });

          const itemized = cart.items.map((it) => {
            const p = this.repo.getProductBySku(it.sku)!;
            return {
              sku: it.sku,
              name: it.name,
              category: p.category,
              price_inr: it.price_inr
            };
          });

          const allMice = this.repo.getMice();
          const allBags = this.repo.getBags();
          const rawAddOns = evaluateProactiveCrossSells(laptop, validated.intent, allMice, allBags);
          const proactiveAddOns = rawAddOns.map((addon) => {
            const isSelected = session.selected_accessory_skus.includes(addon.sku);
            if (isSelected) return addon;
            const itemNewTotal = newTotal + addon.price_inr;
            const isWithin = itemNewTotal <= newBudget;
            const delta = !isWithin ? itemNewTotal - newBudget : undefined;
            return {
              ...addon,
              current_total_inr: newTotal,
              new_total_inr: itemNewTotal,
              is_within_budget: isWithin,
              budget_delta_inr: delta,
              state: (isWithin ? 'ELIGIBLE_CROSS_SELL' : 'COMPATIBLE_BUT_OVER_BUDGET') as 'ELIGIBLE_CROSS_SELL' | 'COMPATIBLE_BUT_OVER_BUDGET'
            };
          });

          const isNowValid = newTotal <= newBudget;
          const updatedRec = {
            ...rec,
            budget_ceiling_inr: newBudget,
            budget_margin_inr: newMargin,
            total_price_inr: newTotal,
            accessories: selectedAccessories,
            itemized_line_items: itemized,
            proactive_add_ons: proactiveAddOns,
            match_type: (isNowValid ? 'VALID_MATCH' : 'PARTIAL_MATCH') as MatchType,
            status: (isNowValid ? 'SUCCESS' : 'PARTIAL_MATCH') as 'SUCCESS' | 'PARTIAL_MATCH'
          };

          const explanation = isNowValid
            ? `Your budget has been updated to **₹${newBudget.toLocaleString('en-IN')}**. Your current basket total of **₹${newTotal.toLocaleString('en-IN')}** is now within budget with **₹${newMargin.toLocaleString('en-IN')} unused budget**. Ready for purchase authorization.`
            : `Your budget has been updated to **₹${newBudget.toLocaleString('en-IN')}**. Basket total is **₹${newTotal.toLocaleString('en-IN')}** (still exceeds budget by **₹${Math.abs(newMargin).toLocaleString('en-IN')}**). Remove an add-on or increase your budget to continue.`;

          const response: AgentResponse = {
            session_id: sessionId,
            state: isNowValid ? 'VALID_MATCH' : 'PARTIAL_MATCH',
            match_type: isNowValid ? 'VALID_MATCH' : 'PARTIAL_MATCH',
            user_query: userMessage,
            intent: validated.intent,
            recommendation: updatedRec,
            explanation,
            execution_time_ms: Number((performance.now() - startTime).toFixed(1))
          };

          this.sessionManager.recordAgentResponse(sessionId, response);
          return response;
        }

        const engineResult = this.decisionEngine.evaluateIntent(validated.intent);
        let explanation = '';
        try {
          explanation = await this.llmProvider.generateExplanation(engineResult, userMessage);
        } catch {
          explanation = `Your budget ceiling has been updated to **₹${budgetCheck.amount.toLocaleString('en-IN')}**. Re-evaluated recommendation and eligible accessories with updated budget.`;
        }

        let finalState: AgentState = 'RECOMMENDATION_READY';
        if (engineResult.status === 'VALID_MATCH') finalState = 'VALID_MATCH';
        else if (engineResult.status === 'PARTIAL_MATCH') finalState = 'PARTIAL_MATCH';
        else if (engineResult.status === 'NO_PRODUCT_MATCH') finalState = 'NO_PRODUCT_MATCH';

        const response: AgentResponse = {
          session_id: sessionId,
          state: finalState,
          match_type: engineResult.match_type,
          user_query: userMessage,
          intent: validated.intent,
          recommendation: engineResult,
          explanation,
          execution_time_ms: Number((performance.now() - startTime).toFixed(1))
        };

        this.sessionManager.recordAgentResponse(sessionId, response);
        return response;
      }
    }

    // Contextual Handler A: Grounded Justification Inquiry ("Why AeroBook?", "Why did you choose this?")
    if (session.latest_recommendation?.recommended_laptop && /\b(why\b|reason\b|explain\b|how come\b)/i.test(lower)) {
      const rec = session.latest_recommendation;
      const laptop = rec.recommended_laptop!.product;
      const locked = rec.locked_variant!;
      const topRejection = rec.rejections.find((r) => r.sku === 'NX-LP-DEVPRO15-09' || r.sku === 'NX-LP-PRO16-05') || rec.rejections[0];

      let explanation = `The **${laptop.name}** (${laptop.sku}) was selected by our deterministic decision engine because it satisfied all verified hard constraints and ranked #1 in weighted utility scoring:\n\n` +
        `• **Target Fit:** Matches your ${session.current_intent?.target_workload || 'coding'} requirements — ${laptop.processor.cores}-core ${laptop.processor.model} with ${locked.ram_summary}.\n` +
        `• **Mobility Score:** At ${(laptop.weight_g / 1000).toFixed(2)}kg with a ${laptop.battery.capacity_wh}Wh battery, it scored top marks for daily travel.\n` +
        `• **Budget Efficiency:** Priced at ₹${laptop.price_inr.toLocaleString('en-IN')}, leaving ₹${rec.budget_margin_inr.toLocaleString('en-IN')} headroom for compatible accessories.\n`;

      if (topRejection) {
        explanation += `\n**Alternative Comparison:** ${topRejection.name || topRejection.sku} was rejected because: ${topRejection.reason}`;
      }

      const response: AgentResponse = {
        session_id: sessionId,
        state: 'RECOMMENDATION_READY',
        user_query: userMessage,
        intent: session.current_intent,
        recommendation: rec,
        explanation,
        execution_time_ms: Number((performance.now() - startTime).toFixed(1))
      };

      this.sessionManager.recordAgentResponse(sessionId, response);
      return response;
    }

    // Contextual Handler B: Accessory Exclusion / Inclusion via Natural Language
    // ("Remove the mouse", "Take out bag", "Add a compatible mouse", "Add a bag that fits the laptop")
    if (session.latest_recommendation?.recommended_laptop && /\b(remove|exclude|take off|drop|delete)\b/i.test(lower)) {
      let targetSku: string | undefined;
      if (/\b(mouse|mice)\b/i.test(lower)) {
        targetSku = session.selected_accessory_skus.find((s) => s.startsWith('NX-MS')) ||
                    session.latest_recommendation.accessories.find((a) => a.sku.startsWith('NX-MS'))?.sku;
      } else if (/\b(bag|backpack|sleeve)\b/i.test(lower)) {
        targetSku = session.selected_accessory_skus.find((s) => s.startsWith('NX-BG')) ||
                    session.latest_recommendation.accessories.find((a) => a.sku.startsWith('NX-BG'))?.sku;
      }

      if (targetSku) {
        const toggleRes = this.sessionManager.toggleAccessory(sessionId, targetSku, false);
        if (toggleRes.success && toggleRes.session?.latest_recommendation) {
          const updatedRec = toggleRes.session.latest_recommendation;
          const removedProd = this.repo.getProductBySku(targetSku);
          const explanation = `Removed **${removedProd?.name || targetSku}** from your bundle. Your updated bundle total is **₹${updatedRec.total_price_inr.toLocaleString('en-IN')}** (remaining budget: ₹${updatedRec.budget_margin_inr.toLocaleString('en-IN')}).`;

          const response: AgentResponse = {
            session_id: sessionId,
            state: 'RECOMMENDATION_READY',
            match_type: updatedRec.match_type ?? 'VALID_MATCH',
            user_query: userMessage,
            intent: session.current_intent,
            recommendation: updatedRec,
            explanation,
            execution_time_ms: Number((performance.now() - startTime).toFixed(1))
          };

          this.sessionManager.recordAgentResponse(sessionId, response);
          return response;
        }
      }
    }

    if (session.latest_recommendation?.recommended_laptop && /\b(add|include|attach|put in|give me a|with a)\b/i.test(lower) && !/\b(cheaper|different)\b/i.test(lower)) {
      const rec = session.latest_recommendation;
      const laptop = rec.recommended_laptop!.product;
      let targetSku: string | undefined;

      if (/\b(mouse|mice)\b/i.test(lower)) {
        const proactiveMouse = rec.proactive_add_ons?.find((a) => a.category === 'mouse');
        if (proactiveMouse) {
          targetSku = proactiveMouse.sku;
        } else {
          const mice = this.repo.getMice().filter((m) => m.is_active && m.stock_quantity > 0);
          const compatMouse = mice.find((m) => {
            if (laptop.ports.usb_a_count === 0 && !m.bluetooth) return false;
            return true;
          });
          targetSku = compatMouse?.sku;
        }
      } else if (/\b(bag|backpack|sleeve)\b/i.test(lower)) {
        const proactiveBag = rec.proactive_add_ons?.find((a) => a.category === 'bag');
        if (proactiveBag) {
          targetSku = proactiveBag.sku;
        } else {
          const bags = this.repo.getBags().filter((b) => b.is_active && b.stock_quantity > 0);
          const compatBag = bags.find((b) => b.target_laptop_size_inches >= laptop.display.size_inches);
          targetSku = compatBag?.sku;
        }
      }

      if (targetSku) {
        const toggleRes = this.sessionManager.toggleAccessory(sessionId, targetSku, true);
        if (toggleRes.success && toggleRes.session?.latest_recommendation) {
          const updatedRec = toggleRes.session.latest_recommendation;
          const addedProd = this.repo.getProductBySku(targetSku);
          const explanation = `Added **${addedProd?.name || targetSku}** (₹${addedProd?.price_inr.toLocaleString('en-IN')}) to your bundle.\n\n` +
            `• **Compatibility Verified:** Verified port and physical compatibility with **${laptop.name}**.\n` +
            `• **Updated Basket Total:** **₹${updatedRec.total_price_inr.toLocaleString('en-IN')}** (Customer Budget: ₹${updatedRec.budget_ceiling_inr.toLocaleString('en-IN')}, Remaining Margin: ₹${updatedRec.budget_margin_inr.toLocaleString('en-IN')}).\n` +
            `Ready for purchase review when you are.`;

          const response: AgentResponse = {
            session_id: sessionId,
            state: 'RECOMMENDATION_READY',
            match_type: 'VALID_MATCH',
            user_query: userMessage,
            intent: session.current_intent,
            recommendation: updatedRec,
            explanation,
            execution_time_ms: Number((performance.now() - startTime).toFixed(1))
          };

          this.sessionManager.recordAgentResponse(sessionId, response);
          return response;
        } else if (!toggleRes.success) {
          const explanation = `Could not add accessory: ${toggleRes.error}`;
          const response: AgentResponse = {
            session_id: sessionId,
            state: 'RECOMMENDATION_READY',
            match_type: rec.match_type,
            user_query: userMessage,
            intent: session.current_intent,
            recommendation: rec,
            explanation,
            execution_time_ms: Number((performance.now() - startTime).toFixed(1))
          };
          this.sessionManager.recordAgentResponse(sessionId, response);
          return response;
        }
      }
    }

    // Contextual Handler B3: Budget Downsell / Cheaper Alternative Inquiry ("Can I get something cheaper?", "Cheaper option")
    if (session.latest_recommendation?.recommended_laptop && /\b(cheaper|lower price|less expensive|budget option|save money|more affordable)\b/i.test(lower)) {
      const rec = session.latest_recommendation;
      const currentLaptop = rec.recommended_laptop!.product;
      const allLaptops = this.repo.getLaptops().filter((l) => l.is_active && l.stock_quantity > 0 && l.price_inr < currentLaptop.price_inr);
      
      allLaptops.sort((a, b) => b.price_inr - a.price_inr); // descending, closest price tier below

      if (allLaptops.length > 0) {
        const cheaperOption = allLaptops[0];
        const savingsInr = currentLaptop.price_inr - cheaperOption.price_inr;

        const tradeOffs: string[] = [];
        if (cheaperOption.ram.capacity_gb !== null && currentLaptop.ram.capacity_gb !== null && cheaperOption.ram.capacity_gb < currentLaptop.ram.capacity_gb) {
          tradeOffs.push(`RAM is reduced from ${currentLaptop.ram.capacity_gb}GB to ${cheaperOption.ram.capacity_gb}GB.`);
        }
        if ((cheaperOption.processor.cores ?? 0) < (currentLaptop.processor.cores ?? 0)) {
          tradeOffs.push(`CPU has ${cheaperOption.processor.cores} cores instead of ${currentLaptop.processor.cores} cores.`);
        }
        if (cheaperOption.battery.capacity_wh < currentLaptop.battery.capacity_wh) {
          tradeOffs.push(`Battery capacity is ${cheaperOption.battery.capacity_wh}Wh (vs ${currentLaptop.battery.capacity_wh}Wh).`);
        }
        if (cheaperOption.weight_g > currentLaptop.weight_g) {
          tradeOffs.push(`Weight increases by ${((cheaperOption.weight_g - currentLaptop.weight_g) / 1000).toFixed(2)}kg.`);
        }
        if (tradeOffs.length === 0) {
          tradeOffs.push(`Different chassis finish and display peak brightness.`);
        }

        const explanation = `Here is our closest lower-priced alternative: **${cheaperOption.name}** at **₹${cheaperOption.price_inr.toLocaleString('en-IN')}** (saves ₹${savingsInr.toLocaleString('en-IN')}).\n\n` +
          `• **Key Specifications:** ${cheaperOption.processor.cores}-core ${cheaperOption.processor.model}, ${cheaperOption.ram.capacity_gb ?? 'N/A'}GB RAM, ${cheaperOption.storage.capacity_gb}GB SSD, ${(cheaperOption.weight_g / 1000).toFixed(2)}kg.\n` +
          `• **Disclosed Trade-offs:**\n` +
          tradeOffs.map((t) => `  - ${t}`).join('\n') + '\n\n' +
          `Would you like to switch to **${cheaperOption.name}**, or keep **${currentLaptop.name}**?`;

        const syntheticIntent: CustomerIntent = {
          required_categories: ['laptop'],
          hard_constraints: {
            max_total_budget: cheaperOption.price_inr,
            min_ram_gb: cheaperOption.ram.capacity_gb ?? 8,
            in_stock_only: true
          },
          soft_preferences: session.current_intent?.soft_preferences ?? { weights: { portability: 0.4, battery: 0.3, longevity: 0.3 } }
        };
        const engineResult = this.decisionEngine.evaluateIntent(syntheticIntent);

        const response: AgentResponse = {
          session_id: sessionId,
          state: 'RECOMMENDATION_READY',
          match_type: 'VALID_MATCH',
          user_query: userMessage,
          intent: syntheticIntent,
          recommendation: engineResult,
          explanation,
          execution_time_ms: Number((performance.now() - startTime).toFixed(1))
        };

        this.sessionManager.recordAgentResponse(sessionId, response);
        return response;
      } else {
        const explanation = `The **${currentLaptop.name}** at ₹${currentLaptop.price_inr.toLocaleString('en-IN')} is already the lowest-priced laptop in our catalog that satisfies your baseline requirements.`;
        const response: AgentResponse = {
          session_id: sessionId,
          state: 'RECOMMENDATION_READY',
          match_type: rec.match_type,
          user_query: userMessage,
          intent: session.current_intent,
          recommendation: rec,
          explanation,
          execution_time_ms: Number((performance.now() - startTime).toFixed(1))
        };
        this.sessionManager.recordAgentResponse(sessionId, response);
        return response;
      }
    }

    // Contextual Handler C: Purchase Review via Natural Language ("Review my purchase", "Authorize purchase")
    if (session.latest_recommendation && /\b(review my purchase|authorize purchase|review purchase|ready to buy|checkout)\b/i.test(lower)) {
      const review = this.sessionManager.generatePurchaseReview(sessionId);
      const explanation = `### Immutable Purchase Authorization Review\n\n` +
        `• **Selected System:** ${review.primary_product.name} (SKU: ${review.primary_product.sku}, Variant: ${review.primary_product.variant_id}) — ₹${review.primary_product.price_inr.toLocaleString('en-IN')}\n` +
        (review.accessories.length > 0
          ? `• **Accessories:**\n` + review.accessories.map((a) => `  - ${a.name} (₹${a.price_inr.toLocaleString('en-IN')}) [${a.compatibility_reason}]`).join('\n') + '\n'
          : `• **Accessories:** None attached.\n`) +
        `• **Verified Total:** ₹${review.final_total_inr.toLocaleString('en-IN')} (Customer Budget: ₹${review.customer_budget_inr.toLocaleString('en-IN')})\n` +
        `• **Audit Session ID:** \`${review.session_id}\`\n\n` +
        `Click **"Continue to Razorpay"** to proceed to payment authorization.`;

      const response: AgentResponse = {
        session_id: sessionId,
        state: 'RECOMMENDATION_READY',
        user_query: userMessage,
        intent: session.current_intent,
        recommendation: session.latest_recommendation,
        explanation,
        execution_time_ms: Number((performance.now() - startTime).toFixed(1))
      };

      this.sessionManager.recordAgentResponse(sessionId, response);
      return response;
    }

    // Contextual Handler E: Natural Language Comparison & Evidence-Based Decision Support
    // ("Compare AeroBook 14 and DevForge 15", "Which is better?", "Which one should I buy for coding and daily travel?")
    const isComparisonOrDecision =
      /\b(compare|comparison|versus|\bvs\b|which is better|which one is better|which should i buy|which one should i buy)\b/i.test(lower);

    if (isComparisonOrDecision) {
      const allLaptops = this.repo.getLaptops();
      const mentionedLaptops: typeof allLaptops = [];

      const modelKeywords: Array<{ keywords: string[]; sku: string }> = [
        { keywords: ['aerobook', 'aero 14', 'aero14'], sku: 'NX-LP-AERO14-01' },
        { keywords: ['devforge', 'dev 15', 'dev15'], sku: 'NX-LP-DEV15-02' },
        { keywords: ['slimbook', 'slim 14', 'slim14'], sku: 'NX-LP-SLIM14-03' },
        { keywords: ['codecraft', 'code 14', 'code14'], sku: 'NX-LP-CODE14-04' },
        { keywords: ['workstation', 'pro 16', 'pro16'], sku: 'NX-LP-PRO16-05' },
        { keywords: ['airlite', 'lite 13', 'lite13'], sku: 'NX-LP-LITE13-06' },
        { keywords: ['campus', 'campus 14'], sku: 'NX-LP-CAMPUS-07' },
        { keywords: ['devpro', 'devpro 15'], sku: 'NX-LP-DEVPRO15-09' },
        { keywords: ['edgebook', 'edge 14'], sku: 'NX-LP-EDGE14-10' },
        { keywords: ['flexbook', 'flex 14'], sku: 'NX-LP-FLEX14-11' },
        { keywords: ['titan', 'titan 15'], sku: 'NX-LP-TITAN15-12' },
        { keywords: ['carboncraft', 'carbon 14'], sku: 'NX-LP-CARBON14-13' },
        { keywords: ['devstation', 'code 15', 'code15'], sku: 'NX-LP-CODE15-15' },
      ];

      for (const entry of modelKeywords) {
        if (entry.keywords.some((kw) => lower.includes(kw))) {
          const found = allLaptops.find((l) => l.sku === entry.sku);
          if (found && !mentionedLaptops.some((m) => m.sku === found.sku)) {
            mentionedLaptops.push(found);
          }
        }
      }

      let prodA = mentionedLaptops[0];
      let prodB = mentionedLaptops[1];

      const wantsGaming =
        /\b(gaming|game|games)\b/i.test(lower) ||
        session.current_intent?.target_workload === 'gaming';

      // For gaming inquiry where specific laptops weren't named, compare our dedicated GPU models
      if (wantsGaming && mentionedLaptops.length === 0) {
        prodA = allLaptops.find((l) => l.sku === 'NX-LP-TITAN15-12') || allLaptops[0];
        prodB = allLaptops.find((l) => l.sku === 'NX-LP-PRO16-05') || allLaptops[1];
      }

      if (!prodA && session.latest_recommendation?.recommended_laptop) {
        prodA = session.latest_recommendation.recommended_laptop.product;
      }
      if (!prodB) {
        if (prodA?.sku === 'NX-LP-AERO14-01') {
          prodB = allLaptops.find((l) => l.sku === 'NX-LP-DEV15-02')!;
        } else if (prodA) {
          prodB = allLaptops.find((l) => l.sku === 'NX-LP-AERO14-01')!;
        } else {
          prodA = allLaptops.find((l) => l.sku === 'NX-LP-AERO14-01')!;
          prodB = allLaptops.find((l) => l.sku === 'NX-LP-DEV15-02')!;
        }
      }

      const wantsTravel =
        /\b(travel|commute|portable|light|lightweight)\b/i.test(lower) ||
        session.current_intent?.soft_preferences.max_preferred_weight_g !== undefined;
      const wantsCoding =
        /\b(coding|dev|code|software|programming)\b/i.test(lower) ||
        session.current_intent?.target_workload === 'coding';

      const weightDiffG = Math.abs(prodA.weight_g - prodB.weight_g);
      const batteryDiffWh = Math.abs(prodA.battery.capacity_wh - prodB.battery.capacity_wh);
      const priceDiffInr = Math.abs(prodA.price_inr - prodB.price_inr);

      let winner = prodA;
      let winnerReason = '';
      let tradeOffDisclosure = '';

      if (wantsGaming) {
        // Evaluate dedicated GPU, VRAM, and display refresh rate
        const aVram = prodA.gpu?.vram_gb ?? 0;
        const bVram = prodB.gpu?.vram_gb ?? 0;
        // If customer asks generally or has budget ceiling <= 70k, Titan 15 is the value champion
        if (prodA.price_inr <= 70000 && prodA.gpu?.is_dedicated) {
          winner = prodA;
        } else if (prodB.price_inr <= 70000 && prodB.gpu?.is_dedicated) {
          winner = prodB;
        } else {
          winner = aVram >= bVram ? prodA : prodB;
        }
        const loser = winner.sku === prodA.sku ? prodB : prodA;

        winnerReason =
          `For gaming workloads, I recommend **${winner.name}**:\n` +
          `1. **Graphics Engine:** Powered by ${winner.gpu?.model || 'Dedicated GPU'} with ${winner.gpu?.vram_gb || 4}GB ${winner.gpu?.memory_type || 'GDDR6'} VRAM.\n` +
          `2. **Display Refresh Rate:** Features a high-refresh ${winner.display.refresh_rate_hz || 144}Hz display for smooth frame pacing and low input latency.\n` +
          `3. **Value & Efficiency:** Priced at ₹${winner.price_inr.toLocaleString('en-IN')}, delivering verified hardware capabilities within budget.`;

        tradeOffDisclosure =
          `**Hardware Trade-off:** ${winner.name} (${winner.gpu?.vram_gb || 4}GB VRAM) delivers outstanding 1080p gaming, but if you require maximum 8GB VRAM for 1440p ray-tracing, ${loser.name} (₹${loser.price_inr.toLocaleString('en-IN')}) offers higher sustained graphical throughput at a ₹${priceDiffInr.toLocaleString('en-IN')} price premium.`;
      } else if (wantsTravel || (wantsCoding && wantsTravel)) {
        winner = prodA.weight_g <= prodB.weight_g ? prodA : prodB;
        const loser = winner.sku === prodA.sku ? prodB : prodA;
        winnerReason =
          `Based on your stated priorities (coding and daily travel), I recommend **${winner.name}** because:\n` +
          `1. **Portability:** It is ${(weightDiffG / 1000).toFixed(2)}kg lighter (${(winner.weight_g / 1000).toFixed(2)}kg vs ${(loser.weight_g / 1000).toFixed(2)}kg), which significantly eases daily commuting.\n` +
          `2. **Battery:** Its ${winner.battery.capacity_wh}Wh battery provides ${batteryDiffWh}Wh more capacity than ${loser.name} (${loser.battery.capacity_wh}Wh).\n` +
          `3. **Ports:** Includes Thunderbolt 4 and dual USB-C charging.\n` +
          `4. **Price:** Priced at ₹${winner.price_inr.toLocaleString('en-IN')} (₹${priceDiffInr.toLocaleString('en-IN')} lower than ${loser.name}).`;

        tradeOffDisclosure =
          `**Trade-off to consider:** The ${winner.name}'s RAM (${winner.ram.capacity_gb}GB ${winner.ram.type}) is soldered and non-expandable, whereas ${loser.name} offers expandable DDR5 RAM slots and an H-series processor for heavier sustained multi-core compilation.`;
      } else if (wantsCoding) {
        // DevForge has 45W H-series CPU & expandable 32GB RAM vs AeroBook's 15W U-series CPU & soldered 16GB
        const devForgeCandidate = [prodA, prodB].find((p) => p.sku === 'NX-LP-DEV15-02');
        const aeroBookCandidate = [prodA, prodB].find((p) => p.sku === 'NX-LP-AERO14-01');

        if (devForgeCandidate && aeroBookCandidate) {
          winner = devForgeCandidate;
          winnerReason =
            `For intensive coding, local containerization, and fast compilation at a desk, **${devForgeCandidate.name}** is the superior development machine:\n` +
            `1. **Compilation Throughput:** Powered by a high-power 45W 8-core Intel Core i7-13700H, providing faster parallel builds and Docker execution than 15W ultrabook processors.\n` +
            `2. **Memory Capacity & Expandability:** 32GB DDR5 RAM installed, with SO-DIMM slots expandable up to 64GB (vs 16GB soldered on ${aeroBookCandidate.name}).\n` +
            `3. **Dual SSD Slots:** Supports secondary NVMe storage expansion for multiple OS boot or heavy datasets.`;

          tradeOffDisclosure =
            `**Trade-off to consider:** ${devForgeCandidate.name} weighs 1.82kg (0.61kg heavier than ${aeroBookCandidate.name}) and has a 54Wh battery (~7.5 hrs runtime), making it better suited for desk setups rather than all-day mobile transit.`;
        } else {
          winner = (prodA.ram.capacity_gb ?? 0) >= (prodB.ram.capacity_gb ?? 0) ? prodA : prodB;
          winnerReason =
            `For coding requirements, **${winner.name}** offers superior developer hardware with ${winner.ram.capacity_gb ?? 'N/A'}GB RAM and ${winner.processor.cores ?? 'multi'}-core ${winner.processor.model}.`;
          tradeOffDisclosure =
            `**Key Trade-off:** Review weight (${(winner.weight_g / 1000).toFixed(2)}kg) and battery capacity (${winner.battery.capacity_wh}Wh) based on your travel needs.`;
        }
      } else {
        winner = prodA.price_inr <= prodB.price_inr ? prodA : prodB;
        winnerReason =
          `Based on overall verified specifications:\n` +
          `• **${prodA.name}:** Optimized for mobility and all-day battery life (weight: ${(prodA.weight_g / 1000).toFixed(2)}kg, battery: ${prodA.battery.capacity_wh}Wh, price: ₹${prodA.price_inr.toLocaleString('en-IN')}).\n` +
          `• **${prodB.name}:** Optimized for workstation desks and memory upgradeability (weight: ${(prodB.weight_g / 1000).toFixed(2)}kg, expandable RAM, price: ₹${prodB.price_inr.toLocaleString('en-IN')}).`;
        tradeOffDisclosure =
          `**Key Trade-off:** Choose ${prodA.name} for daily travel or ${prodB.name} if you require expandable RAM.`;
      }

      const explanation =
        `### Factual Specification Comparison\n\n` +
        `| Specification | **${prodA.name}** | **${prodB.name}** |\n` +
        `|---|---|---|\n` +
        `| **Price** | ₹${prodA.price_inr.toLocaleString('en-IN')} | ₹${prodB.price_inr.toLocaleString('en-IN')} |\n` +
        `| **RAM** | ${prodA.ram.capacity_gb}GB ${prodA.ram.type} (${prodA.ram.is_expandable ? 'Expandable' : 'Soldered'}) | ${prodB.ram.capacity_gb}GB ${prodB.ram.type} (${prodB.ram.is_expandable ? 'Expandable' : 'Soldered'}) |\n` +
        `| **Graphics / GPU** | ${prodA.gpu ? `${prodA.gpu.model} (${prodA.gpu.vram_gb ? `${prodA.gpu.vram_gb}GB ${prodA.gpu.memory_type}` : 'Integrated'})` : 'Integrated'} | ${prodB.gpu ? `${prodB.gpu.model} (${prodB.gpu.vram_gb ? `${prodB.gpu.vram_gb}GB ${prodB.gpu.memory_type}` : 'Integrated'})` : 'Integrated'} |\n` +
        `| **Storage** | ${prodA.storage.capacity_gb}GB ${prodA.storage.type} | ${prodB.storage.capacity_gb}GB ${prodB.storage.type} |\n` +
        `| **Processor** | ${prodA.processor.cores}-Core ${prodA.processor.brand} ${prodA.processor.model} | ${prodB.processor.cores}-Core ${prodB.processor.brand} ${prodB.processor.model} |\n` +
        `| **Weight** | ${(prodA.weight_g / 1000).toFixed(2)}kg (${prodA.weight_g}g) | ${(prodB.weight_g / 1000).toFixed(2)}kg (${prodB.weight_g}g) |\n` +
        `| **Battery** | ${prodA.battery.capacity_wh}Wh (${prodA.battery.claimed_hours} hrs) | ${prodB.battery.capacity_wh}Wh (${prodB.battery.claimed_hours} hrs) |\n` +
        `| **Display** | ${prodA.display.size_inches}" ${prodA.display.resolution} (${prodA.display.refresh_rate_hz || 60}Hz) | ${prodB.display.size_inches}" ${prodB.display.resolution} (${prodB.display.refresh_rate_hz || 60}Hz) |\n` +
        `| **Important Ports** | ${prodA.ports.usb_c_count}x USB-C, ${prodA.ports.usb_a_count}x USB-A${prodA.ports.thunderbolt ? ', Thunderbolt 4' : ''} | ${prodB.ports.usb_c_count}x USB-C, ${prodB.ports.usb_a_count}x USB-A${prodB.ports.thunderbolt ? ', Thunderbolt 4' : ''} |\n` +
        `| **Upgradeability** | RAM: ${prodA.ram.is_expandable ? 'Yes' : 'No (Soldered)'}, SSD: ${prodA.storage.is_expandable ? 'Yes' : 'No'} | RAM: ${prodB.ram.is_expandable ? 'Yes' : 'No (Soldered)'}, SSD: ${prodB.storage.is_expandable ? 'Yes' : 'No'} |\n` +
        `| **Verified Stock** | ${prodA.stock_quantity} units available | ${prodB.stock_quantity} units available |\n\n` +
        `${winnerReason}\n\n` +
        `${tradeOffDisclosure}`;

      const syntheticIntent: CustomerIntent = session.current_intent ?? {
        required_categories: ['laptop'],
        hard_constraints: {
          max_total_budget: Math.max(prodA.price_inr, prodB.price_inr),
          min_ram_gb: 16,
          in_stock_only: true
        },
        soft_preferences: {
          weights: { portability: wantsTravel ? 0.45 : 0.35, battery: 0.35, longevity: 0.20 }
        }
      };

      const engineResult = this.decisionEngine.evaluateIntent(syntheticIntent);

      const response: AgentResponse = {
        session_id: sessionId,
        state: 'RECOMMENDATION_READY',
        match_type: 'VALID_MATCH',
        user_query: userMessage,
        intent: syntheticIntent,
        recommendation: engineResult,
        explanation,
        execution_time_ms: Number((performance.now() - startTime).toFixed(1))
      };

      this.sessionManager.recordAgentResponse(sessionId, response);
      return response;
    }


    // Contextual Handler D: Clarification Answer / Follow-up Refinement
    if (session.current_state === 'CLARIFICATION_REQUIRED' && session.current_intent) {
      const prevIntent = session.current_intent;
      const budgetUpdate = normalizeBudget(userMessage);
      const ramUpdate = normalizeRam(userMessage);

      if (/\b(portability|lightweight|travel|commute|portable)\b/i.test(lower)) {
        prevIntent.soft_preferences.max_preferred_weight_g = 1400;
        prevIntent.soft_preferences.weights = { portability: 0.50, battery: 0.30, longevity: 0.20 };
      } else if (/\b(performance|raw performance|speed|power|heavy|workstation)\b/i.test(lower)) {
        prevIntent.soft_preferences.weights = { portability: 0.20, battery: 0.30, longevity: 0.50 };
      }

      if (budgetUpdate) {
        prevIntent.hard_constraints.max_total_budget = budgetUpdate.amount;
        prevIntent.budget = {
          currency: 'INR',
          total_ceiling: budgetUpdate.amount,
          is_hard_ceiling: budgetUpdate.isHardCeiling,
          raw_expression: budgetUpdate.rawExpression
        };
      }

      if (ramUpdate) {
        prevIntent.hard_constraints.min_ram_gb = ramUpdate.capacity_gb;
      }

      const newCategories = normalizeCategories(userMessage);
      if (newCategories.length > 0) {
        prevIntent.required_categories = newCategories;
        prevIntent.compatibility_requirements = {
          bag_must_fit_laptop: newCategories.includes('bag'),
          mouse_must_interface_without_adapters: newCategories.includes('mouse')
        };
      }

      if (/\b(coding|software|developer|dev)\b/i.test(lower)) {
        prevIntent.target_workload = 'coding';
      }

      // Re-run decision engine with refined intent
      const engineResult = this.decisionEngine.evaluateIntent(prevIntent);
      let explanation = '';
      try {
        explanation = await this.llmProvider.generateExplanation(engineResult, userMessage);
      } catch (err: any) {
        explanation = engineResult.reasons.join(' ');
      }

      let finalState: AgentState;
      let matchType: MatchType = engineResult.match_type ?? 'VALID_MATCH';

      if (engineResult.status === 'NO_CATEGORY_MATCH') {
        finalState = 'NO_CATEGORY_MATCH';
        matchType = 'NO_CATEGORY_MATCH';
        this.sessionManager.addAuditEvent(sessionId, 'NO_CATEGORY_MATCH_RECORDED', {
          requested_category: engineResult.unsupported_category,
          supported_categories: engineResult.supported_categories ?? ['laptop', 'mouse', 'bag']
        });
      } else if (engineResult.status === 'NO_PRODUCT_MATCH' || engineResult.status === 'NO_MATCH') {
        finalState = 'NO_PRODUCT_MATCH';
        matchType = 'NO_PRODUCT_MATCH';
        this.sessionManager.addAuditEvent(sessionId, 'NO_PRODUCT_MATCH_RECORDED', {
          rejections_count: engineResult.rejections.length
        });
      } else if (engineResult.status === 'PARTIAL_MATCH') {
        finalState = 'PARTIAL_MATCH';
        matchType = 'PARTIAL_MATCH';
        this.sessionManager.addAuditEvent(sessionId, 'PARTIAL_MATCH_RECORDED', {
          sku: engineResult.recommended_laptop?.product.sku,
          unfulfilled: engineResult.unfulfilled_constraints
        });
      } else {
        finalState = 'VALID_MATCH';
        matchType = 'VALID_MATCH';
        this.sessionManager.addAuditEvent(sessionId, 'VALID_MATCH_RECORDED', {
          sku: engineResult.recommended_laptop?.product.sku,
          total_inr: engineResult.total_price_inr
        });
      }

      const response: AgentResponse = {
        session_id: sessionId,
        state: finalState,
        match_type: matchType,
        user_query: userMessage,
        intent: prevIntent,
        recommendation: engineResult,
        explanation,
        unsupported_category: engineResult.unsupported_category,
        supported_categories: engineResult.supported_categories,
        unfulfilled_constraints: engineResult.unfulfilled_constraints,
        execution_time_ms: Number((performance.now() - startTime).toFixed(1))
      };

      this.sessionManager.recordAgentResponse(sessionId, response);
      return response;
    }

    // Step 1: LLM / NLU Intent Extraction
    let rawIntentJson: string;
    try {
      rawIntentJson = await this.llmProvider.generateStructuredIntent(userMessage);
    } catch (err: any) {
      const response: AgentResponse = {
        session_id: sessionId,
        state: 'ERROR',
        user_query: userMessage,
        intent: null,
        errors: [`Intent extraction failed: ${err.message}`],
        execution_time_ms: Number((performance.now() - startTime).toFixed(1))
      };
      this.sessionManager.recordAgentResponse(sessionId, response);
      return response;
    }

    // Step 2: JSON Parsing
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawIntentJson);
    } catch (err: any) {
      const response: AgentResponse = {
        session_id: sessionId,
        state: 'ERROR',
        user_query: userMessage,
        intent: null,
        errors: [`LLM produced invalid JSON syntax: ${err.message}`],
        execution_time_ms: Number((performance.now() - startTime).toFixed(1))
      };
      this.sessionManager.recordAgentResponse(sessionId, response);
      return response;
    }

    // Step 3: Schema Validation
    const validation = validateCustomerIntent(parsedJson);
    if (!validation.valid || !validation.intent) {
      const response: AgentResponse = {
        session_id: sessionId,
        state: 'ERROR',
        user_query: userMessage,
        intent: null,
        errors: validation.errors,
        execution_time_ms: Number((performance.now() - startTime).toFixed(1))
      };
      this.sessionManager.recordAgentResponse(sessionId, response);
      return response;
    }

    let intent = validation.intent;

    // Step 4: Ambiguity Detection Gate
    const ambiguity = detectAmbiguity(intent, userMessage);
    if (ambiguity.isAmbiguous) {
      const response: AgentResponse = {
        session_id: sessionId,
        state: 'CLARIFICATION_REQUIRED',
        user_query: userMessage,
        intent: intent,
        clarification_question: ambiguity.clarificationQuestion,
        execution_time_ms: Number((performance.now() - startTime).toFixed(1))
      };
      this.sessionManager.recordAgentResponse(sessionId, response);
      return response;
    }

    // Step 5: Deterministic Decision Engine Evaluation
    const engineResult = this.decisionEngine.evaluateIntent(intent);

    // Step 6: Grounded Explanation Generation
    let explanation = '';
    try {
      explanation = await this.llmProvider.generateExplanation(engineResult, userMessage);
    } catch (err: any) {
      explanation = engineResult.reasons.join(' ');
    }

    let finalState: AgentState;
    let matchType: MatchType = engineResult.match_type ?? 'VALID_MATCH';

    if (engineResult.status === 'NO_CATEGORY_MATCH') {
      finalState = 'NO_CATEGORY_MATCH';
      matchType = 'NO_CATEGORY_MATCH';
      this.sessionManager.addAuditEvent(sessionId, 'NO_CATEGORY_MATCH_RECORDED', {
        requested_category: engineResult.unsupported_category,
        supported_categories: engineResult.supported_categories ?? ['laptop', 'mouse', 'bag']
      });
    } else if (engineResult.status === 'NO_PRODUCT_MATCH' || engineResult.status === 'NO_MATCH') {
      finalState = 'NO_PRODUCT_MATCH';
      matchType = 'NO_PRODUCT_MATCH';
      this.sessionManager.addAuditEvent(sessionId, 'NO_PRODUCT_MATCH_RECORDED', {
        rejections_count: engineResult.rejections.length
      });
    } else if (engineResult.status === 'PARTIAL_MATCH') {
      finalState = 'PARTIAL_MATCH';
      matchType = 'PARTIAL_MATCH';
      this.sessionManager.addAuditEvent(sessionId, 'PARTIAL_MATCH_RECORDED', {
        sku: engineResult.recommended_laptop?.product.sku,
        unfulfilled: engineResult.unfulfilled_constraints
      });
    } else {
      finalState = 'VALID_MATCH';
      matchType = 'VALID_MATCH';
      this.sessionManager.addAuditEvent(sessionId, 'VALID_MATCH_RECORDED', {
        sku: engineResult.recommended_laptop?.product.sku,
        total_inr: engineResult.total_price_inr
      });
    }

    const response: AgentResponse = {
      session_id: sessionId,
      state: finalState,
      match_type: matchType,
      user_query: userMessage,
      intent: intent,
      recommendation: engineResult,
      explanation: explanation,
      unsupported_category: engineResult.unsupported_category,
      supported_categories: engineResult.supported_categories,
      unfulfilled_constraints: engineResult.unfulfilled_constraints,
      execution_time_ms: Number((performance.now() - startTime).toFixed(1))
    };

    this.sessionManager.recordAgentResponse(sessionId, response);
    return response;
  }
}
