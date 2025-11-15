import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, 'orders.db');
const SQLITE_DB_PATH = process.env.ORDER_DB_PATH || process.env.ORDER_STORE_PATH || DEFAULT_DB_PATH;
const PG_URL = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || null;

// If DATABASE_URL is provided, use Postgres; otherwise fall back to sqlite for dev/tests.
let usePg = !!PG_URL;

let sqlitePromise;
async function getSqliteDb() {
  if (!sqlitePromise) {
    sqlitePromise = open({ filename: SQLITE_DB_PATH, driver: sqlite3.Database });
    const db = await sqlitePromise;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        status TEXT,
        qty REAL,
        data TEXT,
        created_at TEXT,
        persisted_at TEXT,
        persisted_by TEXT,
        queued_at TEXT,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        last_attempt_at TEXT,
        failed_at TEXT
      );
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT,
        event TEXT,
        meta TEXT,
        created_at TEXT
      );
    `);
  }
  return sqlitePromise;
}

let pgPool;
async function getPgPool() {
  if (!pgPool) {
    // create a pool with a short connection timeout to avoid long hangs
    pgPool = new Pool({ connectionString: PG_URL, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000 });
    // run migrations but don't let them block forever - fail fast and log if the DB is unavailable
    try {
      const migrationsPromise = (async () => {
        await pgPool.query(`
          CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            symbol TEXT,
            status TEXT,
            qty REAL,
            data TEXT,
            created_at TEXT,
            persisted_at TEXT,
            persisted_by TEXT,
            queued_at TEXT,
            retry_count INTEGER DEFAULT 0,
            last_error TEXT,
            last_attempt_at TEXT,
            failed_at TEXT
          );
        `);
        await pgPool.query(`
          CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            order_id TEXT,
            event TEXT,
            meta TEXT,
            created_at TEXT
          );
        `);
      })();
      await Promise.race([
        migrationsPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('pg migrations timeout')), 5000))
      ]);
    } catch (e) {
      // migrations failed or timed out; log and continue so the service can still respond
      console.warn('⚠️ Postgres migrations failed or timed out during startup:', e && e.message ? e.message : e);
    }
  }
  return pgPool;
}

function normalizeOrderRow(row) {
  if (!row) return null;
  const obj = { ...row };
  try { obj.data = row.data ? JSON.parse(row.data) : null; } catch (e) { obj.data = null; }
  return obj;
}

// Public API
export async function appendOrder(order) {
  if (usePg) {
    const pool = await getPgPool();
    const id = order.id || `ord-${Date.now()}-${Math.floor(Math.random()*10000)}`;
    const q = `INSERT INTO orders (id, symbol, status, qty, data, created_at, persisted_at, persisted_by, queued_at, retry_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
    await pool.query(q, [id, order.symbol || null, order.status || null, order.qty || order.filled_qty || null, JSON.stringify(order), order.created_at || order.submitted_at || new Date().toISOString(), order.persisted_at || null, order.persisted_by || null, order.queued_at || null, order.retry_count || 0]);
    return { ...order, id };
  } else {
    const db = await getSqliteDb();
    const id = order.id || `ord-${Date.now()}-${Math.floor(Math.random()*10000)}`;
    const stmt = await db.prepare(`INSERT OR REPLACE INTO orders (id, symbol, status, qty, data, created_at, persisted_at, persisted_by, queued_at, retry_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    await stmt.run(id, order.symbol || null, order.status || null, order.qty || order.filled_qty || null, JSON.stringify(order), order.created_at || order.submitted_at || new Date().toISOString(), order.persisted_at || null, order.persisted_by || null, order.queued_at || null, order.retry_count || 0);
    await stmt.finalize();
    return { ...order, id };
  }
}

export async function updateOrder(order) {
  if (usePg) {
    const pool = await getPgPool();
    const existingRes = await pool.query('SELECT data FROM orders WHERE id = $1', [order.id]);
    const existingData = existingRes.rows && existingRes.rows[0] && existingRes.rows[0].data ? JSON.parse(existingRes.rows[0].data) : {};
    const merged = { ...existingData, ...order };
    const q = `INSERT INTO orders (id, symbol, status, qty, data, created_at, persisted_at, persisted_by, queued_at, retry_count, last_error, last_attempt_at, failed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, status = EXCLUDED.status, retry_count = EXCLUDED.retry_count, last_error = EXCLUDED.last_error, last_attempt_at = EXCLUDED.last_attempt_at, failed_at = EXCLUDED.failed_at`;
    const id = order.id || merged.id || `ord-${Date.now()}-${Math.floor(Math.random()*10000)}`;
    await pool.query(q, [id, merged.symbol || null, merged.status || null, merged.qty || null, JSON.stringify(merged), merged.created_at || new Date().toISOString(), merged.persisted_at || null, merged.persisted_by || null, merged.queued_at || null, merged.retry_count || 0, merged.last_error || null, merged.last_attempt_at || null, merged.failed_at || null]);
    return { ...merged, id };
  } else {
    const db = await getSqliteDb();
    const existing = await db.get(`SELECT * FROM orders WHERE id = ?`, order.id);
    const existingData = existing ? (existing.data ? JSON.parse(existing.data) : {}) : {};
    const mergedData = { ...existingData, ...order };
    const stmt = await db.prepare(`INSERT OR REPLACE INTO orders (id, symbol, status, qty, data, created_at, persisted_at, persisted_by, queued_at, retry_count, last_error, last_attempt_at, failed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const id = order.id || mergedData.id || `ord-${Date.now()}-${Math.floor(Math.random()*10000)}`;
    const symbol = mergedData.symbol || null;
    const status = mergedData.status || null;
    const qty = mergedData.qty || null;
    const data = JSON.stringify(mergedData);
    const created_at = mergedData.created_at || new Date().toISOString();
    const persisted_at = mergedData.persisted_at || null;
    const persisted_by = mergedData.persisted_by || null;
    const queued_at = mergedData.queued_at || null;
    const retry_count = mergedData.retry_count != null ? mergedData.retry_count : 0;
    const last_error = mergedData.last_error || null;
    const last_attempt_at = mergedData.last_attempt_at || null;
    const failed_at = mergedData.failed_at || null;
    await stmt.run(id, symbol, status, qty, data, created_at, persisted_at, persisted_by, queued_at, retry_count, last_error, last_attempt_at, failed_at);
    await stmt.finalize();
    return { ...mergedData, id };
  }
}

export async function getOrderById(id) {
  if (usePg) {
    const pool = await getPgPool();
    const res = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    return normalizeOrderRow(res.rows[0]);
  } else {
    const db = await getSqliteDb();
    const row = await db.get(`SELECT * FROM orders WHERE id = ?`, id);
    return normalizeOrderRow(row);
  }
}

export async function listOrders(filter = {}) {
  if (usePg) {
    const pool = await getPgPool();
    const { status, symbol, from, to, page = 1, limit = 50 } = filter;
    const where = [];
    const params = [];
    let idx = 1;
    if (status) { where.push(`status = $${idx++}`); params.push(status); }
    if (symbol) { where.push(`symbol = $${idx++}`); params.push(symbol); }
    if (from) { where.push(`created_at >= $${idx++}`); params.push(new Date(from).toISOString()); }
    if (to) { where.push(`created_at <= $${idx++}`); params.push(new Date(to).toISOString()); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    const totalRes = await pool.query(`SELECT COUNT(*) as cnt FROM orders ${whereSql}`, params);
    const total = totalRes.rows && totalRes.rows[0] ? Number(totalRes.rows[0].cnt) : 0;
    const rows = await pool.query(`SELECT * FROM orders ${whereSql} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...params, limit, offset]);
    const orders = rows.rows.map(normalizeOrderRow);
    return { total, page: Number(page), limit: Number(limit), orders };
  } else {
    const db = await getSqliteDb();
    const { status, symbol, from, to, page = 1, limit = 50 } = filter;
    const where = [];
    const params = [];
    if (status) { where.push(`status = ?`); params.push(status); }
    if (symbol) { where.push(`symbol = ?`); params.push(symbol); }
    if (from) { where.push(`datetime(created_at) >= datetime(?)`); params.push(new Date(from).toISOString()); }
    if (to) { where.push(`datetime(created_at) <= datetime(?)`); params.push(new Date(to).toISOString()); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    const totalRow = await db.get(`SELECT COUNT(*) as cnt FROM orders ${whereSql}`, ...params);
    const rows = await db.all(`SELECT * FROM orders ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
    const orders = rows.map(normalizeOrderRow);
    return { total: totalRow ? totalRow.cnt : 0, page: Number(page), limit: Number(limit), orders };
  }
}

export async function addAuditLog(orderId, event, meta = {}) {
  if (usePg) {
    const pool = await getPgPool();
    const created_at = new Date().toISOString();
    await pool.query('INSERT INTO audit_logs(order_id, event, meta, created_at) VALUES($1,$2,$3,$4)', [orderId, event, JSON.stringify(meta), created_at]);
    return { orderId, event, meta, created_at };
  } else {
    const db = await getSqliteDb();
    const created_at = new Date().toISOString();
    const stmt = await db.prepare(`INSERT INTO audit_logs (order_id, event, meta, created_at) VALUES (?, ?, ?, ?)`);
    await stmt.run(orderId, event, JSON.stringify(meta), created_at);
    await stmt.finalize();
    return { orderId, event, meta, created_at };
  }
}

export async function listAuditLogs({ page = 1, limit = 100 } = {}) {
  if (usePg) {
    const pool = await getPgPool();
    const offset = (page - 1) * limit;
    const res = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return { total: res.rowCount, page: Number(page), limit: Number(limit), logs: res.rows };
  } else {
    const db = await getSqliteDb();
    const offset = (page - 1) * limit;
    const rows = await db.all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', Number(limit), offset);
    return { total: rows.length, page: Number(page), limit: Number(limit), logs: rows };
  }
}

export async function ping() {
  try {
    if (usePg) {
      const pool = await getPgPool();
      // run a quick SELECT with a timeout so health checks return quickly if DB is slow
      try {
        await Promise.race([
          pool.query('SELECT 1'),
          new Promise((_, rej) => setTimeout(() => rej(new Error('pg ping timeout')), 5000))
        ]);
        return true;
      } catch (e) {
        console.warn('⚠️ Postgres ping failed or timed out:', e && e.message ? e.message : e);
        return false;
      }
    } else {
      const db = await getSqliteDb();
      await db.get('SELECT 1 as v');
      return true;
    }
  } catch (err) {
    return false;
  }
}

export default {
  appendOrder,
  updateOrder,
  getOrderById,
  listOrders,
  addAuditLog,
  ping,
};

