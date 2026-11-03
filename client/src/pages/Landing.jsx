import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PORTALS } from '../portals.js';
import Logo from '../components/Logo.jsx';
import { api } from '../api.js';
import { createPortal } from 'react-dom';

const joinInitial = { name: '', email: '', phone: '', password: '', role: 'client', organization_id: '' };
const companyInitial = { company_name: '', company_email: '', company_phone: '', website: '', name: '', email: '', phone: '', password: '' };
export default function Landing() {
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(searchParams.get('register') === '1');
  const [mode, setMode] = useState('join');
  const [form, setForm] = useState(joinInitial);
  const [companyForm, setCompanyForm] = useState(companyInitial);
  const [organizations, setOrganizations] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/organizations').then((d) => {
      const list = d.organizations || [];
      setOrganizations(list);
      const slug = searchParams.get('company');
      const selected = list.find((o) => o.slug === slug);
      if (selected) setForm((v) => ({ ...v, organization_id: String(selected.id) }));
      else if (list.length === 1) setForm((v) => ({ ...v, organization_id: String(list[0].id) }));
    }).catch((e) => setError(e.message));
  }, [searchParams]);

  const updateJoin = (key) => (e) => setForm((v) => ({ ...v, [key]: e.target.value }));
  const updateCompany = (key) => (e) => setCompanyForm((v) => ({ ...v, [key]: e.target.value }));
  const openRegistration = () => { setOpen(true); setError(''); setMessage(''); };

  async function register(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const endpoint = mode === 'new' ? '/auth/register-company' : '/auth/register';
      const body = mode === 'new' ? companyForm : { ...form, organization_id: Number(form.organization_id) };
      const result = await api(endpoint, { method: 'POST', body });
      setMessage(result.message || 'Registration submitted. Please wait for approval.');
      if (mode === 'new') setCompanyForm(companyInitial); else setForm(joinInitial);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="landing">
    <header className="landing-head"><Logo /><nav className="landing-actions"><Link className="btn-ghost" to="/public-marketplace">Real Estate Market</Link><button className="btn" onClick={openRegistration}>Registration</button></nav></header>
    <section className="hero"><h1>Real estate CRM, <span>made simple.</span></h1><p>One connected workspace for property inventory, customer relationships, sales and growth.</p><p><Link className="btn" to="/public-marketplace">Explore Real Estate Market →</Link></p></section>
    <section className="portal-grid">{Object.entries(PORTALS).filter(([key]) => key !== 'client').map(([key, p]) => <Link key={key} to={`/${key}/login`} className="portal-card"><div className="portal-ico">{p.icon}</div><h3>{p.label} Portal</h3><p>{p.blurb}</p><span className="portal-go">Sign in →</span></Link>)}</section>
    <footer className="landing-foot">© {new Date().getFullYear()} SoftSpark EstateOne. All rights reserved.</footer>
    {open && createPortal(<div className="modal-back" onClick={() => setOpen(false)}><form className="modal" onSubmit={register} onClick={(e) => e.stopPropagation()}>
      <div className="row-between"><h2>{mode === 'new' ? 'Register your company' : 'Join a company'}</h2><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>✕</button></div>
      <div className="two" role="group" aria-label="Registration type">
        <button type="button" className={mode === 'join' ? 'btn' : 'btn-ghost'} onClick={() => { setMode('join'); setError(''); setMessage(''); }}>Join Existing Company</button>
        <button type="button" className={mode === 'new' ? 'btn' : 'btn-ghost'} onClick={() => { setMode('new'); setError(''); setMessage(''); }}>Register New Company</button>
      </div>
      <p className="muted">{mode === 'new' ? 'Register your real-estate business and its first Admin account. SoftSpark EstateOne Super Admin must approve the company before its workspace is activated.' : 'Choose your account type and the company you want to join. Your request will be reviewed by that company’s Admin.'}</p>
      {error && <div className="alert">{error}</div>}{message && <div className="alert success">{message}</div>}
      {mode === 'new' ? <>
        <h3>Company details</h3>
        <label>Company / Organization name<input required maxLength="180" value={companyForm.company_name} onChange={updateCompany('company_name')} placeholder="e.g. PQR Realty" /></label>
        <div className="two"><label>Company email<input type="email" value={companyForm.company_email} onChange={updateCompany('company_email')} placeholder="info@company.com" /></label><label>Company mobile<input value={companyForm.company_phone} onChange={updateCompany('company_phone')} placeholder="Company contact number" /></label></div>
        <label>Website (optional)<input type="url" value={companyForm.website} onChange={updateCompany('website')} placeholder="https://www.example.com" /></label>
        <h3>First Admin account</h3>
        <label>Admin full name<input required value={companyForm.name} onChange={updateCompany('name')} /></label>
        <div className="two"><label>Admin email<input required type="email" value={companyForm.email} onChange={updateCompany('email')} /></label><label>Admin mobile<input required value={companyForm.phone} onChange={updateCompany('phone')} /></label></div>
        <label>Password (minimum 8 characters)<input required type="password" minLength="8" value={companyForm.password} onChange={updateCompany('password')} /></label>
        <p className="muted small">After approval, this account becomes the company Admin and receives access to its own workspace. A 14-day Starter trial is prepared for the new company.</p>
      </> : <>
        <label>Full name<input required value={form.name} onChange={updateJoin('name')} /></label>
        <div className="two"><label>Email<input required type="email" value={form.email} onChange={updateJoin('email')} /></label><label>Mobile number<input required value={form.phone} onChange={updateJoin('phone')} /></label></div>
        <div className="two"><label>Account type<select required value={form.role} onChange={updateJoin('role')}><option value="client">Client</option><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
          <label>Company / Organization<select required value={form.organization_id} onChange={updateJoin('organization_id')}><option value="">Select company</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label></div>
        <p className="muted small">{form.role === 'admin' ? 'Admin requests are reviewed by SoftSpark EstateOne Super Admin.' : 'Your selected company Admin will review this request.'}</p>
        <label>Password (minimum 8 characters)<input required type="password" minLength="8" value={form.password} onChange={updateJoin('password')} /></label>
      </>}
      <div className="modal-actions"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Close</button><button className="btn" disabled={busy}>{busy ? 'Submitting…' : mode === 'new' ? 'Submit company for approval' : 'Submit registration'}</button></div>
    </form></div>, document.body)}
  </div>;
}
