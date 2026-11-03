import {useEffect,useState} from 'react';
import {api} from '../api.js';
import {useAuth} from '../auth.jsx';
const blank={name:'',email:'',phone:'',alternate_phone:'',address:'',city:'',client_type:'buyer',source:'',notes:''};
export default function Clients(){
 const {user}=useAuth();const [rows,setRows]=useState([]);const [form,setForm]=useState(blank);const [show,setShow]=useState(false);const [error,setError]=useState('');
 async function load(){try{const d=await api('/clients');setRows(d.clients);}catch(e){setError(e.message);}}
 useEffect(()=>{load();},[]);
 async function save(e){e.preventDefault();try{await api('/clients',{method:'POST',body:form});setForm(blank);setShow(false);load();}catch(e){setError(e.message);}}
 const canAdd=['superadmin','admin','staff'].includes(user.role);
 return <><div className="page-head"><div><h1>Clients</h1><p className="muted">Buyer and seller profiles, contact information and enquiry history.</p></div>{canAdd&&<button className="btn" onClick={()=>setShow(!show)}>+ Add client</button>}</div>{error&&<div className="alert">{error}</div>}
 {show&&<form className="card form-grid" onSubmit={save}><h3 className="span-all">New client profile</h3>{Object.entries({name:'Full name',email:'Email',phone:'Phone',alternate_phone:'Alternate phone',address:'Address',city:'City',client_type:'Client type',source:'Source',notes:'Notes'}).map(([k,l])=><label>{l}<input required={k==='name'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<div><button className="btn">Save client</button></div></form>}
 <div className="card table-card"><table><thead><tr><th>Client</th><th>Phone</th><th>Location</th><th>Type</th><th>Source</th><th>Created</th></tr></thead><tbody>{rows.map(c=><tr><td><strong>{c.name}</strong><div className="muted small">{c.email}</div></td><td>{c.phone||'—'}</td><td>{c.city||'—'}</td><td><span className="pill">{c.client_type}</span></td><td>{c.source||'—'}</td><td>{new Date(c.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>{!rows.length&&<p className="muted pad">No client profiles yet.</p>}</div></>;
}
