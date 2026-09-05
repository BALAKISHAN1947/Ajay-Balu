import { AgentOrchestrator } from '../src/agent/agentOrchestrator.ts';
import { getLLMProvider } from '../src/llm/llmProvider.ts';
import { getCatalogRepository } from '../src/repository/catalogRepository.ts';
import { getSessionManager } from '../src/session/sessionManager.ts';

async function main() {
  const repo = getCatalogRepository();
  const sessionManager = getSessionManager(repo);
  const llmProvider = getLLMProvider();

  console.log(`=== PERFORMANCE & LATENCY DIAGNOSTIC ===`);
  console.log(`LLM Provider in use: ${llmProvider.name}`);
  console.log(`Target: ~2.0s average for normal requests\n`);

  const orchestrator = new AgentOrchestrator(llmProvider, repo, sessionManager);

  const testQueries = [
    { label: 'Cold Request - Standard Query', query: 'I need a coding laptop under 70000 with 16GB RAM' },
    { label: 'Warm Request 1 - Travel Laptop', query: 'Show me a lightweight travel laptop for office work under 60k' },
    { label: 'Warm Request 2 - Hinglish Query', query: 'bhai coding ke liye halka laptop batao 60k ke andar, 16GB RAM chahiye' },
    { label: 'Warm Request 3 - Decision & Tradeoff', query: 'Which laptop is better for coding and battery life between AeroBook and DevForge?' },
  ];

  const results: Array<{
    label: string;
    query: string;
    llm_intent_ms?: number;
    deterministic_engine_ms?: number;
    llm_explanation_ms?: number;
    total_server_ms: number;
    frontend_roundtrip_ms?: number;
  }> = [];

  for (const item of testQueries) {
    const sessionId = `perf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const t1 = Date.now();
    const res = await orchestrator.processMessage(item.query, sessionId, t1);
    const timings = res.timings;

    results.push({
      label: item.label,
      query: item.query,
      llm_intent_ms: timings?.llm_intent_ms,
      deterministic_engine_ms: timings?.deterministic_engine_ms,
      llm_explanation_ms: timings?.llm_explanation_ms,
      total_server_ms: timings?.total_server_ms ?? res.execution_time_ms,
      frontend_roundtrip_ms: timings?.frontend_roundtrip_ms
    });
  }

  console.log(`| Test Query Label | Intent NLU (ms) | Engine (ms) | Explanation (ms) | Total Server (ms) | Frontend RTT (ms) |`);
  console.log(`|-------------------|-----------------|-------------|------------------|-------------------|-------------------|`);
  for (const r of results) {
    console.log(
      `| ${r.label.padEnd(17)} | ` +
      `${String(r.llm_intent_ms ?? 'N/A').padStart(15)} | ` +
      `${String(r.deterministic_engine_ms ?? 'N/A').padStart(11)} | ` +
      `${String(r.llm_explanation_ms ?? 'N/A').padStart(16)} | ` +
      `${String(r.total_server_ms).padStart(17)} | ` +
      `${String(r.frontend_roundtrip_ms ?? 'N/A').padStart(17)} |`
    );
  }

  const avgServer = results.reduce((sum, r) => sum + r.total_server_ms, 0) / results.length;
  console.log(`\nAverage Total Server Latency: ${avgServer.toFixed(1)} ms`);
}

main().catch(console.error);
