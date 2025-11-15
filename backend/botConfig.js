import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.BOT_CONFIG_PATH || path.join(__dirname, 'botConfig.json');

const DEFAULT = {
  strategy: 'fixed', // 'fixed' or 'percent'
  amount: 1, // fixed shares when strategy is 'fixed'
  percent: 1, // percent of available cash to use when strategy is 'percent'
  symbol: 'AAPL',
  // Risk controls
  dailyLossCap: 1000, // USD daily loss cap (when exceeded, trading paused)
  perTradeMaxShares: 100, // absolute cap per trade
  cooldownSeconds: 300, // cooldown per-symbol between trades
  stopLossPercent: 2, // default stop-loss percent
  takeProfitPercent: 4 // default take-profit percent
};

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT, null, 2));
      return { ...DEFAULT };
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return { ...DEFAULT, ...parsed };
  } catch (err) {
    console.warn('⚠️ Failed reading bot config, using defaults:', err && err.message ? err.message : err);
    return { ...DEFAULT };
  }
}

function writeConfig(cfg) {
  const merged = { ...DEFAULT, ...cfg };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

export function getConfig() {
  return readConfig();
}

export function updateConfig(partial) {
  const cur = readConfig();
  const next = { ...cur, ...partial };
  return writeConfig(next);
}

export default {
  getConfig,
  updateConfig,
};
