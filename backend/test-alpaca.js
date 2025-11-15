import { getAlpacaClient } from './alpacaClient.js';

(async () => {
  try {
    console.log('Calling alpaca.getOrders()...');
    const alpaca = getAlpacaClient();
    const orders = await alpaca.getOrders();
    console.log('Got', orders && orders.length, 'orders');
    console.log(JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('Alpaca getOrders error:');
    if (err && err.response && err.response.data) {
      console.error('response.data:', JSON.stringify(err.response.data, null, 2));
    }
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
