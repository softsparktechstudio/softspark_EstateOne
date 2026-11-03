import { Router } from 'express';
import { query, logActivity, pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
const router=Router();router.use(requireAuth);
router.get('/',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const params=[];let where='WHERE 1=1';
  if(req.user.role==='staff'){params.push(req.user.id);where+=` AND d.assigned_to=$1`;}
  const {rows}=await query(`SELECT d.*,c.name AS client_name,p.title AS property_title,u.unit_number,us.name AS assigned_name
    FROM deals d LEFT JOIN clients c ON c.id=d.client_id LEFT JOIN properties p ON p.id=d.property_id
    LEFT JOIN units u ON u.id=d.unit_id LEFT JOIN users us ON us.id=d.assigned_to ${where}
    ORDER BY d.created_at DESC LIMIT 500`,params);
  res.json({deals:rows});
});
router.post('/',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const b=req.body||{};if(!b.client_id&&!b.lead_id)return res.status(400).json({error:'Select a client or lead'});
  const assigned=req.user.role==='staff'?req.user.id:Number(b.assigned_to||req.user.id);
  const valid=await query("SELECT id FROM users WHERE id=$1 AND role IN ('admin','staff') AND is_active=true AND ($2::bigint IS NULL OR organization_id=$2)",[assigned, req.user.role==='superadmin'?null:req.user.organization_id]);
  if(!valid.rowCount)return res.status(400).json({error:'Deal owner must be an active admin or staff user'});
  const code=`CW-${Date.now().toString().slice(-8)}`;
  const {rows}=await query(`INSERT INTO deals(deal_code,lead_id,client_id,property_id,unit_id,assigned_to,deal_value,commission_rate,stage,expected_close_date,notes,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [code,b.lead_id||null,b.client_id||null,b.property_id||null,b.unit_id||null,assigned,Number(b.deal_value||0),Number(b.commission_rate||0),b.stage||'negotiation',b.expected_close_date||null,b.notes||null,req.user.id]);
  await logActivity(req.user.id,'deal_create',`Created deal ${code}`);
  res.status(201).json({deal:rows[0]});
});
router.patch('/:id',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const b=req.body||{};const fields=['deal_value','commission_rate','stage','expected_close_date','notes',...(req.user.role==='staff'?[]:['assigned_to'])];const sets=[],values=[];
  for(const f of fields)if(b[f]!==undefined){values.push(b[f]);sets.push(`${f}=$${values.length}`);}
  if(!sets.length)return res.status(400).json({error:'No fields to update'});
  if(b.assigned_to!==undefined){const valid=await query("SELECT id FROM users WHERE id=$1 AND role IN ('admin','staff') AND is_active=true AND ($2::bigint IS NULL OR organization_id=$2)",[b.assigned_to, req.user.role==='superadmin'?null:req.user.organization_id]);if(!valid.rowCount)return res.status(400).json({error:'Deal owner must be an active admin or staff user'});}
  values.push(Number(req.params.id));let where=`id=$${values.length}`;
  if(req.user.role==='staff'){values.push(req.user.id);where+=` AND assigned_to=$${values.length}`;}
  const {rows}=await query(`UPDATE deals SET ${sets.join(',')},updated_at=NOW() WHERE ${where} RETURNING *`,values);
  if(!rows[0])return res.status(404).json({error:'Deal not found'});
  res.json({deal:rows[0]});
});
router.get('/bookings',requireRole('superadmin','admin'),async(req,res)=>{
  const {rows}=await query(`SELECT b.*,c.name AS client_name,p.title AS property_title,u.unit_number FROM bookings b
    LEFT JOIN clients c ON c.id=b.client_id LEFT JOIN properties p ON p.id=b.property_id LEFT JOIN units u ON u.id=b.unit_id
    ORDER BY b.created_at DESC LIMIT 500`);
  res.json({bookings:rows});
});
router.post('/bookings',requireRole('superadmin','admin'),async(req,res)=>{
  const b=req.body||{};if(!b.client_id||!b.total_amount)return res.status(400).json({error:'Client and total amount are required'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.organization_id',$1,true), set_config('app.is_superadmin',$2,true)`, [req.user.organization_id ? String(req.user.organization_id) : '', req.user.role === 'superadmin' ? 'true' : 'false']);
    if(b.unit_id){
      const unit=await client.query('SELECT id,status FROM units WHERE id=$1 FOR UPDATE',[b.unit_id]);
      if(!unit.rowCount)throw new Error('Unit not found');
      if(!['available','hold'].includes(unit.rows[0].status))throw new Error('This unit is not available for booking');
    }
    const bookingNo=`BK-${Date.now().toString().slice(-9)}`;
    const inserted=await client.query(`INSERT INTO bookings(deal_id,client_id,property_id,unit_id,booking_number,total_amount,booking_amount,status,notes,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.deal_id||null,b.client_id,b.property_id||null,b.unit_id||null,bookingNo,Number(b.total_amount),Number(b.booking_amount||0),b.status||'reserved',b.notes||null,req.user.id]);
    if(b.unit_id)await client.query("UPDATE units SET status='booked',updated_at=NOW() WHERE id=$1",[b.unit_id]);
    if(b.deal_id)await client.query("UPDATE deals SET stage='won',updated_at=NOW() WHERE id=$1",[b.deal_id]);
    await client.query('COMMIT');
    await logActivity(req.user.id,'booking_create',`Created booking ${bookingNo}`);
    res.status(201).json({booking:inserted.rows[0]});
  }catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message});}
  finally{client.release();}
});
router.get('/bookings/:id/schedules',requireRole('superadmin','admin'),async(req,res)=>{
  const {rows}=await query('SELECT * FROM payment_schedules WHERE booking_id=$1 ORDER BY due_date,id',[Number(req.params.id)]);
  res.json({schedules:rows});
});
router.post('/bookings/:id/schedules',requireRole('superadmin','admin'),async(req,res)=>{
  const b=req.body||{};if(!b.milestone||!b.amount)return res.status(400).json({error:'Milestone and amount are required'});
  const {rows}=await query(`INSERT INTO payment_schedules(booking_id,milestone,due_date,amount,paid_amount,status)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[Number(req.params.id),b.milestone,b.due_date||null,Number(b.amount),Number(b.paid_amount||0),b.status||'pending']);
  res.status(201).json({schedule:rows[0]});
});
router.patch('/schedules/:id',requireRole('superadmin','admin'),async(req,res)=>{
  const b=req.body||{};const {rows}=await query(`UPDATE payment_schedules SET paid_amount=COALESCE($1,paid_amount),status=COALESCE($2,status),due_date=COALESCE($3,due_date)
    WHERE id=$4 RETURNING *`,[b.paid_amount??null,b.status??null,b.due_date??null,Number(req.params.id)]);
  if(!rows[0])return res.status(404).json({error:'Payment schedule not found'});
  res.json({schedule:rows[0]});
});
router.get('/invoices',requireRole('superadmin','admin'),async(req,res)=>{
  const {rows}=await query(`SELECT i.*,b.booking_number,c.name AS client_name FROM invoices i LEFT JOIN bookings b ON b.id=i.booking_id LEFT JOIN clients c ON c.id=b.client_id ORDER BY i.created_at DESC LIMIT 500`);
  res.json({invoices:rows});
});
router.post('/invoices',requireRole('superadmin','admin'),async(req,res)=>{
  const b=req.body||{};const n=b.invoice_number||`INV-${Date.now().toString().slice(-9)}`;
  const subtotal=Number(b.subtotal||0),tax=Number(b.tax_amount||0);
  const {rows}=await query(`INSERT INTO invoices(booking_id,invoice_number,due_date,subtotal,tax_amount,total_amount,status,notes,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.booking_id||null,n,b.due_date||null,subtotal,tax,subtotal+tax,b.status||'issued',b.notes||null,req.user.id]);
  res.status(201).json({invoice:rows[0]});
});
router.get('/commissions',requireRole('superadmin','admin'),async(_req,res)=>{
  const {rows}=await query(`SELECT c.*,u.name AS payee_user FROM commissions c LEFT JOIN users u ON u.id=c.payee_user_id ORDER BY c.created_at DESC`);
  res.json({commissions:rows});
});
router.post('/commissions',requireRole('superadmin','admin'),async(req,res)=>{
  const b=req.body||{};const rate=Number(b.rate||0),base=Number(b.base_amount||0),amount=Number(b.amount??(base*rate/100));
  const {rows}=await query(`INSERT INTO commissions(deal_id,booking_id,payee_user_id,payee_name,rate,amount,status,due_date)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.deal_id||null,b.booking_id||null,b.payee_user_id||null,b.payee_name||null,rate,amount,b.status||'pending',b.due_date||null]);
  res.status(201).json({commission:rows[0]});
});
export default router;
