import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { money, todayISO } from '../format.js';

const EMPTY_ITEM = () => ({
  title: '',
  duration: '',
  editing_type: '',
  description: '',
  rate: '',
  quantity: '1',
});

export default function InvoiceEditor({ invoiceId, settings, onCancel, onSaved }) {
  const isNew = !invoiceId;
  const [form, setForm] = useState(() => ({
    invoice_number: isNew
      ? `${settings.invoice_prefix || 'INV-'}${String(settings.next_number || 1).padStart(4, '0')}`
      : '',
    client_name: '',
    invoice_date: todayISO(),
    discount_type: 'percent',
    discount_value: '0',
    notes: settings.default_notes || '',
    status: 'draft',
    items: [EMPTY_ITEM()],
  }));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return undefined;
    let active = true;
    api.get(`/invoices/${invoiceId}`)
      .then((invoice) => {
        if (!active) return;
        setForm({
          invoice_number: invoice.invoice_number,
          client_name: invoice.client_name,
          invoice_date: invoice.invoice_date,
          discount_type: invoice.discount_type,
          discount_value: String(invoice.discount_value),
          notes: invoice.notes,
          status: invoice.status,
          items: invoice.items.map((item) => ({
            title: item.title,
            duration: item.duration,
            editing_type: item.editing_type,
            description: item.description,
            rate: String(item.rate),
            quantity: String(item.quantity),
          })),
        });
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [invoiceId, isNew]);

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + (Number(item.rate) || 0) * (Number(item.quantity) || 0), 0);
    const value = Number(form.discount_value) || 0;
    const discount = form.discount_type === 'percent' ? (subtotal * value) / 100 : value;
    return { subtotal, discount: Math.min(discount, subtotal), total: Math.max(0, subtotal - discount) };
  }, [form.items, form.discount_type, form.discount_value]);

  const currency = settings?.currency_code || 'USD';

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const setItem = (index, field, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }));
  };

  const submit = async (download) => {
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      discount_value: Number(form.discount_value) || 0,
      items: form.items.map((item) => ({
        ...item,
        rate: Number(item.rate) || 0,
        quantity: Number(item.quantity) || 1,
      })),
    };

    try {
      const saved = isNew
        ? await api.post('/invoices', payload)
        : await api.put(`/invoices/${invoiceId}`, payload);

      if (download) {
        const link = document.createElement('a');
        link.href = `/api/invoices/${saved.id}/pdf?download=1`;
        link.download = `${saved.invoice_number}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      onSaved(saved.id, isNew);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="empty-state"><div className="spinner" /><p>Loading invoice…</p></div>;
  }

  return (
    <div className="editor-layout">
      <form className="editor-main" onSubmit={(event) => { event.preventDefault(); submit(false); }}>
        <button type="button" className="back-link" onClick={onCancel}><ArrowLeft size={16} /> Back to invoices</button>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>{isNew ? 'New invoice' : `Edit ${form.invoice_number}`}</h2>
              <p>Add one row per video. The total updates as you type.</p>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="invoice_number">Invoice number</label>
              <input id="invoice_number" value={form.invoice_number} onChange={(e) => setField('invoice_number', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="client_name">Client name</label>
              <input id="client_name" value={form.client_name} onChange={(e) => setField('client_name', e.target.value)} placeholder="e.g. Acme Media" required />
            </div>
            <div className="field">
              <label htmlFor="invoice_date">Invoice date</label>
              <input id="invoice_date" type="date" value={form.invoice_date} onChange={(e) => setField('invoice_date', e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" value={form.status} onChange={(e) => setField('status', e.target.value)}>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>Videos</h2>
              <p>Title, length, type and rate for each video in this bill.</p>
            </div>
            <button type="button" className="button button--secondary button--small" onClick={() => setForm((current) => ({ ...current, items: [...current.items, EMPTY_ITEM()] }))}>
              <Plus size={16} /> Add video
            </button>
          </div>

          <div className="items-head" aria-hidden="true">
            <span>#</span>
            <span>Video / project</span>
            <span>Length</span>
            <span>Editing type</span>
            <span>Rate</span>
            <span>Qty</span>
            <span>Amount</span>
            <span />
          </div>

          <div className="items-list">
            {form.items.map((item, index) => (
              <div className="item-row" key={index}>
                <span className="item-row__index">{index + 1}</span>
                <div className="item-row__title">
                  <input
                    value={item.title}
                    onChange={(event) => setItem(index, 'title', event.target.value)}
                    placeholder="e.g. YouTube video — Episode 3"
                    aria-label={`Video ${index + 1} title`}
                  />
                  <input
                    className="item-row__description"
                    value={item.description}
                    onChange={(event) => setItem(index, 'description', event.target.value)}
                    placeholder="Details (optional)"
                    aria-label={`Video ${index + 1} details`}
                  />
                </div>
                <input value={item.duration} onChange={(e) => setItem(index, 'duration', e.target.value)} placeholder="8 min" aria-label={`Video ${index + 1} length`} />
                <input list="editing-types" value={item.editing_type} onChange={(e) => setItem(index, 'editing_type', e.target.value)} placeholder="Long-form" aria-label={`Video ${index + 1} editing type`} />
                <input type="number" min="0" step="0.01" value={item.rate} onChange={(e) => setItem(index, 'rate', e.target.value)} aria-label={`Video ${index + 1} rate`} />
                <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => setItem(index, 'quantity', e.target.value)} aria-label={`Video ${index + 1} quantity`} />
                <span className="item-row__amount">{money((Number(item.rate) || 0) * (Number(item.quantity) || 0), currency)}</span>
                <button
                  type="button"
                  className="icon-button icon-button--danger"
                  onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}
                  disabled={form.items.length === 1}
                  aria-label={`Remove video ${index + 1}`}
                  title="Remove video"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <datalist id="editing-types">
            <option value="Long-form" />
            <option value="Shorts" />
            <option value="Reels" />
            <option value="Thumbnail" />
            <option value="Captions" />
            <option value="Color grading" />
            <option value="Podcast" />
          </datalist>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div><h2>Discount & notes</h2><p>Optional finishing touches for this invoice.</p></div>
          </div>
          <div className="form-grid form-grid--three">
            <div className="field">
              <label htmlFor="discount_type">Discount type</label>
              <select id="discount_type" value={form.discount_type} onChange={(e) => setField('discount_type', e.target.value)}>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="discount_value">Discount value</label>
              <input id="discount_value" type="number" min="0" step="0.01" value={form.discount_value} onChange={(e) => setField('discount_value', e.target.value)} />
            </div>
            <div className="field field--wide">
              <label htmlFor="notes">Notes / thank-you message</label>
              <textarea id="notes" rows="3" value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Thanks for the opportunity — it was a pleasure editing this for you!" />
            </div>
          </div>
        </section>

        {error && <div className="form-error form-error--block">{error}</div>}

        <div className="editor-actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="button button--secondary" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : 'Save invoice'}</button>
          <button type="button" className="button button--primary" onClick={() => submit(true)} disabled={saving}><Download size={16} /> {saving ? 'Saving…' : 'Save & download PDF'}</button>
        </div>
      </form>

      <aside className="summary-card">
        <span className="sidebar__label">SUMMARY</span>
        <h3>Invoice total</h3>
        <div className="summary-row"><span>Subtotal</span><strong>{money(totals.subtotal, currency)}</strong></div>
        <div className="summary-row"><span>Discount</span><strong>- {money(totals.discount, currency)}</strong></div>
        <div className="summary-row summary-row--total"><span>Total</span><strong>{money(totals.total, currency)}</strong></div>
        <div className="summary-hint">
          <strong>{form.items.length}</strong> {form.items.length === 1 ? 'video' : 'videos'} in this bill
        </div>
      </aside>
    </div>
  );
}
