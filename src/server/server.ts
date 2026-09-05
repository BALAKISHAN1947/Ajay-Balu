import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentOrchestrator } from '../agent/agentOrchestrator.ts';
import { getSessionManager, SessionManager } from '../session/sessionManager.ts';
import { getCatalogRepository } from '../repository/catalogRepository.ts';
import { getLLMProvider } from '../llm/llmProvider.ts';
import { getOrderManager, OrderManager } from '../engine/orderManager.ts';
import { getRazorpayService, RazorpayService } from '../services/razorpayService.ts';
import { getExperimentEngine, ExperimentEngine } from '../benchmark/experimentEngine.ts';
import { getCatalogFixEngine, CatalogFixEngine } from '../benchmark/catalogFixEngine.ts';
import { validateBenchmarkDataset, BenchmarkDataError } from '../benchmark/benchmarkRunner.ts';
import { BENCHMARK_INTENTS } from '../data/benchmarkIntents.ts';

// Safe environment loading
if (typeof (process as any).loadEnvFile === 'function') {
  try {
    (process as any).loadEnvFile();
  } catch {
    // .env not present or optional in test environment
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../../public');

export interface ServerOptions {
  port?: number;
  sessionManager?: SessionManager;
  orchestrator?: AgentOrchestrator;
  orderManager?: OrderManager;
  razorpayService?: RazorpayService;
  experimentEngine?: ExperimentEngine;
  catalogFixEngine?: CatalogFixEngine;
}

export function createServer(options: ServerOptions = {}) {
  const repo = getCatalogRepository();
  const sessionManager = options.sessionManager || getSessionManager(repo);
  const orchestrator = options.orchestrator || new AgentOrchestrator(getLLMProvider(), repo, sessionManager);
  const razorpayService = options.razorpayService || getRazorpayService();
  const orderManager = options.orderManager || getOrderManager(repo, razorpayService);
  const experimentEngine = options.experimentEngine || getExperimentEngine();
  const catalogFixEngine = options.catalogFixEngine || getCatalogFixEngine();

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Razorpay-Signature, x-razorpay-signature, X-Razorpay-Event-Id, x-razorpay-event-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;

    // API Route: POST /api/v1/agent/message
    if (req.method === 'POST' && pathname === '/api/v1/agent/message') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload.message || typeof payload.message !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Field "message" is required and must be a string.' }));
            return;
          }

          const sessionId = payload.session_id || `ses_${Date.now()}`;
          const clientT1 = typeof payload.t1_frontend_start === 'number' ? payload.t1_frontend_start : undefined;
          const response = await orchestrator.processMessage(payload.message, sessionId, clientT1);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            state: 'ERROR',
            errors: [`Internal server error: ${err.message}`]
          }));
        }
      });
      return;
    }

    // API Route: GET /api/v1/session/:id
    const sessionMatch = pathname.match(/^\/api\/v1\/session\/([a-zA-Z0-9_-]+)$/);
    if (req.method === 'GET' && sessionMatch) {
      const sessionId = sessionMatch[1];
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Session "${sessionId}" not found.` }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(session));
      return;
    }

    // API Route: POST /api/v1/session/:id/accessory
    const accessoryMatch = pathname.match(/^\/api\/v1\/session\/([a-zA-Z0-9_-]+)\/accessory$/);
    if (req.method === 'POST' && accessoryMatch) {
      const sessionId = accessoryMatch[1];
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const sku = payload.sku;
          const included = typeof payload.included === 'boolean' ? payload.included : undefined;

          if (!sku || typeof sku !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Field "sku" is required.' }));
            return;
          }

          const result = sessionManager.toggleAccessory(sessionId, sku, included);
          if (!result.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: result.error }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.session));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API Route: POST /api/v1/session/:id/budget
    const budgetMatch = pathname.match(/^\/api\/v1\/session\/([a-zA-Z0-9_-]+)\/budget$/);
    if (req.method === 'POST' && budgetMatch) {
      const sessionId = budgetMatch[1];
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const amount = Number(payload.budget ?? payload.amount);
          if (isNaN(amount) || amount <= 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Valid positive budget number is required.' }));
            return;
          }

          const result = sessionManager.updateBudget(sessionId, amount);
          if (!result.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: result.error }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.session));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API Route: GET /api/v1/session/:id/compare?alternative_sku=...
    const compareMatch = pathname.match(/^\/api\/v1\/session\/([a-zA-Z0-9_-]+)\/compare$/);
    if (req.method === 'GET' && compareMatch) {
      const sessionId = compareMatch[1];
      const altSku = reqUrl.searchParams.get('alternative_sku');
      if (!altSku) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Query parameter "alternative_sku" is required.' }));
        return;
      }

      try {
        const comparison = sessionManager.compareProducts(sessionId, altSku);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(comparison));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // API Route: GET /api/v1/session/:id/review
    const reviewMatch = pathname.match(/^\/api\/v1\/session\/([a-zA-Z0-9_-]+)\/review$/);
    if (req.method === 'GET' && reviewMatch) {
      const sessionId = reviewMatch[1];
      try {
        const review = sessionManager.generatePurchaseReview(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(review));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // API Route: GET /api/v1/session/:id/order
    const sessionOrderMatch = pathname.match(/^\/api\/v1\/session\/([a-zA-Z0-9_-]+)\/order$/);
    if (req.method === 'GET' && sessionOrderMatch) {
      const sessionId = sessionOrderMatch[1];
      const session = sessionManager.getSession(sessionId);
      if (!session || !session.current_order_id) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active order for this session.' }));
        return;
      }
      const order = orderManager.getOrder(session.current_order_id);
      if (!order) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Order not found.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(order));
      return;
    }

    // API Route: POST /api/v1/checkout/approve
    if (req.method === 'POST' && pathname === '/api/v1/checkout/approve') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload.session_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Field "session_id" is required.' }));
            return;
          }

          const approval = orderManager.approvePurchase(sessionManager, payload.session_id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, approval }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API Route: POST /api/v1/checkout/create-order
    if (req.method === 'POST' && pathname === '/api/v1/checkout/create-order') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload.session_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Field "session_id" is required.' }));
            return;
          }

          const orderResult = await orderManager.createPaymentOrder(
            sessionManager,
            payload.session_id,
            payload.amount
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(orderResult));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API Route: POST /api/v1/checkout/verify-payment
    if (req.method === 'POST' && pathname === '/api/v1/checkout/verify-payment') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const { session_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;
          if (!session_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required fields for payment verification.' }));
            return;
          }

          const result = orderManager.verifyPayment(sessionManager, session_id, {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
          });

          if (!result.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: result.error, status: result.status }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API Route: POST /api/v1/checkout/cancel
    if (req.method === 'POST' && pathname === '/api/v1/checkout/cancel') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload.session_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Field "session_id" is required.' }));
            return;
          }

          const result = orderManager.cancelPayment(sessionManager, payload.session_id, payload.reason);
          if (!result.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: result.error }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API Route: POST /api/v1/checkout/fail
    if (req.method === 'POST' && pathname === '/api/v1/checkout/fail') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload.session_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Field "session_id" is required.' }));
            return;
          }

          const result = orderManager.failPayment(sessionManager, payload.session_id, payload.reason);
          if (!result.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: result.error }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Webhook Route: POST /api/v1/webhooks/razorpay (Strict RAW BODY verification)
    if (req.method === 'POST' && pathname === '/api/v1/webhooks/razorpay') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks);
        const signature =
          (req.headers['x-razorpay-signature'] as string) ||
          (req.headers['X-Razorpay-Signature'] as string) ||
          '';
        const eventId =
          (req.headers['x-razorpay-event-id'] as string) ||
          (req.headers['X-Razorpay-Event-Id'] as string) ||
          undefined;

        const result = orderManager.processWebhook(rawBody, signature, eventId, sessionManager);
        if (!result.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.message }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
      return;
    }

    // ==========================================
    // MERCHANT REVENUE INTELLIGENCE ENDPOINTS (Track 01)
    // ==========================================

    // API Route: GET /api/v1/merchant/benchmark/latest
    if (req.method === 'GET' && pathname === '/api/v1/merchant/benchmark/latest') {
      try {
        const summary = experimentEngine.getBaselineSummary();
        if (!summary) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'NOT_RUN', summary: null }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'COMPLETED', summary }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // API Route: GET/POST /api/v1/merchant/benchmark/validate
    if ((req.method === 'GET' || req.method === 'POST') && pathname === '/api/v1/merchant/benchmark/validate') {
      try {
        const validation = validateBenchmarkDataset(BENCHMARK_INTENTS);
        if (!validation.valid && validation.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'INVALID_BENCHMARK_DATA',
            benchmark_id: validation.error.benchmark_id,
            field: validation.error.field,
            reason: validation.error.reason,
            error: `Dataset validation failed on intent "${validation.error.benchmark_id}" (field: "${validation.error.field}"): ${validation.error.reason}`
          }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'VALID',
          count: validation.count,
          message: `${validation.count}/${validation.count} valid`
        }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // API Route: POST /api/v1/merchant/benchmark/run
    if (req.method === 'POST' && pathname === '/api/v1/merchant/benchmark/run') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const version = payload.catalog_version || 'Catalog-v1.0-Baseline';
          if (version.includes('Enriched') || version === 'version_b' || version === 'enriched') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Multi-fix benchmark runs are disabled. Run an isolated 1-fix experiment using POST /api/v1/merchant/experiment/isolated with a specific fix_id.'
            }));
            return;
          } else {
            const summary = await experimentEngine.runBaseline(version);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'COMPLETED', summary }));
            return;
          }
        } catch (err: any) {
          if (err.status === 'INVALID_BENCHMARK_DATA' || err instanceof BenchmarkDataError || err.name === 'BenchmarkDataError') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'INVALID_BENCHMARK_DATA',
              benchmark_id: err.benchmark_id || 'UNKNOWN',
              field: err.field || 'unknown',
              reason: err.reason || err.message,
              error: err.message
            }));
            return;
          }
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API Route: GET /api/v1/merchant/benchmark/intents/:id
    const intentDetailMatch = pathname.match(/^\/api\/v1\/merchant\/benchmark\/intents\/([a-zA-Z0-9_-]+)$/);
    if (req.method === 'GET' && intentDetailMatch) {
      const intentId = intentDetailMatch[1];
      try {
        let summary = experimentEngine.getBaselineSummary();
        if (!summary) {
          summary = await experimentEngine.runBaseline();
        }
        const result = summary.results.find((r) => r.benchmark_id === intentId);
        if (!result) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Benchmark intent "${intentId}" not found.` }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // API Route: GET /api/v1/merchant/catalog/fixes
    if (req.method === 'GET' && pathname === '/api/v1/merchant/catalog/fixes') {
      try {
        const pending = catalogFixEngine.getPendingFixes();
        const approved = catalogFixEngine.getApprovedFixes();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pending, approved }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // API Route: POST /api/v1/merchant/catalog/fixes/approve
    if (req.method === 'POST' && pathname === '/api/v1/merchant/catalog/fixes/approve') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload.fix_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Field "fix_id" is required.' }));
            return;
          }
          const result = catalogFixEngine.approveFix(payload.fix_id);
          if (!result.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: result.error }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API Route: GET /api/v1/merchant/experiment/compare (Disallowed: only isolated 1-fix experiments permitted)
    if (req.method === 'GET' && pathname === '/api/v1/merchant/experiment/compare') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Multi-fix experiments are disabled. Run an isolated 1-fix experiment using POST /api/v1/merchant/experiment/isolated with a specific fix_id.'
      }));
      return;
    }

    /**
     * API Route: POST /api/v1/merchant/experiment/isolated
     * Runs a causal one-fix experiment: Version B = Version A + exactly ONE approved fix.
     * Body: { "fix_id": "FIX-RAM-01" }
     *
     * The approved_fix_id in the response identifies the single causal variable.
     * has_outcome_changes tells the UI whether "opportunity recovered" language is valid.
     */
    if (req.method === 'POST' && pathname === '/api/v1/merchant/experiment/isolated') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload.fix_id || typeof payload.fix_id !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Field "fix_id" is required.' }));
            return;
          }
          const comparison = await experimentEngine.runIsolatedExperiment(payload.fix_id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(comparison));
        } catch (err: any) {
          if (err.message && err.message.includes('PRECONDITION_FAILED')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'PRECONDITION_FAILED',
              error: err.message.replace('PRECONDITION_FAILED: ', '')
            }));
            return;
          }
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    /**
     * API Route: POST /api/v1/merchant/experiment/reset
     * Clears the enriched experiment state so a fresh isolated experiment can be
     * started from the existing baseline without re-running the 100-intent baseline.
     * Resets all approved fixes back to PENDING.
     * Does NOT modify Catalog Version A or the baseline benchmark summary.
     */
    if (req.method === 'POST' && pathname === '/api/v1/merchant/experiment/reset') {
      try {
        experimentEngine.resetExperiment();
        catalogFixEngine.resetApprovedFixes();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'RESET',
          message: 'Experiment state reset. Catalog Version A (baseline) is preserved. All approved fixes reset to pending. You may now run a fresh isolated experiment with a single approved fix.'
        }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Static File Serving
    let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
      };
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // 404 Fallback
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found' }));
  });

  return server;
}

// Start server if run directly
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const port = parseInt(process.env.PORT || '3000', 10);
  const server = createServer();
  server.listen(port, () => {
    console.log(`\n[AgentReady Server] Running at http://localhost:${port}`);
    console.log(`[AgentReady Server] Architecture: Customer UI -> Agent API -> Decision Engine`);
    console.log(`[AgentReady Server] Razorpay: Test-Mode Integration Connected`);
    console.log(`[AgentReady Server] Merchant: Nexora Technologies (Bengaluru)\n`);
  });
}
