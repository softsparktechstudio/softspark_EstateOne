import { useEffect, useState } from 'react';
import { api } from '../api.js';

const channels = [
  { name: 'Facebook & Instagram Lead Ads', group: 'Social lead capture', detail: 'Receive Meta Lead Ads through a verified webhook and create CRM leads.', state: 'Available', key: 'meta' },
  { name: 'WhatsApp Business Platform', group: 'Customer messaging', detail: 'Send text messages through the official WhatsApp Cloud API after configuring server credentials.', state: 'Configure credentials', key: 'whatsapp' },
  { name: 'Email notifications', group: 'Customer messaging', detail: 'SMTP/provider connection for enquiry acknowledgements, invoices and reminders.', state: 'Connector setup required' },
  { name: 'Website enquiry forms', group: 'Lead capture', detail: 'Connect your website forms to the SoftSpark EstateOne lead pipeline.', state: 'Available through CRM API/manual capture' },
  { name: 'Other social platforms', group: 'Lead capture', detail: 'Import lead exports as CSV; native platform connectors can be added separately.', state: 'CSV import available' },
];

export default function Connect() {
  const [meta, setMeta] = useState(null);
  const [whatsapp, setWhatsapp] = useState(null);
  const [error, setError] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [sendState, setSendState] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { api('/social/connections').then((d) => { setMeta(d.connections?.[0]); setWhatsapp(d.connections?.[1]); }).catch((e) => setError(e.message)); }, []);
  async function sendWhatsApp(e) { e.preventDefault(); setSending(true); setSendState(''); setError(''); try { await api('/saas/whatsapp/send', { method: 'POST', body: { to, message } }); setSendState('Message submitted to WhatsApp. Delivery status will be reported by the provider webhook.'); setMessage(''); } catch (e) { setError(e.message); } finally { setSending(false); } }
  return <>
    <div className="page-head"><div><div className="eyebrow">SoftSpark CONNECT</div><h1>Channels & integrations</h1><p className="muted">Bring marketing enquiries and customer conversations into one operating workflow.</p></div></div>
    {error && <div className="alert">{error}</div>}
    <div className="connect-grid">{channels.map((c) => <article className="card connect-card" key={c.name}><div className="row-between"><span className="connect-icon">{c.group === 'Social lead capture' ? '◎' : c.group === 'Customer messaging' ? '✉' : '↗'}</span><span className={`pill ${c.key ? ((c.key === 'meta' ? meta?.configured : whatsapp?.configured) ? 'ok' : 'off') : ''}`}>{c.key === 'meta' ? (meta?.configured ? 'Configured' : 'Needs credentials') : c.key === 'whatsapp' ? (whatsapp?.configured ? 'Configured' : 'Needs credentials') : c.state}</span></div><div className="eyebrow">{c.group}</div><h3>{c.name}</h3><p className="muted small">{c.detail}</p>{c.key === 'whatsapp' && <div className="connect-details"><span>Integration type</span><strong>WhatsApp Cloud API</strong><span>Credentials</span><strong>{whatsapp?.configured ? 'Server credentials detected' : 'Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in server/.env'}</strong><span>Message scope</span><strong>Text messages; approved templates and inbound webhook workflows are future additions</strong></div>}{c.key === 'meta' && <div className="connect-details"><span>Webhook endpoint</span><code>/webhooks/meta</code><span>Integration type</span><strong>{meta?.mode || 'Meta Graph API webhook'}</strong><span>Credentials</span><strong>{meta?.configured ? 'Server credentials detected' : 'Set META_* values in server/.env'}</strong></div>}</article>)}</div>
    <div className="card connect-guidance"><h3>Send a WhatsApp message</h3><p className="muted small">Uses the official WhatsApp Cloud API when configured on the server. Ensure the recipient has opted in and your use complies with Meta messaging rules.</p><form className="form-grid whatsapp-form" onSubmit={sendWhatsApp}><label>Recipient number (international format)<input required value={to} onChange={e=>setTo(e.target.value)} placeholder="+919876543210" /></label><label className="span-all">Message<textarea required rows="3" maxLength="4000" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write your customer update…" /></label><div className="span-all"><button className="btn-primary cw-primary-action" disabled={sending}>{sending?'Sending…':'Send WhatsApp message'}</button></div></form>{sendState&&<div className="alert success">{sendState}</div>}</div>
    <div className="card connect-guidance"><h3>Integration safety checklist</h3><ul className="report-notes"><li>Store access tokens and webhook secrets only in the backend environment file.</li><li>Use HTTPS for public webhooks and verify provider signatures.</li><li>Obtain customer consent and follow each channel's messaging/template rules.</li><li>Test with a dedicated business account before connecting production leads.</li></ul></div>
  </>;
}
