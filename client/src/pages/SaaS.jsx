import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function SaaS(){
  const {user}=useAuth(); const isRoot=user?.role==='superadmin';
  const [plans,setPlans]=useState([]),[subscription,setSubscription]=useState(null),[organizations,setOrganizations]=useState([]),[admins,setAdmins]=useState([]),[selectedAdmins,setSelectedAdmins]=useState({}),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [form,setForm]=useState({name:'',slug:'',adminName:'',adminEmail:'',adminPassword:'',phone:'',email:''});
  async function load(){setError('');try{const p=await api('/saas/plans');setPlans(p.plans||[]);if(isRoot){const [o,a]=await Promise.all([api('/saas/organizations'),api('/saas/admin-accounts')]);setOrganizations(o.organizations||[]);setAdmins(a.admins||[]);}else{const s=await api('/saas/subscription');setSubscription(s.subscription);}}catch(e){setError(e.message)}}
  useEffect(()=>{load()},[]);
  async function createCompany(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{const r=await api('/saas/organizations',{method:'POST',body:form});setMessage(`Company ${r.organization.name} created. Admin login: ${r.admin.email}`);setForm({name:'',slug:'',adminName:'',adminEmail:'',adminPassword:'',phone:'',email:''});load()}catch(e){setError(e.message)}finally{setBusy(false)}}
  async function assignAdmin(organizationId){
    const adminId=selectedAdmins[organizationId];
    if(!adminId){setError('Select an Admin account first.');return;}
    setBusy(true);setError('');setMessage('');
    try{const r=await api(`/saas/organizations/${organizationId}/assign-admin`,{method:'PATCH',body:{adminId:Number(adminId)}});setMessage(r.message);await load();}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function openCheckout(info){
    if(!window.Razorpay){setError('Razorpay Checkout script is unavailable. Check your internet connection and try again.');return;}
    const checkout=new window.Razorpay({key:info.keyId,amount:info.amount,currency:info.currency,name:'SoftSpark EstateOne',description:'Company subscription',order_id:info.orderId,
      handler:async response=>{try{await api('/saas/subscription/verify',{method:'POST',body:response});setMessage('Payment verified. Subscription activated.');load();}catch(e){setError(e.message);}},
      modal:{ondismiss:()=>setMessage('Checkout was closed. Your subscription remains unactivated until payment is completed.')},theme:{color:'#2563eb'}});
    checkout.open();
  }
  async function changePlan(planCode,billingCycle){setBusy(true);setError('');setMessage('');try{const r=await api('/saas/subscription/change',{method:'POST',body:{planCode,billingCycle}});setMessage(r.message);if(r.razorpay){setMessage(`${r.message} Opening secure checkout…`); await openCheckout(r.razorpay); }load()}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <>
    <div className="page-head"><div><div className="eyebrow">CODEWEFT SAAS</div><h1>{isRoot?'Organizations & platform plans':'Company & subscription'}</h1><p className="muted">Manage company onboarding, plan limits and recurring billing.</p></div><span className="pill ok">SaaS foundation</span></div>
    {error&&<div className="alert">{error}</div>}{message&&<div className="alert success">{message}</div>}
    {isRoot&&<>
      <div className="card"><h3>Register a new company</h3><p className="muted small">Creates an organization, its first Admin login, a 14-day Starter trial and a public marketplace slug.</p>
        <form className="form-grid" onSubmit={createCompany}>
          <label>Company name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
          <label>Portal slug<input value={form.slug} placeholder="auto-generated-from-company" onChange={e=>setForm({...form,slug:e.target.value})}/></label>
          <label>Admin full name<input required value={form.adminName} onChange={e=>setForm({...form,adminName:e.target.value})}/></label>
          <label>Admin email<input required type="email" value={form.adminEmail} onChange={e=>setForm({...form,adminEmail:e.target.value})}/></label>
          <label>Temporary password (min 10 chars)<input required minLength="10" type="password" value={form.adminPassword} onChange={e=>setForm({...form,adminPassword:e.target.value})}/></label>
          <label>Company phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
          <label>Company email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
          <div className="span-all"><button className="btn-primary cw-primary-action" disabled={busy}>{busy?'Creating…':'Create company & Admin'}</button></div>
        </form>
      </div>
      <div className="card table-card"><div className="row-between"><div><h3>Company workspaces & Admin assignment</h3><p className="muted small">Each company has its own isolated CRM records. Assign one Admin account as the company owner.</p></div></div><div className="table-wrap"><table><thead><tr><th>ID</th><th>Company</th><th>Assigned Admin</th><th>Status</th><th>Plan</th><th>Marketplace</th><th>Assign Admin</th></tr></thead><tbody>{organizations.map(o=><tr key={o.id}><td>{o.id}</td><td><strong>{o.name}</strong></td><td>{o.owner_name||'—'}</td><td><span className="pill">{o.status}</span></td><td>{o.plan_name||o.subscription_status||'—'}</td><td>{o.slug}</td><td><div style={{display:'flex',gap:8,minWidth:230}}><select value={selectedAdmins[o.id]??(admins.find(a=>Number(a.id)===Number(o.owner_user_id))?.id||'')} onChange={e=>setSelectedAdmins(v=>({...v,[o.id]:e.target.value}))}><option value="">Select Admin</option>{admins.map(a=><option key={a.id} value={a.id}>{a.name} · {a.email}</option>)}</select><button className="btn-ghost" disabled={busy||!selectedAdmins[o.id]} onClick={()=>assignAdmin(o.id)}>Assign</button></div></td></tr>)}</tbody></table></div></div>
    </>}
    {!isRoot&&<div className="card"><div className="row-between"><div><h3>Current subscription</h3><p className="muted small">Your active or trial plan and usage limits.</p></div><span className="pill">{subscription?.status||'Not subscribed'}</span></div><div className="stat-grid"><article className="card stat"><span>Plan</span><strong>{subscription?.plan_name||'—'}</strong></article><article className="card stat"><span>Users allowed</span><strong>{subscription?.user_limit??'—'}</strong></article><article className="card stat"><span>Lead limit</span><strong>{subscription?.lead_limit??'—'}</strong></article><article className="card stat"><span>Property limit</span><strong>{subscription?.property_limit??'—'}</strong></article></div><p className="muted small">{subscription?.ends_at?`Current period ends ${new Date(subscription.ends_at).toLocaleDateString()}`:'No subscription period is recorded yet.'}</p></div>}
    <div className="page-head"><div><h2>Available plans</h2><p className="muted small">Indicative INR pricing. Taxes and third-party usage charges may apply.</p></div></div>
    <div className="plan-grid">{plans.map(p=><article className="card plan-card" key={p.code}><div className="eyebrow">{p.code}</div><h3>{p.name}</h3><div className="plan-price">{Number(p.monthly_price)===0?'Custom':`₹${Number(p.monthly_price).toLocaleString('en-IN')}`}<small>/month</small></div><p className="muted small">{p.user_limit.toLocaleString('en-IN')} users · {p.lead_limit.toLocaleString('en-IN')} leads · {p.property_limit.toLocaleString('en-IN')} properties</p><div className="plan-actions"><button className="btn-ghost" disabled={busy||isRoot||p.code==='enterprise'} onClick={()=>changePlan(p.code,'monthly')}>Monthly</button><button className="btn-primary" disabled={busy||isRoot||p.code==='enterprise'} onClick={()=>changePlan(p.code,'annual')}>Annual</button></div></article>)}</div>
    {isRoot&&<p className="muted small">Platform-level company management is available here. New organizations receive their own Admin account and tenant-scoped business data. Before public launch, run cross-company access tests using the dedicated non-owner runtime database role and complete a security review.</p>}
  </>;
}
