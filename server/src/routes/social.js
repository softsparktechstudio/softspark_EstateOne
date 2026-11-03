import { Router } from 'express';
import crypto from 'crypto';
import { query, queryAsTenant, logActivity } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { enforcePlanLimit } from '../middleware/planLimits.js';

const router=Router();
const graphVersion=process.env.META_GRAPH_VERSION||'v21.0';
function verifySignature(req){
  if(!process.env.META_APP_SECRET)return process.env.NODE_ENV!=='production'; // signature bypass is allowed only in local development
  const signature=req.headers['x-hub-signature-256'];
  if(!signature||!req.rawBody)return false;
  const expected='sha256='+crypto.createHmac('sha256',process.env.META_APP_SECRET).update(req.rawBody).digest('hex');
  const a=Buffer.from(signature),b=Buffer.from(expected);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function fetchMetaLead(leadId){
  if(!process.env.META_ACCESS_TOKEN)throw new Error('META_ACCESS_TOKEN is not configured in server/.env');
  const url=`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(leadId)}?fields=id,created_time,field_data,form_id,ad_id&access_token=${encodeURIComponent(process.env.META_ACCESS_TOKEN)}`;
  const response=await fetch(url);
  const data=await response.json();
  if(!response.ok)throw new Error(data.error?.message||'Meta Graph API request failed');
  const fields=Object.fromEntries((data.field_data||[]).map(x=>[String(x.name).toLowerCase(),Array.isArray(x.values)?x.values[0]:x.values]));
  return {data,fields};
}
async function ingestMetaLead(leadId,formId=null,payload={},organizationId=null){
  if(!organizationId)throw new Error('Set META_ORGANIZATION_ID to route incoming Meta leads to a company.');
  const existing=await queryAsTenant(organizationId,'SELECT id FROM leads WHERE social_lead_id=$1',[String(leadId)]);
  if(existing.rowCount)return {duplicate:true,leadId:existing.rows[0].id};
  const limit=await queryAsTenant(organizationId,`SELECT p.lead_limit,(SELECT COUNT(*)::int FROM leads WHERE organization_id=$1) AS current_count FROM organization_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.organization_id=$1 ORDER BY s.created_at DESC LIMIT 1`,[organizationId]);
  if(limit.rows[0] && Number(limit.rows[0].current_count)>=Number(limit.rows[0].lead_limit))throw new Error('Company lead limit reached. Upgrade the subscription to receive more leads.');
  const {data,fields}=await fetchMetaLead(leadId);
  const name=fields.full_name||fields.name||[fields.first_name,fields.last_name].filter(Boolean).join(' ')||'Social Media Lead';
  const email=fields.email||fields.email_address||null;
  const phone=fields.phone_number||fields.phone||fields.mobile_number||null;
  const {rows}=await queryAsTenant(organizationId,`INSERT INTO leads(name,email,phone,source,source_detail,social_platform,social_lead_id,social_form_id,campaign_name,status,notes)
    VALUES($1,$2,$3,'Social Media','Meta Lead Ads','Meta',$4,$5,$6,'new',$7) RETURNING id`,
    [name,email,phone,String(leadId),formId||data.form_id||null,data.campaign_name||null,JSON.stringify(fields)]);
  await queryAsTenant(organizationId,`INSERT INTO social_lead_events(platform,external_lead_id,payload,processing_status)
    VALUES('Meta',$1,$2::jsonb,'processed') ON CONFLICT(external_lead_id) DO UPDATE SET processing_status='processed',payload=EXCLUDED.payload`,
    [String(leadId),JSON.stringify(payload)]);
  return {duplicate:false,leadId:rows[0].id};
}
export const metaWebhook={
  verify:(req,res)=>{
    const mode=req.query['hub.mode'],token=req.query['hub.verify_token'],challenge=req.query['hub.challenge'];
    if(mode==='subscribe'&&token&&token===process.env.META_VERIFY_TOKEN)return res.status(200).send(challenge);
    return res.sendStatus(403);
  },
  receive:async(req,res)=>{
    if(!verifySignature(req))return res.sendStatus(401);
    // Acknowledge Meta quickly, then process events asynchronously.
    res.sendStatus(200);
    if(req.body?.object!=='page')return;
    for(const entry of req.body.entry||[]){
      for(const change of entry.changes||[]){
        if(change.field!=='leadgen')continue;
        const value=change.value||{};
        const leadId=value.leadgen_id;
        if(!leadId)continue;
        try{await ingestMetaLead(leadId,value.form_id,change,Number(process.env.META_ORGANIZATION_ID||0));}
        catch(e){
          await queryAsTenant(Number(process.env.META_ORGANIZATION_ID||0),`INSERT INTO social_lead_events(platform,external_lead_id,payload,processing_status,error_message)
            VALUES('Meta',$1,$2::jsonb,'failed',$3) ON CONFLICT(external_lead_id) DO UPDATE SET processing_status='failed',error_message=EXCLUDED.error_message`,
            [String(leadId),JSON.stringify(change),e.message]).catch(()=>{});
          console.error('Meta lead ingestion failed:',e.message);
        }
      }
    }
  }
};
router.use(requireAuth);
router.get('/connections',requireRole('superadmin','admin','staff'),async(_req,res)=>{
  res.json({connections:[{platform:'Facebook / Instagram Lead Ads',configured:!!(process.env.META_ACCESS_TOKEN&&process.env.META_VERIFY_TOKEN&&process.env.META_APP_SECRET),webhookPath:'/webhooks/meta',mode:'Meta Graph API webhook'},{platform:'WhatsApp Business Platform',configured:!!(process.env.WHATSAPP_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID),mode:'WhatsApp Cloud API text messaging'}]});
});
router.post('/meta/sync/:leadId',requireRole('superadmin','admin'),async(req,res)=>{
  try{const result=await ingestMetaLead(req.params.leadId,req.body?.form_id,{manual:true},req.user.organization_id);await logActivity(req.user.id,'social_lead_sync',`Synced Meta lead ${req.params.leadId}`);res.status(result.duplicate?200:201).json(result);}
  catch(e){res.status(400).json({error:e.message});}
});
router.post('/manual',requireRole('superadmin','admin','staff'),enforcePlanLimit('leads'),async(req,res)=>{
  const b=req.body||{};if(!b.name)return res.status(400).json({error:'Lead name is required'});
  const {rows}=await query(`INSERT INTO leads(name,email,phone,source,source_detail,social_platform,campaign_name,status,assigned_to,created_by,notes)
    VALUES($1,$2,$3,$4,$5,$6,$7,'new',$8,$9,$10) RETURNING *`,
    [b.name,b.email||null,b.phone||null,b.source||'Social Media',b.source_detail||null,b.social_platform||'Other',b.campaign_name||null,req.user.role==='staff'?req.user.id:null,req.user.id,b.notes||null]);
  await logActivity(req.user.id,'social_lead_manual',`Added ${b.social_platform||'social'} lead ${b.name}`);
  res.status(201).json({lead:rows[0]});
});
export default router;
