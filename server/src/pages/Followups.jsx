import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { createPortal } from 'react-dom';
const statuses = ['contacted','qualified','site visit','negotiations','completed','negative'];
const sources = ['Website','Walk-in','Phone Call','WhatsApp','Facebook','Instagram','Referral','Channel Partner','Property Portal','Advertisement','Email','Google Ads','99acres','Magicbricks','Housing.com','Other'];
const priorities = ['urgent','high','medium','low'];
const stages = ['new','qualification','site_visit','negotiation','booking','won','lost'];
const blank = { lead_id:'', title:'', status:'contacted', source:'Phone Call', priority:'medium', stage:'new', scheduled_at:'', followup_type:'call', notes:'' };
const title = x => x.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

function DateTimePicker({ value, onChange }) {
 const initialDate = value ? value.slice(0,10) : '';
 const initialTime = value && value.length >= 16 ? value.slice(11,16) : '10:00';
 const [open,setOpen]=useState(false);
 const [draftDate,setDraftDate]=useState(initialDate);
 const [draftTime,setDraftTime]=useState(initialTime);
 const [month,setMonth]=useState(()=>{const d=initialDate?new Date(`${initialDate}T12:00:00`):new Date();return new Date(d.getFullYear(),d.getMonth(),1)});
 function begin(){setDraftDate(value?value.slice(0,10):new Date().toLocaleDateString('en-CA'));setDraftTime(value?.slice(11,16)||'10:00');const d=value?new Date(`${value.slice(0,10)}T12:00:00`):new Date();setMonth(new Date(d.getFullYear(),d.getMonth(),1));setOpen(true)}
 const firstDay=month.getDay(),days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
 const cells=Array.from({length:Math.ceil((firstDay+days)/7)*7},(_,i)=>{const day=i-firstDay+1;return day>0&&day<=days?day:null});
 const fmt=n=>String(n).padStart(2,'0');
 function confirm(){if(draftDate)onChange(`${draftDate}T${draftTime||'10:00'}`);setOpen(false)}
 return <div className="cw-datetime-picker">
  <button type="button" className="cw-date-display" onClick={begin}>{value?new Date(value).toLocaleString():'Select date & time'}<span>▦</span></button>
  {open&&<div className="cw-calendar-popover">
   <div className="cw-calendar-head"><button type="button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button><strong>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</strong><button type="button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button></div>
   <div className="cw-calendar-grid">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(x=><span className="cw-calendar-weekday" key={x}>{x}</span>)}{cells.map((day,i)=>day?<button type="button" key={i} className={draftDate===`${month.getFullYear()}-${fmt(month.getMonth()+1)}-${fmt(day)}`?'selected':''} onClick={()=>setDraftDate(`${month.getFullYear()}-${fmt(month.getMonth()+1)}-${fmt(day)}`)}>{day}</button>:<span key={i}/>)}</div>
   <label className="cw-calendar-time">Time<input type="time" value={draftTime} onChange={e=>setDraftTime(e.target.value)}/></label>
   <div className="cw-calendar-actions"><button type="button" className="btn-ghost" onClick={()=>setOpen(false)}>Cancel</button><button type="button" className="btn-primary" onClick={confirm}>OK</button></div>
  </div>}
 </div>;
}
export default function Followups() {
 const [items,setItems]=useState([]),[leads,setLeads]=useState([]),[form,setForm]=useState(blank),[error,setError]=useState(''),[busy,setBusy]=useState(false),[filter,setFilter]=useState(''),[filterPriority,setFilterPriority]=useState(''),[open,setOpen]=useState(false);
 const load=useCallback(async()=>{setError('');try{const params=new URLSearchParams();if(filter)params.set('status',filter);if(filterPriority)params.set('priority',filterPriority);const [f,o]=await Promise.all([api(`/followups?${params}`),api('/followups/options')]);setItems(f.followups||[]);setLeads(o.leads||[])}catch(e){setError(e.message)}},[filter,filterPriority]);
 useEffect(()=>{load()},[load]);
 async function save(e){e.preventDefault();setBusy(true);setError('');try{await api('/followups',{method:'POST',body:form});setForm(blank);setOpen(false);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function update(id,status){try{await api(`/followups/${id}`,{method:'PATCH',body:{status}});await load()}catch(e){setError(e.message)}}
 async function remove(id){if(!window.confirm('Delete this follow-up?'))return;try{await api(`/followups/${id}`,{method:'DELETE'});await load()}catch(e){setError(e.message)}}
 const change=k=>e=>setForm(v=>({...v,[k]:e.target.value}));
 return <><div className="page-head"><div><div className="eyebrow">SALES ACTIVITY</div><h1>Follow-ups</h1><p className="muted">Manage customer conversations, sales stages and next actions.</p></div><button className="btn" onClick={()=>{setForm(blank);setOpen(true)}}>＋ Add follow-up</button></div>
 {error&&<div className="alert">{error}</div>}
 <div className="card table-card"><div className="row-between followup-toolbar"><div><h3>All follow-ups</h3><p className="muted small">{items.length} records</p></div><div className="followup-filters"><select aria-label="Filter by status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All statuses</option>{statuses.map(x=><option key={x} value={x}>{title(x)}</option>)}</select><select aria-label="Filter by priority" value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}><option value="">All priorities</option>{priorities.map(x=><option key={x} value={x}>{title(x)}</option>)}</select></div></div>
 <div className="table-wrap"><table><thead><tr><th>Lead / Customer</th><th>Status</th><th>Source</th><th>Priority</th><th>Stage</th><th>Next action</th><th>Assigned</th><th>Actions</th></tr></thead><tbody>{items.map(f=><tr key={f.id}><td><strong>{f.lead_name}</strong><small className="muted">{f.title||f.notes||''}</small></td><td><select className="table-select" value={f.status} onChange={e=>update(f.id,e.target.value)}>{statuses.map(x=><option key={x} value={x}>{title(x)}</option>)}</select></td><td>{f.source||'—'}</td><td><span className={`pill ${['high','urgent'].includes(f.priority)?'warn':''}`}>{title(f.priority||'medium')}</span></td><td>{title(f.stage||'new')}</td><td>{f.scheduled_at?new Date(f.scheduled_at).toLocaleString():'—'}{f.scheduled_at&&new Date(f.scheduled_at)<new Date()&&!['completed','negative'].includes(f.status)&&<small className="pill warn">Overdue</small>}</td><td>{f.assigned_name||f.created_by_name||'—'}</td><td><button className="btn-ghost" onClick={()=>remove(f.id)}>Delete</button></td></tr>)}</tbody></table></div>{!items.length&&<p className="muted pad">No follow-ups found. Select Add follow-up to create one.</p>}</div>
 {open&&createPortal(<div className="modal-back" onClick={()=>setOpen(false)}><form className="modal followup-modal cw-followup-modal" onSubmit={save} onClick={e=>e.stopPropagation()}><div className="followup-modal-head"><h2>Add follow-up</h2><button type="button" className="btn-ghost" onClick={()=>setOpen(false)} aria-label="Close">✕</button></div><p className="followup-modal-intro">Record the customer interaction, update its sales stage and schedule the next action.</p><div className="followup-form-grid"><label>Lead / Customer<select required value={form.lead_id} onChange={change('lead_id')}><option value="">Select lead</option>{leads.map(l=><option key={l.id} value={l.id}>#{l.id} · {l.name}</option>)}</select></label><label>Follow-up title<input value={form.title} onChange={change('title')} placeholder="e.g. Discuss 2 BHK options"/></label><label>Status<select value={form.status} onChange={change('status')}>{statuses.map(x=><option key={x} value={x}>{title(x)}</option>)}</select></label><label>Source<select value={form.source} onChange={change('source')}>{sources.map(x=><option key={x}>{x}</option>)}</select></label><label>Priority<select value={form.priority} onChange={change('priority')}>{priorities.map(x=><option key={x} value={x}>{title(x)}</option>)}</select></label><label>Stage<select value={form.stage} onChange={change('stage')}>{stages.map(x=><option key={x} value={x}>{title(x)}</option>)}</select></label><label>Next follow-up date & time<DateTimePicker value={form.scheduled_at} onChange={v=>setForm(x=>({...x,scheduled_at:v}))}/></label><label>Contact method<select value={form.followup_type} onChange={change('followup_type')}>{['call','whatsapp','email','meeting','site_visit','other'].map(x=><option key={x} value={x}>{title(x)}</option>)}</select></label><label className="span-all">Notes<textarea rows="3" value={form.notes} onChange={change('notes')} placeholder="Discussion summary and next action"/></label></div><div className="followup-modal-actions"><button type="button" className="btn-ghost" onClick={()=>setOpen(false)}>Cancel</button><button className="btn" disabled={busy||!leads.length}>{busy?'Saving…':'Save follow-up'}</button></div>{!leads.length&&<p className="muted small">Add or assign a lead before creating a follow-up.</p>}</form></div>, document.body)}
 </>;
}
