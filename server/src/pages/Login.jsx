import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { PORTALS, isPortal } from '../portals.js';
import Logo from '../components/Logo.jsx';

export default function Login() {
  const { portal } = useParams();
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isPortal(portal)) return <Navigate to="/" replace />;
  if (user) return <Navigate to={`/${user.role}`} replace />;
  const cfg = PORTALS[portal];

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const u = await login(email, password, portal);
      nav(`/${u.role}`);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-side">
        <Logo light />
        <h2>{cfg.label} Portal</h2>
        <p>{cfg.blurb}</p>
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo-mobile"><Logo /></div>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to the {cfg.label.toLowerCase()} portal</p>
        {error && <div className="alert">{error}</div>}
        <label>Email<input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></label>
        <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/" className="back-link">← Choose another portal</Link>
      </form>
    </div>
  );
}
