import { useEffect, useState } from 'react';
import { api } from '../api.js';

const starters = [
  'Give me a summary of my current leads, grouped by status and source.',
  'Which properties and projects currently have available inventory?',
  'Show overdue and upcoming follow-ups, with the lead names and next actions.',
  'Summarize my sales pipeline and booking value from the CRM data.',
];


function InlineAnswer({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2,-2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1,-1)}</code>;
    return part;
  });
}

function ChatAnswer({ text }) {
  const lines = String(text || '').replace(/\r/g,'').split('\n');
  const blocks = [];
  let bullets = [];
  const flush = () => { if (bullets.length) { blocks.push(<ul key={`list-${blocks.length}`}>{bullets.map((x,i)=><li key={i}><InlineAnswer text={x}/></li>)}</ul>); bullets=[]; } };
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line || /^[-*_]{3,}$/.test(line)) { flush(); return; }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bullet) { bullets.push(bullet[1]); return; }
    flush();
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) blocks.push(<h4 key={`h-${blocks.length}`}><InlineAnswer text={heading[1]}/></h4>);
    else blocks.push(<p key={`p-${blocks.length}`}><InlineAnswer text={line.replace(/^\s*>\s?/, '')}/></p>);
  });
  flush();
  return <div className="cw-chat-answer">{blocks}</div>;
}

export default function Intelligence() {
  const [status, setStatus] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [context, setContext] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leadId, setLeadId] = useState('');
  const [matches, setMatches] = useState([]);
  useEffect(() => { api('/intelligence/status').then(setStatus).catch((e) => setError(e.message)); }, []);

  async function ask(value = prompt) {
    if (!value.trim() || busy) return;
    setBusy(true); setError(''); setAnswer(''); setMatches([]);
    try {
      const result = await api('/intelligence/chat', { method: 'POST', body: { prompt: value.trim(), context } });
      setAnswer(result.answer);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function summarizeLead() {
    if (!leadId || busy) return;
    setBusy(true); setError(''); setAnswer(''); setMatches([]);
    try { const result = await api(`/intelligence/leads/${encodeURIComponent(leadId)}/summary`, { method: 'POST', body: {} }); setAnswer(result.answer); setMatches(result.matchingProperties || []); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <>
    <div className="page-head"><div><div className="eyebrow">CODEWEFT INTELLIGENCE</div><h1>AI business assistant</h1><p className="muted">Turn everyday real-estate work into clear plans, messages and decisions.</p></div><span className={`pill ${status?.configured ? 'ok' : 'off'}`}>{status?.configured ? 'AI connected' : 'AI setup required'}</span></div>
    {error && <div className="alert">{error}</div>}
    <div className="intelligence-layout">
      <section className="card ai-chat-card">
        <div className="ai-heading"><div className="ai-orb">✦</div><div><h3>Ask SoftSpark EstateOne</h3><p className="muted small">Answers use the CRM records your account is permitted to access. Review suggestions before acting.</p></div></div>
        <div className="lead-ai-tool"><div><strong>Summarize a CRM lead</strong><p className="muted small">Use a lead ID to generate a brief and property matches from your company's records.</p></div><div className="lead-ai-action"><input type="number" min="1" value={leadId} onChange={e=>setLeadId(e.target.value)} placeholder="Lead ID"/><button className="btn-ghost" disabled={busy||!leadId} onClick={summarizeLead}>Summarize lead</button></div></div>
        <label>Business context <span className="muted">(optional; do not include passwords or sensitive personal data)</span></label>
        <textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Example: We sell residential apartments in Rajkot. Our team has 6 sales executives…" rows="3" />
        <label className="prompt-label">What would you like help with?</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask about leads, property marketing, follow-ups, sales planning…" rows="4" maxLength={5000} />
        <div className="row-between"><span className="muted small">{prompt.length}/5000 characters</span><button className="btn-primary cw-primary-action" disabled={busy || prompt.trim().length < 3 || !status?.configured} onClick={() => ask()}>{busy ? 'Thinking…' : 'Generate response ✦'}</button></div>
        {answer && <div className="ai-answer"><div className="row-between"><strong>SoftSpark EstateOne response</strong><button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(answer)}>Copy response</button></div><div className="ai-answer-text"><ChatAnswer text={answer}/></div>{matches.length>0&&<div className="ai-match-list"><strong>Matching available properties</strong>{matches.map(p=><div key={p.id}><span>{p.title}</span><small>{p.city||'—'} · ₹{Number(p.price||0).toLocaleString('en-IN')}</small></div>)}</div>}</div>}
      </section>
      <aside className="card ai-side-card"><h3>Suggested tasks</h3><p className="muted small">Choose a starter prompt to begin.</p><div className="ai-starters">{starters.map((s) => <button key={s} className="ai-starter" onClick={() => { setPrompt(s); ask(s); }}>{s}<span>↗</span></button>)}</div><div className="ai-note"><strong>Provider</strong><p>{status?.provider || 'Groq API'}</p><strong>Model</strong><p>{status?.model || 'openai/gpt-oss-120b'}</p><strong>Privacy</strong><p>General prompts include organization-level aggregate counts. When you explicitly request a lead summary, selected lead qualification fields and redacted notes (no name, email or phone fields) plus matching property details are sent to Groq. The assistant does not write to your CRM.</p></div></aside>
    </div>
  </>;
}
