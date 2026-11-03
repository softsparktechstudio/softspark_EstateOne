import { Router } from 'express';
import { query, logActivity } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router=Router();router.use(requireAuth);
router.get('/',async(req,res)=>{
  let sql=`SELECT c.*,u.name AS portal_user_name FROM clients c LEFT JOIN users u ON u.id=c.user_id`;
  const params=[];
  if(req.user.role==='client'){params.push(req.user.id);sql+=` WHERE c.user_id=$1`;}
  else if(req.user.role==='staff'){params.push(req.user.id);sql+=` WHERE EXISTS(SELECT 1 FROM leads l WHERE l.client_id=c.id AND l.assigned_to=$1)`;}
  sql+=' ORDER BY c.created_at DESC LIMIT 500';
  const {rows}=await query(sql,params);res.json({clients:rows});
});
router.post('/',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const b=req.body||{};if(!b.name?.trim())return res.status(400).json({error:'Client name is required'});
  const {rows}=await query(`INSERT INTO clients(name,email,phone,alternate_phone,address,city,client_type,source,notes,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [b.name.trim(),b.email||null,b.phone||null,b.alternate_phone||null,b.address||null,b.city||null,b.client_type||'buyer',b.source||null,b.notes||null,req.user.id]);
  await logActivity(req.user.id,'client_create',`Created client ${b.name}`);
  res.status(201).json({client:rows[0]});
});
router.patch('/:id',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const b=req.body||{};const fields=['name','email','phone','alternate_phone','address','city','client_type','source','notes'];
  const sets=[],values=[];for(const f of fields)if(b[f]!==undefined){values.push(b[f]);sets.push(`${f}=$${values.length}`);}
  if(!sets.length)return res.status(400).json({error:'No fields to update'});
  values.push(Number(req.params.id));
  let where=`id=$${values.length}`;
  if(req.user.role==='staff'){values.push(req.user.id);where+=` AND EXISTS(SELECT 1 FROM leads l WHERE l.client_id=clients.id AND l.assigned_to=$${values.length})`;}
  const {rows}=await query(`UPDATE clients SET ${sets.join(',')},updated_at=NOW() WHERE ${where} RETURNING *`,values);
  if(!rows[0])return res.status(404).json({error:'Client not found'});
  res.json({client:rows[0]});
});
router.post('/from-lead/:leadId',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const id=Number(req.params.leadId);
  const lead=await query('SELECT * FROM leads WHERE id=$1',[id]);
  if(!lead.rowCount)return res.status(404).json({error:'Lead not found'});
  const l=lead.rows[0];
  if(req.user.role==='staff'&&l.assigned_to!==req.user.id)return res.status(403).json({error:'This lead is not assigned to you'});
  if(l.client_id){const c=await query('SELECT * FROM clients WHERE id=$1',[l.client_id]);return res.json({client:c.rows[0],alreadyExists:true});}
  const {rows}=await query(`INSERT INTO clients(name,email,phone,source,notes,created_by)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[l.name,l.email,l.phone,l.source,l.notes,req.user.id]);
  await query('UPDATE leads SET client_id=$1,status=CASE WHEN status IN (\'won\',\'converted\') THEN status ELSE \'qualified\' END,updated_at=NOW() WHERE id=$2',[rows[0].id,id]);
  await logActivity(req.user.id,'lead_convert',`Converted lead #${id} to client #${rows[0].id}`);
  res.status(201).json({client:rows[0]});
});
export default router;
