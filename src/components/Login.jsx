import { useState } from 'react';
import { Clapperboard, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/login', { password });
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__icon"><Clapperboard size={28} /></div>
        <h1>Invoice Studio</h1>
        <p>Sign in to create invoices and manage your editing work.</p>

        <form onSubmit={submit}>
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <LockKeyhole size={17} />
            <input
              id="password"
              type={visible ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoFocus
              required
            />
            <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Hide password' : 'Show password'}>
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="button button--primary button--block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-card__hint">Password is set in the server's <code>.env</code> file. You can change it in Settings.</p>
      </div>
    </div>
  );
}
