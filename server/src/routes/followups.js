import { Router } from 'express';
import { query, logActivity } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
const router=Router(); router.use(requireAuth,requireRole('superadmin','admin','staff'));
const all=(r)=>['superadmin','admin'].includes(r);
router.get('/',async(req,res)=>{
 const params=[];let where='WHERE 1=1';
 if(!all(req.user.role)){params.push(req.user.id);where+=` AND (f.user_id=$${params.length} OR l.assigned_to=$${params.length})`;}
 if(req.query.status){params.push(req.query.status);where+=` AND f.status=$${params.length}`;}
 if(req.query.priority){params.push(req.query.priority);where+=` AND f.priority=$${params.length}`;}
 const {rows}=await query(`SELECT f.*,l.name AS lead_name,l.phone AS lead_phone,l.email AS lead_email,l.assigned_to,u.name AS assigned_name,creator.name AS created_by_name FROM lead_followups f JOIN leads l ON l.id=f.lead_id LEFT JOIN users u ON u.id=l.assigned_to LEFT JOIN users creator ON creator.id=f.user_id ${where} ORDER BY COALESCE(f.scheduled_at,f.created_at) DESC LIMIT 500`,params);
 res.json({followups:rows});
});
router.get('/options',async(req,res)=>{
 const params=[];let where=`WHERE 1=1`;if(!all(req.user.role)){params.push(req.user.id);where+=` AND assigned_to=$1`;}
 const leads=await query(`SELECT id,name,status,source,priority FROM leads ${where} ORDER BY name LIMIT 500`,params);
 res.json({leads:leads.rows});
});
router.post('/',async(req,res)=>{
 const b=req.body||{};const leadId=Number(b.lead_id);if(!leadId)return res.status(400).json({error:'Select a lead.'});
 const lead=await query('SELECT id,assigned_to FROM leads WHERE id=$1',[leadId]);if(!lead.rowCount||(!all(req.user.role)&&Number(lead.rows[0].assigned_to)!==Number(req.user.id)))return res.status(404).json({error:'Lead not found or not assigned to you.'});
 const allowed=['contacted','qualified','site visit','negotiations','completed','negative'];const status=allowed.includes(String(b.status||'').toLowerCase())?String(b.status).toLowerCase():'contacted';
 const priority=['urgent','high','medium','low'].includes(String(b.priority||'').toLowerCase())?String(b.priority).toLowerCase():'medium';
 const {rows}=await query(`INSERT INTO lead_followups(lead_id,user_id,followup_type,scheduled_at,outcome,notes,status,source,priority,stage,title) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[leadId,req.user.id,b.followup_type||'call',b.scheduled_at||null,b.outcome||null,b.notes||null,status,b.source||'Phone Call',priority,b.stage||lead.rows[0].status||'new',b.title||null]);
 if(b.scheduled_at)await query('UPDATE leads SET next_follow_up=$1,updated_at=NOW() WHERE id=$2',[b.scheduled_at,leadId]);
 await logActivity(req.user.id,'followup_create',`Created follow-up for lead #${leadId}`);res.status(201).json({followup:rows[0]});
});
router.patch('/:id',async(req,res)=>{
 const id=Number(req.params.id),b=req.body||{};const existing=await query(`SELECT f.id,l.assigned_to FROM lead_followups f JOIN leads l ON l.id=f.lead_id WHERE f.id=$1`,[id]);
 if(!existing.rowCount||(!all(req.user.role)&&Number(existing.rows[0].assigned_to)!==Number(req.user.id)))return res.status(404).json({error:'Follow-up not found.'});
 const fields=['status','source','priority','stage','scheduled_at','notes','outcome','title'];const sets=[],vals=[];if(b.status!==undefined&&!['contacted','qualified','site visit','negotiations','completed','negative'].includes(String(b.status).toLowerCase()))return res.status(400).json({error:'Invalid follow-up status.'});if(b.priority!==undefined&&!['urgent','high','medium','low'].includes(String(b.priority).toLowerCase()))return res.status(400).json({error:'Invalid priority.'});if(b.stage!==undefined&&!['new','qualification','site_visit','negotiation','booking','won','lost'].includes(String(b.stage)))return res.status(400).json({error:'Invalid sales stage.'});for(const f of fields)if(b[f]!==undefined){vals.push(b[f]);sets.push(`${f}=$${vals.length}`);}if(b.status==='completed'){sets.push('completed_at=NOW()');}if(!sets.length)return res.status(400).json({error:'No changes supplied.'});vals.push(id);const {rows}=await query(`UPDATE lead_followups SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`,vals);res.json({followup:rows[0]});
});
router.delete('/:id',async(req,res)=>{const id=Number(req.params.id);const existing=await query(`SELECT f.id,l.assigned_to FROM lead_followups f JOIN leads l ON l.id=f.lead_id WHERE f.id=$1`,[id]);if(!existing.rowCount||(!all(req.user.role)&&Number(existing.rows[0].assigned_to)!==Number(req.user.id)))return res.status(404).json({error:'Follow-up not found.'});await query('DELETE FROM lead_followups WHERE id=$1',[id]);res.json({ok:true});});
export default router;
