import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Profile() {
  const { user } = useAuth();
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api('/auth/change-password', { method: 'POST', body: f });
      setMsg({ ok: true, text: 'Password updated.' });
      setF({ currentPassword: '', newPassword: '' });
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head"><div><h1>My Profile</h1><p className="muted">Your account details and security.</p></div></div>
      <div className="grid-2">
        <div className="card">
          <h3>Account</h3>
          <dl className="kv">
            <dt>Name</dt><dd>{user.name}</dd>
            <dt>Email</dt><dd>{user.email}</dd>
            <dt>Phone</dt><dd>{user.phone || '—'}</dd>
            <dt>Role</dt><dd><span className={`pill role-${user.role}`}>{user.role}</span></dd>
          </dl>
        </div>
        <form className="card" onSubmit={submit}>
          <h3>Change password</h3>
          {msg && <div className={`alert ${msg.ok ? 'success' : ''}`}>{msg.text}</div>}
          <label>Current password<input type="password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></label>
          <label>New password<input type="password" required minLength={8} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></label>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        </form>
      </div>
    </>
  );
}
