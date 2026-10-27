import 'dotenv/config';
import Groq from 'groq-sdk';
import { createInvoice, sendInvoice, listInvoices, sendReminder } from './paypal.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'openai/gpt-oss-120b';

const tools = [
  {
    type: 'function',
    function: {
      name: 'create_invoice',
      description: 'Propose a PayPal invoice. Only call when you have ALL fields. If any are missing, ask the user instead.',
      parameters: {
        type: 'object',
        properties: {
          clientName: { type: 'string' },
          clientEmail: { type: 'string' },
          description: { type: 'string' },
          amount: { type: 'number', description: 'USD' },
          dueDate: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['clientName', 'clientEmail', 'description', 'amount', 'dueDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_invoices',
      description: "List the user's recent invoices with their status.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_reminder',
      description: 'Propose a payment reminder for an unpaid invoice. Write a polite subject and note matching the tone the user wants.',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' },
          subject: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['invoiceId', 'subject', 'note'],
      },
    },
  },
];

export async function getInvoices() {
  const data = await listInvoices();
  return (data.items ?? []).map(i => ({
    id: i.id,
    status: i.status,
    due: i.detail?.payment_term?.due_date,
    total: i.amounts?.total?.value ?? i.due_amount?.value,
    client: i.primary_recipients?.[0]?.billing_info?.email_address,
  }));
}

const sessions = new Map();

function getSession(id) {
  if (!sessions.has(id)) {
    const today = new Date().toISOString().slice(0, 10);
    sessions.set(id, {
      pending: null,
      messages: [{
        role: 'system',
        content:
          `You are Get Paid Agent, an assistant that helps freelancers invoice clients and chase payments through PayPal. Today is ${today}. ` +
          'Convert relative dates like "in 7 days" to YYYY-MM-DD. Currency is USD. ' +
          'If the client email, amount, description or due date is missing, ask a short question instead of guessing. ' +
          'Creating invoices and sending reminders needs the user to press Confirm in the app, so after you call those tools, just say you prepared it and are waiting for confirmation. ' +
          'Never claim an action happened unless a tool result says success. Keep replies short.',
      }],
    });
  }
  return sessions.get(id);
}

export async function chat(sessionId, userText) {
  const s = getSession(sessionId);
  if (s.pending) {
    return { reply: 'Please confirm or cancel the pending action first.', pending: s.pending };
  }
  s.messages.push({ role: 'user', content: userText });

  for (let step = 0; step < 6; step++) {
    const res = await groq.chat.completions.create({
      model: MODEL,
      messages: s.messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
    });
    const msg = res.choices[0].message;
    s.messages.push(msg);

    if (!msg.tool_calls?.length) {
      return { reply: msg.content, pending: null };
    }

    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}');
      let result;
      try {
        if (call.function.name === 'list_invoices') {
          result = await getInvoices();
        } else if (!s.pending) {
          s.pending = { type: call.function.name, args };
          result = { status: 'awaiting_user_confirmation' };
        } else {
          result = { status: 'skipped', reason: 'another action is already pending' };
        }
      } catch (e) {
        result = { error: e.message };
      }
      s.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }

    if (s.pending) {
      const label = s.pending.type === 'create_invoice'
        ? 'I prepared the invoice below. Please confirm to send it.'
        : 'I drafted the reminder below. Please confirm to send it.';
      s.messages.push({ role: 'assistant', content: label });
      return { reply: label, pending: s.pending };
    }
  }
  return { reply: 'Sorry, I got stuck. Please try again.', pending: null };
}

export async function confirm(sessionId, approve) {
  const s = getSession(sessionId);
  const p = s.pending;
  if (!p) return { reply: 'Nothing to confirm.', pending: null };
  s.pending = null;

  if (!approve) {
    const reply = 'Cancelled. Nothing was sent.';
    s.messages.push({ role: 'assistant', content: reply });
    return { reply, pending: null };
  }

  let reply;
  if (p.type === 'create_invoice') {
    const id = await createInvoice(p.args);
    await sendInvoice(id);
    reply = `Invoice ${id} for $${p.args.amount} was sent to ${p.args.clientName}, due ${p.args.dueDate}.`;
  } else {
    await sendReminder(p.args.invoiceId, p.args.subject, p.args.note);
    reply = `Reminder sent for invoice ${p.args.invoiceId}.`;
  }
  s.messages.push({ role: 'assistant', content: reply });
  return { reply, pending: null };
}
