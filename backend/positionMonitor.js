import { getAlpacaClient } from './alpacaClient.js';
import botConfig from './botConfig.js';
import botRisk from './botRisk.js';
import orderStore from './orderStore.js';

export function startPositionMonitor({ intervalSec = 60 } = {}) {
  console.log('🛰️ Position monitor starting...');
  setInterval(runMonitor, 1000 * intervalSec);
}

export async function runMonitor() {
  try {
    const alpaca = getAlpacaClient();
    const positions = await alpaca.getPositions();
    if (!positions || !positions.length) return;
    const cfg = botConfig.getConfig();
    for (const pos of positions) {
      const symbol = pos.symbol;
      const qty = Math.abs(Number(pos.qty || 0));
      const entry = Number(pos.avg_entry_price || pos.avg_entry_price) || 0;
      let currentPrice = null;
      try {
        const latest = await alpaca.getLatestTrade(symbol);
        currentPrice = latest && (latest.Price || latest.price) ? (latest.Price || latest.price) : null;
      } catch (e) {
        console.warn('⚠️ Failed to fetch latest price in monitor', e && e.message ? e.message : e);
      }
      if (!currentPrice) continue;

      const stop = Number(cfg.stopLossPercent || 0);
      const take = Number(cfg.takeProfitPercent || 0);
      const isLong = Number(pos.side && pos.side.toLowerCase && pos.side.toLowerCase() === 'long') || (pos.qty && Number(pos.qty) > 0);
      // compute thresholds
      const stopThreshold = entry * (1 - stop / 100);
      const takeThreshold = entry * (1 + take / 100);

      let shouldExit = false;
      if (stop && currentPrice <= stopThreshold) shouldExit = true;
      if (take && currentPrice >= takeThreshold) shouldExit = true;

      if (shouldExit) {
        console.log(`🚨 Position ${symbol} hit threshold (entry=${entry} current=${currentPrice}); exiting`);
        // place market order to close
        try {
          const side = Number(pos.qty) > 0 ? 'sell' : 'buy';
          const order = await alpaca.createOrder({ symbol, qty, side, type: 'market', time_in_force: 'day' });
          // update local order store with exit
          await orderStore.addAuditLog(order.id || `exit-${Date.now()}`, 'position_exit', { symbol, qty, entry, exit: currentPrice });
          // estimate PnL
          const pnl = (currentPrice - entry) * qty * (side === 'sell' ? 1 : -1);
          botRisk.recordPnL(pnl);
          if (process.env.NOTIFY_ON_EXIT === 'true') {
            console.log(`📧 Notify about exit for ${symbol}`);
          }
        } catch (err) {
          console.error('❌ Failed to exit position', err && err.message ? err.message : err);
        }
      }
    }
  } catch (err) {
    console.error('❌ Position monitor failed:', err && err.message ? err.message : err);
  }
}

export default { startPositionMonitor, runMonitor };
