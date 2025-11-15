import express from 'express';
import request from 'supertest';

// Use Jest ESM unstable mock API to replace the real Alpaca client before
// importing the routes module which imports it.
beforeAll(async () => {
  // mock module path relative to routes import
  jest.unstable_mockModule('../alpacaClient.js', () => ({
    getAlpacaClient: () => ({
      createOrder: async (opts) => ({ id: 'fake-order-1', ...opts, status: 'accepted', created_at: new Date().toISOString() }),
      getOrder: async (id) => ({ id, status: 'accepted', created_at: new Date().toISOString() }),
      cancelOrder: async (id) => ({ id, canceled: true })
    })
  }));
});

test('POST /api/trade creates an order and persists it', async () => {
  // Import routes after module mock is registered
  const routesMod = await import('../routes.js');
  const orderStore = await import('../orderStore.js');

  const app = express();
  app.use(express.json());
  app.use('/api', routesMod.default);

  const res = await request(app).post('/api/trade').send({ symbol: 'TEST', action: 'buy', amount: 1 });
  expect(res.statusCode).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.order).toBeDefined();
  expect(res.body.order.id).toBe('fake-order-1');

  // ensure it's persisted in the local store file (use default store path)
  const listed = await orderStore.listOrders({ page: 1, limit: 20 });
  const found = (listed.orders || []).find((o) => o.id === 'fake-order-1');
  expect(found).toBeDefined();
});
