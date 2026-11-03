import { Router } from 'express';
import { query, logActivity } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
const router=Router();router.use(requireAuth);
router.get('/tasks',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const params=[];let where='WHERE 1=1';
  if(req.user.role==='staff'){params.push(req.user.id);where+=` AND t.assigned_to=$${params.length}`;}
  if(req.query.status){params.push(req.query.status);where+=` AND t.status=$${params.length}`;}
  const {rows}=await query(`SELECT t.*,u.name AS assigned_name,l.name AS lead_name,c.name AS client_name FROM tasks t
    LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN leads l ON l.id=t.related_lead_id LEFT JOIN clients c ON c.id=t.related_client_id
    ${where} ORDER BY t.due_at NULLS LAST,t.created_at DESC LIMIT 500`,params);
  res.json({tasks:rows});
});
router.post('/tasks',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const b=req.body||{};if(!b.title?.trim())return res.status(400).json({error:'Task title is required'});
  const assigned=req.user.role==='staff'?req.user.id:Number(b.assigned_to||req.user.id);
  const valid=await query("SELECT id FROM users WHERE id=$1 AND role IN ('admin','staff') AND is_active=true AND ($2::bigint IS NULL OR organization_id=$2)",[assigned, req.user.role==='superadmin'?null:req.user.organization_id]);
  if(!valid.rowCount)return res.status(400).json({error:'Task owner must be an active admin or staff user'});
  const {rows}=await query(`INSERT INTO tasks(title,description,assigned_to,related_lead_id,related_client_id,due_at,priority,status,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.title.trim(),b.description||null,assigned,b.related_lead_id||null,b.related_client_id||null,b.due_at||null,b.priority||'medium',b.status||'open',req.user.id]);
  await logActivity(req.user.id,'task_create',`Created task ${b.title}`);
  res.status(201).json({task:rows[0]});
});
router.patch('/tasks/:id',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const b=req.body||{};const fields=['title','description','due_at','priority','status','completed_at'];const sets=[],values=[];
  for(const f of fields)if(b[f]!==undefined){values.push(b[f]);sets.push(`${f}=$${values.length}`);}
  if(!sets.length)return res.status(400).json({error:'No fields to update'});
  values.push(Number(req.params.id));let where=`id=$${values.length}`;
  if(req.user.role==='staff'){values.push(req.user.id);where+=` AND assigned_to=$${values.length}`;}
  const {rows}=await query(`UPDATE tasks SET ${sets.join(',')} WHERE ${where} RETURNING *`,values);
  if(!rows[0])return res.status(404).json({error:'Task not found'});
  res.json({task:rows[0]});
});
router.get('/site-visits',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const params=[];let where='WHERE 1=1';
  if(req.user.role==='staff'){params.push(req.user.id);where+=` AND sv.assigned_to=$${params.length}`;}
  const {rows}=await query(`SELECT sv.*,c.name AS client_name,p.title AS property_title,u.name AS assigned_name
    FROM site_visits sv LEFT JOIN clients c ON c.id=sv.client_id LEFT JOIN properties p ON p.id=sv.property_id
    LEFT JOIN users u ON u.id=sv.assigned_to ${where} ORDER BY sv.scheduled_at DESC LIMIT 500`,params);
  res.json({siteVisits:rows});
});
router.post('/site-visits',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const b=req.body||{};if(!b.scheduled_at)return res.status(400).json({error:'Visit date and time are required'});
  const assigned=req.user.role==='staff'?req.user.id:Number(b.assigned_to||req.user.id);
  const valid=await query("SELECT id FROM users WHERE id=$1 AND role IN ('admin','staff') AND is_active=true AND ($2::bigint IS NULL OR organization_id=$2)",[assigned, req.user.role==='superadmin'?null:req.user.organization_id]);
  if(!valid.rowCount)return res.status(400).json({error:'Site visit owner must be an active admin or staff user'});
  const {rows}=await query(`INSERT INTO site_visits(client_id,lead_id,property_id,unit_id,assigned_to,scheduled_at,status,feedback,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.client_id||null,b.lead_id||null,b.property_id||null,b.unit_id||null,assigned,b.scheduled_at,b.status||'scheduled',b.feedback||null,req.user.id]);
  await logActivity(req.user.id,'site_visit_create',`Scheduled site visit #${rows[0].id}`);
  res.status(201).json({siteVisit:rows[0]});
});
router.patch('/site-visits/:id',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const b=req.body||{};const {rows}=await query(`UPDATE site_visits SET status=COALESCE($1,status),feedback=COALESCE($2,feedback),scheduled_at=COALESCE($3,scheduled_at)
    WHERE id=$4 ${req.user.role==='staff'?'AND assigned_to=$5':''} RETURNING *`,
    req.user.role==='staff'?[b.status??null,b.feedback??null,b.scheduled_at??null,Number(req.params.id),req.user.id]:[b.status??null,b.feedback??null,b.scheduled_at??null,Number(req.params.id)]);
  if(!rows[0])return res.status(404).json({error:'Site visit not found'});
  res.json({siteVisit:rows[0]});
});
router.get('/calendar',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const params=[];let taskScope='',visitScope='',followScope='';
  if(req.user.role==='staff'){params.push(req.user.id);taskScope=' AND t.assigned_to=$1';visitScope=' WHERE sv.assigned_to=$1';followScope=' AND l.assigned_to=$1';}
  const {rows}=await query(`SELECT * FROM (
    SELECT 'task' AS event_type,t.id,t.title AS label,t.due_at AS event_at,t.status FROM tasks t WHERE t.due_at IS NOT NULL ${taskScope}
    UNION ALL
    SELECT 'site_visit',sv.id,COALESCE(p.title,'Site visit'),sv.scheduled_at,sv.status FROM site_visits sv LEFT JOIN properties p ON p.id=sv.property_id ${visitScope}
    UNION ALL
    SELECT 'lead_followup',f.id,'Follow-up: '||l.name,f.scheduled_at,COALESCE(f.outcome,'scheduled')
      FROM lead_followups f JOIN leads l ON l.id=f.lead_id WHERE f.scheduled_at IS NOT NULL ${followScope}
  ) events WHERE event_at >= NOW() - INTERVAL '30 days' ORDER BY event_at LIMIT 500`,params);
  res.json({events:rows});
});
export default router;
