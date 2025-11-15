import { getAlpacaClient } from './alpacaClient.js';
import orderStore from './orderStore.js';
import nodemailer from 'nodemailer';

// Exponential backoff base (ms). Final delay = base * 2^(retry-1) + jitter
const BACKOFF_BASE = Number(process.env.QUEUE_BACKOFF_BASE_MS || 1000);

function jitter(ms) {
  return Math.floor(Math.random() * Math.min(ms, 1000));
}

async function sendNotification(subject, text) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log('Notification (no SMTP configured):', subject, text);
    return;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!to) return console.log('No NOTIFY_EMAIL_TO configured; skipping email');

  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
  try {
    await transporter.sendMail({ from: process.env.NOTIFY_EMAIL_FROM || `no-reply@${host}`, to, subject, text });
    console.log('📧 Notification sent to', to);
  } catch (err) {
    console.error('❌ Failed to send notification email:', err && err.message ? err.message : err);
  }
}

function dueForAttempt(q) {
  const retry = q.retry_count || 0;
  if (!q.last_attempt_at) return true;
  const last = new Date(q.last_attempt_at).getTime();
  const delay = BACKOFF_BASE * Math.pow(2, Math.max(0, retry - 1));
  const due = last + delay + jitter(delay);
  return Date.now() >= due;
}

async function processSingleQueuedOrder(q, { maxRetries = 5 } = {}) {
  if (!dueForAttempt(q)) return { processed: 0, skipped: true };
  const alpaca = getAlpacaClient();
  try {
    console.log('🔁 Processing queued order', q.id, q.symbol, q.qty, q.side);
    // If stop/take configured, attempt bracket order (OCO) via Alpaca order_class 'bracket'
    let order;
    if ((q.stopLossPercent || q.takeProfitPercent) && alpaca.createOrder) {
      try {
        // attempt to determine current price
        let price = null;
        try {
          const latest = await alpaca.getLatestTrade(q.symbol);
          price = latest && (latest.Price || latest.price) ? (latest.Price || latest.price) : null;
        } catch (e) {
          console.warn('⚠️ Could not fetch latest trade for bracket sizing:', e && e.message ? e.message : e);
        }
        const entryPrice = price || 0;
        const stopLossPercent = Number(q.stopLossPercent || 0);
        const takeProfitPercent = Number(q.takeProfitPercent || 0);
        const stop_price = stopLossPercent ? (entryPrice * (1 - stopLossPercent / 100)).toFixed(2) : undefined;
        const limit_price = takeProfitPercent ? (entryPrice * (1 + takeProfitPercent / 100)).toFixed(2) : undefined;
        const createParams = { symbol: q.symbol, qty: q.qty, side: q.side, type: 'market', time_in_force: q.time_in_force || 'day' };
        if (stop_price || limit_price) {
          createParams.order_class = 'bracket';
          if (limit_price) createParams.take_profit = { limit_price: String(limit_price) };
          if (stop_price) createParams.stop_loss = { stop_price: String(stop_price) };
        }
        order = await alpaca.createOrder(createParams);
      } catch (e) {
        console.warn('⚠️ Bracket order failed, falling back to simple order:', e && e.message ? e.message : e);
        order = await alpaca.createOrder({ symbol: q.symbol, qty: q.qty, side: q.side, type: q.type || 'market', time_in_force: q.time_in_force || 'day' });
      }
    } else {
      order = await alpaca.createOrder({ symbol: q.symbol, qty: q.qty, side: q.side, type: q.type || 'market', time_in_force: q.time_in_force || 'day' });
    }
    const updatedAt = new Date().toISOString();
    const updatedRecord = { ...order, persisted_updated_at: updatedAt, persisted_updated_by: 'queue-processor', status: order.status || 'accepted' };
    await orderStore.updateOrder(updatedRecord);
    await orderStore.addAuditLog(q.id, 'executed', { new_id: order.id, symbol: order.symbol, qty: order.qty });
    if (process.env.NOTIFY_ON_SUCCESS === 'true') {
      await sendNotification(`Order executed: ${order.id}`, `Order ${q.id} executed as ${order.id} (${order.symbol} ${order.qty})`);
    }
    return { processed: 1 };
  } catch (err) {
    console.error('❌ Failed to process queued order', q.id, err && err.message ? err.message : err);
    const retryCount = (q.retry_count || 0) + 1;
    const update = { id: q.id, retry_count: retryCount, last_error: err && err.message ? err.message : String(err), last_attempt_at: new Date().toISOString() };
    if (retryCount >= maxRetries) {
      update.status = 'failed';
      update.failed_at = new Date().toISOString();
      await orderStore.addAuditLog(q.id, 'failed', { error: update.last_error });
      if (process.env.NOTIFY_ON_FAILURE === 'true') {
        await sendNotification(`Order failed: ${q.id}`, `Order ${q.id} failed after ${retryCount} attempts: ${update.last_error}`);
      }
    }
    await orderStore.updateOrder(update);
    return { processed: 0 };
  }
}

export async function processQueuedOrders({ maxPerRun = 10, maxRetries = 5 } = {}) {
  const res = await orderStore.listOrders({ status: 'queued', page: 1, limit: maxPerRun });
  const queued = res.orders || [];
  if (!queued.length) return { processed: 0 };

  let processed = 0;
  for (const q of queued) {
    const r = await processSingleQueuedOrder(q, { maxRetries });
    if (r && r.processed) processed += r.processed;
  }
  return { processed };
}

export async function processQueuedOrderById(id, opts = {}) {
  const q = await orderStore.getOrderById(id);
  if (!q) return { found: false };
  return processSingleQueuedOrder(q, opts);
}

export default { processQueuedOrders, processQueuedOrderById };
