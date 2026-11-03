import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL, max: 1 });

await pool.query("SET app.is_superadmin = 'true'"); // Controlled migration session; runtime requests use per-user tenant context.

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../sql');
for (const file of ['schema.sql', 'phase2_5.sql', 'saas_upgrade.sql', 'feature_update.sql', 'public_company_registration.sql', 'tenant_isolation_hardening.sql']) {
  await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  console.log(`Applied ${file}`);
}
const appRole = process.env.APP_DB_ROLE || 'codeweft_app';
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appRole)) throw new Error('APP_DB_ROLE must be a simple PostgreSQL role name.');
await pool.query(`GRANT USAGE ON SCHEMA public TO "${appRole}"`);
await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${appRole}"`);
await pool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${appRole}"`);
await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${appRole}"`);
await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${appRole}"`);
console.log(`Database schema is ready. Runtime privileges granted to ${appRole}.`);
await pool.end();
