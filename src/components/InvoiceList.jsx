import { useEffect, useMemo, useState } from 'react';
import { Check, Download, FileText, Pencil, Plus, Search, Trash2, Video } from 'lucide-react';
import { api } from '../api.js';
import { formatDate, money } from '../format.js';

export default function InvoiceList({ currency, reloadKey, onNew, onEdit, onNotify, onChanged }) {
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/invoices'), api.get('/stats')])
      .then(([list, summary]) => {
        if (!active) return;
        setInvoices(list);
        setStats(summary);
      })
      .catch((error) => onNotify({ type: 'error', message: error.message }))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey, onNotify]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return invoices;
    return invoices.filter((invoice) => (
      invoice.client_name.toLowerCase().includes(text)
      || invoice.invoice_number.toLowerCase().includes(text)
    ));
  }, [invoices, query]);

  const markPaid = async (invoice) => {
    try {
      await api.patch(`/invoices/${invoice.id}/status`, { status: 'paid' });
      onChanged();
      onNotify({ type: 'success', message: `${invoice.invoice_number} marked as paid.` });
    } catch (error) {
      onNotify({ type: 'error', message: error.message });
    }
  };

  const remove = async (invoice) => {
    if (!window.confirm(`Delete ${invoice.invoice_number} for ${invoice.client_name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/invoices/${invoice.id}`);
      onChanged();
      onNotify({ type: 'success', message: 'Invoice deleted.' });
    } catch (error) {
      onNotify({ type: 'error', message: error.message });
    }
  };

  return (
    <>
      <section className="stats-grid">
        <div className="stat-card">
          <span className="stat-card__icon stat-card__icon--indigo"><FileText size={20} /></span>
          <div><span>Total invoices</span><strong>{stats?.invoice_count ?? '—'}</strong></div>
        </div>
        <div className="stat-card">
          <span className="stat-card__icon stat-card__icon--violet"><Video size={20} /></span>
          <div><span>Videos billed</span><strong>{stats?.work_count ?? '—'}</strong></div>
        </div>
        <div className="stat-card">
          <span className="stat-card__icon stat-card__icon--green"><Check size={20} /></span>
          <div><span>Marked paid</span><strong>{stats?.paid_count ?? '—'}</strong></div>
        </div>
        <div className="stat-card">
          <span className="stat-card__icon stat-card__icon--amber"><span className="stat-card__symbol">¤</span></span>
          <div><span>Total billed</span><strong>{money(stats?.revenue || 0, currency)}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>All invoices</h2>
            <p>Every bill you've created, in one place.</p>
          </div>
          <div className="panel__tools">
            <div className="search-field">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search client or invoice #"
                aria-label="Search invoices"
              />
            </div>
            <button type="button" className="button button--primary" onClick={onNew}>
              <Plus size={17} /> New invoice
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner" /><p>Loading invoices…</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <FileText size={38} />
            <h3>{query ? 'No matching invoices' : 'No invoices yet'}</h3>
            <p>{query ? 'Try a different search term.' : 'Create your first invoice to get started.'}</p>
            {!query && <button type="button" className="button button--primary" onClick={onNew}><Plus size={17} /> Create invoice</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th className="table-center">Videos</th>
                  <th className="table-right">Total</th>
                  <th>Status</th>
                  <th className="table-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => (
                  <tr key={invoice.id}>
                    <td><strong className="mono">{invoice.invoice_number}</strong></td>
                    <td>{invoice.client_name}</td>
                    <td>{formatDate(invoice.invoice_date)}</td>
                    <td className="table-center">{invoice.item_count}</td>
                    <td className="table-right"><strong>{money(invoice.total, currency)}</strong></td>
                    <td><span className={`badge badge--${invoice.status}`}>{invoice.status}</span></td>
                    <td>
                      <div className="row-actions">
                        <a
                          className="icon-button"
                          href={`/api/invoices/${invoice.id}/pdf?download=1`}
                          title="Download PDF"
                          aria-label={`Download PDF for ${invoice.invoice_number}`}
                        >
                          <Download size={17} />
                        </a>
                        <button type="button" className="icon-button" onClick={() => onEdit(invoice.id)} title="Edit" aria-label="Edit invoice">
                          <Pencil size={16} />
                        </button>
                        {invoice.status !== 'paid' && (
                          <button type="button" className="icon-button icon-button--green" onClick={() => markPaid(invoice)} title="Mark as paid" aria-label="Mark as paid">
                            <Check size={17} />
                          </button>
                        )}
                        <button type="button" className="icon-button icon-button--danger" onClick={() => remove(invoice)} title="Delete" aria-label="Delete invoice">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
