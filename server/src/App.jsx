import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { isPortal } from './portals.js';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Shell from './components/Shell.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Insights from './pages/Insights.jsx';
import Users from './pages/Users.jsx';
import Approvals from './pages/Approvals.jsx';
import Profile from './pages/Profile.jsx';
import Properties from './pages/Properties.jsx';
import Leads from './pages/Leads.jsx';
import Followups from './pages/Followups.jsx';
import Clients from './pages/Clients.jsx';
import Operations from './pages/Operations.jsx';
import Deals from './pages/Deals.jsx';
import Reports from './pages/Reports.jsx';
import Connect from './pages/Connect.jsx';
import Intelligence from './pages/Intelligence.jsx';
import SaaS from './pages/SaaS.jsx';
import Partners from './pages/Partners.jsx';
import Marketplace from './pages/Marketplace.jsx';
import PublicMarketplace from './pages/PublicMarketplace.jsx';
import PublicDirectory from './pages/PublicDirectory.jsx';
import PublicPartnerPortal from './pages/PublicPartnerPortal.jsx';

function Guard() {
  const { portal } = useParams();
  const { user, loading } = useAuth();
  if (!isPortal(portal)) return <Navigate to="/" replace />;
  if (loading) return <div className="splash"><div className="spinner" /></div>;
  if (!user) return <Navigate to={`/${portal}/login`} replace />;
  if (user.role !== portal) return <Navigate to={`/${user.role}`} replace />;
  return <Shell />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/market/:slug" element={<PublicMarketplace />} />
      <Route path="/public-marketplace" element={<PublicDirectory />} />
      <Route path="/partner/:slug/:partnerCode" element={<PublicPartnerPortal />} />
      <Route path="/:portal/login" element={<Login />} />
      <Route path="/:portal" element={<Guard />}>
        <Route index element={<Dashboard />} />
        <Route path="insights" element={<Insights />} />
        <Route path="users" element={<Users />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="properties" element={<Properties />} />
        <Route path="leads" element={<Leads />} />
        <Route path="followups" element={<Followups />} />
        <Route path="clients" element={<Clients />} />
        <Route path="operations" element={<Operations />} />
        <Route path="deals" element={<Deals />} />
        <Route path="reports" element={<Reports />} />
        <Route path="connect" element={<Connect />} />
        <Route path="intelligence" element={<Intelligence />} />
        <Route path="saas" element={<SaaS />} />
        <Route path="partners" element={<Partners />} />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="public-marketplace" element={<PublicDirectory />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
