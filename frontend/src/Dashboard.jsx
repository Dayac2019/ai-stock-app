import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Dashboard() {
  const [suggestions, setSuggestions] = useState([]);
  const [tips, setTips] = useState([]);
  const [symbol, setSymbol] = useState('AAPL');
  const [action, setAction] = useState('buy');
  const [amount, setAmount] = useState(1);
  const [ordersCount, setOrdersCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => { fetchSuggestions(); fetchTips(); fetchOrdersCount(); }, []);

  async function fetchSuggestions() {
    try {
      const res = await axios.get('/api/suggestions');
      setSuggestions(res.data.suggestions || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchTips() {
    try {
      const res = await axios.get('/api/tips');
      setTips(res.data.tips || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchOrdersCount(){
    try{
      const res = await axios.get('/api/orders');
      setOrdersCount((res.data && res.data.total) || (res.data && res.data.orders && res.data.orders.length) || 0);
    }catch(e){console.error(e);}
  }

  async function submitTrade(e){
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try{
      const res = await axios.post('/api/trade', { symbol, action, amount });
      if (res.data.queued) {
        setMessage({ type: 'info', text: 'Order queued (offline or retry).' });
      } else if (res.data.success) {
        setMessage({ type: 'success', text: `Order placed: ${res.data.order && (res.data.order.id || '')}` });
      } else {
        setMessage({ type: 'error', text: 'Trade response: ' + JSON.stringify(res.data) });
      }
      await fetchOrdersCount();
    }catch(err){
      setMessage({ type: 'error', text: (err && err.response && err.response.data && err.response.data.message) || err.message || String(err) });
    }finally{ setLoading(false); }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Trading Dashboard</h2>
      <p>Orders persisted: {ordersCount}</p>

      <section style={{ marginBottom: 20 }}>
        <h3>AI Suggestions</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {suggestions.map((s) => (
            <button key={s.symbol} onClick={() => setSymbol(s.symbol)} style={{ padding: 8 }}>{s.symbol}: {s.reason}</button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3>Quick Trade</h3>
        <form onSubmit={submitTrade}>
          <label>Symbol: <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} /></label>
          <label style={{ marginLeft: 8 }}>Action: <select value={action} onChange={(e) => setAction(e.target.value)}><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
          <label style={{ marginLeft: 8 }}>Qty: <input type="number" min="1" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
          <button type="submit" disabled={loading} style={{ marginLeft: 8 }}>Submit</button>
        </form>
        {message && <div style={{ marginTop: 8, color: message.type === 'error' ? 'red' : message.type === 'success' ? 'green' : 'black' }}>{message.text}</div>}
      </section>

      <section>
        <h3>AI Tips</h3>
        <ul>
          {tips.map((t, idx) => (<li key={idx}>{t}</li>))}
        </ul>
      </section>
    </div>
  );
}
