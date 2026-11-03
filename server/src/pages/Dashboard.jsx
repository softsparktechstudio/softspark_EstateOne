import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const ago = (d) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString();
};

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/dashboard').then(setData).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <div className="page-head">
        <div><h1>Hello, {user.name.split(' ')[0]} 👋</h1><p className="muted">Here’s what’s happening today.{user.organization_name ? ` Workspace: ${user.organization_name}` : ''}</p></div>
      </div>
      {error && <div className="alert">{error}</div>}
      {!data && !error && <div className="spinner" />}
      {data && (
        <>
          {data.stats.length > 0 && (
            <div className="dashboard-stat-grid">
              {data.stats.map((s) => (
                <div className="card stat" key={s.label}><span>{s.label}</span><strong>{s.value}</strong></div>
              ))}
            </div>
          )}
          <div className="card">
            <h3>Recent activity</h3>
            {data.activity.length === 0 ? <p className="muted">No activity yet.</p> : (
              <ul className="feed">
                {data.activity.map((a) => (
                  <li key={a.id}>
                    <span className="dot" />
                    <div><strong>{a.name ? `${a.name} · ` : ''}{a.action.replace('_', ' ')}</strong>
                      {a.details && <span className="muted"> — {a.details}</span>}</div>
                    <time>{ago(a.created_at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card promo">
            <h3>Your workspace is ready</h3>
            <p>Use the navigation to manage properties, projects, leads, client profiles, follow-ups, site visits, deals, bookings and downloadable reports.</p>
          </div>
        </>
      )}
    </>
  );
}
