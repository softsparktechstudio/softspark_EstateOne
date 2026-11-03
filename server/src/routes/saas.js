import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool, query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
const orgId = (req) => Number(req.user.organization_id || 0);
const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150);

router.get('/plans', async (_req,res) => {
  const {rows}=await query('SELECT id,code,name,monthly_price,annual_price,user_limit,lead_limit,property_limit,features FROM subscription_plans WHERE is_active=true ORDER BY monthly_price');
  res.json({plans:rows});
});
router.get('/organizations', requireRole('superadmin'), async (_req,res) => {
  const {rows}=await query(`SELECT o.*,u.name AS owner_name,s.status AS subscription_status,p.name AS plan_name
    FROM organizations o LEFT JOIN users u ON u.id=o.owner_user_id
    LEFT JOIN LATERAL (SELECT * FROM organization_subscriptions x WHERE x.organization_id=o.id ORDER BY x.created_at DESC LIMIT 1) s ON true
    LEFT JOIN subscription_plans p ON p.id=s.plan_id ORDER BY o.created_at DESC`);
  res.json({organizations:rows});
});
router.post('/organizations', requireRole('superadmin'), async (req,res) => {
  const b=req.body||{};
  if(!b.name?.trim()||!b.adminName?.trim()||!b.adminEmail?.trim()||!b.adminPassword||b.adminPassword.length<10)
    return res.status(400).json({error:'Company name, admin name, admin email and an admin password of at least 10 characters are required.'});
  const slug=slugify(b.slug||b.name);
  if(!slug)return res.status(400).json({error:'Enter a company name or a valid public portal slug.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.organization_id',$1,true), set_config('app.is_superadmin',$2,true)`, [orgId(req) ? String(orgId(req)) : '', req.user.role === 'superadmin' ? 'true' : 'false']);
    const org=await client.query(`INSERT INTO organizations(name,slug,email,phone,website,status) VALUES($1,$2,$3,$4,$5,'trial') RETURNING *`,[b.name.trim(),slug,b.email||null,b.phone||null,b.website||null]);
    const hash=await bcrypt.hash(b.adminPassword,10);
    const admin=await client.query(`INSERT INTO users(name,email,phone,password_hash,role,organization_id) VALUES($1,$2,$3,$4,'admin',$5) RETURNING id,name,email,role,organization_id`,[b.adminName.trim(),b.adminEmail.trim().toLowerCase(),b.adminPhone||null,hash,org.rows[0].id]);
    await client.query('UPDATE organizations SET owner_user_id=$1 WHERE id=$2',[admin.rows[0].id,org.rows[0].id]);
    const plan=await client.query(`SELECT id FROM subscription_plans WHERE code='starter'`);
    if(plan.rows[0]) await client.query(`INSERT INTO organization_subscriptions(organization_id,plan_id,status,trial_ends_at,ends_at) VALUES($1,$2,'trial',NOW()+INTERVAL '14 days',NOW()+INTERVAL '14 days')`,[org.rows[0].id,plan.rows[0].id]);
    await client.query(`INSERT INTO marketplace_settings(organization_id,public_name,slug) VALUES($1,$2,$3)`,[org.rows[0].id,org.rows[0].name,slug]);
    await client.query('COMMIT');
    res.status(201).json({organization:org.rows[0],admin:admin.rows[0]});
  } catch(e) { await client.query('ROLLBACK'); if(e.code==='23505')return res.status(409).json({error:'Company slug or admin email already exists.'}); throw e; }
  finally {client.release();}
});
// Super Admin can explicitly attach an existing Admin account to a company workspace.
router.get('/admin-accounts', requireRole('superadmin'), async (_req,res)=>{
  const {rows}=await query(`SELECT id,name,email,organization_id FROM users WHERE role='admin' ORDER BY name,email`);
  res.json({admins:rows});
});
router.patch('/organizations/:id/assign-admin', requireRole('superadmin'), async(req,res)=>{
  const organizationId=Number(req.params.id);
  const adminId=Number(req.body?.adminId);
  if(!Number.isInteger(organizationId)||organizationId<1||!Number.isInteger(adminId)||adminId<1)
    return res.status(400).json({error:'Select a valid company and Admin account.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.organization_id',$1,true),set_config('app.is_superadmin','true',true)`,[orgId(req)?String(orgId(req)):'']);
    const org=await client.query('SELECT id,name FROM organizations WHERE id=$1',[organizationId]);
    if(!org.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Company not found.'});}
    const admin=await client.query(`UPDATE users SET organization_id=$1 WHERE id=$2 AND role='admin' RETURNING id,name,email,organization_id`,[organizationId,adminId]);
    if(!admin.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Admin account not found.'});}
    await client.query('UPDATE organizations SET owner_user_id=$1,updated_at=NOW() WHERE id=$2',[adminId,organizationId]);
    await client.query('COMMIT');
    res.json({organization:org.rows[0],admin:admin.rows[0],message:`${admin.rows[0].name} is now assigned to ${org.rows[0].name}.`});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
});

router.get('/subscription', async(req,res)=>{
  if(!orgId(req)) return res.status(409).json({error:'This account is not assigned to a company.'});
  const {rows}=await query(`SELECT s.*,p.code AS plan_code,p.name AS plan_name,p.monthly_price,p.annual_price,p.user_limit,p.lead_limit,p.property_limit
    FROM organization_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.organization_id=$1 ORDER BY CASE WHEN s.status IN ('active','trial') THEN 0 ELSE 1 END,s.created_at DESC LIMIT 1`,[orgId(req)]);
  res.json({subscription:rows[0]||null});
});
router.post('/subscription/change', requireRole('admin','superadmin'), async(req,res)=>{
  const {planCode,billingCycle='monthly'}=req.body||{};
  if(!['monthly','annual'].includes(billingCycle))return res.status(400).json({error:'Invalid billing cycle'});
  if(!orgId(req))return res.status(409).json({error:'Company is not configured'});
  const plan=await query('SELECT * FROM subscription_plans WHERE code=$1 AND is_active=true',[planCode]);
  if(!plan.rowCount)return res.status(404).json({error:'Plan not found'});
  const amount=Number(billingCycle==='annual'?plan.rows[0].annual_price:plan.rows[0].monthly_price);
  if(!amount)return res.status(400).json({error:'Contact sales to activate the Enterprise plan.'});
  let gatewayOrderId=null;
  if(!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET){
    if(planCode !== 'starter') return res.status(503).json({error:'Configure Razorpay credentials before activating a paid plan. The local Starter trial remains available.'});
  }
  if(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET){
    const auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/json'},body:JSON.stringify({amount:Math.round(amount*100),currency:'INR',receipt:`cw-${orgId(req)}-${Date.now()}`}),signal:AbortSignal.timeout(20000)});
    const order=await response.json(); if(!response.ok)return res.status(502).json({error:'Payment gateway could not create an order.'}); gatewayOrderId=order.id;
  }
  const sub=await query(`INSERT INTO organization_subscriptions(organization_id,plan_id,billing_cycle,status,starts_at,ends_at,gateway)
    VALUES($1,$2,$3,$4,NOW(),NOW()+CASE WHEN $3='annual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END,$5) RETURNING *`,[orgId(req),plan.rows[0].id,billingCycle,gatewayOrderId?'pending':'trial',gatewayOrderId?'razorpay':null]);
  const bill=await query(`INSERT INTO billing_transactions(organization_id,subscription_id,amount,status,gateway,gateway_order_id,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,[orgId(req),sub.rows[0].id,amount,gatewayOrderId?'created':'manual_review',gatewayOrderId?'razorpay':'manual',gatewayOrderId,JSON.stringify({plan:planCode,billingCycle})]);
  res.status(201).json({subscription:sub.rows[0],billing:bill.rows[0],razorpay:gatewayOrderId?{keyId:process.env.RAZORPAY_KEY_ID,orderId:gatewayOrderId,amount:Math.round(amount*100),currency:'INR'}:null,message:gatewayOrderId?'Payment order created. Complete checkout and verify the payment signature before activating the plan.':'Subscription request recorded. Configure Razorpay to collect payments online.'});
});

router.post('/subscription/verify', requireRole('admin','superadmin'), async(req,res)=>{
  const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body||{};
  if(!process.env.RAZORPAY_KEY_SECRET||!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return res.status(400).json({error:'Payment verification details are incomplete.'});
  const expected=createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  const a=Buffer.from(expected);const b=Buffer.from(String(razorpay_signature));
  if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(400).json({error:'Payment signature verification failed.'});
  const bill=await query(`UPDATE billing_transactions SET status='paid',gateway_payment_id=$1 WHERE gateway_order_id=$2 AND organization_id=$3 RETURNING subscription_id`,[razorpay_payment_id,razorpay_order_id,orgId(req)]);
  if(!bill.rowCount)return res.status(404).json({error:'Matching billing order was not found for this company.'});
  await query(`UPDATE organization_subscriptions SET status='expired',updated_at=NOW() WHERE organization_id=$1 AND id<>$2 AND status IN ('active','trial')`,[orgId(req),bill.rows[0].subscription_id]);
  await query(`UPDATE organization_subscriptions SET status='active',updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[bill.rows[0].subscription_id,orgId(req)]);
  await query(`UPDATE organizations SET status='active',updated_at=NOW() WHERE id=$1`,[orgId(req)]);
  res.json({ok:true,status:'active'});
});
router.get('/partners', async(req,res)=>{
  if(!orgId(req))return res.status(409).json({error:'Company is not configured'});
  const {rows}=await query(`SELECT cp.*,pj.name AS project_name,COUNT(pr.id)::int AS referral_count,COALESCE(SUM(pr.commission_amount),0)::numeric AS commission_total FROM channel_partners cp LEFT JOIN projects pj ON pj.id=cp.project_id LEFT JOIN partner_referrals pr ON pr.partner_id=cp.id AND pr.organization_id=cp.organization_id WHERE cp.organization_id=$1 GROUP BY cp.id,pj.name ORDER BY cp.created_at DESC`,[orgId(req)]);
  res.json({partners:rows});
});
router.post('/partners', requireRole('admin','superadmin'), async(req,res)=>{
  const b=req.body||{};if(!b.name?.trim())return res.status(400).json({error:'Partner name is required'});
  if(b.project_id){const project=await query('SELECT id FROM projects WHERE id=$1 AND organization_id=$2',[Number(b.project_id),orgId(req)]);if(!project.rowCount)return res.status(400).json({error:'Select a project belonging to your company.'});}
  const code=(b.partner_code||`CP-${Date.now().toString().slice(-7)}`).toUpperCase();
  const {rows}=await query(`INSERT INTO channel_partners(organization_id,name,company_name,email,phone,partner_code,commission_rate,notes,created_by,project_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[orgId(req),b.name.trim(),b.company_name||null,b.email||null,b.phone||null,code,Number(b.commission_rate||0),b.notes||null,req.user.id,b.project_id||null]);
  res.status(201).json({partner:rows[0]});
});
router.post('/partners/:id/referrals', requireRole('admin','superadmin','staff'), async(req,res)=>{
  const b=req.body||{};const partner=await query('SELECT id FROM channel_partners WHERE id=$1 AND organization_id=$2',[Number(req.params.id),orgId(req)]);
  if(!partner.rowCount)return res.status(404).json({error:'Partner not found'});
  if(b.property_id){const property=await query('SELECT id FROM properties WHERE id=$1',[Number(b.property_id)]);if(!property.rowCount)return res.status(400).json({error:'Property does not belong to this company or was not found.'});}
  const {rows}=await query(`INSERT INTO partner_referrals(organization_id,partner_id,referral_name,referral_phone,property_id,commission_amount,status) VALUES($1,$2,$3,$4,$5,$6,'new') RETURNING *`,[orgId(req),partner.rows[0].id,b.referral_name||null,b.referral_phone||null,b.property_id||null,Number(b.commission_amount||0)]);
  res.status(201).json({referral:rows[0]});
});
router.get('/marketplace/settings', requireRole('admin','superadmin'), async(req,res)=>{
  const {rows}=await query('SELECT * FROM marketplace_settings WHERE organization_id=$1',[orgId(req)]);res.json({settings:rows[0]||null});
});
router.get('/marketplace/inquiries', requireRole('admin','superadmin'), async(req,res)=>{
  const {rows}=await query(`SELECT mi.*,p.title AS property_title FROM marketplace_inquiries mi LEFT JOIN properties p ON p.id=mi.property_id WHERE mi.organization_id=$1 ORDER BY mi.created_at DESC LIMIT 300`,[orgId(req)]);res.json({inquiries:rows});
});
router.put('/marketplace/settings', requireRole('admin','superadmin'), async(req,res)=>{
  const b=req.body||{};const slug=slugify(b.slug||b.public_name);
  const {rows}=await query(`INSERT INTO marketplace_settings(organization_id,enabled,public_name,slug,description,contact_email,contact_phone) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(organization_id) DO UPDATE SET enabled=EXCLUDED.enabled,public_name=EXCLUDED.public_name,slug=EXCLUDED.slug,description=EXCLUDED.description,contact_email=EXCLUDED.contact_email,contact_phone=EXCLUDED.contact_phone,updated_at=NOW() RETURNING *`,[orgId(req),b.enabled!==false,b.public_name||null,slug,b.description||null,b.contact_email||null,b.contact_phone||null]);
  res.json({settings:rows[0]});
});
router.post('/whatsapp/send', requireRole('admin','superadmin','staff'), async(req,res)=>{
  const b=req.body||{};if(!/^\+?[1-9]\d{7,14}$/.test(String(b.to||'').replace(/[\s()-]/g,''))||!b.message?.trim())return res.status(400).json({error:'Enter a valid international phone number and message.'});
  if(!process.env.WHATSAPP_TOKEN||!process.env.WHATSAPP_PHONE_NUMBER_ID)return res.status(503).json({error:'WhatsApp Cloud API is not configured. Add WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID to server/.env.'});
  const phone=String(b.to).replace(/\D/g,'');
  const response=await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v21.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',headers:{Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:phone,type:'text',text:{preview_url:false,body:String(b.message).slice(0,4000)}}),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({}));
  const status=response.ok?'submitted':'failed';
  await query(`INSERT INTO whatsapp_message_log(organization_id,user_id,to_phone,message,provider_message_id,status,error) VALUES($1,$2,$3,$4,$5,$6,$7)`,[orgId(req),req.user.id,phone,String(b.message).slice(0,4000),data.messages?.[0]?.id||null,status,response.ok?null:(data.error?.message||'WhatsApp provider error')]);
  if(!response.ok)return res.status(502).json({error:data.error?.message||'WhatsApp provider rejected the message.'});
  res.json({ok:true,messageId:data.messages?.[0]?.id||null,status:'submitted'});
});
router.get('/whatsapp/logs', requireRole('admin','superadmin'), async(req,res)=>{
  const {rows}=await query('SELECT id,to_phone,message,status,error,created_at FROM whatsapp_message_log WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100',[orgId(req)]);res.json({messages:rows});
});
export default router;
