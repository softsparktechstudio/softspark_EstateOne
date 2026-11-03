import { useEffect, useState } from 'react';
import { api, uploadFiles } from '../api.js';
import { useAuth } from '../auth.jsx';

const blankProject={name:'',project_code:'',project_type:'Residential',city:'',state:'Gujarat',address:'',total_units:0,description:''};
const blankProperty={title:'',project_id:'',property_type:'Apartment',listing_type:'sale',city:'',state:'Gujarat',address:'',bedrooms:2,bathrooms:2,area_sqft:'',price:'',status:'available',description:''};
export default function Properties(){
 const {user}=useAuth();const [tab,setTab]=useState('properties');const [properties,setProperties]=useState([]);const [projects,setProjects]=useState([]);const [units,setUnits]=useState([]);
 const [form,setForm]=useState(blankProperty);const [projectForm,setProjectForm]=useState(blankProject);const [unitForm,setUnitForm]=useState({project_id:'',property_id:'',unit_number:'',floor_number:'',block_name:'',unit_type:'',area_sqft:'',base_price:'',status:'available'});
 const [show,setShow]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [priceEdits,setPriceEdits]=useState({});
 const canEdit=['superadmin','admin','staff'].includes(user.role);
 async function load(){try{const [p,pr,u]=await Promise.all([api('/properties'),api('/properties/projects'),api('/properties/units')]);setProperties(p.properties);setProjects(pr.projects);setUnits(u.units);}catch(e){setError(e.message);}}
 useEffect(()=>{load();},[]);
 async function saveProperty(e){e.preventDefault();setBusy(true);setError('');try{await api('/properties',{method:'POST',body:{...form,project_id:form.project_id||null}});setForm(blankProperty);setShow(false);await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function saveProject(e){e.preventDefault();try{await api('/properties/projects',{method:'POST',body:projectForm});setProjectForm(blankProject);await load();setTab('projects');}catch(e){setError(e.message);}}
 async function saveUnit(e){e.preventDefault();try{await api('/properties/units',{method:'POST',body:unitForm});setUnitForm({...unitForm,unit_number:''});await load();}catch(e){setError(e.message);}}
 async function changeStatus(p,status){try{await api(`/properties/${p.id}`,{method:'PATCH',body:{status}});await load();}catch(e){setError(e.message);}}
 async function publish(p){try{await api(`/properties/${p.id}/listings`,{method:'POST',body:{headline:p.title,description:p.description,portal_name:'SoftSpark EstateOne Website',published:true}});setError('Property published to client portal.');}catch(e){setError(e.message);}}
 async function savePrice(p){try{await api(`/properties/${p.id}`,{method:'PATCH',body:{price:Number(priceEdits[p.id]??p.price)}});await load();}catch(e){setError(e.message);}}
 async function updateUnit(u,body){try{await api(`/properties/units/${u.id}`,{method:'PATCH',body});await load();}catch(e){setError(e.message);}}
 async function images(id,files){try{await uploadFiles(`/properties/${id}/images`,files);await load();}catch(e){setError(e.message);}}
 return <><div className="page-head"><div><h1>Properties & inventory</h1><p className="muted">Projects, property listings, images, units, pricing and availability.</p></div>{canEdit&&tab==='properties'&&<button className="btn" onClick={()=>setShow(!show)}>+ Add property</button>}</div>
 {error&&<div className="alert">{error}</div>}
 <div className="module-tabs">{(user.role==='client'?['properties']:['properties','projects','units']).map(t=><button className={tab===t?'selected':''} onClick={()=>{setTab(t);setShow(false);}}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div>
 {show&&<form className="card form-grid" onSubmit={saveProperty}><h3 className="span-all">New property</h3>
 {Object.entries({title:'Property title',property_type:'Property type',listing_type:'Listing type',city:'City',state:'State',address:'Address',bedrooms:'Bedrooms',bathrooms:'Bathrooms',area_sqft:'Area (sq.ft)',price:'Price',status:'Status',description:'Description'}).map(([k,l])=><label>{l}{k==='description'?<textarea value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>:<input required={k==='title'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>}</label>)}
 <label>Project<select value={form.project_id} onChange={e=>setForm({...form,project_id:e.target.value})}><option value="">No project</option>{projects.map(p=><option value={p.id}>{p.name}</option>)}</select></label>
 <div className="span-all"><button className="btn" disabled={busy}>{busy?'Saving…':'Save property'}</button></div></form>}
 {tab==='properties'&&<div className="property-grid">{properties.map(p=><article className="card property-card" key={p.id}>
   {p.image_url?<img src={p.image_url} alt={p.title}/>:<div className="property-placeholder">⌂</div>}
   <div className="property-body"><div className="row-between"><span className="pill">{p.status}</span><strong className="price">₹{Number(p.price||0).toLocaleString('en-IN')}</strong></div>
    <h3>{p.title}</h3><p className="muted small">{[p.project_name,p.city,p.state].filter(Boolean).join(' · ')}</p>
    <p className="small">{p.property_type} · {p.bedrooms||'—'} BHK · {p.area_sqft||'—'} sq.ft · {p.unit_count} units</p>
    {canEdit&&<div className="property-admin-controls">
      <label className="property-field">Availability
       <select value={p.status} onChange={e=>changeStatus(p,e.target.value)}>
        <option value="available">Available</option><option value="hold">On hold</option><option value="sold">Sold</option><option value="rented">Rented</option>
       </select>
      </label>
      <label className="upload-label property-upload">Add property images
       <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e=>images(p.id,e.target.files)}/>
      </label>
      <button type="button" className="btn-ghost property-publish" onClick={()=>publish(p)}>Publish to client portal</button>
      <div className="price-edit">
       <label className="property-field">Update price
        <input type="number" min="0" value={priceEdits[p.id]??p.price} onChange={e=>setPriceEdits({...priceEdits,[p.id]:e.target.value})}/>
       </label>
       <button type="button" className="btn-ghost" onClick={()=>savePrice(p)}>Save price</button>
      </div>
     </div>}
   </div></article>)}</div>}
 {tab==='projects'&&<>{canEdit&&<div className="card"><h3>Create project</h3><form className="form-grid" onSubmit={saveProject}>{Object.entries({name:'Project name',project_code:'Project code',project_type:'Project type',city:'City',state:'State',address:'Address',total_units:'Total units',description:'Description'}).map(([k,l])=><label>{l}<input required={k==='name'} value={projectForm[k]} onChange={e=>setProjectForm({...projectForm,[k]:e.target.value})}/></label>)}<div><button className="btn">Save project</button></div></form></div>}<div className="card table-card"><table><thead><tr><th>Project</th><th>Location</th><th>Units</th><th>Status</th></tr></thead><tbody>{projects.map(p=><tr><td>{p.name}<div className="muted small">{p.project_code}</div></td><td>{p.city}, {p.state}</td><td>{p.unit_count}</td><td><span className="pill">{p.status}</span></td></tr>)}</tbody></table></div></>}
 {tab==='units'&&<>{canEdit&&<div className="card"><h3>Add inventory unit</h3><form className="form-grid" onSubmit={saveUnit}><label>Project<select required value={unitForm.project_id} onChange={e=>setUnitForm({...unitForm,project_id:e.target.value})}><option value="">Select project</option>{projects.map(p=><option value={p.id}>{p.name}</option>)}</select></label><label>Property<select value={unitForm.property_id} onChange={e=>setUnitForm({...unitForm,property_id:e.target.value})}><option value="">Select property (optional)</option>{properties.map(p=><option value={p.id}>{p.title}</option>)}</select></label>{Object.entries({unit_number:'Unit number',floor_number:'Floor',block_name:'Block',unit_type:'Unit type',area_sqft:'Area sq.ft',base_price:'Base price'}).map(([k,l])=><label>{l}<input required={k==='unit_number'} value={unitForm[k]} onChange={e=>setUnitForm({...unitForm,[k]:e.target.value})}/></label>)}<div><button className="btn">Add unit</button></div></form></div>}<div className="card table-card"><table><thead><tr><th>Project</th><th>Unit</th><th>Floor / Block</th><th>Area</th><th>Price</th><th>Status</th></tr></thead><tbody>{units.map(u=><tr><td>{u.project_name}</td><td>{u.unit_number}</td><td>{u.floor_number||'—'} / {u.block_name||'—'}</td><td>{u.area_sqft||'—'}</td><td>₹{Number(u.base_price).toLocaleString('en-IN')}</td><td>{canEdit?<select value={u.status} onChange={e=>updateUnit(u,{status:e.target.value})}><option>available</option><option>hold</option><option>booked</option><option>sold</option></select>:<span className="pill">{u.status}</span>}</td></tr>)}</tbody></table></div></>}
 </>;
}
