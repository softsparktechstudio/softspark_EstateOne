import { Router } from 'express';
import { parse } from 'csv-parse/sync';
import { query, logActivity } from '../db.js';
import { enforcePlanLimit } from '../middleware/planLimits.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router=Router(); router.use(requireAuth);
const canSeeAll=(role)=>['superadmin','admin'].includes(role);
router.get('/',async(req,res)=>{
  const params=[];let where='WHERE 1=1';
  if(!canSeeAll(req.user.role)){params.push(req.user.id);where+=` AND l.assigned_to=$${params.length}`;}
  if(req.query.status){params.push(req.query.status);where+=` AND l.status=$${params.length}`;}
  if(req.query.q){params.push(`%${req.query.q}%`);where+=` AND (l.name ILIKE $${params.length} OR l.email ILIKE $${params.length} OR l.phone ILIKE $${params.length})`;}
  const {rows}=await query(`SELECT l.*,u.name AS assigned_name,c.name AS client_name FROM leads l
    LEFT JOIN users u ON u.id=l.assigned_to LEFT JOIN clients c ON c.id=l.client_id
    ${where} ORDER BY l.updated_at DESC LIMIT 500`,params);
  res.json({leads:rows});
});
router.post('/',requireRole('superadmin','admin','staff'),enforcePlanLimit('leads'),async(req,res)=>{
  const b=req.body||{};
  if(!b.name?.trim()) return res.status(400).json({error:'Lead name is required'});
  const assigned=req.user.role==='staff'?req.user.id:(b.assigned_to||null);
  if(assigned){const a=await query("SELECT id FROM users WHERE id=$1 AND role IN ('admin','staff') AND is_active=true AND ($2::bigint IS NULL OR organization_id=$2)",[assigned, req.user.role==='superadmin'?null:req.user.organization_id]);if(!a.rowCount)return res.status(400).json({error:'Select an active admin or staff member'});}
  const {rows}=await query(`INSERT INTO leads(title,name,email,phone,source,source_detail,social_platform,campaign_name,status,priority,budget_min,budget_max,property_type,city,assigned_to,created_by,notes,next_follow_up)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [b.title||null,b.name.trim(),b.email||null,b.phone||null,b.source||'Manual',b.source_detail||null,b.social_platform||null,b.campaign_name||null,b.status||'new',b.priority||'medium',b.budget_min||null,b.budget_max||null,b.property_type||null,b.city||null,assigned,req.user.id,b.notes||null,b.next_follow_up||null]);
  await logActivity(req.user.id,'lead_create',`Created lead ${b.name}`);
  res.status(201).json({lead:rows[0]});
});
router.patch('/:id',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const id=Number(req.params.id);const b=req.body||{};
  const own=canSeeAll(req.user.role)?'':' AND assigned_to=$2';
  const params=[];const fields=['title','name','email','phone','source','source_detail','status','priority','budget_min','budget_max','property_type','city','client_id','notes','next_follow_up','last_contacted_at',...(canSeeAll(req.user.role)?['assigned_to']:[])];
  const sets=[];
  for(const f of fields) if(b[f]!==undefined){params.push(b[f]);sets.push(`${f}=$${params.length}`);}
  if(!sets.length)return res.status(400).json({error:'No fields to update'});
  if(b.assigned_to!==undefined&&b.assigned_to!==null){const a=await query("SELECT id FROM users WHERE id=$1 AND role IN ('admin','staff') AND is_active=true AND ($2::bigint IS NULL OR organization_id=$2)",[b.assigned_to, req.user.role==='superadmin'?null:req.user.organization_id]);if(!a.rowCount)return res.status(400).json({error:'Assignee must be an active admin or staff user'});}
  params.push(id);let where=`id=$${params.length}`;
  if(!canSeeAll(req.user.role)){params.push(req.user.id);where+=` AND assigned_to=$${params.length}`;}
  const {rows}=await query(`UPDATE leads SET ${sets.join(',')},updated_at=NOW() WHERE ${where} RETURNING *`,params);
  if(!rows[0])return res.status(404).json({error:'Lead not found or not assigned to you'});
  await logActivity(req.user.id,'lead_update',`Updated lead #${id}`);
  res.json({lead:rows[0]});
});
router.post('/:id/assign',requireRole('superadmin','admin'),async(req,res)=>{
  const assignee=Number(req.body?.assigned_to||0);
  const u=await query("SELECT id FROM users WHERE id=$1 AND role IN ('admin','staff') AND is_active=true AND ($2::bigint IS NULL OR organization_id=$2)",[assignee, req.user.role==='superadmin'?null:req.user.organization_id]);
  if(!u.rowCount)return res.status(400).json({error:'Invalid active staff/admin user'});
  const {rows}=await query('UPDATE leads SET assigned_to=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[assignee,Number(req.params.id)]);
  if(!rows[0])return res.status(404).json({error:'Lead not found'});
  await logActivity(req.user.id,'lead_assign',`Assigned lead #${req.params.id} to user #${assignee}`);
  res.json({lead:rows[0]});
});
router.get('/:id/followups',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const id=Number(req.params.id);
  const lead=await query(`SELECT id,assigned_to FROM leads WHERE id=$1`,[id]);
  if(!lead.rowCount||(!canSeeAll(req.user.role)&&lead.rows[0].assigned_to!==req.user.id))return res.status(404).json({error:'Lead not found'});
  const {rows}=await query(`SELECT f.*,u.name AS user_name FROM lead_followups f LEFT JOIN users u ON u.id=f.user_id WHERE f.lead_id=$1 ORDER BY COALESCE(f.scheduled_at,f.created_at) DESC`,[id]);
  res.json({followups:rows});
});
router.post('/:id/followups',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const id=Number(req.params.id);const b=req.body||{};
  const lead=await query('SELECT id,assigned_to FROM leads WHERE id=$1',[id]);
  if(!lead.rowCount||(!canSeeAll(req.user.role)&&lead.rows[0].assigned_to!==req.user.id))return res.status(404).json({error:'Lead not found'});
  const {rows}=await query(`INSERT INTO lead_followups(lead_id,user_id,followup_type,scheduled_at,outcome,notes,completed_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id,req.user.id,b.followup_type||'call',b.scheduled_at||null,b.outcome||null,b.notes||null,b.completed_at||null]);
  if(b.scheduled_at)await query('UPDATE leads SET next_follow_up=$1,updated_at=NOW() WHERE id=$2',[b.scheduled_at,id]);
  await logActivity(req.user.id,'lead_followup',`Follow-up added for lead #${id}`);
  res.status(201).json({followup:rows[0]});
});
router.post('/import/csv',requireRole('superadmin','admin','staff'),enforcePlanLimit('leads'),async(req,res)=>{
  const csv=String(req.body?.csv||'');
  if(!csv.trim())return res.status(400).json({error:'CSV text is required'});
  let records;
  try{records=parse(csv,{columns:true,skip_empty_lines:true,trim:true,relax_column_count:true});}
  catch(e){return res.status(400).json({error:`CSV parse error: ${e.message}`});}
  if(req.user.role!=='superadmin' && req.user.organization_id){
    const limit=await query(`SELECT p.lead_limit,(SELECT COUNT(*)::int FROM leads WHERE organization_id=$1) AS current_count FROM organization_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.organization_id=$1 ORDER BY s.created_at DESC LIMIT 1`,[req.user.organization_id]);
    const incoming=records.filter(r=>r.name).length;
    if(limit.rows[0] && Number(limit.rows[0].current_count)+incoming>Number(limit.rows[0].lead_limit))return res.status(402).json({error:`This CSV contains ${incoming} leads but your plan has only ${Math.max(0,Number(limit.rows[0].lead_limit)-Number(limit.rows[0].current_count))} lead slots remaining.`});
  }
  let imported=0,skipped=0;
  for(const r of records){
    if(!r.name){skipped++;continue;}
    await query(`INSERT INTO leads(name,email,phone,source,source_detail,campaign_name,status,assigned_to,created_by,notes)
      VALUES($1,$2,$3,$4,$5,$6,'new',$7,$8,$9)`,
      [r.name,r.email||null,r.phone||null,r.source||'CSV Import',r.source_detail||null,r.campaign_name||null,req.user.role==='staff'?req.user.id:null,req.user.id,r.notes||null]);
    imported++;
  }
  await logActivity(req.user.id,'lead_import',`Imported ${imported} leads from CSV`);
  res.json({imported,skipped});
});
export default router;
