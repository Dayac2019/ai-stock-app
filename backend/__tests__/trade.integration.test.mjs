// ESM integration test for /api/trade
// Uses jest.unstable_mockModule to mock the Alpaca client before importing routes
import express from 'express';
import bodyParser from 'body-parser';
import request from 'supertest';

import { jest } from '@jest/globals';

// Register an ESM mock for the alpacaClient module that routes.js imports.
beforeAll(async () => {
  jest.unstable_mockModule('../alpacaClient.js', () => ({
    getAlpacaClient: () => ({
      createOrder: async (opts) => ({ id: 'mock-order-123', ...opts, status: 'accepted', created_at: new Date().toISOString() }),
      getOrder: async (id) => ({ id, status: 'accepted', created_at: new Date().toISOString() }),
      cancelOrder: async (id) => ({ id, canceled: true })
    })
  }));
});

test('POST /api/trade creates an order and returns persisted result', async () => {
  // Import routes after mock is registered
  const routesModule = await import('../routes.js');
  const orderStore = await import('../orderStore.js');

  const app = express();
  app.use(bodyParser.json());
  app.use('/api', routesModule.default);

  const res = await request(app)
    .post('/api/trade')
    .send({ symbol: 'MOCK', action: 'buy', amount: 1 })
    .set('Accept', 'application/json');

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.order).toBeDefined();
  expect(res.body.order.id).toBe('mock-order-123');

  // Verify it was persisted locally
  const listed = await orderStore.listOrders({ page: 1, limit: 50 });
  const found = (listed.orders || []).find((o) => (o.id === 'mock-order-123'));
  expect(found).toBeDefined();
});
