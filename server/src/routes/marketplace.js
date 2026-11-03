import { Router } from 'express';
import { query, queryAsTenant } from '../db.js';
const router=Router();

// Public directory of published properties across enabled company marketplaces.
router.get('/public',async(_req,res)=>{
 const portals=await query(`SELECT ms.organization_id,ms.slug,ms.public_name,o.name AS company_name FROM marketplace_settings ms JOIN organizations o ON o.id=ms.organization_id WHERE ms.enabled=true AND o.status IN ('active','trial') ORDER BY o.name`);
 const properties=[];
 for(const c of portals.rows){
  const result=await queryAsTenant(c.organization_id,`SELECT p.id,p.title,p.property_type,p.listing_type,p.description,p.address,p.city,p.state,p.bedrooms,p.bathrooms,p.area_sqft,p.price,pr.name AS project_name,(SELECT file_path FROM property_images pi WHERE pi.property_id=p.id ORDER BY is_primary DESC,id LIMIT 1) AS image_url FROM properties p LEFT JOIN projects pr ON pr.id=p.project_id JOIN property_listings pl ON pl.property_id=p.id WHERE p.organization_id=$1 AND p.status='available' AND pl.published=true ORDER BY p.created_at DESC LIMIT 100`,[c.organization_id]);
  for(const item of result.rows)properties.push({...item,company_name:c.public_name||c.company_name,marketplace_slug:c.slug});
 }
 res.json({properties});
});

router.get('/:slug',async(req,res)=>{
  const {rows}=await query(`SELECT ms.organization_id,ms.public_name,ms.description,ms.contact_email,ms.contact_phone,o.name AS company_name
    FROM marketplace_settings ms JOIN organizations o ON o.id=ms.organization_id WHERE ms.slug=$1 AND ms.enabled=true AND o.status IN ('active','trial')`,[req.params.slug]);
  if(!rows[0])return res.status(404).json({error:'Property portal not found'});
  const company=rows[0];
  const listings=await queryAsTenant(company.organization_id, `SELECT p.id,p.title,p.property_type,p.listing_type,p.description,p.address,p.city,p.state,p.bedrooms,p.bathrooms,p.area_sqft,p.price,pr.name AS project_name,
    (SELECT file_path FROM property_images pi WHERE pi.property_id=p.id ORDER BY is_primary DESC,id LIMIT 1) AS image_url
    FROM properties p LEFT JOIN projects pr ON pr.id=p.project_id JOIN property_listings pl ON pl.property_id=p.id
    WHERE p.organization_id=$1 AND p.status='available' AND pl.published=true ORDER BY p.created_at DESC LIMIT 100`,[company.organization_id]);
  res.json({company:{name:company.public_name||company.company_name,description:company.description,email:company.contact_email,phone:company.contact_phone},properties:listings.rows});
});
router.post('/:slug/inquiries',async(req,res)=>{
  const b=req.body||{};if(!b.name?.trim()||!b.phone?.trim())return res.status(400).json({error:'Name and phone are required.'});
  const org=await query(`SELECT ms.organization_id FROM marketplace_settings ms JOIN organizations o ON o.id=ms.organization_id WHERE ms.slug=$1 AND ms.enabled=true AND o.status IN ('active','trial')`,[req.params.slug]);
  if(!org.rowCount)return res.status(404).json({error:'Property portal not found'});
  const propertyId=b.property_id?Number(b.property_id):null;
  if(propertyId){const p=await queryAsTenant(org.rows[0].organization_id,'SELECT id FROM properties WHERE id=$1 AND organization_id=$2 AND status=\'available\'',[propertyId,org.rows[0].organization_id]);if(!p.rowCount)return res.status(404).json({error:'Property not found'});}
  const {rows}=await queryAsTenant(org.rows[0].organization_id, `INSERT INTO marketplace_inquiries(organization_id,property_id,name,email,phone,message) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,created_at`,[org.rows[0].organization_id,propertyId,b.name.trim(),b.email||null,b.phone.trim(),b.message||null]);
  res.status(201).json({ok:true,inquiry:rows[0],message:'Your enquiry has been submitted.'});
});

router.post('/:slug/partners/:partnerCode/referrals',async(req,res)=>{
  const b=req.body||{};if(!b.name?.trim()||!b.phone?.trim())return res.status(400).json({error:'Customer name and phone are required.'});
  const portal=await query(`SELECT organization_id FROM marketplace_settings WHERE slug=$1 AND enabled=true`,[req.params.slug]);
  if(!portal.rowCount)return res.status(404).json({error:'Partner referral link is invalid or inactive.'});
  const partner=await queryAsTenant(portal.rows[0].organization_id,`SELECT cp.id,cp.organization_id,cp.status FROM channel_partners cp WHERE cp.organization_id=$1 AND cp.partner_code=$2 AND cp.status='active'`,[portal.rows[0].organization_id,req.params.partnerCode]);
  if(!partner.rowCount)return res.status(404).json({error:'Partner referral link is invalid or inactive.'});
  if(b.property_id){const property=await queryAsTenant(partner.rows[0].organization_id,'SELECT id FROM properties WHERE id=$1',[Number(b.property_id)]);if(!property.rowCount)return res.status(400).json({error:'Property not found in this company.'});}
  const {rows}=await queryAsTenant(partner.rows[0].organization_id,`INSERT INTO partner_referrals(organization_id,partner_id,referral_name,referral_phone,property_id,status) VALUES($1,$2,$3,$4,$5,'new') RETURNING id,created_at`,[partner.rows[0].organization_id,partner.rows[0].id,b.name.trim(),b.phone.trim(),b.property_id||null]);
  res.status(201).json({ok:true,referral:rows[0],message:'Referral submitted successfully.'});
});
export default router;
