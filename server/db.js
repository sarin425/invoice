import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Add your Neon pooled connection string to .env.');
}

export const pool = new Pool({ connectionString });

pool.on('error', (error) => {
  console.error('Unexpected Postgres pool error:', error);
});

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    business_name TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    tax_id TEXT NOT NULL DEFAULT '',
    currency_code TEXT NOT NULL DEFAULT 'USD',
    invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
    next_number INTEGER NOT NULL DEFAULT 1,
    default_notes TEXT NOT NULL DEFAULT '',
    logo_data TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

  CREATE TABLE IF NOT EXISTS invoices (
    id BIGSERIAL PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    client_name TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    discount_type TEXT NOT NULL DEFAULT 'percent',
    discount_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS line_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    duration TEXT NOT NULL DEFAULT '',
    editing_type TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
    quantity NUMERIC(14, 4) NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON line_items(invoice_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC);
`;

const SETTINGS_COLUMNS = [
  'business_name', 'owner_name', 'email', 'phone', 'address', 'tax_id',
  'currency_code', 'invoice_prefix', 'next_number', 'default_notes',
  'logo_data', 'updated_at',
];

export async function initDb() {
  await pool.query(SCHEMA_SQL);
}

export async function closeDb() {
  await pool.end();
}

export async function getSettings() {
  const { rows } = await pool.query('SELECT * FROM settings WHERE id = 1');
  return rows[0] ?? null;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getPublicSettings() {
  const settings = await getSettings();
  if (!settings) return null;
  return Object.fromEntries(SETTINGS_COLUMNS.map((key) => [
    key,
    key === 'updated_at' ? toIso(settings[key]) : settings[key],
  ]));
}

export async function updateSettings(patch) {
  const allowed = SETTINGS_COLUMNS.filter((key) => key !== 'updated_at');
  const entries = Object.entries(patch).filter(([key]) => allowed.includes(key));
  if (!entries.length) return getPublicSettings();

  const assignments = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
  const values = entries.map(([, value]) => value);
  await pool.query(
    `UPDATE settings SET ${assignments}, updated_at = NOW() WHERE id = 1`,
    values,
  );
  return getPublicSettings();
}

export async function setPasswordHash(hash) {
  await pool.query('UPDATE settings SET password_hash = $1, updated_at = NOW() WHERE id = 1', [hash]);
}

export function calculateTotals(invoice, items) {
  const subtotal = items.reduce((sum, item) => sum + toNumber(item.rate) * toNumber(item.quantity), 0);
  const discountValue = toNumber(invoice.discount_value);
  const discount = invoice.discount_type === 'percent'
    ? (subtotal * discountValue) / 100
    : discountValue;
  const total = Math.max(0, subtotal - discount);
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    total: round2(total),
  };
}

export function formatInvoiceNumber(prefix, number) {
  return `${prefix}${String(number).padStart(4, '0')}`;
}

export async function reserveInvoiceNumber() {
  const { rows } = await pool.query(`
    UPDATE settings
    SET next_number = next_number + 1
    WHERE id = 1
    RETURNING invoice_prefix, next_number - 1 AS number
  `);
  const row = rows[0];
  if (!row) throw new Error('Settings row is missing.');
  return formatInvoiceNumber(row.invoice_prefix, toNumber(row.number, 1));
}

function normalizeInvoiceRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: toNumber(row.id),
    discount_value: toNumber(row.discount_value),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function normalizeLineItem(row) {
  return {
    ...row,
    rate: toNumber(row.rate),
    quantity: toNumber(row.quantity, 1),
  };
}

export async function listInvoices() {
  const invoiceResult = await pool.query(`
    SELECT * FROM invoices
    ORDER BY invoice_date DESC, id DESC
  `);
  const itemResult = await pool.query(`
    SELECT * FROM line_items
    ORDER BY invoice_id, sort_order, id
  `);

  const itemsByInvoice = new Map();
  for (const row of itemResult.rows) {
    const item = normalizeLineItem(row);
    if (!itemsByInvoice.has(item.invoice_id)) itemsByInvoice.set(item.invoice_id, []);
    itemsByInvoice.get(item.invoice_id).push(item);
  }

  return invoiceResult.rows.map((row) => {
    const invoice = normalizeInvoiceRow(row);
    const items = itemsByInvoice.get(invoice.id) ?? [];
    return {
      ...invoice,
      items,
      item_count: items.length,
      ...calculateTotals(invoice, items),
    };
  });
}

export async function getInvoice(id) {
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId)) return null;

  const invoiceResult = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
  if (!invoiceResult.rows[0]) return null;

  const itemResult = await pool.query(`
    SELECT * FROM line_items
    WHERE invoice_id = $1
    ORDER BY sort_order, id
  `, [invoiceId]);

  const invoice = normalizeInvoiceRow(invoiceResult.rows[0]);
  const items = itemResult.rows.map(normalizeLineItem);
  return { ...invoice, items, ...calculateTotals(invoice, items) };
}

export async function createInvoice(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO invoices (
        invoice_number, client_name, invoice_date, discount_type, discount_value, notes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      data.invoice_number,
      data.client_name,
      data.invoice_date,
      data.discount_type,
      data.discount_value,
      data.notes,
      data.status,
    ]);

    const invoiceId = toNumber(result.rows[0].id);
    for (const [index, item] of data.items.entries()) {
      await client.query(`
        INSERT INTO line_items (
          invoice_id, title, duration, editing_type, description, rate, quantity, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        invoiceId,
        item.title,
        item.duration,
        item.editing_type,
        item.description,
        item.rate,
        item.quantity,
        index,
      ]);
    }

    await client.query('COMMIT');
    return invoiceId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function replaceInvoice(id, data) {
  const invoiceId = Number(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE invoices
      SET invoice_number = $1, client_name = $2, invoice_date = $3,
          discount_type = $4, discount_value = $5, notes = $6,
          status = $7, updated_at = NOW()
      WHERE id = $8
      RETURNING id
    `, [
      data.invoice_number,
      data.client_name,
      data.invoice_date,
      data.discount_type,
      data.discount_value,
      data.notes,
      data.status,
      invoiceId,
    ]);

    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('DELETE FROM line_items WHERE invoice_id = $1', [invoiceId]);
    for (const [index, item] of data.items.entries()) {
      await client.query(`
        INSERT INTO line_items (
          invoice_id, title, duration, editing_type, description, rate, quantity, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        invoiceId,
        item.title,
        item.duration,
        item.editing_type,
        item.description,
        item.rate,
        item.quantity,
        index,
      ]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getInvoice(invoiceId);
}

export async function setInvoiceStatus(id, status) {
  const { rowCount } = await pool.query(`
    UPDATE invoices
    SET status = $1, updated_at = NOW()
    WHERE id = $2
  `, [status, Number(id)]);
  if (!rowCount) return null;
  return getInvoice(Number(id));
}

export async function deleteInvoice(id) {
  const { rowCount } = await pool.query('DELETE FROM invoices WHERE id = $1', [Number(id)]);
  return rowCount > 0;
}

export async function invoiceNumberExists(number, excludeId = null) {
  const params = excludeId === null
    ? [number]
    : [number, Number(excludeId)];
  const where = excludeId === null
    ? 'invoice_number = $1'
    : 'invoice_number = $1 AND id <> $2';
  const { rows } = await pool.query(`SELECT id FROM invoices WHERE ${where} LIMIT 1`, params);
  return rows.length > 0;
}

export async function listWorkHistory() {
  const { rows } = await pool.query(`
    SELECT li.id, li.title, li.duration, li.editing_type, li.description, li.rate, li.quantity,
           i.id AS invoice_id, i.invoice_number, i.client_name, i.invoice_date, i.status
    FROM line_items li
    JOIN invoices i ON i.id = li.invoice_id
    ORDER BY i.invoice_date DESC, i.id DESC, li.sort_order
  `);
  return rows.map((row) => ({
    ...row,
    id: toNumber(row.id),
    invoice_id: toNumber(row.invoice_id),
    rate: toNumber(row.rate),
    quantity: toNumber(row.quantity, 1),
  }));
}

export async function getStats() {
  const invoiceResult = await pool.query(`
    SELECT COUNT(*)::int AS invoice_count,
           COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count
    FROM invoices
  `);
  const itemResult = await pool.query(`
    SELECT COUNT(*)::int AS work_count,
           COALESCE(SUM(rate * quantity), 0) AS revenue
    FROM line_items
  `);

  const stats = {
    ...invoiceResult.rows[0],
    ...itemResult.rows[0],
  };
  return {
    invoice_count: toNumber(stats.invoice_count),
    paid_count: toNumber(stats.paid_count),
    work_count: toNumber(stats.work_count),
    revenue: round2(toNumber(stats.revenue)),
  };
}
