import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { chat, confirm, getInvoices } from './agent-core.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId = 'default', message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    res.json(await chat(sessionId, message));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/confirm', async (req, res) => {
  try {
    const { sessionId = 'default', approve } = req.body;
    res.json(await confirm(sessionId, approve === true));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/invoices', async (req, res) => {
  try {
    res.json(await getInvoices());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
