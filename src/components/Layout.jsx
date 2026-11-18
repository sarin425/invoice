import { useState } from 'react';
import { Clapperboard, FileText, History, LogOut, Menu, Plus, Settings, X } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'editor', label: 'New invoice', icon: Plus },
  { id: 'work', label: 'Work history', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Layout({ page, businessName, onNavigate, onLogout, children }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavigate = (id) => {
    onNavigate(id);
    setMenuOpen(false);
  };

  return (
    <div className="app-shell">
      {menuOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
        <div className="brand">
          <div className="brand__mark"><Clapperboard size={22} strokeWidth={2.2} /></div>
          <div>
            <strong>Invoice Studio</strong>
            <span>For video editors</span>
          </div>
          <button className="sidebar__close" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${page === id ? 'nav-item--active' : ''}`}
              onClick={() => handleNavigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__business">
            <span className="sidebar__label">BUSINESS</span>
            <strong>{businessName || 'Set up your business'}</strong>
          </div>
          <button type="button" className="nav-item nav-item--logout" onClick={onLogout}>
            <LogOut size={18} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="icon-button menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="topbar__title">
            <strong>{NAV_ITEMS.find((item) => item.id === page)?.label || 'Invoices'}</strong>
            <span>Manage your video editing invoices and work history</span>
          </div>
          <div className="topbar__actions">
            <button type="button" className="button button--primary button--small" onClick={() => handleNavigate('editor')}>
              <Plus size={16} /> New invoice
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
