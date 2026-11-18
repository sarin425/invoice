import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initDb,
  getInvoice,
  getPublicSettings,
  invoiceNumberExists,
  listInvoices,
  listWorkHistory,
  reserveInvoiceNumber,
  createInvoice,
  replaceInvoice,
  deleteInvoice,
  setInvoiceStatus,
  updateSettings,
  getStats,
} from './db.js';
import {
  checkPassword,
  changePassword,
  clearCookieHeader,
  cookieHeader,
  createSession,
  isAuthenticated,
  requireAuth,
  sessionCookieOptions,
} from './auth.js';
import { buildInvoicePdf } from './pdf.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '..');
const distDir = path.join(projectRoot, 'dist');
const port = Number(process.env.PORT || 3001);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requiredString(value, label, maxLength = 500) {
  const text = String(value ?? '').trim();
  if (!text) throw new HttpError(400, `${label} is required.`);
  if (text.length > maxLength) throw new HttpError(400, `${label} is too long.`);
  return text;
}

function optionalString(value, maxLength = 2000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function nonNegativeNumber(value, label, max = 1000000000) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) {
    throw new HttpError(400, `${label} must be a valid non-negative number.`);
  }
  return number;
}

async function normalizeInvoice(body, { isNew }) {
  const clientName = requiredString(body.client_name, 'Client name', 200);
  const invoiceDate = requiredString(body.invoice_date, 'Invoice date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
    throw new HttpError(400, 'Invoice date must be in YYYY-MM-DD format.');
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) throw new HttpError(400, 'Add at least one video to the invoice.');
  if (rawItems.length > 200) throw new HttpError(400, 'An invoice can have at most 200 videos.');

  const items = rawItems.map((item, index) => {
    const label = `Video ${index + 1}`;
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new HttpError(400, `${label} quantity must be greater than zero.`);
    }
    return {
      title: requiredString(item.title, `${label} title`, 200),
      duration: optionalString(item.duration, 100),
      editing_type: optionalString(item.editing_type, 100),
      description: optionalString(item.description, 1000),
      rate: nonNegativeNumber(item.rate, `${label} rate`),
      quantity,
    };
  });

  const discountType = body.discount_type === 'fixed' ? 'fixed' : 'percent';
  const discountValue = nonNegativeNumber(body.discount_value, 'Discount');
  if (discountType === 'percent' && discountValue > 100) {
    throw new HttpError(400, 'Percentage discount cannot exceed 100.');
  }

  const currentSettings = await getPublicSettings();
  let invoiceNumber = optionalString(body.invoice_number, 100);
  if (isNew && !invoiceNumber) invoiceNumber = await reserveInvoiceNumber();
  if (!invoiceNumber) throw new HttpError(400, 'Invoice number is required.');

  return {
    invoice_number: invoiceNumber,
    client_name: clientName,
    invoice_date: invoiceDate,
    discount_type: discountType,
    discount_value: discountValue,
    notes: optionalString(body.notes, 4000),
    status: ['draft', 'sent', 'paid'].includes(body.status) ? body.status : 'draft',
    items,
    currency_code: currentSettings?.currency_code || 'USD',
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const password = String(req.body?.password ?? '');
  if (!(await checkPassword(password))) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  res.setHeader('Set-Cookie', cookieHeader(createSession(), sessionCookieOptions()));
  return res.json({ authenticated: true });
}));

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearCookieHeader());
  res.json({ authenticated: false });
});

app.get('/api/settings', requireAuth, asyncRoute(async (_req, res) => {
  res.json(await getPublicSettings());
}));

app.put('/api/settings', requireAuth, asyncRoute(async (req, res) => {
  const body = req.body ?? {};
  const numericFields = ['next_number'];
  const patch = {};
  const allowed = [
    'business_name', 'owner_name', 'email', 'phone', 'address', 'tax_id',
    'currency_code', 'invoice_prefix', 'next_number', 'default_notes', 'logo_data',
  ];

  for (const key of allowed) {
    if (!(key in body)) continue;
    if (numericFields.includes(key)) {
      patch[key] = nonNegativeNumber(body[key], key, 999999);
      if (patch[key] < 1) throw new HttpError(400, 'Starting invoice number must be at least 1.');
    } else if (key === 'logo_data') {
      const value = String(body[key] ?? '');
      if (value && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) {
        throw new HttpError(400, 'Logo must be a PNG or JPEG image.');
      }
      if (value.length > 3_000_000) throw new HttpError(400, 'Logo is too large. Use a smaller image.');
      patch[key] = value;
    } else {
      patch[key] = optionalString(body[key], key === 'default_notes' ? 4000 : 300);
    }
  }

  const currentSettings = await getPublicSettings();
  patch.currency_code = (patch.currency_code || currentSettings?.currency_code || 'USD').toUpperCase().slice(0, 10);
  res.json(await updateSettings(patch));
}));

app.post('/api/settings/password', requireAuth, asyncRoute(async (req, res) => {
  const current = String(req.body?.current_password ?? '');
  const next = String(req.body?.new_password ?? '');
  if (!(await checkPassword(current))) throw new HttpError(400, 'Current password is incorrect.');
  if (next.length < 6) throw new HttpError(400, 'New password must be at least 6 characters long.');
  await changePassword(next);
  res.json({ ok: true });
}));

app.get('/api/invoices', requireAuth, asyncRoute(async (_req, res) => {
  res.json(await listInvoices());
}));

app.get('/api/invoices/:id', requireAuth, asyncRoute(async (req, res) => {
  const invoice = await getInvoice(Number(req.params.id));
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  res.json(invoice);
}));

app.post('/api/invoices', requireAuth, asyncRoute(async (req, res) => {
  const data = await normalizeInvoice(req.body ?? {}, { isNew: true });
  if (await invoiceNumberExists(data.invoice_number)) {
    throw new HttpError(409, `Invoice number ${data.invoice_number} is already used.`);
  }
  const id = await createInvoice(data);
  res.status(201).json(await getInvoice(id));
}));

app.put('/api/invoices/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!await getInvoice(id)) throw new HttpError(404, 'Invoice not found.');
  const data = await normalizeInvoice(req.body ?? {}, { isNew: false });
  if (await invoiceNumberExists(data.invoice_number, id)) {
    throw new HttpError(409, `Invoice number ${data.invoice_number} is already used.`);
  }
  res.json(await replaceInvoice(id, data));
}));

app.patch('/api/invoices/:id/status', requireAuth, asyncRoute(async (req, res) => {
  const status = req.body?.status;
  if (!['draft', 'sent', 'paid'].includes(status)) throw new HttpError(400, 'Invalid status.');
  const invoice = await setInvoiceStatus(Number(req.params.id), status);
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  res.json(invoice);
}));

app.delete('/api/invoices/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!await deleteInvoice(Number(req.params.id))) throw new HttpError(404, 'Invoice not found.');
  res.status(204).end();
}));

app.get('/api/invoices/:id/pdf', requireAuth, asyncRoute(async (req, res) => {
  const invoice = await getInvoice(Number(req.params.id));
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  const settings = await getPublicSettings();
  const pdf = await buildInvoicePdf(invoice, settings);
  const safeName = invoice.invoice_number.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}.pdf"`);
  res.setHeader('Content-Length', pdf.length);
  res.send(pdf);
}));

app.get('/api/work', requireAuth, asyncRoute(async (_req, res) => {
  res.json(await listWorkHistory());
}));

app.get('/api/stats', requireAuth, asyncRoute(async (_req, res) => {
  res.json(await getStats());
}));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  const status = error.status || 500;
  if (status === 500) console.error(error);
  return res.status(status).json({ error: error.message || 'Something went wrong.' });
});

await initDb();

app.listen(port, () => {
  console.log(`Invoice Studio API running on http://localhost:${port}`);
  if (!process.env.APP_PASSWORD && !process.env.SETTINGS_PASSWORD_SET) {
    console.log('Using default password "change-me-please" — set APP_PASSWORD in .env to change it.');
  }
});
