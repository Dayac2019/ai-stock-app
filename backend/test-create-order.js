import alpaca from './alpacaClient.js';

(async () => {
  try {
    console.log('Creating test market order AAPL qty 1...');
    const order = await alpaca.createOrder({ symbol: 'AAPL', qty: 1, side: 'buy', type: 'market', time_in_force: 'day' });
    console.log('Order created:');
    console.log(JSON.stringify(order, null, 2));
  } catch (err) {
    console.error('Alpaca createOrder error:');
    if (err && err.response && err.response.data) {
      console.error('response.data:', JSON.stringify(err.response.data, null, 2));
    }
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
