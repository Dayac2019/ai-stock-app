import express from "express";
import axios from "axios";
const router = express.Router();

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
  res.json({ success: true, message: `Executed ${action} on ${symbol}` });
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

export default router;

