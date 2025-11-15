import express from 'express';

const app = express();
const PORT = 4000;

app.get('/test', (req, res) => {
  res.json({ success: true, message: 'Test endpoint working' });
});

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  
  // Try to connect after 1 second
  setTimeout(async () => {
    try {
      const response = await fetch(`http://localhost:${PORT}/test`);
      const data = await response.json();
      console.log('Test request successful:', data);
    } catch (error) {
      console.error('Error making test request:', error);
    }
  }, 1000);
});