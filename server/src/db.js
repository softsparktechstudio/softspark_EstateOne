import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import 'dotenv/config';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const tenantStorage = new AsyncLocalStorage();

export async function query(text, params) {
  const tenant = tenantStorage.getStore();
  if (!tenant) return pool.query(text, params);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.organization_id',$1,true), set_config('app.is_superadmin',$2,true)`, [tenant.organizationId ? String(tenant.organizationId) : '', tenant.isSuperAdmin ? 'true' : 'false']);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function queryAsTenant(organizationId, text, params) {
  return tenantStorage.run({ organizationId: Number(organizationId), isSuperAdmin: false }, () => query(text, params));
}

export async function logActivity(userId, action, details = '') {
  try {
    await query(`INSERT INTO activity_log (user_id,organization_id,action,details)
      SELECT id,organization_id,$2,$3 FROM users WHERE id=$1`, [userId, action, details]);
  } catch (e) {
    console.error('activity log failed', e.message);
  }
}
