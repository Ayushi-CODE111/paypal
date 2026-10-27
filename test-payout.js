import 'dotenv/config';
const { PAYPAL_CLIENT_ID: id, PAYPAL_SECRET: secret, PAYPAL_BASE: base } = process.env;

const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
  method: 'POST',
  headers: {
    Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
});
const { access_token } = await tokenRes.json();

const res = await fetch(`${base}/v1/payments/payouts`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sender_batch_header: {
      sender_batch_id: `batch_${Date.now()}`,
      email_subject: 'You have a payment',
    },
    items: [{
      recipient_type: 'EMAIL',
      receiver: 'PASTE_YOUR_PERSONAL_SANDBOX_EMAIL',
      amount: { value: '5.00', currency: 'USD' },
      note: 'Logo design',
      sender_item_id: `item_${Date.now()}`,
    }],
  }),
});
console.log(res.status, JSON.stringify(await res.json(), null, 2));