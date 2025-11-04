import Alpaca from '@alpacahq/alpaca-trade-api';

// Initialize Alpaca client using environment variables.
// Set ALPACA_API_KEY and ALPACA_SECRET_KEY in your environment or in a .env file.
const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: (process.env.ALPACA_PAPER || 'true') === 'true',
  usePolygon: false
});

export default alpaca;
