import { useState } from 'react';
import { ImagePlus, LockKeyhole, Save, Trash2 } from 'lucide-react';
import { api } from '../api.js';

const EMPTY_SETTINGS = {
  business_name: '', owner_name: '', email: '', phone: '', address: '',
  tax_id: '', currency_code: 'USD', invoice_prefix: 'INV-', next_number: 1,
  default_notes: '', logo_data: '',
};

export default function Settings({ settings, onSaved, onNotify }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_SETTINGS, ...settings }));
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' });
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const handleLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      onNotify({ type: 'error', message: 'Please choose a PNG or JPEG image.' });
      return;
    }
    if (file.size > 1_500_000) {
      onNotify({ type: 'error', message: 'Logo must be smaller than 1.5 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setField('logo_data', String(reader.result));
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await api.put('/settings', form);
      onSaved(updated);
      onNotify({ type: 'success', message: 'Settings saved.' });
    } catch (error) {
      onNotify({ type: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setChangingPassword(true);
    try {
      await api.post('/settings/password', passwordForm);
      setPasswordForm({ current_password: '', new_password: '' });
      onNotify({ type: 'success', message: 'Password updated.' });
    } catch (error) {
      onNotify({ type: 'error', message: error.message });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="settings-layout">
      <form className="panel" onSubmit={save}>
        <div className="panel__header">
          <div>
            <h2>Business details</h2>
            <p>These details appear at the top of every PDF invoice.</p>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="business_name">Business / brand name</label>
            <input id="business_name" value={form.business_name} onChange={(e) => setField('business_name', e.target.value)} placeholder="Frame Cuts Studio" />
          </div>
          <div className="field">
            <label htmlFor="owner_name">Your name</label>
            <input id="owner_name" value={form.owner_name} onChange={(e) => setField('owner_name', e.target.value)} placeholder="Your full name" />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="+1 555 000 0000" />
          </div>
          <div className="field field--wide">
            <label htmlFor="address">Address</label>
            <textarea id="address" rows="2" value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="City, State, Country" />
          </div>
          <div className="field">
            <label htmlFor="tax_id">Tax ID / GST / VAT (optional)</label>
            <input id="tax_id" value={form.tax_id} onChange={(e) => setField('tax_id', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="currency_code">Currency code</label>
            <input id="currency_code" value={form.currency_code} onChange={(e) => setField('currency_code', e.target.value.toUpperCase())} placeholder="USD, INR, EUR…" maxLength={10} />
          </div>
        </div>

        <div className="section-divider" />
        <h3 className="section-title">Invoice numbering & defaults</h3>
        <div className="form-grid form-grid--three">
          <div className="field">
            <label htmlFor="invoice_prefix">Invoice prefix</label>
            <input id="invoice_prefix" value={form.invoice_prefix} onChange={(e) => setField('invoice_prefix', e.target.value)} placeholder="INV-" />
          </div>
          <div className="field">
            <label htmlFor="next_number">Next invoice number</label>
            <input id="next_number" type="number" min="1" value={form.next_number} onChange={(e) => setField('next_number', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="default_notes">Default notes / thank-you message</label>
            <textarea id="default_notes" rows="2" value={form.default_notes} onChange={(e) => setField('default_notes', e.target.value)} placeholder="Thanks for your business!" />
          </div>
        </div>
        <p className="field-hint">New invoices will be numbered like <strong>{form.invoice_prefix}{String(form.next_number || 1).padStart(4, '0')}</strong>.</p>

        <div className="section-divider" />
        <h3 className="section-title">Logo</h3>
        <div className="logo-field">
          {form.logo_data ? (
            <div className="logo-preview">
              <img src={form.logo_data} alt="Invoice logo preview" />
              <button type="button" className="button button--secondary button--small" onClick={() => setField('logo_data', '')}>
                <Trash2 size={15} /> Remove
              </button>
            </div>
          ) : (
            <label className="upload-box">
              <ImagePlus size={22} />
              <span>Click to upload a PNG or JPEG logo</span>
              <input type="file" accept="image/png,image/jpeg" onChange={handleLogo} hidden />
            </label>
          )}
        </div>

        <div className="editor-actions">
          <button type="submit" className="button button--primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>

      <form className="panel" onSubmit={changePassword}>
        <div className="panel__header">
          <div>
            <h2>Change password</h2>
            <p>Protect your invoices if this app is hosted online.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="current_password">Current password</label>
          <div className="password-field">
            <LockKeyhole size={17} />
            <input id="current_password" type="password" value={passwordForm.current_password} onChange={(e) => setPasswordForm((current) => ({ ...current, current_password: e.target.value }))} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="new_password">New password</label>
          <div className="password-field">
            <LockKeyhole size={17} />
            <input id="new_password" type="password" minLength={6} value={passwordForm.new_password} onChange={(e) => setPasswordForm((current) => ({ ...current, new_password: e.target.value }))} required />
          </div>
        </div>
        <div className="editor-actions">
          <button type="submit" className="button button--secondary" disabled={changingPassword}>
            {changingPassword ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  );
}
