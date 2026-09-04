import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GOLDEN_DATASET } from '../src/data/goldenDataset.ts';
import { DeterministicNLUProvider } from '../src/llm/llmProvider.ts';
import { validateCustomerIntent } from '../src/nlu/intentValidator.ts';
import { detectAmbiguity } from '../src/nlu/ambiguityDetector.ts';

describe('Golden Dataset Evaluation (16 Natural-Language Test Cases)', () => {
  const nlu = new DeterministicNLUProvider();

  for (const tc of GOLDEN_DATASET) {
    it(`[${tc.id}] ${tc.description}`, async () => {
      const jsonStr = await nlu.generateStructuredIntent(tc.query);
      const parsed = JSON.parse(jsonStr);

      const validation = validateCustomerIntent(parsed);
      assert.equal(validation.valid, true, `Validation should pass for ${tc.id}: ${validation.errors.join(', ')}`);

      const intent = validation.intent!;
      const expected = tc.expected;

      // Check required categories
      if (expected.required_categories.length > 0) {
        for (const cat of expected.required_categories) {
          assert.ok(
            intent.required_categories.includes(cat),
            `[${tc.id}] Expected category "${cat}" in [${intent.required_categories.join(', ')}]`
          );
        }
      }

      // Check budget
      if (expected.budget_ceiling !== undefined) {
        const extractedBudget = intent.budget?.total_ceiling ?? intent.hard_constraints.max_total_budget;
        assert.equal(
          extractedBudget,
          expected.budget_ceiling,
          `[${tc.id}] Expected budget ₹${expected.budget_ceiling}, got ₹${extractedBudget}`
        );
      }

      // Check is_hard_ceiling
      if (expected.is_hard_ceiling !== undefined && intent.budget) {
        assert.equal(
          intent.budget.is_hard_ceiling,
          expected.is_hard_ceiling,
          `[${tc.id}] Expected is_hard_ceiling to be ${expected.is_hard_ceiling}`
        );
      }

      // Check RAM
      if (expected.min_ram_gb !== undefined) {
        assert.equal(
          intent.hard_constraints.min_ram_gb,
          expected.min_ram_gb,
          `[${tc.id}] Expected min RAM ${expected.min_ram_gb}GB, got ${intent.hard_constraints.min_ram_gb}GB`
        );
      }

      // Check Storage
      if (expected.min_storage_gb !== undefined) {
        assert.equal(
          intent.hard_constraints.min_storage_gb,
          expected.min_storage_gb,
          `[${tc.id}] Expected min Storage ${expected.min_storage_gb}GB, got ${intent.hard_constraints.min_storage_gb}GB`
        );
      }

      // Check Workload
      if (expected.target_workload !== undefined) {
        assert.equal(
          intent.target_workload,
          expected.target_workload,
          `[${tc.id}] Expected workload "${expected.target_workload}", got "${intent.target_workload}"`
        );
      }

      // Check Clarification / Ambiguity Trigger
      const ambiguity = detectAmbiguity(intent, tc.query);
      if (expected.expect_clarification) {
        assert.equal(ambiguity.isAmbiguous, true, `[${tc.id}] Should trigger clarification`);
        assert.ok(ambiguity.clarificationQuestion, `[${tc.id}] Should provide clarification question`);
      } else {
        assert.equal(ambiguity.isAmbiguous, false, `[${tc.id}] Should NOT trigger clarification`);
      }
    });
  }
});
