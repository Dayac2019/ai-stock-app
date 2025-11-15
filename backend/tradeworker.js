import axios from "axios";
import { processQueuedOrders } from "./queueProcessor.js";
import botConfig from './botConfig.js';
import { getAlpacaClient } from './alpacaClient.js';
import botRisk from './botRisk.js';

export function startTradeWorker() {
  console.log("🤖 Trade worker started...");
  setInterval(runTradeCycle, 1000 * (process.env.WORKER_INTERVAL || 300));
}

  export async function runTradeCycle() {
  try {
    console.log("📈 Checking AI predictions...");
    const mockPrediction = Math.random() > 0.5 ? "BUY" : "SELL";
    const cfg = botConfig.getConfig();
    const symbol = cfg.symbol || 'AAPL';

    console.log(`AI Decision: ${mockPrediction} ${symbol}`);

    // market hours check
    try {
      const alpaca = getAlpacaClient();
      const clock = await alpaca.getClock();
      if (!clock || !clock.is_open) {
        console.log('⏱ Market is closed; skipping trading cycle');
        return;
      }
    } catch (err) {
      console.warn('⚠️ Failed to fetch market clock; proceeding with caution', err && err.message ? err.message : err);
    }

    // determine amount according to strategy
    let amountToBuy = Number(cfg.amount || 1);
    if (cfg.strategy === 'percent') {
      try {
        const alpaca = getAlpacaClient();
        const account = await alpaca.getAccount();
        const cash = Number(account && account.cash ? account.cash : 0) || 0;
        // get a recent price (try getLatestTrade, fallback to 1)
        let price = 1;
        try {
          const latest = await alpaca.getLatestTrade(symbol);
          price = latest && latest.Price ? latest.Price : (latest && latest.price) || price;
        } catch (e) {
          // non-fatal: will fallback
          console.warn('⚠️ Failed to fetch latest price for sizing, falling back to default price', e && e.message ? e.message : e);
        }
        const budget = cash * (Number(cfg.percent || 1) / 100);
        amountToBuy = Math.max(1, Math.floor(budget / (price || 1)));
      } catch (err) {
        console.warn('⚠️ Failed to compute dynamic amount using Alpaca account, falling back to fixed amount', err && err.message ? err.message : err);
        amountToBuy = Number(cfg.amount || 1);
      }
    }

    // risk checks before sending request
    const can = botRisk.canPlaceTrade({ symbol, qty: amountToBuy, side: mockPrediction });
    if (!can.ok) {
      console.log('⛔ Trade blocked by risk policy:', can.reason);
    } else {
      await axios.post("http://localhost:4000/api/trade", { symbol, action: mockPrediction, amount: amountToBuy, stopLossPercent: cfg.stopLossPercent, takeProfitPercent: cfg.takeProfitPercent }).catch((e) => {
        console.warn('⚠️ Worker trade request failed (will rely on queue):', e && e.message ? e.message : e);
      });
      botRisk.noteTrade({ symbol });
    }

    // After attempting to place any new trades, try processing queued orders locally
    try {
      const r = await processQueuedOrders({ maxPerRun: 10, maxRetries: Number(process.env.WORKER_MAX_RETRIES || 5) });
      if (r && r.processed) console.log(`✅ Queue processor handled ${r.processed} orders`);
    } catch (qpErr) {
      console.error('❌ Queue processing error:', qpErr && qpErr.message ? qpErr.message : qpErr);
    }

    console.log(`✅ Trade completed for ${symbol}`);
  } catch (error) {
    console.error("❌ Error in trade worker:", error.message);
  }
}
