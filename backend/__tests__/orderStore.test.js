import fs from 'fs';
import os from 'os';
import path from 'path';

describe('orderStore', () => {
  const tempFile = path.join(os.tmpdir(), `orders_test_${Date.now()}.json`);

  beforeAll(() => {
    process.env.ORDER_STORE_PATH = tempFile;
  });

  afterAll(() => {
    try { fs.unlinkSync(tempFile); } catch (e) {}
  });

  test('append, list and update order', async () => {
    const store = await import('../orderStore.js');
    const sample = { id: 'test-1', symbol: 'AAA', qty: 1, status: 'accepted', created_at: new Date().toISOString() };
    await store.appendOrder(sample);
    const listRes = await store.listOrders({ page: 1, limit: 10 });
    expect(listRes.total).toBeGreaterThanOrEqual(1);
    const fetched = (listRes.orders || []).find((o) => o.id === sample.id);
    expect(fetched).toBeDefined();

    // update
    sample.status = 'canceled';
    await store.updateOrder(sample);
    const list2 = await store.listOrders({ page: 1, limit: 10 });
    const updated = (list2.orders || []).find((o) => o.id === sample.id);
    expect(updated.status).toBe('canceled');
  });
});
