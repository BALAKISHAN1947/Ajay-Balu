import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomerIntent } from '../src/nlu/intentValidator.ts';
import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';
import { getCatalogRepository } from '../src/repository/catalogRepository.ts';
import { getSessionManager } from '../src/session/sessionManager.ts';

describe('Regression Tests: Null Budget & Canonical Intent Normalization', () => {
  const repo = getCatalogRepository();
  const sessionManager = getSessionManager(repo);

  it('Test 1: "Compare the best two laptops" produces comparison without TypeError or fake budget', async () => {
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);
    const session = sessionManager.getOrCreateSession();

    const response = await orchestrator.processMessage('Compare the best two laptops', session.session_id);

    assert.ok(response, 'Response should exist');
    assert.notEqual(response.state, 'ERROR', 'Should not result in an error state');
    assert.equal(response.state, 'RECOMMENDATION_READY');
    assert.equal(response.match_type, 'VALID_MATCH');
    assert.ok(response.explanation && response.explanation.includes('Factual Specification Comparison'), 'Comparison table produced');
    // Budget remains absent/null in intent
    assert.equal(response.intent?.budget, undefined, 'Budget remains absent/null');
  });

  it('Test 2: "I need a laptop and a bag that fits it" preserves compatibility and creates no fake budget', async () => {
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);
    const session = sessionManager.getOrCreateSession();

    const response = await orchestrator.processMessage('I need a laptop and a bag that fits it', session.session_id);

    assert.notEqual(response.state, 'ERROR');
    assert.ok(response.intent);
    assert.ok(response.intent.required_categories.includes('laptop'));
    assert.ok(response.intent.required_categories.includes('bag'));
    assert.equal(response.intent.budget, undefined, 'No fake budget created');
  });

  it('Test 3: "I need a laptop for work" returns CLARIFICATION_REQUIRED without crashing', async () => {
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);
    const session = sessionManager.getOrCreateSession();

    const response = await orchestrator.processMessage('I need a laptop for work', session.session_id);

    assert.notEqual(response.state, 'ERROR');
    assert.equal(response.state, 'CLARIFICATION_REQUIRED');
    assert.ok(response.clarification_question, 'Should ask a clarification question');
    assert.equal(response.intent?.budget, undefined, 'Budget remains absent');
  });

  it('Test 4: "I need a coding laptop under 60000 with 16GB RAM" yields VALID intent with canonical defaults', async () => {
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);
    const session = sessionManager.getOrCreateSession();

    const response = await orchestrator.processMessage('I need a coding laptop under 60000 with 16GB RAM', session.session_id);

    assert.notEqual(response.state, 'ERROR');
    assert.ok(response.intent);
    assert.equal(response.intent.budget?.total_ceiling, 60000);
    assert.equal(response.intent.hard_constraints.max_total_budget, 60000);
    assert.equal(response.intent.hard_constraints.min_ram_gb, 16);
    assert.equal(response.intent.hard_constraints.in_stock_only, true);
    assert.ok(response.intent.soft_preferences?.weights);
    assert.equal(typeof response.intent.soft_preferences.weights.portability, 'number');
    assert.equal(typeof response.intent.soft_preferences.weights.battery, 'number');
    assert.equal(typeof response.intent.soft_preferences.weights.longevity, 'number');
  });

  it('Test 5: "I need running shoes under 5000" returns NO_CATEGORY_MATCH with no unrelated products', async () => {
    const orchestrator = new AgentOrchestrator(new DeterministicNLUProvider(), repo, sessionManager);
    const session = sessionManager.getOrCreateSession();

    const response = await orchestrator.processMessage('I need running shoes under 5000', session.session_id);

    assert.equal(response.state, 'NO_CATEGORY_MATCH');
    assert.equal(response.match_type, 'NO_CATEGORY_MATCH');
    assert.equal(response.recommendation?.recommended_laptop, null);
    assert.equal(response.recommendation?.accessories?.length, 0);
  });

  it('Test 6: Raw Groq response with budget: null passes validation without TypeError', () => {
    const rawGroqIntentWithNullBudget = {
      raw_query: 'Compare the best two laptops',
      target_workload: 'work',
      required_categories: ['laptop'],
      budget: null,
      hard_constraints: {
        in_stock_only: true
      },
      soft_preferences: {
        weights: { portability: 0.40, battery: 0.35, longevity: 0.25 }
      }
    };

    const validation = validateCustomerIntent(rawGroqIntentWithNullBudget);
    assert.equal(validation.valid, true, 'Validation must succeed with null budget');
    assert.ok(validation.intent);
    assert.equal(validation.intent.budget, undefined, 'Null budget is mapped to undefined');
  });

  it('Test 7: Raw Groq response missing soft weights and in_stock_only receives canonical defaults in orchestrator', async () => {
    // Custom mock LLM provider simulating incomplete Groq output
    const incompleteGroqProvider = {
      name: 'groq-mock',
      async generateStructuredIntent(_query: string): Promise<string> {
        return JSON.stringify({
          raw_query: 'I need a coding laptop under 60000 with 16GB RAM',
          target_workload: 'coding',
          required_categories: ['laptop'],
          budget: { currency: 'INR', total_ceiling: 60000, is_hard_ceiling: true },
          hard_constraints: { min_ram_gb: 16 }
          // Missing: soft_preferences.weights, hard_constraints.in_stock_only, hard_constraints.max_total_budget
        });
      },
      async generateExplanation(): Promise<string> {
        return 'Mock explanation';
      }
    };

    const orchestrator = new AgentOrchestrator(incompleteGroqProvider as any, repo, sessionManager);
    const session = sessionManager.getOrCreateSession();

    const response = await orchestrator.processMessage('I need a coding laptop under 60000 with 16GB RAM', session.session_id);

    assert.notEqual(response.state, 'ERROR');
    assert.ok(response.intent);
    // Verified defaults:
    assert.equal(response.intent.hard_constraints.in_stock_only, true, 'in_stock_only defaulted to true');
    assert.equal(response.intent.hard_constraints.max_total_budget, 60000, 'max_total_budget derived from budget.total_ceiling');
    assert.deepEqual(
      response.intent.soft_preferences.weights,
      { portability: 0.40, battery: 0.35, longevity: 0.25 },
      'Default soft preference weights supplied'
    );
  });
});
