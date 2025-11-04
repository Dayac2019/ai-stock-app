import axios from "axios";

export function startTradeWorker() {
  console.log("🤖 Trade worker started...");
  setInterval(runTradeCycle, 1000 * (process.env.WORKER_INTERVAL || 300));
}

async function runTradeCycle() {
  try {
    console.log("📈 Checking AI predictions...");
    const mockPrediction = Math.random() > 0.5 ? "BUY" : "SELL";
    const symbol = "AAPL";

    console.log(`AI Decision: ${mockPrediction} ${symbol}`);

    // Mock trade action
    await axios.post("http://localhost:4000/api/trade", {
      symbol,
      action: mockPrediction,
      amount: 1
    });

    console.log(`✅ Trade completed for ${symbol}`);
  } catch (error) {
    console.error("❌ Error in trade worker:", error.message);
  }
}
