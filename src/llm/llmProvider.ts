import type { RecommendationResult } from '../types/recommendation.ts';
import { normalizeBudget, normalizeRam, normalizeStorage, normalizeCategories, extractCategories, normalizeGpu } from '../nlu/normalization.ts';
import { Groq } from 'groq-sdk';

export interface ILLMProvider {
  name: string;
  generateStructuredIntent(rawQuery: string): Promise<string>;
  generateExplanation(engineResult: RecommendationResult, userQuery: string): Promise<string>;
}

/**
 * Deterministic NLU Provider:
 * Parses natural language using precise linguistic and numerical extraction rules.
 * Enables zero-dependency, reproducible, deterministic testing and offline demo execution.
 */
export class DeterministicNLUProvider implements ILLMProvider {
  public name = 'deterministic-nlu';

  async generateStructuredIntent(rawQuery: string): Promise<string> {
    const budget = normalizeBudget(rawQuery);
    const ram = normalizeRam(rawQuery);
    const storage = normalizeStorage(rawQuery);
    const gpu = normalizeGpu(rawQuery);
    const catResult = extractCategories(rawQuery);
    const categories = catResult.supported;

    const lower = rawQuery.toLowerCase();
    const isLightweight = /\b(light|lightweight|portable|travel|commute|carry)\b/i.test(lower);
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

    const intentPayload = {
      raw_query: rawQuery,
      target_workload: targetWorkload,
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
      return `Nexora Technologies does not currently sell ${unsupported}. Our catalog specializes exclusively in high-performance laptops, ergonomic mice, and protective workspace bags.\n\nAvailable Categories:\n• Laptops: Developer ultrabooks & performance workstations\n• Mice: Bluetooth & low-latency wireless mice\n• Laptop Bags: Protective sleeves & transit backpacks`;
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

    return `Based on your request, the best verified match is the **${laptop.name}** (SKU: ${laptop.sku}, Variant: ${locked.variant_id}).

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

  async generateStructuredIntent(rawQuery: string): Promise<string> {
    const prompt = `You are a strict commerce NLU parser for electronics. Output ONLY valid JSON matching this schema:
{
  "raw_query": string,
  "target_workload": "coding" | "gaming" | "work" | undefined,
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

  async generateStructuredIntent(rawQuery: string): Promise<string> {
    const prompt = `You are a strict commerce NLU parser for electronics. Output ONLY valid JSON matching this schema:
{
  "raw_query": string,
  "target_workload": "coding" | "gaming" | "work" | undefined,
  "required_categories": ("laptop" | "mouse" | "bag")[],
  "budget": { "currency": "INR", "total_ceiling": number, "is_hard_ceiling": boolean, "raw_expression": string } | undefined,
  "hard_constraints": { "max_total_budget"?: number, "min_ram_gb"?: number, "min_storage_gb"?: number, "in_stock_only": true, "max_weight_g"?: number },
  "soft_preferences": { "max_preferred_weight_g"?: number, "min_preferred_battery_wh"?: number, "prefer_bluetooth_mouse"?: boolean, "preferred_bag_type"?: string, "weights": { "portability": number, "battery": number, "longevity": number } },
  "compatibility_requirements": { "bag_must_fit_laptop": boolean, "mouse_must_interface_without_adapters": boolean }
}
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
        temperature: 1,
        max_completion_tokens: 2048,
        top_p: 1,
        stream: true,
        reasoning_effort: 'medium',
        stop: null
      });

      let fullContent = '';
      for await (const chunk of chatCompletion) {
        fullContent += chunk.choices[0]?.delta?.content || '';
      }

      const trimmed = fullContent.trim();
      const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch) {
        return codeBlockMatch[1].trim();
      }
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1).trim();
      }
      return trimmed;
    } catch (err: any) {
      console.warn(`[GroqLLMProvider] Groq intent extraction failed (${err.message}). Falling back to deterministic NLU.`);
      return this.fallback.generateStructuredIntent(rawQuery);
    }
  }

  async generateExplanation(engineResult: RecommendationResult, userQuery: string): Promise<string> {
    const prompt = `You are a factual shopping assistant for Nexora Technologies. Explain the following verified recommendation to the user.
STRICT RULE: ONLY cite factual specifications, prices, and trade-offs provided in the engine result. Do NOT invent prices or attributes.
User Query: "${userQuery}"
Engine Result: ${JSON.stringify(engineResult, null, 2)}`;

    try {
      const chatCompletion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        model: this.model,
        temperature: 1,
        max_completion_tokens: 2048,
        top_p: 1,
        stream: true,
        reasoning_effort: 'medium',
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

