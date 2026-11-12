import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat, confirm, getInvoices } from './agent-core.js';
import { verifyWebhook } from './paypal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

// ---- live events to the browser (Server-Sent Events) ----
const clients = new Set();
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach(c => c.write(': ping\n\n')), 25000);
const broadcast = (data) => clients.forEach(c => c.write(`data: ${JSON.stringify(data)}\n\n`));

// ---- PayPal webhook ----
app.post('/api/webhook', async (req, res) => {
  const event = req.body;
  console.log('Webhook received:', event.event_type);
  try {
    if (process.env.PAYPAL_WEBHOOK_ID) {
      const ok = await verifyWebhook(req.headers, event);
      if (!ok) {
        console.warn('Webhook signature check FAILED, ignoring');
        return res.sendStatus(400);
      }
    } else {
      console.warn('PAYPAL_WEBHOOK_ID not set: skipping signature check');
    }
    const invoice = event.resource?.invoice ?? event.resource ?? {};
    const amount = invoice.amount?.value ?? invoice.due_amount?.value;
    broadcast({
      type: event.event_type,
      invoiceId: invoice.id,
      amount,
      message: event.event_type === 'INVOICING.INVOICE.PAID'
        ? `Payment received${amount ? ` ($${amount})` : ''} for invoice ${invoice.id ?? ''}`
        : `Invoice update: ${event.event_type}`,
    });
    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(500);
  }
});

// ---- serve the built React app (for Render) ----
const dist = path.join(__dirname, 'client', 'dist');
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(dist, 'index.html'), (err) => err && next());
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));