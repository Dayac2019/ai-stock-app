import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Orders() {
  const [local, setLocal] = useState({ orders: [], total: 0 });
  const [alpaca, setAlpaca] = useState([]);
  const [adminKey, setAdminKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLocal();
  }, []);

  async function fetchLocal() {
    setLoading(true);
    try {
      const res = await axios.get('/api/orders');
      setLocal(res.data);
    } catch (err) {
      setError(err.message || 'Failed to fetch local orders');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAlpaca() {
    setLoading(true);
    try {
      const res = await axios.get('/api/orders/alpaca', { headers: adminKey ? { 'x-admin-key': adminKey } : {} });
      setAlpaca(res.data.orders || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch Alpaca orders (requires admin key)');
    } finally {
      setLoading(false);
    }
  }

  async function cancelOrder(id) {
    if (!window.confirm('Cancel order ' + id + '?')) return;
    setLoading(true);
    try {
      await axios.post(`/api/orders/${id}/cancel`, null, { headers: adminKey ? { 'x-admin-key': adminKey } : {} });
      await fetchLocal();
      await fetchAlpaca();
    } catch (err) {
      setError(err.message || 'Failed to cancel order');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Orders</h2>
      <p>
        <label style={{ marginRight: 8 }}>
          Admin key (optional):
          <input style={{ marginLeft: 6 }} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
        </label>
        <button onClick={fetchLocal} disabled={loading}>Reload local orders</button>
        <button onClick={fetchAlpaca} disabled={loading} style={{ marginLeft: 8 }}>Load Alpaca orders (admin)</button>
      </p>
      {error && <div style={{ color: 'red' }}>{error}</div>}

      <h3>Local persisted orders ({local.total || local.orders.length})</h3>
      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>id</th>
            <th>symbol</th>
            <th>qty</th>
            <th>status</th>
            <th>created_at</th>
            <th>persisted_by</th>
            <th>persisted_at</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          {(local.orders || []).map((o) => (
            <tr key={o.id || o.client_order_id}>
              <td>{o.id || o.client_order_id}</td>
              <td>{o.symbol}</td>
              <td>{o.qty || o.filled_qty}</td>
              <td>{o.status}</td>
              <td>{o.created_at || o.submitted_at}</td>
              <td>{o.persisted_by}</td>
              <td>{o.persisted_at || o.persisted_updated_at}</td>
              <td>
                <button onClick={() => cancelOrder(o.id || o.client_order_id)} disabled={loading}>Cancel</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Alpaca orders (live view)</h3>
      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>id</th>
            <th>symbol</th>
            <th>qty</th>
            <th>status</th>
            <th>created_at</th>
          </tr>
        </thead>
        <tbody>
          {(alpaca || []).map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>{o.symbol}</td>
              <td>{o.qty}</td>
              <td>{o.status}</td>
              <td>{o.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
