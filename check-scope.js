import 'dotenv/config';
const { PAYPAL_CLIENT_ID: id, PAYPAL_SECRET: secret, PAYPAL_BASE: base } = process.env;

const res = await fetch(`${base}/v1/oauth2/token`, {
  method: 'POST',
  headers: {
    Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
});
const data = await res.json();
console.log(data.scope?.split(' ').join('\n'));