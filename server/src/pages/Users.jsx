import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { createPortal } from 'react-dom';

const CREATABLE = { superadmin: ['admin', 'staff', 'client'], admin: ['staff', 'client'], staff: [] };
const empty = { name: '', email: '', phone: '', password: '', role: 'client', organization_id: '' };

export default function Users() {
  const { user } = useAuth();
  const canCreate = CREATABLE[user.role] || [];
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ ...empty, role: canCreate[canCreate.length - 1] || 'client' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (role) p.set('role', role);
    api(`/users?${p}`).then((d) => setUsers(d.users)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [q, role]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (user.role === 'superadmin') api('/saas/organizations').then(d=>setOrganizations(d.organizations||[])).catch(e=>setError(e.message)); }, [user.role]);

  const toggle = async (u) => {
    try {
      const d = await api(`/users/${u.id}/active`, { method: 'PATCH' });
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, ...d.user, organization_name: x.organization_name } : x)));
    } catch (e) { setError(e.message); }
  };

  const create = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api('/users', { method: 'POST', body: form });
      setModal(false); setForm({ ...empty, role: form.role }); load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const filterRoles = user.role === 'staff' ? [] : CREATABLE[user.role];

  return (
    <>
      <div className="page-head">
        <div><h1>{user.role === 'staff' ? 'Clients' : 'People'}</h1><p className="muted">{users.length} record{users.length === 1 ? '' : 's'}</p></div>
        {canCreate.length > 0 && <button className="btn" onClick={() => { setError(''); setModal(true); }}>+ Add user</button>}
      </div>

      {error && !modal && <div className="alert">{error}</div>}

      <div className="toolbar">
        <input className="search" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        {filterRoles.length > 0 && (
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {filterRoles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      <div className="card table-card">
        {loading ? <div className="spinner" /> : users.length === 0 ? <p className="muted pad">No users found.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Role</th>{user.role === 'superadmin' && <th>Company</th>}<th>Phone</th><th>Status</th>{canCreate.length > 0 && <th />}</tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td data-l="Name"><strong>{u.name}</strong><div className="muted small">{u.email}</div></td>
                    <td data-l="Role"><span className={`pill role-${u.role}`}>{u.role}</span></td>
                    {user.role === 'superadmin' && <td data-l="Company">{u.organization_name || 'Platform'}</td>}
                    <td data-l="Phone">{u.phone || '—'}</td>
                    <td data-l="Status"><span className={`pill ${u.approval_status === 'pending' ? 'warn' : u.is_active ? 'ok' : 'off'}`}>{u.approval_status === 'pending' ? 'Pending approval' : u.approval_status === 'rejected' ? 'Rejected' : u.is_active ? 'Active' : 'Disabled'}</span></td>
                    {canCreate.length > 0 && (
                      <td className="right"><button className="btn-ghost" onClick={() => toggle(u)}>{u.is_active ? 'Disable' : 'Enable'}</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && createPortal(<div className="modal-back" onClick={() => setModal(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={create}>
            <h2>Add user</h2>
            {error && <div className="alert">{error}</div>}
            <label>Full name<input required value={form.name} onChange={set('name')} /></label>
            <label>Email<input type="email" required value={form.email} onChange={set('email')} /></label>
            <div className="two">
              <label>Phone<input value={form.phone} onChange={set('phone')} /></label>
              <label>Role<select value={form.role} onChange={set('role')}>{canCreate.map((r) => <option key={r}>{r}</option>)}</select></label>
            </div>
             {user.role === 'superadmin' && form.role === 'admin' && <label>Assign company workspace<select required value={form.organization_id} onChange={set('organization_id')}><option value="">Select company</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
            <label>Temporary password<input type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="Min 8 characters" /></label>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Create user'}</button>
            </div>
          </form>
        </div>, document.body)}
    </>
  );
}
