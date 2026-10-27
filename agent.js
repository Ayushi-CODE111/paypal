import 'dotenv/config';
import readline from 'node:readline/promises';
import Groq from 'groq-sdk';
import { createInvoice, sendInvoice, listInvoices, sendReminder } from './paypal.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'openai/gpt-oss-120b'; // if "model not found", copy a current name from Groq's console
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const today = new Date().toISOString().slice(0, 10);

const tools = [
  {
    type: 'function',
    function: {
      name: 'create_invoice',
      description: 'Create and send a PayPal invoice. Only call when you have ALL fields. If any are missing, ask the user instead.',
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
      description: 'List the user\'s recent invoices with their status.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_reminder',
      description: 'Send a payment reminder for an unpaid invoice. Write a polite subject and note yourself, matching the tone the user wants.',
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

async function confirm(text) {
  const a = await rl.question(`\n${text}\nConfirm? (y/n) `);
  return a.trim().toLowerCase().startsWith('y');
}

async function runTool(name, args) {
  if (name === 'create_invoice') {
    const ok = await confirm(
      `INVOICE PREVIEW\n  To: ${args.clientName} <${args.clientEmail}>\n  For: ${args.description}\n  Amount: $${args.amount}\n  Due: ${args.dueDate}`
    );
    if (!ok) return { cancelled: true, message: 'User cancelled.' };
    const id = await createInvoice(args);
    await sendInvoice(id);
    return { success: true, invoiceId: id, status: 'SENT' };
  }
  if (name === 'list_invoices') {
    const data = await listInvoices();
    return (data.items ?? []).map(i => ({
      id: i.id,
      status: i.status,
      due: i.detail?.payment_term?.due_date,
      total: i.amounts?.total?.value ?? i.due_amount?.value,
      client: i.primary_recipients?.[0]?.billing_info?.email_address,
    }));
  }
  if (name === 'send_reminder') {
    const ok = await confirm(
      `REMINDER PREVIEW for ${args.invoiceId}\n  Subject: ${args.subject}\n  Message: ${args.note}`
    );
    if (!ok) return { cancelled: true, message: 'User cancelled.' };
    await sendReminder(args.invoiceId, args.subject, args.note);
    return { success: true };
  }
  return { error: 'unknown tool' };
}

const messages = [
  {
    role: 'system',
    content:
      `You are Get Paid Agent, an assistant that helps freelancers invoice clients and chase payments through PayPal. Today is ${today}. ` +
      'Convert relative dates like "in 7 days" to YYYY-MM-DD. Currency is USD. ' +
      'If the client email, amount, description or due date is missing, ask a short question instead of guessing. ' +
      'Never claim an action happened unless a tool result says success. Keep replies short.',
  },
];

console.log('Get Paid Agent ready. Try: "Invoice Rahul Sharma $50 for logo design, due in 7 days, email sb-v52ub53580137@personal.example.com"\n(type "exit" to quit)\n');

while (true) {
  const input = await rl.question('You: ');
  if (input.trim() === 'exit') break;
  messages.push({ role: 'user', content: input });

  while (true) {
    const res = await groq.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
    });
    const msg = res.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      console.log(`\nAgent: ${msg.content}\n`);
      break;
    }
    for (const call of msg.tool_calls) {
      let result;
      try {
        result = await runTool(call.function.name, JSON.parse(call.function.arguments));
      } catch (e) {
        result = { error: e.message };
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
}
rl.close();