import express from "express";
import axios from "axios";
import { getAlpacaClient } from "./alpacaClient.js";
import orderStore, { getOrderById } from "./orderStore.js";
import { processQueuedOrders, processQueuedOrderById } from './queueProcessor.js';
import botConfig from './botConfig.js';
import client from 'prom-client';

// Prometheus metrics
const collectDefault = client.collectDefaultMetrics;
collectDefault({ timeout: 5000 });
const registry = new client.Registry();
registry.setDefaultLabels({ app: 'ai-stock-backend' });
collectDefault({ register: registry });
const tradeCounter = new client.Counter({ name: 'ai_trades_total', help: 'Total trades attempted' });
registry.registerMetric(tradeCounter);
const router = express.Router();

// Simple in-memory rate limiter (per-IP) for sensitive routes like /trade
const rateMap = new Map();
function rateLimit({ windowMs = 60_000, max = 10 } = {}) {
  return (req, res, next) => {
    try {
      const key = req.ip || req.connection.remoteAddress || 'anon';
      const now = Date.now();
      const entry = rateMap.get(key) || { count: 0, start: now };
      if (now - entry.start > windowMs) {
        entry.count = 0;
        entry.start = now;
      }
      entry.count += 1;
      rateMap.set(key, entry);
      if (entry.count > max) {
        return res.status(429).json({ success: false, message: 'Rate limit exceeded' });
      }
      next();
    } catch (err) {
      next();
    }
  };
}

// Admin auth middleware: if ADMIN_API_KEY is set, require header x-admin-key
function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return next(); // if not configured, skip
  const provided = req.headers['x-admin-key'] || req.query.admin_key;
  if (!provided || provided !== adminKey) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

// 🔹 Get AI-picked stock suggestions
router.get("/suggestions", async (req, res) => {
  const suggestions = [
    { symbol: "AAPL", reason: "Consistent growth and AI integration" },
    { symbol: "TSLA", reason: "Strong EV demand and innovation" },
    { symbol: "NVDA", reason: "AI hardware leadership" }
  ];
  res.json({ success: true, suggestions });
});

// 🔹 Trade actions (mocked for now)
router.post("/trade", async (req, res) => {
  const { symbol, action, amount } = req.body;
  console.log(`📊 Trade request: ${action} ${amount} shares of ${symbol}`);

  if (!symbol || !action || !amount) {
    return res.status(400).json({ success: false, message: "symbol, action and amount required" });
  }

  // Only allow trading when ALPACA_PAPER is true by default (safety)
  if ((process.env.ALPACA_PAPER || 'true') !== 'true') {
    return res.status(403).json({ success: false, message: 'Trading disabled: ALPACA_PAPER is not true' });
  }

    try {
    const side = action.toLowerCase() === 'buy' ? 'buy' : 'sell';

    // Create a fresh Alpaca client and place a market order via SDK. Use a
    // small retry to cover transient network/SDK issues.
    const alpaca = getAlpacaClient();
    let order;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // If stop/take provided, attempt bracket (OCO) order via Alpaca
        if ((req.body && (req.body.stopLossPercent || req.body.takeProfitPercent)) && alpaca.createOrder) {
          try {
            let price = null;
            try {
              const latest = await alpaca.getLatestTrade(symbol);
              price = latest && (latest.Price || latest.price) ? (latest.Price || latest.price) : null;
            } catch (e) {
              console.warn('⚠️ Could not fetch latest trade for bracket sizing:', e && e.message ? e.message : e);
            }
            const entryPrice = price || 0;
            const stopLossPercent = Number(req.body.stopLossPercent || 0);
            const takeProfitPercent = Number(req.body.takeProfitPercent || 0);
            const stop_price = stopLossPercent ? (entryPrice * (1 - stopLossPercent / 100)).toFixed(2) : undefined;
            const limit_price = takeProfitPercent ? (entryPrice * (1 + takeProfitPercent / 100)).toFixed(2) : undefined;
            const params = { symbol, qty: amount, side, type: 'market', time_in_force: 'day' };
            if (stop_price || limit_price) {
              params.order_class = 'bracket';
              if (limit_price) params.take_profit = { limit_price: String(limit_price) };
              if (stop_price) params.stop_loss = { stop_price: String(stop_price) };
            }
            order = await alpaca.createOrder(params);
          } catch (e) {
            console.warn('⚠️ Bracket order failed, falling back to simple order:', e && e.message ? e.message : e);
            order = await alpaca.createOrder({ symbol, qty: amount, side, type: 'market', time_in_force: 'day' });
          }
        } else {
          order = await alpaca.createOrder({ symbol, qty: amount, side, type: 'market', time_in_force: 'day' });
        }
        break;
      } catch (e) {
        lastErr = e;
        // If error looks like a network/connection issue, we'll retry; if it's a deterministic rejection (like wash-trade 403), stop and return error.
        const code = e && e.response && e.response.status;
        if (code && (code >= 400 && code < 500) && code !== 429) {
          // client error (likely will not be fixed by retry) — throw to be handled below
          lastErr = e;
          break;
        }
        // brief backoff
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  // If we don't have an order but lastErr exists and looks retryable, queue it.
    if (!order) {
      // If Alpaca returned a deterministic client-side rejection, return that error instead of queuing.
      const status = lastErr && lastErr.response && lastErr.response.status;
      if (status && status >= 400 && status < 500 && status !== 502 && status !== 503 && status !== 504) {
        throw lastErr;
      }

      // Persist a queued order to be executed later by the worker
      try {
        const queuedBy = req.headers['x-user'] || req.headers['x-admin-key'] || 'system';
        const queuedAt = new Date().toISOString();
        const queuedRecord = {
          id: `queued-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          symbol,
          qty: amount,
          side,
          type: 'market',
          status: 'queued',
          queued_at: queuedAt,
          persisted_at: queuedAt,
          persisted_by: queuedBy,
          retry_count: 0
        };
        await orderStore.appendOrder(queuedRecord);
        return res.json({ success: true, queued: true, order: queuedRecord });
      } catch (storeErr) {
        console.warn('⚠️ Failed to persist queued order locally:', storeErr && storeErr.message ? storeErr.message : storeErr);
        throw lastErr || new Error('Failed to place order and failed to queue locally');
      }
    }

    console.log('✅ Alpaca order placed', order && order.id);

    // Persist the order locally for history/inspection with metadata
    try {
      const persistedBy = req.headers['x-user'] || req.headers['x-admin-key'] || 'system';
      const persistedAt = new Date().toISOString();
      // attach stop/take thresholds to local persisted record if provided
      const localRecord = { ...order, persisted_at: persistedAt, persisted_by: persistedBy };
      if (req.body && req.body.stopLossPercent) localRecord.stopLossPercent = Number(req.body.stopLossPercent);
      if (req.body && req.body.takeProfitPercent) localRecord.takeProfitPercent = Number(req.body.takeProfitPercent);
      await orderStore.appendOrder(localRecord);
    } catch (storeErr) {
      console.warn('⚠️ Failed to persist order locally:', storeErr && storeErr.message ? storeErr.message : storeErr);
    }

    return res.json({ success: true, order });
  } catch (err) {
    console.error('❌ Alpaca order error:', err && err.message ? err.message : err);
    // If the error contains a client rejection (e.g., wash-trade 403), return it to the caller so they can handle (cancel opposing order, etc.)
    const status = err && err.response && err.response.status;
    if (status && status >= 400 && status < 500) {
      return res.status(status).json({ success: false, message: err.response && err.response.data ? err.response.data : err.message });
    }
    // don't echo secrets; return safe error message for server/network issues
    return res.status(500).json({ success: false, message: 'Order failed (network or server error)', detail: err && err.message ? err.message : String(err) });
  }
});

// 🔹 Get learning tips
router.get("/tips", (req, res) => {
  const tips = [
    "Diversify your portfolio — don’t put all your eggs in one basket.",
    "Use stop-loss orders to protect your capital.",
    "Follow market trends, not emotions.",
    "Reinvest your profits for compound growth."
  ];
  res.json({ success: true, tips });
});

// Health endpoint: checks DB connectivity and basic liveness
router.get('/health', async (req, res) => {
  try {
    const ok = await orderStore.ping();
    return res.json({ success: true, healthy: !!ok });
  } catch (err) {
    return res.status(500).json({ success: false, healthy: false, detail: err && err.message ? err.message : String(err) });
  }
});

// (order-by-id and cancel routes are defined after listing endpoints so specific
// paths like /orders/alpaca do not get captured by the ':id' param route.)

// 🔹 List locally persisted orders with filtering and pagination
router.get('/orders', requireAdmin, async (req, res) => {
  try {
    const { status, symbol, from, to, page = 1, limit = 50 } = req.query;
    const result = await orderStore.listOrders({ status, symbol, from, to, page, limit });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('❌ List local orders error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to list local orders', detail: err && err.message ? err.message : String(err) });
  }
});

// 🔹 List orders directly from Alpaca (proxy). Requires admin auth when ADMIN_API_KEY is configured.
router.get('/orders/alpaca', requireAdmin, async (req, res) => {
  try {
    // Prefer running a small helper script to fetch Alpaca orders. This keeps
    // the SDK call isolated and avoids intermittent issues inside the long-
    // running server process. The helper script prints a JSON array which we
    // parse and return.
    // Query Alpaca directly (fresh client) with retries. If it fails, fall
    // back to local persisted store.
    try {
      const alpaca = getAlpacaClient();
      let orders;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          orders = await alpaca.getOrders();
          break;
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        }
      }
      if (!orders) throw lastErr;
      return res.json({ success: true, orders, source: 'alpaca' });
    } catch (err) {
      console.error('❌ Alpaca list failed, falling back to local store:', err && err.message ? err.message : err);
      const local = await orderStore.listOrders({ page: 1, limit: 100 });
      return res.json({ success: true, orders: local.orders, source: 'local' });
    }
  } catch (err) {
    console.error('❌ List Alpaca orders fatal error:', err && err.stack ? err.stack : err);
    const local = await orderStore.listOrders({ page: 1, limit: 100 });
    return res.json({ success: true, orders: local.orders, source: 'local' });
  }
});

// Admin: view queued or failed orders
router.get('/admin/queue', requireAdmin, async (req, res) => {
  try {
    const { status = 'queued', page = 1, limit = 100 } = req.query;
    const result = await orderStore.listOrders({ status, page, limit });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('❌ Admin queue list error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to list queue', detail: err && err.message ? err.message : String(err) });
  }
});

// Admin: process queued orders now
router.post('/admin/queue/process', requireAdmin, async (req, res) => {
  try {
    const { maxPerRun = 50 } = req.body || {};
    const r = await processQueuedOrders({ maxPerRun: Number(maxPerRun), maxRetries: Number(process.env.WORKER_MAX_RETRIES || 5) });
    return res.json({ success: true, processed: r.processed });
  } catch (err) {
    console.error('❌ Admin process queue error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to process queue', detail: err && err.message ? err.message : String(err) });
  }
});

// Admin: process a single queued order by id
router.post('/admin/queue/:id/process', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const r = await processQueuedOrderById(id, { maxRetries: Number(process.env.WORKER_MAX_RETRIES || 5) });
    return res.json({ success: true, result: r });
  } catch (err) {
    console.error('❌ Admin process single queue error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to process queued order', detail: err && err.message ? err.message : String(err) });
  }
});

// Admin: view audit logs
router.get('/admin/audit', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const logs = await orderStore.listAuditLogs({ page: Number(page), limit: Number(limit) });
    return res.json({ success: true, ...logs });
  } catch (err) {
    console.error('❌ Admin audit list error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to list audit logs', detail: err && err.message ? err.message : String(err) });
  }
});

// Admin: get bot configuration
router.get('/admin/bot-config', requireAdmin, async (req, res) => {
  try {
    const cfg = botConfig.getConfig();
    return res.json({ success: true, config: cfg });
  } catch (err) {
    console.error('❌ Get bot config error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to read bot config', detail: err && err.message ? err.message : String(err) });
  }
});

// Admin: update bot configuration (partial updates allowed)
router.post('/admin/bot-config', requireAdmin, async (req, res) => {
  try {
    const update = req.body || {};
    // sanitize inputs
    const allowed = ['strategy', 'amount', 'percent', 'symbol'];
    const patch = {};
    for (const k of allowed) if (Object.prototype.hasOwnProperty.call(update, k)) patch[k] = update[k];
    const cfg = botConfig.updateConfig(patch);
    return res.json({ success: true, config: cfg });
  } catch (err) {
    console.error('❌ Update bot config error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to update bot config', detail: err && err.message ? err.message : String(err) });
  }
});

// Metrics endpoint for Prometheus scraping
router.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', registry.contentType);
    const metrics = await registry.metrics();
    return res.send(metrics);
  } catch (err) {
    return res.status(500).send('metrics error');
  }
});

// 🔹 Get specific order by id
router.get('/orders/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, message: 'order id required' });
  try {
    const alpaca = getAlpacaClient();
    const order = await alpaca.getOrder(id);
    return res.json({ success: true, order });
  } catch (err) {
    console.error('❌ Get order error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to fetch order', detail: err && err.message ? err.message : String(err) });
  }
});

// 🔹 Cancel order by id
router.post('/orders/:id/cancel', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, message: 'order id required' });

  // Only allow cancelling in paper mode for safety (default true)
  if ((process.env.ALPACA_PAPER || 'true') !== 'true') {
    return res.status(403).json({ success: false, message: 'Cancelling disabled: ALPACA_PAPER is not true' });
  }

  try {
    // If the order exists locally and is queued, cancel locally without calling Alpaca
    const local = await orderStore.getOrderById(id);
    if (local && local.status === 'queued') {
      const updatedBy = req.headers['x-user'] || req.headers['x-admin-key'] || 'system';
      const updatedAt = new Date().toISOString();
      const updatedRecord = { id, status: 'canceled', persisted_updated_at: updatedAt, persisted_updated_by: updatedBy };
      await orderStore.updateOrder(updatedRecord);
      return res.json({ success: true, canceled: true, source: 'local' });
    }

    const alpaca = getAlpacaClient();
    const result = await alpaca.cancelOrder(id);
    // Try to fetch the updated order state and persist it locally
    try {
      const updated = await alpaca.getOrder(id);
      // attach update metadata
      const updatedBy = req.headers['x-user'] || req.headers['x-admin-key'] || 'system';
      const updatedAt = new Date().toISOString();
      const updatedRecord = { ...updated, persisted_updated_at: updatedAt, persisted_updated_by: updatedBy };
      await orderStore.updateOrder(updatedRecord);
    } catch (storeErr) {
      console.warn('⚠️ Failed to update local order after cancel:', storeErr && storeErr.message ? storeErr.message : storeErr);
    }
    // The SDK returns order data or an empty result depending on version — return success
    return res.json({ success: true, canceled: true, result });
  } catch (err) {
    console.error('❌ Cancel order error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to cancel order', detail: err && err.message ? err.message : String(err) });
  }
});

export default router;


