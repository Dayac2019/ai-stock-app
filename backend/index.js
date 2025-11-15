import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cors from "cors";
import routes from "./routes.js";
import { startTradeWorker } from "./tradeWorker.js";
import { startPositionMonitor } from './positionMonitor.js';

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json());
// Add request logging middleware
app.use((req, res, next) => {
  console.log(`📝 ${req.method} ${req.url}`);
  next();
});

app.use("/api", routes);

// Add error handling middleware - must be after routes
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ success: false, message: err.message });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, '0.0.0.0', () => {
  const mask = (s) => {
    try {
      if (!s) return null;
      const str = String(s);
      return '***' + (str.length > 4 ? str.slice(-4) : str);
    } catch (e) {
      return null;
    }
  };

  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('Environment variables (masked):', {
    ALPACA_API_KEY: mask(process.env.ALPACA_API_KEY),
    ALPACA_SECRET_KEY: mask(process.env.ALPACA_SECRET_KEY),
    ALPACA_PAPER: process.env.ALPACA_PAPER,
    ALPACA_BASE_URL: process.env.ALPACA_BASE_URL
  });
});

// Start background worker for auto trades
// Start background worker for auto trades only when explicitly requested.
// This allows running the worker as a separate deployable service.
if ((process.env.RUN_WORKER || 'false') === 'true') {
  startTradeWorker();
  // start monitor if requested
  if ((process.env.RUN_MONITOR || 'true') === 'true') {
    startPositionMonitor({ intervalSec: Number(process.env.MONITOR_INTERVAL || 60) });
  }
}
