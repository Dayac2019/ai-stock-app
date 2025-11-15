import { useEffect, useState } from 'react';
import axios from 'axios';

export default function AdminQueue() {
  const [adminKey, setAdminKey] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { fetchQueue(); }, []);

  async function fetchQueue() {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/queue?status=queued', { headers: adminKey ? { 'x-admin-key': adminKey } : {} });
      setOrders(res.data.orders || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch queue');
    } finally { setLoading(false); }
  }

  async function processAll() {
    setLoading(true);
    try {
      const res = await axios.post('/api/admin/queue/process', { maxPerRun: 50 }, { headers: adminKey ? { 'x-admin-key': adminKey } : {} });
      alert('Processed: ' + (res.data.processed || 0));
      await fetchQueue();
    } catch (err) {
      setError(err.message || 'Failed to process queue');
    } finally { setLoading(false); }
  }

  async function processOne(id) {
    setLoading(true);
    try {
      const res = await axios.post(`/api/admin/queue/${id}/process`, null, { headers: adminKey ? { 'x-admin-key': adminKey } : {} });
      alert('Result: ' + JSON.stringify(res.data.result || res.data));
      await fetchQueue();
    } catch (err) {
      setError(err.message || 'Failed to process order');
    } finally { setLoading(false); }
  }

  async function cancelLocal(id) {
    if (!confirm('Cancel queued order ' + id + '?')) return;
    setLoading(true);
    try {
      await axios.post(`/api/orders/${id}/cancel`, null, { headers: adminKey ? { 'x-admin-key': adminKey } : {} });
      await fetchQueue();
    } catch (err) {
      setError(err.message || 'Failed to cancel');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin Queue</h2>
      <p>
        <label style={{ marginRight: 8 }}>
          Admin key:
          <input style={{ marginLeft: 6 }} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
        </label>
        <button onClick={fetchQueue} disabled={loading}>Reload</button>
        <button onClick={processAll} disabled={loading} style={{ marginLeft: 8 }}>Process All</button>
      </p>
      {error && <div style={{ color: 'red' }}>{error}</div>}

      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>id</th>
            <th>symbol</th>
            <th>qty</th>
            <th>status</th>
            <th>queued_at</th>
            <th>retry_count</th>
            <th>last_error</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          {(orders || []).map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>{o.symbol}</td>
              <td>{o.qty}</td>
              <td>{o.status}</td>
              <td>{o.queued_at}</td>
              <td>{o.retry_count}</td>
              <td>{o.last_error}</td>
              <td>
                <button onClick={() => processOne(o.id)} disabled={loading}>Process</button>
                <button onClick={() => cancelLocal(o.id)} disabled={loading} style={{ marginLeft: 8 }}>Cancel</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
