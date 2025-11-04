# ai-stock-app
AI stock app that allows you to buy and trade stocks and gives suggestions and automated trades.

## Adding your Alpaca API key

This project expects Alpaca credentials to be provided via environment variables. The backend already loads a `.env` file using `dotenv` (see `backend/index.js`).

Recommended variables (see `.env.example`):

- `ALPACA_API_KEY` — your Alpaca API key
- `ALPACA_SECRET_KEY` — your Alpaca secret key
- `ALPACA_PAPER` — `true` for paper trading, `false` for live (default: `true`)

Two easy ways to provide them locally:

1) Use a `.env` file (recommended for development)

	 - Copy `.env.example` to `.env` and fill in your keys.
	 - The repository's `.gitignore` already excludes `.env`.

2) Or set environment variables in PowerShell (temporary for the session):

```powershell
$env:ALPACA_API_KEY = 'your_alpaca_api_key_here'
$env:ALPACA_SECRET_KEY = 'your_alpaca_secret_key_here'
$env:ALPACA_PAPER = 'true'
node backend/index.js
```

Or set them permanently in Windows system/user env variables via Settings > Environment Variables.

## Using the Alpaca client in the backend

A helper client has been added at `backend/alpacaClient.js`. Example usage in your backend code:

```javascript
import alpaca from './alpacaClient.js';

// create a simple market order
await alpaca.createOrder({
	symbol: 'AAPL',
	qty: 1,
	side: 'buy',
	type: 'market',
	time_in_force: 'day'
});
```

Important: never commit your real API keys to source control. Use `.env` for local development and a secure secret store (CI secrets, cloud key vault) for production.

