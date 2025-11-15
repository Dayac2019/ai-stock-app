import dotenv from 'dotenv';
import Alpaca from '@alpacahq/alpaca-trade-api';

// Load .env early when this module is imported so env vars are available
// for code that calls getAlpacaClient().
dotenv.config();

// Helper: validate required env vars and provide a helpful error.
function validateEnv() {
  const keyId = process.env.ALPACA_API_KEY;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secretKey) {
    throw new Error('Missing Alpaca API credentials. Set ALPACA_API_KEY and ALPACA_SECRET_KEY in your environment or backend/.env');
  }
}

/**
 * Return a fresh Alpaca client instance. Creating a client on-demand avoids
 * cross-request state and reduces issues seen when the SDK is kept as a
 * long-lived import in some environments.
 */
export function getAlpacaClient() {
  validateEnv();
  const keyId = process.env.ALPACA_API_KEY;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  const paper = (process.env.ALPACA_PAPER || 'true') === 'true';
  const baseUrl = process.env.ALPACA_BASE_URL || undefined;

  return new Alpaca({
    keyId,
    secretKey,
    paper,
    baseUrl,
    usePolygon: false,
  });
}

// Default export kept for backwards-compatibility (rare). It creates a
// client on first access.
const defaultExport = getAlpacaClient();
export default defaultExport;
