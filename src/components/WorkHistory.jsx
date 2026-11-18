import { useEffect, useMemo, useState } from 'react';
import { Clapperboard, Search } from 'lucide-react';
import { api } from '../api.js';
import { formatDate, money } from '../format.js';

export default function WorkHistory({ currency }) {
  const [work, setWork] = useState([]);
  const [query, setQuery] = useState('');
  const [client, setClient] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/work')
      .then((rows) => { if (active) setWork(rows); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const clients = useMemo(() => [...new Set(work.map((row) => row.client_name))].sort(), [work]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return work.filter((row) => {
      if (client !== 'all' && row.client_name !== client) return false;
      if (!text) return true;
      return [row.title, row.client_name, row.invoice_number, row.editing_type]
        .some((value) => String(value || '').toLowerCase().includes(text));
    });
  }, [work, query, client]);

  const totalAmount = filtered.reduce((sum, row) => sum + row.rate * row.quantity, 0);

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Work history</h2>
          <p>Every video you've billed across all invoices — your complete editing log.</p>
        </div>
        <div className="panel__tools">
          <div className="search-field">
            <Search size={17} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search videos" aria-label="Search work history" />
          </div>
          <select className="select-field" value={client} onChange={(e) => setClient(e.target.value)} aria-label="Filter by client">
            <option value="all">All clients</option>
            {clients.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="form-error form-error--block">{error}</div>}
      {loading ? (
        <div className="empty-state"><div className="spinner" /><p>Loading work history…</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Clapperboard size={38} />
          <h3>{work.length === 0 ? 'No work logged yet' : 'No matching videos'}</h3>
          <p>{work.length === 0 ? 'Videos added to invoices will show up here automatically.' : 'Try changing your search or client filter.'}</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Video / project</th>
                  <th>Client</th>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Length</th>
                  <th>Type</th>
                  <th className="table-right">Rate</th>
                  <th className="table-center">Qty</th>
                  <th className="table-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.title}</strong>
                      {row.description && <span className="cell-subtext">{row.description}</span>}
                    </td>
                    <td>{row.client_name}</td>
                    <td><span className="mono">{row.invoice_number}</span></td>
                    <td>{formatDate(row.invoice_date)}</td>
                    <td>{row.duration || '-'}</td>
                    <td>{row.editing_type || '-'}</td>
                    <td className="table-right">{money(row.rate, currency)}</td>
                    <td className="table-center">{row.quantity}</td>
                    <td className="table-right"><strong>{money(row.rate * row.quantity, currency)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>Showing {filtered.length} of {work.length} videos</span>
            <strong>{money(totalAmount, currency)} billed</strong>
          </div>
        </>
      )}
    </section>
  );
}
