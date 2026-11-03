import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, logActivity } from '../db.js';
import { enforcePlanLimit } from '../middleware/planLimits.js';
import { requireAuth, requireRole, MANAGES } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const COLS = 'id, name, email, phone, role, is_active, approval_status, organization_id, created_at';

// superadmin: admin+staff+client, admin: staff+client, staff: clients (read only)
router.get('/', requireRole('superadmin', 'admin', 'staff'), async (req, res) => {
  const visible = req.user.role === 'staff' ? ['client'] : MANAGES[req.user.role];
  const { role, q } = req.query;
  const roles = role && visible.includes(role) ? [role] : visible;
  const params = [roles];
  let sql = `SELECT u.id,u.name,u.email,u.phone,u.role,u.is_active,u.approval_status,u.organization_id,o.name AS organization_name,u.created_at FROM users u LEFT JOIN organizations o ON o.id=u.organization_id WHERE u.role = ANY($1) AND u.approval_status='approved'` ;
  if (req.user.role !== 'superadmin') { params.push(req.user.organization_id); sql += ` AND u.organization_id=$${params.length}`; }
  if (q) { params.push(`%${q}%`); sql += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR o.name ILIKE $${params.length})`; }
  sql += ' ORDER BY u.created_at DESC LIMIT 200';
  const { rows } = await query(sql, params);
  res.json({ users: rows });
});


// Registration approval queue for administrators.
router.get('/pending', requireRole('superadmin', 'admin'), async (req, res) => {
  const params = [];
  let sql = `SELECT u.id,u.name,u.email,u.phone,u.role,u.organization_id,o.name AS organization_name,u.approval_status,u.registration_type,u.created_at FROM users u LEFT JOIN organizations o ON o.id=u.organization_id WHERE u.approval_status='pending'`;
  if (req.user.role !== 'superadmin') { params.push(req.user.organization_id); sql += ` AND u.organization_id=$${params.length} AND u.role IN ('staff','client')`; }
  sql += ' ORDER BY u.created_at ASC LIMIT 300';
  const { rows } = await query(sql, params);
  res.json({ requests: rows });
});

router.patch('/:id/approval', requireRole('superadmin', 'admin'), async (req, res) => {
  const id = Number(req.params.id);
  const decision = String(req.body?.decision || '').toLowerCase();
  if (!['approve','reject'].includes(decision)) return res.status(400).json({ error: 'Decision must be approve or reject.' });
  if (req.user.role === 'admin' && (await query('SELECT role FROM users WHERE id=$1',[id])).rows[0]?.role === 'admin')
    return res.status(403).json({ error: 'Only the Super Admin can approve company Admin accounts.' });
  const scope = req.user.role === 'superadmin' ? '' : " AND organization_id=$2 AND role IN ('staff','client')";
  const params = req.user.role === 'superadmin' ? [id] : [id, req.user.organization_id];
  const found = await query(`SELECT id,role,email,organization_id,registration_type FROM users WHERE id=$1 AND approval_status='pending'${scope}`, params);
  if (!found.rowCount) return res.status(404).json({ error: 'Pending registration not found or you do not have permission to review it.' });
  const approved = decision === 'approve';
  const { rows } = await query(`UPDATE users SET approval_status=$1,is_active=$2,approved_by=$3,approved_at=NOW() WHERE id=$4 RETURNING id,name,email,phone,role,is_active,approval_status,organization_id,created_at`, [approved ? 'approved' : 'rejected', approved, req.user.id, id]);
  if (rows[0].role === 'admin' && rows[0].organization_id) {
    if (found.rows[0].registration_type === 'new_company') {
      if (approved) {
        await query(`UPDATE organizations SET status='trial',owner_user_id=$1,updated_at=NOW() WHERE id=$2`, [rows[0].id, rows[0].organization_id]);
        await query(`UPDATE marketplace_settings SET enabled=true,updated_at=NOW() WHERE organization_id=$1`, [rows[0].organization_id]);
        await query(`UPDATE organization_subscriptions SET status='trial',starts_at=NOW(),trial_ends_at=NOW()+INTERVAL '14 days',ends_at=NOW()+INTERVAL '14 days',updated_at=NOW() WHERE organization_id=$1 AND status='pending'`, [rows[0].organization_id]);
      } else {
        await query(`UPDATE organizations SET status='closed',updated_at=NOW() WHERE id=$1`, [rows[0].organization_id]);
      }
    } else if (approved) {
      await query(`UPDATE organizations SET owner_user_id=COALESCE(owner_user_id,$1),updated_at=NOW() WHERE id=$2`, [rows[0].id, rows[0].organization_id]);
    }
  }
  await logActivity(req.user.id, `registration_${decision}`, `${found.rows[0].role}: ${found.rows[0].email}`);
  res.json({ user: rows[0], message: approved ? 'Registration approved. The user can now sign in.' : 'Registration rejected.' });
});

router.post('/', requireRole('superadmin', 'admin'), enforcePlanLimit('users'), async (req, res) => {
  const { name, email, phone, password, role } = req.body || {};
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Name, email, password and role are required' });
  if (!MANAGES[req.user.role].includes(role)) return res.status(403).json({ error: `You cannot create ${role} accounts` });
  if (req.user.role === 'superadmin' && !req.body.organization_id && !req.user.organization_id) return res.status(400).json({ error: 'Select an organization for this account.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const { rows } = await query(
      `INSERT INTO users (name,email,phone,password_hash,role,created_by,organization_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
      [name.trim(), email.trim().toLowerCase(), phone || null, await bcrypt.hash(password, 10), role, req.user.id, req.user.role === 'superadmin' ? (req.body.organization_id || req.user.organization_id) : req.user.organization_id]);
    if (role === 'client') {
      await query(`INSERT INTO clients(user_id,name,email,phone,created_by,organization_id)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO NOTHING`,
        [rows[0].id, rows[0].name, rows[0].email, rows[0].phone, req.user.id, rows[0].organization_id]);
    }
    await logActivity(req.user.id, 'user_create', `Created ${role}: ${email}`);
    res.status(201).json({ user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A user with this email already exists' });
    throw e;
  }
});

router.patch('/:id/active', requireRole('superadmin', 'admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query('SELECT id, role FROM users WHERE id=$1 AND ($2::bigint IS NULL OR organization_id=$2)', [id, req.user.role === 'superadmin' ? null : req.user.organization_id]);
  const target = rows[0];
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id || !MANAGES[req.user.role].includes(target.role))
    return res.status(403).json({ error: 'You cannot modify this user' });
  const upd = await query(`UPDATE users SET is_active = NOT is_active WHERE id=$1 AND ($2::bigint IS NULL OR organization_id=$2) RETURNING ${COLS}`, [id, req.user.role === 'superadmin' ? null : req.user.organization_id]);
  await logActivity(req.user.id, 'user_toggle', `${upd.rows[0].email} -> ${upd.rows[0].is_active ? 'active' : 'disabled'}`);
  res.json({ user: upd.rows[0] });
});

export default router;
