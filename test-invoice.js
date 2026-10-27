import { createInvoice, sendInvoice, listInvoices } from './paypal.js';

const id = await createInvoice({
  clientName: 'Rahul Sharma',
  clientEmail: 'sb-v52ub53580137@personal.example.com',
  description: 'Logo design',
  amount: 500,
  dueDate: '2026-11-05',
});
console.log('Draft invoice:', id);

await sendInvoice(id);
console.log('Sent!');

const list = await listInvoices();
console.log(list.items?.map(i => `${i.id} ${i.status}`));