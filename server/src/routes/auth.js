import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool, query, queryAsTenant, logActivity } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();


// Public registration requests. Accounts remain inactive until an administrator approves them.
// Public company directory used by the signup form. Only active, enabled company portals are listed.
router.get('/organizations', async (_req,res)=>{
  const {rows}=await query(`SELECT o.id,o.name,ms.slug
    FROM organizations o JOIN marketplace_settings ms ON ms.organization_id=o.id
    WHERE ms.enabled=true AND o.status IN ('active','trial')
    ORDER BY o.name`);
  res.json({organizations:rows});
});

// Public new-company registration. The organization and its first Admin are created
// together in a pending state; only Super Admin approval activates the workspace.
const slugify = (value) => String(value || '').toLowerCase().trim()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '').slice(0, 150);

router.post('/register-company', async (req, res) => {
  const b = req.body || {};
  const companyName = String(b.company_name || '').trim();
  const companyEmail = String(b.company_email || '').trim().toLowerCase();
  const companyPhone = String(b.company_phone || '').trim();
  const website = String(b.website || '').trim();
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = String(b.phone || '').trim();
  const password = String(b.password || '');
  const slug = slugify(b.slug || companyName);
  if (!companyName || !name || !email || !phone || password.length < 8)
    return res.status(400).json({ error: 'Company name, Admin name, email, mobile number and a password of at least 8 characters are required.' });
  if (!slug) return res.status(400).json({ error: 'Please enter a valid company name.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.organization_id','',true), set_config('app.is_superadmin','true',true)");
    const existing = await client.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [email]);
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in or use another email.' });
    }
    const org = await client.query(
      `INSERT INTO organizations(name,slug,email,phone,website,status)
       VALUES($1,$2,$3,$4,$5,'suspended') RETURNING id,name,slug`,
      [companyName, slug, companyEmail || null, companyPhone || null, website || null]
    );
    const hash = await bcrypt.hash(password, 12);
    const admin = await client.query(
      `INSERT INTO users(name,email,phone,password_hash,role,organization_id,is_active,approval_status,registration_type)
       VALUES($1,$2,$3,$4,'admin',$5,false,'pending','new_company')
       RETURNING id,name,email,phone,role,organization_id,is_active,approval_status`,
      [name, email, phone, hash, org.rows[0].id]
    );
    await client.query(
      `INSERT INTO marketplace_settings(organization_id,public_name,slug,enabled)
       VALUES($1,$2,$3,false)`, [org.rows[0].id, companyName, slug]
    );
    const plan = await client.query("SELECT id FROM subscription_plans WHERE code='starter' LIMIT 1");
    if (plan.rows[0]) await client.query(
      `INSERT INTO organization_subscriptions(organization_id,plan_id,status,trial_ends_at,ends_at)
       VALUES($1,$2,'pending',NOW()+INTERVAL '14 days',NOW()+INTERVAL '14 days')`,
      [org.rows[0].id, plan.rows[0].id]
    );
    await client.query('COMMIT');
    return res.status(201).json({ message: `Company registration for ${companyName} has been submitted. SoftSpark EstateOne Super Admin will review the company and its first Admin account. You can sign in after approval.` });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'A company with this name/portal address or an account with this email already exists. Please check the details.' });
    throw e;
  } finally { client.release(); }
});

// Public registration requests. Every request is linked to the selected company
// and remains inactive until the correct company/platform administrator approves it.
router.post('/register', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = String(b.phone || '').trim();
  const password = String(b.password || '');
  const role = String(b.role || 'client').toLowerCase();
  const organizationId = Number(b.organization_id);
  if (!name || !email || !phone || password.length < 8 || !['admin','staff','client'].includes(role))
    return res.status(400).json({ error: 'Complete all fields, select Client, Staff or Admin, and use a password of at least 8 characters.' });
  if (!Number.isInteger(organizationId) || organizationId < 1)
    return res.status(400).json({ error: 'Please select the company you want to join.' });
  const org = await query(`SELECT o.id,o.name FROM organizations o JOIN marketplace_settings ms ON ms.organization_id=o.id WHERE o.id=$1 AND ms.enabled=true AND o.status IN ('active','trial')`,[organizationId]);
  if (!org.rowCount) return res.status(400).json({ error: 'The selected company is not accepting registrations.' });
  const exists = await query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [email]);
  if (exists.rowCount) return res.status(409).json({ error: 'An account with this email already exists. Please sign in or contact the administrator.' });
  const hash = await bcrypt.hash(password, 12);
  const created = await query(`INSERT INTO users(name,email,phone,password_hash,role,organization_id,is_active,approval_status) VALUES($1,$2,$3,$4,$5,$6,false,'pending') RETURNING id,name,email,phone,role,organization_id,is_active,approval_status`,
    [name,email,phone,hash,role,organizationId]);
  if (role === 'client') {
    await queryAsTenant(organizationId, `INSERT INTO clients(organization_id,user_id,name,email,phone,client_type,source,created_by) VALUES($5,$1,$2,$3,$4,'buyer','Website registration',$1) ON CONFLICT(user_id) DO NOTHING`,
      [created.rows[0].id,name,email,phone,organizationId]);
  }
  const reviewer = role === 'admin' ? 'Super Admin' : 'your selected company Admin';
  res.status(201).json({ message: `Registration submitted for ${org.rows[0].name}. Your request will be reviewed by ${reviewer}. You can sign in after approval.` });
});

// POST /api/auth/login  { email, password, portal }
router.post('/login', async (req, res) => {
  const { email, password, portal } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const { rows } = await query(`SELECT u.*, o.name AS organization_name FROM users u LEFT JOIN organizations o ON o.id=u.organization_id WHERE LOWER(u.email)=LOWER($1)`, [email.trim()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Invalid email or password' });
  if (user.approval_status === 'pending') return res.status(403).json({ error: 'Your registration is awaiting administrator approval.' });
  if (user.approval_status === 'rejected') return res.status(403).json({ error: 'Your registration was not approved. Please contact the administrator.' });
  if (!user.is_active) return res.status(403).json({ error: 'Your account is disabled' });
  if (portal && portal !== user.role)
    return res.status(403).json({ error: `This account cannot sign in to the ${portal} portal` });

  await logActivity(user.id, 'login', `Signed in to ${user.role} portal`);
  const { password_hash, ...safe } = user;
  res.json({ token: signToken(user), user: safe });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const { rows } = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword || '', rows[0].password_hash)))
    return res.status(400).json({ error: 'Current password is incorrect' });
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(newPassword, 10), req.user.id]);
  await logActivity(req.user.id, 'password_change');
  res.json({ ok: true });
});

export default router;
