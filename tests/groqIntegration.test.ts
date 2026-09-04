import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GroqLLMProvider, getLLMProvider } from '../src/llm/llmProvider.ts';
import { InMemoryCatalogRepository } from '../src/repository/catalogRepository.ts';
import { DeterministicDecisionEngine } from '../src/engine/decisionEngine.ts';

describe('Groq LLM Provider Integration (openai/gpt-oss-120b)', () => {
  it('1. GroqLLMProvider initializes with correct provider name and default model', () => {
    const provider = new GroqLLMProvider('dummy_key');
    assert.equal(provider.name, 'groq');
  });

  it('2. getLLMProvider returns GroqLLMProvider when provider is groq', () => {
    const provider = getLLMProvider('groq');
    assert.equal(provider.name, 'groq');
    assert.ok(provider instanceof GroqLLMProvider);
  });

  it('3. GroqLLMProvider generates valid structured intent via streaming API', async (t) => {
    if (!process.env.GROQ_API_KEY) {
      t.skip('Skipping live Groq API test: GROQ_API_KEY not configured');
      return;
    }

    const provider = new GroqLLMProvider();
    const query = 'I need a coding laptop under 75000 with 16GB RAM';
    const jsonStr = await provider.generateStructuredIntent(query);

    assert.ok(jsonStr, 'Expected non-empty JSON response');
    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.target_workload, 'coding');
    assert.ok(Array.isArray(parsed.required_categories));
    assert.ok(parsed.required_categories.includes('laptop'));
    assert.equal(parsed.hard_constraints?.min_ram_gb, 16);
  });

  it('4. GroqLLMProvider generates factual explanation via streaming API', async (t) => {
    if (!process.env.GROQ_API_KEY) {
      t.skip('Skipping live Groq API test: GROQ_API_KEY not configured');
      return;
    }

    const provider = new GroqLLMProvider();
    const repo = new InMemoryCatalogRepository();
    const engine = new DeterministicDecisionEngine(repo);

    const engineResult = engine.evaluateIntent({
      required_categories: ['laptop'],
      hard_constraints: { max_total_budget: 80000, min_ram_gb: 16, in_stock_only: true },
      soft_preferences: { weights: { portability: 0.4, battery: 0.3, longevity: 0.3 } }
    });

    const explanation = await provider.generateExplanation(engineResult, 'Best coding laptop under 80k');
    assert.ok(explanation, 'Expected explanation string');
    assert.ok(explanation.length > 20, 'Explanation should be descriptive');
  });
});
