import jwt from 'jsonwebtoken';
import { query, tenantStorage } from '../db.js';

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.organization_id, o.name AS organization_name FROM users u LEFT JOIN organizations o ON o.id=u.organization_id WHERE u.id=$1`, [payload.id]);
    const user = rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'Account disabled or not found' });
    req.user = user;
    tenantStorage.run({ organizationId: user.organization_id || null, isSuperAdmin: user.role === 'superadmin' }, () => next());
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Access denied' });

// Which roles each role is allowed to create/manage
export const MANAGES = {
  superadmin: ['admin', 'staff', 'client'],
  admin: ['staff', 'client'],
  staff: [],
  client: [],
};
