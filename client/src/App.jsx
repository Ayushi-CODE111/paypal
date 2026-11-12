
import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API = import.meta.env.DEV
  ? 'http://localhost:3001/api'
  : '/api';

const sessionId = 'web-' + Math.random().toString(36).slice(2, 8);

const SUGGESTIONS = [
  'Invoice Rahul Sharma $50 for logo design, due in 7 days',
  'Which invoices are unpaid?',
  'Send a friendly reminder for my latest invoice',
];

const isPaid = (status) =>
  ['PAID', 'MARKED_AS_PAID'].includes(
    String(status || '').toUpperCase()
  );

function StatusBadge({ status }) {
  const s = String(status || 'UNKNOWN').toUpperCase();

  return (
    <span className={`badge badge-${s.toLowerCase()}`}>
      <i />
      {s.replace(/_/g, ' ')}
    </span>
  );
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
  const a = pending.args || {};
  const isInvoice = pending.type === 'create_invoice';

  return (
    <div className="proposal">
      <div className="proposal-head">
        <span className="proposal-icon">
          {isInvoice ? '🧾' : '✉️'}
        </span>

        <div>
          <div className="proposal-title">
            {isInvoice
              ? 'Invoice ready to send'
              : 'Reminder ready to send'}
          </div>
          <div className="proposal-sub">
            Review the details, then confirm.
            Nothing is sent until you do.
          </div>
        </div>
      </div>

      {isInvoice ? (
        <div className="proposal-grid">
          <div>
            <span>To</span>
            <b>{a.clientName || 'Not provided'}</b>
          </div>
          <div>
            <span>Email</span>
            <b>{a.clientEmail || 'Not provided'}</b>
          </div>
          <div>
            <span>For</span>
            <b>{a.description || 'Not provided'}</b>
          </div>
          <div>
            <span>Due</span>
            <b>{a.dueDate || 'Not provided'}</b>
          </div>
          <div className="proposal-amount">
            <span>Amount</span>
            <b>${(Number(a.amount) || 0).toFixed(2)}</b>
          </div>
        </div>
      ) : (
        <div className="proposal-grid">
          <div>
            <span>Invoice</span>
            <b className="mono">{a.invoiceId || 'Not provided'}</b>
          </div>
          <div>
            <span>Subject</span>
            <b>{a.subject || 'Payment reminder'}</b>
          </div>
          <div className="wide">
            <span>Message</span>
            <b>{a.note || 'No message provided'}</b>
          </div>
        </div>
      )}

      <div className="proposal-actions">
        <button
          className="btn btn-confirm"
          disabled={busy}
          onClick={onConfirm}
        >
          ✓ Confirm &amp; send
        </button>

        <button
          className="btn btn-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([
    {
      role: 'agent',
      text:
        'Hi! I can create invoices, check who has paid, ' +
        'and send polite reminders. What would you like to do?',
    },
  ]);

  const [input, setInput] = useState('');
  const [pending, setPending] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loadingTable, setLoadingTable] = useState(true);

  const bottomRef = useRef(null);

  // Define add BEFORE useEffect hooks.
  const add = useCallback((role, text) => {
    setMessages((previous) => [
      ...previous,
      { role, text },
    ]);
  }, []);

  // Load invoices from the backend.
  const loadInvoices = useCallback(async () => {
    setLoadingTable(true);

    try {
      const response = await fetch(`${API}/invoices`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        setInvoices(data);
      } else {
        console.error('Invalid invoices response:', data);
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoadingTable(false);
    }
  }, []);

  // Load invoices on the first render.
  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // Listen for server notifications.
  useEffect(() => {
    const es = new EventSource(`${API}/events`);

    es.onmessage = (event) => {
      try {
        const notification = JSON.parse(event.data);

        if (notification.message) {
          add('agent', '🔔 ' + notification.message);
        }

        loadInvoices();
      } catch (error) {
        console.error('Error processing server event:', error);
      }
    };

    es.onerror = (error) => {
      console.error('EventSource connection error:', error);
    };

    return () => {
      es.close();
    };
  }, [add, loadInvoices]);

  // Scroll to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, pending, busy]);

  // Send a message to the backend.
  const sendText = async (text) => {
    const message = text.trim();

    if (!message || busy) return;

    setInput('');
    add('user', message);
    setBusy(true);

    try {
      const response = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      add(
        'agent',
        data.reply || data.error || 'Something went wrong.'
      );

      setPending(data.pending || null);

      if (/invoice|paid|status|sent|unpaid/i.test(message)) {
        await loadInvoices();
      }
    } catch (error) {
      console.error('Chat request failed:', error);

      add(
        'agent',
        'Could not reach the server. Please check that ' +
          'the backend is running.'
      );
    } finally {
      setBusy(false);
    }
  };

  // Confirm or cancel a pending proposal.
  const confirm = async (approve) => {
    if (busy || !pending) return;

    setBusy(true);

    try {
      const response = await fetch(`${API}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          approve,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      add(
        'agent',
        data.reply || data.error || 'Request processed.'
      );

      if (data.error || data.success === false) {
        return;
      }

      setPending(null);
      await loadInvoices();
    } catch (error) {
      console.error('Confirmation failed:', error);

      add(
        'agent',
        'Could not complete the request. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  // Dashboard calculations.
  const total = invoices.reduce(
    (sum, invoice) => sum + (Number(invoice.total) || 0),
    0
  );

  const paidInvoices = invoices.filter((invoice) =>
    isPaid(invoice.status)
  );

  const paidSum = paidInvoices.reduce(
    (sum, invoice) => sum + (Number(invoice.total) || 0),
    0
  );

  const outstanding = total - paidSum;

  const fmt = (amount) =>
    '$' +
    amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="app">
      <header className="hero">
        <div className="brand">
          <div className="logo">💸</div>
          <div>
            <h1>Get Paid Agent</h1>
            <p>
              Invoice clients and chase payments with PayPal,
              in plain English.
            </p>
          </div>
        </div>

        <span className="pill">
          <i /> PayPal Sandbox
        </span>
      </header>

      <div className="stats">
        <Stat
          label="Total invoiced"
          value={fmt(total)}
          hint={`${invoices.length} invoices`}
          tone="blue"
        />
        <Stat
          label="Paid"
          value={fmt(paidSum)}
          hint={`${paidInvoices.length} paid`}
          tone="green"
        />
        <Stat
          label="Outstanding"
          value={fmt(outstanding)}
          hint="waiting on clients"
          tone="amber"
        />
      </div>

      <div className="layout">
        <section className="card chat">
          <div className="card-head">
            <h2>Assistant</h2>
            <span className="online">
              <i /> online
            </span>
          </div>

          <div className="messages">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`row row-${message.role}`}
              >
                <div className="avatar">
                  {message.role === 'agent' ? '🤖' : '🙂'}
                </div>
                <div className={`bubble bubble-${message.role}`}>
                  {message.text}
                </div>
              </div>
            ))}

            {pending && (
              <Proposal
                pending={pending}
                busy={busy}
                onConfirm={() => confirm(true)}
                onCancel={() => confirm(false)}
              />
            )}

            {busy && (
              <div className="row row-agent">
                <div className="avatar">🤖</div>
                <div className="bubble bubble-agent dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div className="chips">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                className="chip"
                disabled={busy}
                onClick={() => sendText(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              sendText(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type a request…"
              disabled={busy}
            />

            <button
              className="btn btn-send"
              type="submit"
              disabled={busy || !input.trim()}
            >
              Send ➤
            </button>
          </form>
        </section>

        <section className="card table-card">
          <div className="card-head">
            <h2>Invoices</h2>
            <button
              className="btn btn-ghost"
              onClick={loadInvoices}
              disabled={loadingTable}
            >
              ↻ Refresh
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {loadingTable && invoices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      Loading…
                    </td>
                  </tr>
                )}

                {!loadingTable && invoices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      No invoices yet. Ask the assistant to create one.
                    </td>
                  </tr>
                )}

                {invoices.map((invoice, index) => (
                  <tr key={invoice.id ?? index}>
                    <td className="mono">
                      …{String(invoice.id ?? '').slice(-9)}
                    </td>
                    <td className="client">
                      {invoice.client || 'Unknown'}
                    </td>
                    <td className="amt">
                      ${(Number(invoice.total) || 0).toFixed(2)}
                    </td>
                    <td>{invoice.due || '—'}</td>
                    <td>
                      <StatusBadge status={invoice.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer>
        Built for the PayPal AI Hackathon · AI proposes, you approve
      </footer>
    </div>
  );
}
