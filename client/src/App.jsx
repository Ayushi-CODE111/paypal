import { useState, useEffect, useRef } from 'react';
import './App.css';

const API = 'http://localhost:3001/api';
const sessionId = 'web-' + Math.random().toString(36).slice(2, 8);

const SUGGESTIONS = [
  'Invoice Rahul Sharma $50 for logo design, due in 7 days',
  'Which invoices are unpaid?',
  'Send a friendly reminder for my latest invoice',
];

const isPaid = (s) => ['PAID', 'MARKED_AS_PAID'].includes((s || '').toUpperCase());

function StatusBadge({ status }) {
  const s = (status || 'UNKNOWN').toUpperCase();
  return <span className={`badge badge-${s.toLowerCase()}`}><i />{s.replace(/_/g, ' ')}</span>;
}

function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-hint">{hint}</span>
    </div>
  );
}

function Proposal({ pending, onConfirm, onCancel, busy }) {
  const a = pending.args;
  const isInvoice = pending.type === 'create_invoice';
  return (
    <div className="proposal">
      <div className="proposal-head">
        <span className="proposal-icon">{isInvoice ? '🧾' : '✉️'}</span>
        <div>
          <div className="proposal-title">{isInvoice ? 'Invoice ready to send' : 'Reminder ready to send'}</div>
          <div className="proposal-sub">Review the details, then confirm. Nothing is sent until you do.</div>
        </div>
      </div>
      {isInvoice ? (
        <div className="proposal-grid">
          <div><span>To</span><b>{a.clientName}</b></div>
          <div><span>Email</span><b>{a.clientEmail}</b></div>
          <div><span>For</span><b>{a.description}</b></div>
          <div><span>Due</span><b>{a.dueDate}</b></div>
          <div className="proposal-amount"><span>Amount</span><b>${Number(a.amount).toFixed(2)}</b></div>
        </div>
      ) : (
        <div className="proposal-grid">
          <div><span>Invoice</span><b className="mono">{a.invoiceId}</b></div>
          <div><span>Subject</span><b>{a.subject}</b></div>
          <div className="wide"><span>Message</span><b>{a.note}</b></div>
        </div>
      )}
      <div className="proposal-actions">
        <button className="btn btn-confirm" disabled={busy} onClick={onConfirm}>✓ Confirm &amp; send</button>
        <button className="btn btn-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'agent', text: 'Hi! I can create invoices, check who has paid, and send polite reminders. What would you like to do?' },
  ]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loadingTable, setLoadingTable] = useState(true);
  const bottomRef = useRef(null);

  const loadInvoices = async () => {
    setLoadingTable(true);
    try {
      const r = await fetch(`${API}/invoices`);
      const data = await r.json();
      if (Array.isArray(data)) setInvoices(data);
    } catch (e) { console.error(e); }
    setLoadingTable(false);
  };

  useEffect(() => { loadInvoices(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pending, busy]);

  const add = (role, text) => setMessages(m => [...m, { role, text }]);

  const sendText = async (text) => {
    text = text.trim();
    if (!text || busy) return;
    setInput('');
    add('user', text);
    setBusy(true);
    try {
      const r = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await r.json();
      add('agent', data.reply || data.error || 'Something went wrong.');
      setPending(data.pending || null);
      if (/invoice|paid|status|sent|unpaid/i.test(text)) loadInvoices();
    } catch {
      add('agent', 'Could not reach the server. Is it running?');
    }
    setBusy(false);
  };

  const confirm = async (approve) => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, approve }),
      });
      const data = await r.json();
      add('agent', data.reply || data.error || 'Something went wrong.');
      setPending(null);
      loadInvoices();
    } catch {
      add('agent', 'Could not reach the server.');
    }
    setBusy(false);
  };

  const total = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const paidSum = invoices.filter(i => isPaid(i.status)).reduce((s, i) => s + Number(i.total || 0), 0);
  const outstanding = total - paidSum;
  const fmt = (n) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="app">
      <header className="hero">
        <div className="brand">
          <div className="logo">💸</div>
          <div>
            <h1>Get Paid Agent</h1>
            <p>Invoice clients and chase payments with PayPal, in plain English.</p>
          </div>
        </div>
        <span className="pill"><i /> PayPal Sandbox</span>
      </header>

      <div className="stats">
        <Stat label="Total invoiced" value={fmt(total)} hint={`${invoices.length} invoices`} tone="blue" />
        <Stat label="Paid" value={fmt(paidSum)} hint={`${invoices.filter(i => isPaid(i.status)).length} paid`} tone="green" />
        <Stat label="Outstanding" value={fmt(outstanding)} hint="waiting on clients" tone="amber" />
      </div>

      <div className="layout">
        <section className="card chat">
          <div className="card-head">
            <h2>Assistant</h2>
            <span className="online"><i /> online</span>
          </div>

          <div className="messages">
            {messages.map((m, i) => (
              <div key={i} className={`row row-${m.role}`}>
                <div className="avatar">{m.role === 'agent' ? '🤖' : '🙂'}</div>
                <div className={`bubble bubble-${m.role}`}>{m.text}</div>
              </div>
            ))}
            {pending && (
              <Proposal pending={pending} busy={busy}
                onConfirm={() => confirm(true)} onCancel={() => confirm(false)} />
            )}
            {busy && (
              <div className="row row-agent">
                <div className="avatar">🤖</div>
                <div className="bubble bubble-agent dots"><span /><span /><span /></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chips">
            {SUGGESTIONS.map(s => (
              <button key={s} className="chip" disabled={busy} onClick={() => sendText(s)}>{s}</button>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); sendText(input); }} className="composer">
            <input value={input} onChange={e => setInput(e.target.value)}
              placeholder="Type a request…" disabled={busy} />
            <button className="btn btn-send" type="submit" disabled={busy || !input.trim()}>Send ➤</button>
          </form>
        </section>

        <section className="card table-card">
          <div className="card-head">
            <h2>Invoices</h2>
            <button className="btn btn-ghost" onClick={loadInvoices}>↻ Refresh</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Invoice</th><th>Client</th><th>Amount</th><th>Due</th><th>Status</th></tr>
              </thead>
              <tbody>
                {loadingTable && invoices.length === 0 && (
                  <tr><td colSpan="5" className="empty">Loading…</td></tr>
                )}
                {!loadingTable && invoices.length === 0 && (
                  <tr><td colSpan="5" className="empty">No invoices yet. Ask the assistant to create one.</td></tr>
                )}
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="mono">…{inv.id.slice(-9)}</td>
                    <td className="client">{inv.client}</td>
                    <td className="amt">${Number(inv.total).toFixed(2)}</td>
                    <td>{inv.due}</td>
                    <td><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer>Built for the PayPal AI Hackathon · AI proposes, you approve</footer>
    </div>
  );
}