import 'dotenv/config';
const { PAYPAL_CLIENT_ID: id, PAYPAL_SECRET: secret, PAYPAL_BASE: base } = process.env;

async function getToken() {
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));
  return data.access_token;
}

async function api(path, method = 'GET', body) {
  const token = await getToken();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`PayPal ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function createInvoice({ clientName, clientEmail, description, amount, dueDate }) {
  const [given_name, ...rest] = clientName.split(' ');
  const data = await api('/v2/invoicing/invoices', 'POST', {
    detail: {
      currency_code: 'USD',
      note: description,
      payment_term: { due_date: dueDate }, // YYYY-MM-DD
    },
    primary_recipients: [{
      billing_info: {
        name: { given_name, surname: rest.join(' ') || '-' },
        email_address: clientEmail,
      },
    }],
    items: [{
      name: description,
      quantity: '1',
      unit_amount: { currency_code: 'USD', value: Number(amount).toFixed(2) },
    }],
  });
  return data.id ?? data.href.split('/').pop();
}

export const sendInvoice = (invoiceId) =>
  api(`/v2/invoicing/invoices/${invoiceId}/send`, 'POST', { send_to_recipient: true });

export const listInvoices = () =>
  api('/v2/invoicing/invoices?page=1&page_size=20&total_required=true');

export const sendReminder = (invoiceId, subject, note) =>
  api(`/v2/invoicing/invoices/${invoiceId}/remind`, 'POST', { subject, note, send_to_recipient: true });