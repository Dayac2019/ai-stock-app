import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import botConfig from './botConfig.js';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RISK_PATH = process.env.BOT_RISK_PATH || path.join(__dirname, 'botRisk.json');

function readState() {
  try {
    if (!fs.existsSync(RISK_PATH)) {
      const init = { dailyPnL: 0, lastReset: new Date().toISOString(), lastTradeAt: {}, dailyLossCapHit: false };
      fs.writeFileSync(RISK_PATH, JSON.stringify(init, null, 2));
      return init;
    }
    const raw = fs.readFileSync(RISK_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.warn('⚠️ Failed to read risk state, starting fresh:', err && err.message ? err.message : err);
    return { dailyPnL: 0, lastReset: new Date().toISOString(), lastTradeAt: {}, dailyLossCapHit: false };
  }
}

function writeState(s) {
  fs.writeFileSync(RISK_PATH, JSON.stringify(s, null, 2));
}

function resetIfNeeded(state) {
  const today = new Date().toISOString().slice(0,10);
  const last = state.lastReset ? state.lastReset.slice(0,10) : null;
  if (last !== today) {
    state.dailyPnL = 0;
    state.lastReset = new Date().toISOString();
    state.dailyLossCapHit = false;
  }
}

export function recordPnL(delta) {
  const state = readState();
  resetIfNeeded(state);
  state.dailyPnL = (state.dailyPnL || 0) + Number(delta || 0);
  const cfg = botConfig.getConfig();
  if (state.dailyPnL <= -(Number(cfg.dailyLossCap) || 0)) {
    state.dailyLossCapHit = true;
    // send alert when cap is hit
    sendAlert(`Daily loss cap hit`, `Daily loss cap of ${cfg.dailyLossCap} reached. Current PnL: ${state.dailyPnL}`);
  }
  writeState(state);
  return state;
}

async function sendAlert(subject, text) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log('Alert (no SMTP configured):', subject, text);
    return;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!to) return console.log('No NOTIFY_EMAIL_TO configured; skipping alert');

  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
  try {
    await transporter.sendMail({ from: process.env.NOTIFY_EMAIL_FROM || `no-reply@${host}`, to, subject, text });
    console.log('📧 Alert sent to', to);
  } catch (err) {
    console.error('❌ Failed to send alert email:', err && err.message ? err.message : err);
  }
}

export function canPlaceTrade({ symbol, qty, side }) {
  const state = readState();
  resetIfNeeded(state);
  const cfg = botConfig.getConfig();

  if (state.dailyLossCapHit) return { ok: false, reason: 'daily_loss_cap_exceeded' };

  const maxShares = Number(cfg.perTradeMaxShares || 0);
  if (maxShares > 0 && Number(qty) > maxShares) return { ok: false, reason: 'per_trade_max_exceeded' };

  const now = Date.now();
  const last = state.lastTradeAt && state.lastTradeAt[symbol] ? new Date(state.lastTradeAt[symbol]).getTime() : 0;
  const cooldownMs = (Number(cfg.cooldownSeconds) || 0) * 1000;
  if (cooldownMs > 0 && now - last < cooldownMs) return { ok: false, reason: 'cooldown_active' };

  return { ok: true };
}

export function noteTrade({ symbol }) {
  const state = readState();
  state.lastTradeAt = state.lastTradeAt || {};
  state.lastTradeAt[symbol] = new Date().toISOString();
  writeState(state);
}

export default {
  recordPnL,
  canPlaceTrade,
  noteTrade,
};
