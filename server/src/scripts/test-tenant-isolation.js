import 'dotenv/config';
import pg from 'pg';

const orgA=Number(process.env.TENANT_TEST_ORG_ID||0);
const orgB=Number(process.env.TENANT_TEST_OTHER_ORG_ID||0);
if(!orgA||!orgB||orgA===orgB){
  console.error('Set TENANT_TEST_ORG_ID and TENANT_TEST_OTHER_ORG_ID to two different organization IDs.');
  process.exit(1);
}
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const tables=['projects','properties','units','property_listings','property_images','leads','lead_followups','clients','tasks','site_visits','deals','bookings','payment_schedules','invoices','commissions','channel_partners','partner_referrals','whatsapp_message_log','marketplace_inquiries'];
const client=await pool.connect();
try{
  await client.query('BEGIN');
  await client.query(`SELECT set_config('app.organization_id',$1,true),set_config('app.is_superadmin','false',true)`,[String(orgA)]);
  const failures=[];
  for(const table of tables){
    const result=await client.query(`SELECT COUNT(*)::int AS total FROM ${table} WHERE organization_id=$1`,[orgB]);
    if(result.rows[0].total!==0)failures.push(`${table}: ${result.rows[0].total} cross-company row(s) visible`);
  }
  await client.query('ROLLBACK');
  if(failures.length){console.error('TENANT ISOLATION FAILED:\n'+failures.join('\n'));process.exitCode=1;}
  else console.log(`TENANT ISOLATION PASSED: organization ${orgA} cannot read organization ${orgB} records in ${tables.length} tenant tables.`);
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Tenant isolation test failed:',error.message);process.exitCode=1;}
finally{client.release();await pool.end();}
