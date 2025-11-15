import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './App.css'
import Orders from './Orders';
import AdminQueue from './AdminQueue';
import Dashboard from './Dashboard';

function Home() {
  return (
    <div style={{ padding: 20 }}>
      <h1>AI Stock App</h1>
      <p>Use the app to place paper trades and view order history.</p>
      <p>
        <Link to="/orders">View Orders</Link>
      </p>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/admin" element={<AdminQueue />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
