import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import Layout from './components/Layout.jsx';
import InvoiceList from './components/InvoiceList.jsx';
import InvoiceEditor from './components/InvoiceEditor.jsx';
import WorkHistory from './components/WorkHistory.jsx';
import Settings from './components/Settings.jsx';

export default function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [settings, setSettings] = useState(null);
  const [page, setPage] = useState('invoices');
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    api.get('/auth/status')
      .then(async (result) => {
        if (!active) return;
        setAuthenticated(result.authenticated);
        if (result.authenticated) {
          const data = await api.get('/settings');
          if (active) setSettings(data);
        }
      })
      .catch(() => { if (active) setAuthenticated(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthenticated(false);
      setPage('invoices');
    };
    window.addEventListener('invoice:unauthorized', onUnauthorized);
    return () => window.removeEventListener('invoice:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const navigate = (nextPage, id = null) => {
    setPage(nextPage);
    setEditingId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);
  const notify = useCallback((message) => setToast(message), []);

  if (authenticated === null || (authenticated && !settings)) {
    return (
      <div className="boot-screen">
        <div className="spinner" />
        <p>Loading Invoice Studio…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Login
        onLogin={async () => {
          const data = await api.get('/settings');
          setSettings(data);
          setAuthenticated(true);
        }}
      />
    );
  }

  let content;
  if (page === 'editor') {
    content = (
      <InvoiceEditor
        key={editingId ?? 'new'}
        invoiceId={editingId}
        settings={settings}
        onCancel={() => navigate('invoices')}
        onSaved={(id, wasNew) => {
          refresh();
          navigate('invoices');
          notify({ type: 'success', message: wasNew ? 'Invoice created successfully.' : 'Invoice updated successfully.' });
          return id;
        }}
      />
    );
  } else if (page === 'work') {
    content = <WorkHistory currency={settings.currency_code} />;
  } else if (page === 'settings') {
    content = (
      <Settings
        settings={settings}
        onSaved={(updated) => setSettings(updated)}
        onNotify={notify}
      />
    );
  } else {
    content = (
      <InvoiceList
        currency={settings.currency_code}
        reloadKey={reloadKey}
        onNew={() => navigate('editor')}
        onEdit={(id) => navigate('editor', id)}
        onNotify={notify}
        onChanged={refresh}
      />
    );
  }

  return (
    <Layout
      page={page}
      businessName={settings.business_name}
      onNavigate={navigate}
      onLogout={async () => {
        await api.post('/auth/logout');
        setAuthenticated(false);
        setSettings(null);
        setPage('invoices');
      }}
    >
      {content}
      {toast && (
        <div className={`toast toast--${toast.type}`} role="status">
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      )}
    </Layout>
  );
}
