import { GroqLLMProvider } from '../src/llm/llmProvider.ts';
import { DeterministicDecisionEngine } from '../src/engine/decisionEngine.ts';
import { getCatalogRepository } from '../src/repository/catalogRepository.ts';
import fs from 'fs';
import path from 'path';

if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

async function testGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log('GROQ_API_KEY not set, skipping live Groq latency check.');
    return;
  }

  const groq = new GroqLLMProvider(apiKey);
  const repo = getCatalogRepository();
  const engine = new DeterministicDecisionEngine(repo);

  console.log('=== LIVE GROQ LATENCY BENCHMARK ===');
  const queries = [
    'I need a lightweight coding laptop under 70k with 16GB RAM',
    'bhai coding ke liye halka laptop batao 60k ke andar, 16GB RAM chahiye'
  ];

  for (const q of queries) {
    console.log(`\nQuery: "${q}"`);
    const t3 = Date.now();
    const intentJson = await groq.generateStructuredIntent(q);
    const t4 = Date.now();
    const intentNluMs = t4 - t3;
    console.log(`- Groq Intent Extraction: ${intentNluMs} ms`);

    const parsed = JSON.parse(intentJson);
    const t5 = Date.now();
    const rec = engine.evaluateIntent(parsed);
    const t6 = Date.now();
    console.log(`- Deterministic Decision Engine: ${t6 - t5} ms (Recommended: ${rec.recommended_laptop?.product.name || 'none'})`);

    const t7 = Date.now();
    const explanation = await groq.generateExplanation(rec, q);
    const t8 = Date.now();
    const explanationMs = t8 - t7;
    console.log(`- Groq Grounded Explanation: ${explanationMs} ms`);
    console.log(`- Total Groq + Engine Pipeline: ${intentNluMs + (t6 - t5) + explanationMs} ms (~${((intentNluMs + (t6 - t5) + explanationMs)/1000).toFixed(2)}s)`);
    console.log(`- Explanation Sample: "${explanation.substring(0, 100)}..."`);
  }
}

testGroq().catch(console.error);
