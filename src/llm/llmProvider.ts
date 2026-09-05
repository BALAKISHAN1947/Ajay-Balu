import type { RecommendationResult } from '../types/recommendation.ts';
import type { ConversationContext } from '../types/session.ts';
import { normalizeBudget, normalizeRam, normalizeStorage, normalizeCategories, extractCategories, normalizeGpu } from '../nlu/normalization.ts';
import { Groq } from 'groq-sdk';

export interface ILLMProvider {
  name: string;
  generateStructuredIntent(rawQuery: string, context?: ConversationContext): Promise<string>;
  generateExplanation(engineResult: RecommendationResult, userQuery: string): Promise<string>;
}

/**
 * Deterministic NLU Provider:
 * Parses natural language using precise linguistic and numerical extraction rules.
 * Enables zero-dependency, reproducible, deterministic testing and offline demo execution.
 */
export class DeterministicNLUProvider implements ILLMProvider {
  public name = 'deterministic-nlu';

  async generateStructuredIntent(rawQuery: string, context?: ConversationContext): Promise<string> {
    const lower = rawQuery.toLowerCase().trim();

    // Check if query is an anaphoric / conversational follow-up reference
    const isFollowUpRef =
      /\b(that|this|it|first|second|1st|2nd|cheaper|cheapest|former|latter|mentioned)\b/i.test(lower) ||
      /\b(?:give me|take|pick|choose|want|get)\s+(?:the\s+)?(?:apple|lenovo|dell|hp|asus|acer|samsung|nexora)\b/i.test(lower) ||
      /\bthe\s+(?:apple|lenovo|dell|hp|asus|acer|samsung|nexora)\s+(?:one|laptop)\b/i.test(lower);

    const hasNewBudgetOrSpec =
      /\b(under\s*\d+|below\s*\d+|budget|max\s*\d+|\d+k\b|ram|ssd|gb|rtx|intel|amd|ryzen|core\s*i\d)\b/i.test(lower) ||
      /\b(search\s+for|find\s+me|looking\s+for|show\s+me|need\s+a\s+new)\b/i.test(lower);

    // If query specifies a new search or budget/spec, it is a new search and NOT a follow-up reference (Bug 7)
    const isFollowUp = isFollowUpRef && !hasNewBudgetOrSpec;

    if (isFollowUp && context?.last_assistant_result) {
      const res = context.last_assistant_result;
      let targetSku: string | undefined;
      let refTarget: 'previous_recommendation' | 'first_option' | 'second_option' | 'cheaper_option' | 'selected_product' | 'none' = 'previous_recommendation';
      let targetIndex: number | undefined;

      // 1. Ordinal reference: "first one", "first option"
      if (/\b(first|1st)\b/i.test(lower)) {
        refTarget = 'first_option';
        targetIndex = 1;
        if (res.comparison_options && res.comparison_options.length > 0) {
          targetSku = res.comparison_options[0].sku;
        } else if (res.closest_options && res.closest_options.length > 0) {
          targetSku = res.closest_options[0].sku;
        } else if (res.recommended_product) {
          targetSku = res.recommended_product.sku;
        }
      }
      // 2. Ordinal reference: "second one", "second option"
      else if (/\b(second|2nd)\b/i.test(lower)) {
        refTarget = 'second_option';
        targetIndex = 2;
        if (res.comparison_options && res.comparison_options.length > 1) {
          targetSku = res.comparison_options[1].sku;
        } else if (res.closest_options && res.closest_options.length > 1) {
          targetSku = res.closest_options[1].sku;
        }
      }
      // 3. Cheaper option: "take the cheaper one", "cheapest one"
      else if (/\b(cheaper|cheapest|less expensive)\b/i.test(lower)) {
        refTarget = 'cheaper_option';
        const candidateList = [
          ...(res.comparison_options || []),
          ...(res.closest_options || []),
          ...(res.recommended_product ? [res.recommended_product] : [])
        ];
        if (candidateList.length > 0) {
          candidateList.sort((a, b) => a.price_inr - b.price_inr);
          targetSku = candidateList[0].sku;
        }
      }
      // 4. Brand reference: "the lenovo one", "the apple one"
      else if (/\b(apple|lenovo|dell|hp|asus|nexora)\b/i.test(lower)) {
        const brandMatch = lower.match(/\b(apple|lenovo|dell|hp|asus|nexora)\b/i);
        const brand = brandMatch ? brandMatch[1].toLowerCase() : '';
        const candidateList = [
          ...(res.comparison_options || []),
          ...(res.closest_options || []),
          ...(res.recommended_product ? [res.recommended_product] : [])
        ];
        const found = candidateList.find(c => (c.brand?.toLowerCase() === brand) || c.name.toLowerCase().includes(brand));
        if (found) {
          targetSku = found.sku;
        }
      }
      // 5. Default "that", "this", "it", "give me that"
      else {
        if (res.recommended_product) {
          targetSku = res.recommended_product.sku;
          refTarget = 'previous_recommendation';
        } else if (res.closest_options && res.closest_options.length > 0) {
          targetSku = res.closest_options[0].sku;
          refTarget = 'previous_recommendation';
        } else if (res.comparison_options && res.comparison_options.length > 0) {
          targetSku = res.comparison_options[0].sku;
          refTarget = 'first_option';
        }
      }

      if (targetSku) {
        return JSON.stringify({
          raw_query: rawQuery,
          follow_up_action: 'SELECT_PRODUCT',
          reference_target: refTarget,
          target_sku: targetSku,
          target_option_index: targetIndex,
          required_categories: ['laptop'],
          hard_constraints: {
            in_stock_only: true
          },
          soft_preferences: {
            weights: { portability: 0.40, battery: 0.35, longevity: 0.25 }
          }
        }, null, 2);
      }
    }

    const budget = normalizeBudget(rawQuery);
    const ram = normalizeRam(rawQuery);
    const storage = normalizeStorage(rawQuery);
    const gpu = normalizeGpu(rawQuery);
    const catResult = extractCategories(rawQuery);
    const categories = catResult.supported;

    const isLightweight = /\b(light|lightweight|portable|travel|commute|carry|halka)\b/i.test(lower);
    const isBatteryPreferred = /\b(battery|battery life|long battery|all day)\b/i.test(lower);
    const prefersBluetooth = /\b(bluetooth|bt|wireless mouse)\b/i.test(lower);
    const prefersBackpack = /\b(backpack|commuter bag)\b/i.test(lower);

    const hardWeightMatch = lower.match(/(?:under|max|less than)\s*(\d+(?:\.\d+)?)\s*(?:kg|kilos|kilo)/i);
    let hardWeightG: number | undefined = undefined;
    if (hardWeightMatch && /\b(must|strictly|max|limit)\b/i.test(lower)) {
      hardWeightG = Math.round(parseFloat(hardWeightMatch[1]) * 1000);
    }

    let targetWorkload: string | undefined = undefined;
    if (/\b(coding|software|developer|development|programming|dev|docker|code|python)\b/i.test(lower)) {
      targetWorkload = 'coding';
    } else if (/\b(gaming|game|games)\b/i.test(lower)) {
      targetWorkload = 'gaming';
    } else if (/\b(office|work|documents)\b/i.test(lower)) {
      targetWorkload = 'work';
    }

    const isCheap = /\b(cheap|cheapest|budget|affordable|college|student)\b/i.test(lower);

    // Coding workload requires at least 16GB RAM for modern IDEs / Docker
    let effectiveMinRam = ram?.capacity_gb;
    if (!effectiveMinRam && targetWorkload === 'coding' && /\b(good for coding|cheapest good|cheap but good)\b/i.test(lower)) {
      effectiveMinRam = 16;
    }

    const effectiveBudgetCeiling = budget
      ? budget.amount
      : (isCheap ? (targetWorkload === 'coding' ? 60000 : 50000) : undefined);

    let requestedBrand: string | undefined;
    const brandMatch = rawQuery.match(/\b(apple|lenovo|dell|hp|asus|acer|samsung|nexora)\b/i);
    if (brandMatch) {
      requestedBrand = brandMatch[1].charAt(0).toUpperCase() + brandMatch[1].slice(1).toLowerCase();
    } else if (/\b(macbook)\b/i.test(rawQuery)) {
      requestedBrand = 'Apple';
    }

    let requestedModel: string | undefined;
    const modelMatch = rawQuery.match(/\b(pro\s*max|macbook\s*pro|macbook\s*air|macbook|thinkpad|xps|zenbook|aerobook|devforge)\b/i);
    if (modelMatch) {
      requestedModel = modelMatch[0].trim();
    }

    const intentPayload = {
      raw_query: rawQuery,
      target_workload: targetWorkload,
      requested_brand: requestedBrand,
      requested_model: requestedModel,
      required_categories: categories,
      requested_category_raw: catResult.rawRequestedCategory,
      unsupported_categories: catResult.unsupported,
      is_category_supported: catResult.isCategorySupported,
      budget: budget ? {
        currency: 'INR',
        total_ceiling: budget.amount,
        is_hard_ceiling: budget.isHardCeiling,
        raw_expression: budget.rawExpression
      } : (isCheap ? {
        currency: 'INR',
        total_ceiling: targetWorkload === 'coding' ? 60000 : 50000,
        is_hard_ceiling: false,
        raw_expression: 'cheap'
      } : undefined),
      hard_constraints: {
        max_total_budget: effectiveBudgetCeiling,
        min_ram_gb: effectiveMinRam,
        min_storage_gb: storage?.capacity_gb,
        in_stock_only: true,
        max_weight_g: hardWeightG,
        gpu_model: gpu?.model,
        min_vram_gb: gpu?.min_vram_gb,
        requires_dedicated_gpu: gpu?.requiresDedicated
      },
      soft_preferences: {
        max_preferred_weight_g: isLightweight ? 1400 : undefined,
        min_preferred_battery_wh: isBatteryPreferred ? 55 : undefined,
        prefer_bluetooth_mouse: prefersBluetooth || undefined,
        preferred_bag_type: prefersBackpack ? 'backpack' : undefined,
        weights: {
          portability: isLightweight ? 0.40 : 0.35,
          battery: isBatteryPreferred ? 0.35 : (isLightweight ? 0.35 : 0.40),
          longevity: 0.25
        }
      },
      compatibility_requirements: {
        bag_must_fit_laptop: categories.includes('bag'),
        mouse_must_interface_without_adapters: categories.includes('mouse')
      }
    };

    return JSON.stringify(intentPayload, null, 2);
  }

  async generateExplanation(engineResult: RecommendationResult, userQuery: string): Promise<string> {
    if (engineResult.status === 'NO_CATEGORY_MATCH') {
      const unsupported = engineResult.unsupported_category || 'that category';
      return `Our verified catalog specializes exclusively in high-performance laptops, ergonomic mice, and protective workspace bags. Our catalog does not currently sell ${unsupported}.\n\nAvailable Categories:\n• Laptops: Developer ultrabooks & performance workstations\n• Mice: Bluetooth & low-latency wireless mice\n• Laptop Bags: Protective sleeves & transit backpacks`;
    }

    if (engineResult.status === 'NO_PRODUCT_MATCH' || engineResult.status === 'NO_MATCH' || !engineResult.recommended_laptop) {
      const analysis = engineResult.constraint_analysis;
      if (analysis) {
        let text = `We could not find a product satisfying all hard constraints in our catalog.\n\n### NO EXACT MATCH\n\n`;
        text += `**Your requirements:**\n`;
        if (analysis.requested.budget_ceiling_inr) {
          text += `• Budget <= ₹${analysis.requested.budget_ceiling_inr.toLocaleString('en-IN')}\n`;
        }
        if (analysis.requested.min_ram_gb) {
          text += `• RAM >= ${analysis.requested.min_ram_gb}GB\n`;
        }
        if (analysis.requested.min_storage_gb) {
          text += `• Storage >= ${analysis.requested.min_storage_gb}GB\n`;
        }
        if (analysis.requested.max_weight_g) {
          text += `• Weight <= ${analysis.requested.max_weight_g}g\n`;
        }
        if (engineResult.locked_variant === null && engineResult.unfulfilled_constraints?.some(u => u.includes('GPU') || u.includes('RTX'))) {
          text += `• GPU = ${engineResult.unfulfilled_constraints.find(u => u.includes('RTX')) || 'Dedicated GPU'}\n`;
        }

        text += `\n**Why no exact match:**\n`;
        for (const pt of analysis.failure_summary_points) {
          text += `• ${pt}\n`;
        }

        if (analysis.closest_options.length > 0) {
          text += `\n**Closest options:**\n`;
          for (const opt of analysis.closest_options) {
            text += `• **${opt.label}:**\n`;
            text += `  - Price: ₹${opt.price_inr.toLocaleString('en-IN')}${opt.budget_delta_inr > 0 ? ` (exceeds budget by ₹${opt.budget_delta_inr.toLocaleString('en-IN')})` : ''}\n`;
            text += `  - RAM: ${opt.ram_gb !== null ? `${opt.ram_gb}GB` : 'Not verified'}\n`;
            text += `  - Trade-off: ${opt.trade_off}\n`;
          }
        }

        if (analysis.trade_off_options.length > 0) {
          text += `\n**Trade-off options:**\n`;
          for (const to of analysis.trade_off_options) {
            text += `• ${to}\n`;
          }
        }

        return text.trim();
      }

      const topRejections = engineResult.rejections.slice(0, 3).map((r) => `• ${r.name ?? r.sku}: ${r.reason}`).join('\n');
      return `We could not find a product satisfying all hard constraints in our catalog.\n\nKey rejection factors:\n${topRejections}\n\nConsider adjusting your budget ceiling or minimum specifications.`;
    }

    const laptop = engineResult.recommended_laptop.product;
    const locked = engineResult.locked_variant!;
    const accessories = engineResult.accessories;

    if (engineResult.status === 'PARTIAL_MATCH') {
      const delta = Math.abs(engineResult.budget_margin_inr);
      let text = `### Closest Match Found (Partial Match)\n\n`;
      text += `Closest match found, but it exceeds your ₹${engineResult.budget_ceiling_inr.toLocaleString('en-IN')} budget by ₹${delta.toLocaleString('en-IN')}.\n\n`;
      text += `• **Model:** **${laptop.name}** (${laptop.sku}, variant: ${locked.variant_id})\n`;
      text += `• **Verified Price:** ₹${laptop.price_inr.toLocaleString('en-IN')}\n`;
      text += `• **Hardware Specifications:** ${locked.ram_summary}, ${locked.storage_summary}, ${laptop.processor.model}\n`;
      text += `• **Unmet Requirement:** Exceeds budget ceiling by ₹${delta.toLocaleString('en-IN')}\n\n`;
      text += `**Trade-offs to consider:**\n`;
      for (const to of engineResult.trade_offs) {
        text += `• ${to}\n`;
      }
      return text.trim();
    }

    const accessoryLines = accessories.length > 0
      ? accessories.map((a) => `• ${a.name} (₹${a.price_inr.toLocaleString('en-IN')}) — ${a.compatibility_evidence ?? 'Compatible'}`).join('\n')
      : 'No accessories requested.';

    const tradeOffLines = engineResult.trade_offs.length > 0
      ? engineResult.trade_offs.map((t) => `• ${t}`).join('\n')
      : 'None identified.';

    const marginText = engineResult.budget_margin_inr >= 0
      ? `Under your budget limit of ₹${engineResult.budget_ceiling_inr.toLocaleString('en-IN')} by ₹${engineResult.budget_margin_inr.toLocaleString('en-IN')}`
      : `Exceeds your budget limit of ₹${engineResult.budget_ceiling_inr.toLocaleString('en-IN')} by ₹${Math.abs(engineResult.budget_margin_inr).toLocaleString('en-IN')}`;

    let requestedNotice = '';
    const nonExistentMatch = userQuery.match(/\b(apple\s+pro\s*max|pro\s*max|macbook\s*pro|macbook\s*air|thinkpad|xps)\b/i);
    if (nonExistentMatch) {
      const term = nonExistentMatch[0];
      requestedNotice = `I couldn't find a laptop named '${term}' in the verified catalog. I found these verified options that match your preferences:\n\n`;
    }

    return `${requestedNotice}Based on your request, the best verified match is the **${laptop.name}** (SKU: ${laptop.sku}, Variant: ${locked.variant_id}).

**Factual Specification Highlights:**
• Memory: ${locked.ram_summary}
• Storage: ${locked.storage_summary}
• Weight: ${(laptop.weight_g / 1000).toFixed(2)} kg
• Battery: ${laptop.battery.capacity_wh}Wh (approx. ${laptop.battery.claimed_hours} hours claimed runtime)
• Base Price: ₹${laptop.price_inr.toLocaleString('en-IN')}

**Verified Compatible Accessories:**
${accessoryLines}

**Disclosed Hardware Trade-offs:**
${tradeOffLines}

**Total Calculated Basket:** ₹${engineResult.total_price_inr.toLocaleString('en-IN')} (${marginText}).`;
  }
}

/**
 * HTTP REST LLM Provider (Gemini / OpenAI compatible):
 * Calls external API using native fetch if configured via environment variables.
 */
export class HttpLLMProvider implements ILLMProvider {
  public name: string;
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(provider = 'gemini', apiKey?: string, model?: string) {
    this.name = provider;
    this.apiKey = apiKey || process.env.LLM_API_KEY || '';
    this.model = model || process.env.LLM_MODEL || (provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini');
    this.baseUrl = provider === 'gemini'
      ? 'https://generativelanguage.googleapis.com/v1beta/models'
      : 'https://api.openai.com/v1/chat/completions';

    if (!this.apiKey) {
      throw new Error(
        `LLM_API_KEY environment variable is missing for provider '${provider}'. Set LLM_API_KEY or configure LLM_PROVIDER=deterministic for offline mode.`
      );
    }
  }

  async generateStructuredIntent(rawQuery: string, _context?: ConversationContext): Promise<string> {
    const prompt = `You are a strict commerce NLU parser for electronics. Output ONLY valid JSON matching this schema:
{
  "raw_query": string,
  "target_workload": "coding" | "gaming" | "work" | undefined,
  "requested_brand": string | undefined,
  "requested_model": string | undefined,
  "required_categories": ("laptop" | "mouse" | "bag")[],
  "budget": { "currency": "INR", "total_ceiling": number, "is_hard_ceiling": boolean, "raw_expression": string } | undefined,
  "hard_constraints": { "max_total_budget"?: number, "min_ram_gb"?: number, "min_storage_gb"?: number, "in_stock_only": true, "max_weight_g"?: number },
  "soft_preferences": { "max_preferred_weight_g"?: number, "min_preferred_battery_wh"?: number, "prefer_bluetooth_mouse"?: boolean, "preferred_bag_type"?: string, "weights": { "portability": number, "battery": number, "longevity": number } },
  "compatibility_requirements": { "bag_must_fit_laptop": boolean, "mouse_must_interface_without_adapters": boolean }
}
Customer query: "${rawQuery}"`;

    if (this.name === 'gemini') {
      const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });
      if (!res.ok) {
        throw new Error(`Gemini API error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json() as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }

    // OpenAI fallback
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content || '{}';
  }

  async generateExplanation(engineResult: RecommendationResult, userQuery: string): Promise<string> {
    const prompt = `You are a factual shopping assistant. Explain the following verified recommendation to the user.
STRICT RULE: ONLY cite factual specifications, prices, and trade-offs provided in the engine result. Do NOT invent prices or attributes.
User Query: "${userQuery}"
Engine Result: ${JSON.stringify(engineResult, null, 2)}`;

    if (this.name === 'gemini') {
      const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      if (!res.ok) {
        throw new Error(`Gemini API error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json() as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }
}

/**
 * Groq LLM Provider:
 * Uses official groq-sdk with openai/gpt-oss-120b model, streaming delta collection,
 * and medium reasoning effort.
 */
export class GroqLLMProvider implements ILLMProvider {
  public name = 'groq';
  private groq: Groq;
  private model: string;
  private fallback: DeterministicNLUProvider;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey || process.env.GROQ_API_KEY || '';
    this.groq = new Groq({ apiKey: key });
    this.model = model || process.env.GROQ_MODEL || process.env.LLM_MODEL || 'openai/gpt-oss-120b';
    this.fallback = new DeterministicNLUProvider();
  }

  async generateStructuredIntent(rawQuery: string, context?: ConversationContext): Promise<string> {
    const contextSection = context
      ? `\nRECENT CONVERSATION CONTEXT (from verified prior turns):\n${JSON.stringify(context, null, 2)}\n`
      : '';

    const prompt = `You are an expert commerce NLU parser for an electronics store catalog.
Extract the customer's shopping intent from their query (which may be in casual English, Hinglish, conversational phrasing, comparative language, or incomplete sentences).
Output ONLY valid JSON matching this schema:
{
  "raw_query": string,
  "follow_up_action": "SELECT_PRODUCT" | "SELECT_PREVIOUS_RECOMMENDATION" | "SELECT_PREVIOUS_OPTION" | "REFINE_PREVIOUS_REQUEST" | "NONE",
  "reference_target": "previous_recommendation" | "first_option" | "second_option" | "cheaper_option" | "selected_product" | "none",
  "target_sku": string | null,
  "target_option_index": number | null,
  "target_workload": "coding" | "gaming" | "work" | null,
  "requested_brand": string | null,
  "requested_model": string | null,
  "required_categories": ("laptop" | "mouse" | "bag")[],
  "budget": { "currency": "INR", "total_ceiling": number, "is_hard_ceiling": boolean, "raw_expression": string } | null,
  "hard_constraints": { "max_total_budget"?: number, "min_ram_gb"?: number, "min_storage_gb"?: number, "in_stock_only": true, "max_weight_g"?: number },
  "soft_preferences": { "max_preferred_weight_g"?: number, "min_preferred_battery_wh"?: number, "prefer_bluetooth_mouse"?: boolean, "preferred_bag_type"?: string, "weights": { "portability": number, "battery": number, "longevity": number } },
  "compatibility_requirements": { "bag_must_fit_laptop": boolean, "mouse_must_interface_without_adapters": boolean }
}
${contextSection}
GUIDELINES FOR CONVERSATIONAL REFERENCES & ANAPHORA RESOLUTION:
When the user uses words such as:
- "that", "this", "it", "that one", "this one", "this laptop", "give me that", "I'll take it", "I'll take that", "yes, give me that", "okay get that", "okay take that", "that one please"
- "the first one", "first option", "I want the first one"
- "the second one", "second option", "take the second one"
- "take the cheaper one", "the cheaper one", "the one you mentioned"
- or comparison follow-ups like "I'll take the Lenovo one", "give me the Apple one"
CRITICAL RULES:
1. Resolve the reference using the most recent relevant verified product/result in RECENT CONVERSATION CONTEXT.
2. If previous state was NO_PRODUCT_MATCH but contained closest_options (e.g. Nexora Campus 14), "that" / "give me that" / "I'll take it" resolves directly to closest_options[0].sku!
3. If previous state compared options (e.g. Option 1: Apple, Option 2: Lenovo), "the first one" resolves to Option 1, "the second one" resolves to Option 2, "the Lenovo one" resolves to the Lenovo option.
4. Set:
   - "follow_up_action": "SELECT_PRODUCT"
   - "reference_target": "previous_recommendation" | "first_option" | "second_option" | "cheaper_option"
   - "target_sku": the exact verified SKU from the conversation context
   - "target_option_index": 1 or 2 (if ordinal specified)
   - "required_categories": ["laptop"]
   - "hard_constraints": { "in_stock_only": true }
5. Do NOT ask for clarification when the reference can be resolved unambiguously from context.
6. Do NOT invent a product or SKU that was not present in the verified context.
7. Do NOT create a fake budget when resolving a reference.
8. If the user query is clearly a NEW SEARCH (e.g. "I want an Apple laptop for coding under 90000", "I want a Lenovo laptop", "show me a Dell laptop", "find me a gaming laptop under 80000", "show me laptops under 60k"), do NOT resolve to previous products. Set follow_up_action: "NONE", reference_target: "none", target_sku: null, and extract requested_brand, budget, and constraints directly from the new query.

GUIDELINES FOR NATURAL LANGUAGE UNDERSTANDING:
- Support arbitrary user language, casual phrasing, and Hinglish (e.g. "bhai 60k ke andar coding laptop chahiye, 16GB RAM", "bhai coding ke liye halka laptop batao 60k ke andar", "something like a macbook but cheaper", "cheap but should not be too slow").
- "halka" means lightweight -> set soft_preferences.max_preferred_weight_g: 1400.
- Extract any requested brand in "requested_brand" (e.g. "Apple", "Lenovo", "Dell", "HP", "Asus", "Acer", "Samsung", "Nexora").
- Extract any requested model or tier in "requested_model" (e.g. "Pro Max", "MacBook", "ThinkPad", "XPS", "AeroBook").
- If user requests a brand or model not in our catalog (like "Apple Pro Max"), faithfully capture requested_brand: "Apple", requested_model: "Pro Max", target_workload: "work" or "coding".
- If no brand is specified, requested_brand MUST be null.
- If no budget is specified, budget must be null. Never invent arbitrary budgets.
- "required_categories": MUST only contain "laptop" unless the customer explicitly mentions or asks for a mouse or a bag. Never add "mouse" or "bag" by default or assume they are needed.
- Always set in_stock_only: true.

Customer query: "${rawQuery}"`;

    try {
      const chatCompletion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.model,
        temperature: 0.1,
        max_completion_tokens: 512,
        top_p: 1,
        stream: true,
        reasoning_effort: 'low',
        stop: null
      });

      let fullContent = '';
      for await (const chunk of chatCompletion) {
        fullContent += chunk.choices[0]?.delta?.content || '';
      }

      const trimmed = fullContent.trim();
      let extracted = trimmed;
      const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch) {
        extracted = codeBlockMatch[1].trim();
      } else {
        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          extracted = trimmed.slice(firstBrace, lastBrace + 1).trim();
        }
      }
      return extracted.replace(/:\s*undefined\b/g, ': null');
    } catch (err: any) {
      console.warn(`[GroqLLMProvider] Groq intent extraction failed (${err.message}). Falling back to deterministic NLU.`);
      return this.fallback.generateStructuredIntent(rawQuery, context);
    }
  }

  async generateExplanation(engineResult: RecommendationResult, userQuery: string): Promise<string> {
    // Construct concise, highly focused factual summary to avoid sending 10KB recursive JSON payload
    const summaryData: Record<string, any> = {
      status: engineResult.status,
      match_type: engineResult.match_type,
      reasons: engineResult.reasons
    };

    if (engineResult.recommended_laptop) {
      const p = engineResult.recommended_laptop.product;
      const v = engineResult.locked_variant;
      summaryData.recommended_laptop = {
        name: p.name,
        sku: p.sku,
        brand: p.brand,
        price_inr: p.price_inr,
        variant_id: v?.variant_id,
        ram_summary: v?.ram_summary || `${p.ram.capacity_gb}GB ${p.ram.type}`,
        storage_summary: v?.storage_summary || `${p.storage.capacity_gb}GB ${p.storage.type}`,
        weight_kg: Number((p.weight_g / 1000).toFixed(2)),
        battery: `${p.battery.capacity_wh}Wh (approx. ${p.battery.claimed_hours}h claimed runtime)`
      };
    }

    if (engineResult.accessories && engineResult.accessories.length > 0) {
      summaryData.accessories = engineResult.accessories.map((a) => ({
        name: a.name,
        sku: a.sku,
        price_inr: a.price_inr,
        compatibility_evidence: a.compatibility_evidence
      }));
    }

    summaryData.total_price_inr = engineResult.total_price_inr;
    summaryData.budget_ceiling_inr = engineResult.budget_ceiling_inr;
    summaryData.budget_margin_inr = engineResult.budget_margin_inr;

    if (engineResult.trade_offs && engineResult.trade_offs.length > 0) {
      summaryData.trade_offs = engineResult.trade_offs;
    }

    if (engineResult.rejections && engineResult.rejections.length > 0) {
      summaryData.top_rejections = engineResult.rejections.slice(0, 2).map((r) => ({
        sku: r.sku,
        name: r.name,
        reason: r.reason
      }));
    }

    const prompt = `You are a factual, helpful AI shopping assistant for a verified electronics marketplace. Explain the verified recommendation to the customer based strictly on the deterministic engine result.

CRITICAL RULES:
1. Anti-Hallucination & Factual Grounding:
   - ONLY recommend and describe products that exist in the deterministic engine result below.
   - NEVER invent or hallucinate products, specifications, brands, or prices.
2. Multi-Brand & Non-Existent Model Handling:
   - If the customer requested a specific brand or model (such as Apple, Lenovo, Dell, "Pro Max", "MacBook", etc.) that was not found in the verified catalog, explicitly inform them:
     "I couldn't find an [Brand] laptop named '[Model]' in the verified catalog. I found these verified options that match your preferences..."
   - Explain why the recommended verified catalog product matches their workload, performance, or budget criteria.
3. No Pressure / Helping Customer Stay Within Budget:
   - The customer's budget is a hard constraint. NEVER encourage them to increase their budget.
   - If optional accessories are shown, explicitly mention they are verified compatible and optional.
4. Professional, Natural Tone:
   - Do NOT expose raw JSON. Speak conversationally (e.g., "I found a laptop matching your request...") followed by factual specifications, trade-offs, price, and verified compatibility.

Customer Query: "${userQuery}"
Deterministic Engine Summary: ${JSON.stringify(summaryData, null, 2)}`;

    try {
      const chatCompletion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.model,
        temperature: 0.3,
        max_completion_tokens: 600,
        top_p: 1,
        stream: true,
        reasoning_effort: 'low',
        stop: null
      });

      let fullContent = '';
      for await (const chunk of chatCompletion) {
        fullContent += chunk.choices[0]?.delta?.content || '';
      }

      return fullContent.trim();
    } catch (err: any) {
      console.warn(`[GroqLLMProvider] Groq explanation failed (${err.message}). Falling back to deterministic explanation.`);
      return this.fallback.generateExplanation(engineResult, userQuery);
    }
  }
}

/**
 * Returns the configured LLM provider instance based on environment variables.
 */
export function getLLMProvider(overrideProvider?: string): ILLMProvider {
  if (overrideProvider) {
    if (overrideProvider === 'groq') return new GroqLLMProvider();
    if (overrideProvider === 'gemini' || overrideProvider === 'openai') return new HttpLLMProvider(overrideProvider);
    return new DeterministicNLUProvider();
  }

  // Under automated test runner, use deterministic provider to avoid external rate limits
  const isTestRunner = Boolean(
    process.env.NODE_TEST_CONTEXT ||
    process.execArgv.some((a) => a.includes('test')) ||
    process.argv.some((a) => a.includes('.test.') || a.includes('tests\\') || a.includes('tests/'))
  );

  if (isTestRunner) {
    return new DeterministicNLUProvider();
  }

  const provider = process.env.LLM_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'deterministic');

  if (provider === 'groq') {
    return new GroqLLMProvider();
  }

  if (provider === 'gemini' || provider === 'openai') {
    return new HttpLLMProvider(provider);
  }

  return new DeterministicNLUProvider();
}

