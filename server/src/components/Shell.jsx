import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { PORTALS } from '../portals.js';
import Logo from './Logo.jsx';

export default function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const cfg = PORTALS[user.role];
  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const signOut = () => { logout(); nav(`/${user.role}/login`); };

  return (
    <div className="shell">
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Logo light />
        <div className="portal-tag">{cfg.label} Portal</div>
        <nav>
          {cfg.nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === ''} onClick={() => setOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-ico">{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <button className="nav-item logout" onClick={signOut}><span className="nav-ico">⏻</span>Sign out</button>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="burger" aria-label="Menu" onClick={() => setOpen(true)}>☰</button>
          <div className="topbar-title">SoftSpark EstateOne <span>Business Suite</span></div>
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div className="user-meta"><strong>{user.name}</strong><span>{cfg.label}</span>{user.organization_name && <span className="user-company" title={user.organization_name}>⌂ {user.organization_name}</span>}</div>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
