import dotenv from 'dotenv';
import express from 'express';
import { startTradeWorker } from './tradeWorker.js';
import orderStore from './orderStore.js';

// Load environment early
dotenv.config();

console.log('👷 Starting background worker service...');

// Start the worker loop
startTradeWorker();

// Minimal HTTP server for health/readiness probes
const app = express();
const WORKER_PORT = Number(process.env.WORKER_PORT || process.env.PORT || 4001);
let ready = false;

(async () => {
  // perform an initial readiness check against DB
  try {
    const ok = await orderStore.ping();
    ready = !!ok;
  } catch (err) {
    ready = false;
  }
})();

app.get('/healthz', (_req, res) => res.json({ status: 'ok', pid: process.pid }));
app.get('/ready', async (_req, res) => {
  try {
    const ok = await orderStore.ping();
    if (ok) return res.json({ ready: true });
    return res.status(503).json({ ready: false });
  } catch (err) {
    return res.status(503).json({ ready: false, error: err && err.message ? err.message : String(err) });
  }
});

app.listen(WORKER_PORT, () => {
  console.log(`👷 Worker HTTP health endpoints listening on port ${WORKER_PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('👷 Worker shutting down (SIGINT)');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('👷 Worker shutting down (SIGTERM)');
  process.exit(0);
});
