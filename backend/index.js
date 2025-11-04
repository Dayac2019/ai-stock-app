import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import routes from "./routes.js";
import { startTradeWorker } from "./tradeWorker.js";

dotenv.config();
const app = express();

app.use(bodyParser.json());
app.use("/api", routes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Start background worker for auto trades
startTradeWorker();
