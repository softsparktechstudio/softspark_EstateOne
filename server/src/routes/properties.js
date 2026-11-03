import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { query, logActivity } from '../db.js';
import { enforcePlanLimit } from '../middleware/planLimits.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
router.use(requireAuth);
const storage = multer.diskStorage({
  destination: (_req,_file,cb) => cb(null, uploadDir),
  filename: (_req,file,cb) => cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({ storage, limits:{fileSize:5*1024*1024}, fileFilter:(_req,file,cb)=>{
  cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype));
}});

router.get('/projects', async (req,res)=>{
  const where=req.user.role==='client' ? `WHERE EXISTS(SELECT 1 FROM properties pr JOIN property_listings pl ON pl.property_id=pr.id WHERE pr.project_id=p.id AND pr.status='available' AND pl.published=true)` : '';
  const {rows}=await query(`SELECT p.*,COUNT(DISTINCT u.id)::int AS unit_count FROM projects p LEFT JOIN units u ON u.project_id=p.id ${where} GROUP BY p.id ORDER BY p.created_at DESC`);
  res.json({projects:rows});
});
router.post('/projects', requireRole('superadmin','admin','staff'), async(req,res)=>{
  const {name,project_code,description,project_type,address,city,state,total_units,status}=req.body||{};
  if(!name?.trim()) return res.status(400).json({error:'Project name is required'});
  const {rows}=await query(`INSERT INTO projects(name,project_code,description,project_type,address,city,state,total_units,status,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [name.trim(),project_code||null,description||null,project_type||'Residential',address||null,city||null,state||null,Number(total_units||0),status||'active',req.user.id]);
  await logActivity(req.user.id,'project_create',`Created project ${name}`);
  res.status(201).json({project:rows[0]});
});
router.get('/units', async(req,res)=>{
  const params=[]; let where='WHERE 1=1';
  if(req.query.project_id){params.push(Number(req.query.project_id));where+=` AND u.project_id=$${params.length}`;}
  if(req.user.role==='client') where+=` AND u.status='available' AND EXISTS(SELECT 1 FROM property_listings pl WHERE pl.property_id=u.property_id AND pl.published=true)`;
  if(req.user.role==='staff'){where+=` AND EXISTS(SELECT 1 FROM site_visits sv WHERE sv.unit_id=u.id AND sv.assigned_to=$${params.length+1})`;params.push(req.user.id);}
  const {rows}=await query(`SELECT u.*,p.name AS project_name FROM units u JOIN projects p ON p.id=u.project_id ${where} ORDER BY p.name,u.unit_number`,params);
  res.json({units:rows});
});
router.post('/units',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const {project_id,property_id,unit_number,floor_number,block_name,unit_type,area_sqft,base_price,final_price,status,notes}=req.body||{};
  if(!project_id||!unit_number) return res.status(400).json({error:'Project and unit number are required'});
  const {rows}=await query(`INSERT INTO units(project_id,property_id,unit_number,floor_number,block_name,unit_type,area_sqft,base_price,final_price,status,notes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [project_id,property_id||null,unit_number,floor_number||null,block_name||null,unit_type||null,area_sqft||null,base_price||0,final_price||null,status||'available',notes||null]);
  res.status(201).json({unit:rows[0]});
});
router.patch('/units/:id',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const {status,base_price,final_price,notes}=req.body||{};
  const {rows}=await query(`UPDATE units SET status=COALESCE($1,status),base_price=COALESCE($2,base_price),final_price=COALESCE($3,final_price),notes=COALESCE($4,notes),updated_at=NOW() WHERE id=$5 RETURNING *`,
    [status??null,base_price??null,final_price??null,notes??null,Number(req.params.id)]);
  if(!rows[0]) return res.status(404).json({error:'Unit not found'});
  res.json({unit:rows[0]});
});

router.get('/',async(req,res)=>{
  const params=[]; let where='WHERE 1=1';
  if(req.query.q){params.push(`%${req.query.q}%`);where+=` AND (p.title ILIKE $${params.length} OR p.city ILIKE $${params.length} OR p.address ILIKE $${params.length})`;}
  if(req.query.status){params.push(req.query.status);where+=` AND p.status=$${params.length}`;}
  if(req.user.role==='client') where += ` AND p.status='available' AND EXISTS(SELECT 1 FROM property_listings pl WHERE pl.property_id=p.id AND pl.published=true)`;
  const {rows}=await query(`SELECT p.*,pr.name AS project_name,
    (SELECT file_path FROM property_images pi WHERE pi.property_id=p.id ORDER BY is_primary DESC,id LIMIT 1) AS image_url,
    (SELECT COUNT(*)::int FROM units u WHERE u.property_id=p.id) AS unit_count
    FROM properties p LEFT JOIN projects pr ON pr.id=p.project_id ${where} ORDER BY p.created_at DESC LIMIT 300`,params);
  res.json({properties:rows});
});
router.post('/',requireRole('superadmin','admin','staff'),enforcePlanLimit('properties'),async(req,res)=>{
  const b=req.body||{};
  if(!b.title?.trim()) return res.status(400).json({error:'Property title is required'});
  const {rows}=await query(`INSERT INTO properties(project_id,title,property_type,listing_type,description,address,city,state,pincode,bedrooms,bathrooms,area_sqft,price,status,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [b.project_id||null,b.title.trim(),b.property_type||'Apartment',b.listing_type||'sale',b.description||null,b.address||null,b.city||null,b.state||null,b.pincode||null,b.bedrooms||null,b.bathrooms||null,b.area_sqft||null,b.price||0,b.status||'available',req.user.id]);
  await logActivity(req.user.id,'property_create',`Created property ${b.title}`);
  res.status(201).json({property:rows[0]});
});
router.patch('/:id',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const b=req.body||{};
  const fields=['title','property_type','listing_type','description','address','city','state','pincode','bedrooms','bathrooms','area_sqft','price','status','project_id'];
  const sets=[];const values=[];
  for(const f of fields) if(b[f]!==undefined){values.push(b[f]);sets.push(`${f}=$${values.length}`);}
  if(!sets.length) return res.status(400).json({error:'No fields to update'});
  values.push(Number(req.params.id));
  const {rows}=await query(`UPDATE properties SET ${sets.join(',')},updated_at=NOW() WHERE id=$${values.length} RETURNING *`,values);
  if(!rows[0]) return res.status(404).json({error:'Property not found'});
  res.json({property:rows[0]});
});
router.post('/:id/images',requireRole('superadmin','admin','staff'),upload.array('images',10),async(req,res)=>{
  const id=Number(req.params.id);
  const exists=await query('SELECT id FROM properties WHERE id=$1',[id]);
  if(!exists.rowCount) return res.status(404).json({error:'Property not found'});
  const files=req.files||[];
  for(let i=0;i<files.length;i++) await query('INSERT INTO property_images(property_id,file_path,original_name,is_primary) VALUES($1,$2,$3,$4)',
    [id,`/uploads/${files[i].filename}`,files[i].originalname,i===0]);
  const {rows}=await query('SELECT * FROM property_images WHERE property_id=$1 ORDER BY id DESC',[id]);
  res.status(201).json({images:rows});
});
router.post('/:id/listings',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const {headline,description,portal_name,external_url,published}=req.body||{};
  const {rows}=await query(`INSERT INTO property_listings(property_id,headline,description,portal_name,external_url,published,published_at)
    VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6 THEN NOW() ELSE NULL END) RETURNING *`,
    [Number(req.params.id),headline||null,description||null,portal_name||'Website',external_url||null,!!published]);
  res.status(201).json({listing:rows[0]});
});
export default router;
