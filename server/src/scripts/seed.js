import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL, max: 1 });

await pool.query("SET app.is_superadmin = 'true'"); // Demo seeding runs as a controlled platform bootstrap.

const users = [
  ['Super Admin', 'superadmin@softspark.com', 'superadmin'],
  ['Asha Admin', 'admin@softspark.com', 'admin'],
  ['Sam Staff', 'staff@softspark.com', 'staff'],
  ['Cleo Client', 'client@softspark.com', 'client'],
];
const hash = await bcrypt.hash('Password@123', 10);
for (const [name, email, role] of users) {
  await pool.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
    [name, email, hash, role]);
}
const orgResult = await pool.query(`SELECT id FROM organizations ORDER BY id LIMIT 1`);
const defaultOrgId = orgResult.rows[0]?.id;
if (defaultOrgId) await pool.query(`UPDATE users SET organization_id=$1 WHERE organization_id IS NULL`, [defaultOrgId]);
console.log('Seeded demo users (password for all: Password@123)');
users.forEach(u => console.log(`  ${u[2].padEnd(10)} ${u[1]}`));

const demo = await pool.query(`SELECT id FROM users WHERE email='admin@softspark.com'`);
const staff = await pool.query(`SELECT id FROM users WHERE email='staff@softspark.com'`);
const clientUser = await pool.query(`SELECT id FROM users WHERE email='client@softspark.com'`);
const adminId = demo.rows[0]?.id;
const staffId = staff.rows[0]?.id;
const clientUserId = clientUser.rows[0]?.id;
if (clientUserId) {
  await pool.query(`INSERT INTO clients(user_id,name,email,phone,client_type,source)
    VALUES($1,'Cleo Client','client@softspark.com','9876543210','buyer','Website')
    ON CONFLICT(user_id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email`,[clientUserId]);
}
await pool.query(`INSERT INTO projects(name,project_code,description,project_type,address,city,state,total_units,status,created_by)
  VALUES('Green Valley Residency','GV-001','Demo residential project for local testing','Residential','Airport Road','Rajkot','Gujarat',120,'active',$1)
  ON CONFLICT(project_code) DO NOTHING`,[adminId]);
const project = await pool.query(`SELECT id FROM projects WHERE project_code='GV-001'`);
const projectId = project.rows[0]?.id;
if (projectId) {
  await pool.query(`INSERT INTO properties(project_id,title,property_type,listing_type,description,address,city,state,bedrooms,bathrooms,area_sqft,price,status,created_by)
    SELECT $1,'2 BHK Apartment - Green Valley','Apartment','sale','Sample property listing','Airport Road','Rajkot','Gujarat',2,2,1150,5200000,'available',$2
    WHERE NOT EXISTS(SELECT 1 FROM properties WHERE title='2 BHK Apartment - Green Valley')`,[projectId,adminId]);
  const property=await pool.query(`SELECT id FROM properties WHERE title='2 BHK Apartment - Green Valley' LIMIT 1`);
  if(property.rows[0]) {
    await pool.query(`INSERT INTO property_listings(property_id,headline,description,portal_name,published,published_at)
      SELECT $1,'Green Valley 2 BHK Apartment','Demo published property for the client portal','SoftSpark EstateOne Website',true,NOW()
      WHERE NOT EXISTS(SELECT 1 FROM property_listings WHERE property_id=$1 AND portal_name='SoftSpark EstateOne Website')`,[property.rows[0].id]);
    await pool.query(`INSERT INTO units(project_id,property_id,unit_number,floor_number,block_name,unit_type,area_sqft,base_price,status)
      VALUES($1,$2,'A-101','1','A','2 BHK',1150,5200000,'available')
      ON CONFLICT(project_id,unit_number) DO NOTHING`,[projectId,property.rows[0].id]);
  }
}
await pool.query(`INSERT INTO leads(name,email,phone,source,status,priority,city,assigned_to,created_by,notes)
  SELECT 'Rahul Mehta','rahul.demo@example.com','9876500011','Website','new','high','Rajkot',$1,$2,'Demo lead for testing the sales pipeline'
  WHERE NOT EXISTS(SELECT 1 FROM leads WHERE phone='9876500011')`,[staffId,adminId]);
await pool.query(`INSERT INTO tasks(title,description,assigned_to,due_at,priority,status,created_by)
  SELECT 'Call new property enquiry','Follow up with the demo lead',$1,NOW()+INTERVAL '1 day','high','open',$2
  WHERE NOT EXISTS(SELECT 1 FROM tasks WHERE title='Call new property enquiry')`,[staffId,adminId]);

if (defaultOrgId) {
  for (const table of ['projects','properties','units','property_listings','property_images','leads','lead_followups','clients','tasks','site_visits','deals','bookings','payment_schedules','invoices','commissions','notifications','social_lead_events','activity_log']) {
    await pool.query(`UPDATE ${table} SET organization_id=$1 WHERE organization_id IS NULL`, [defaultOrgId]).catch(() => {});
  }
}
await pool.end();
