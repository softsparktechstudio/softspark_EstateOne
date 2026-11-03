import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
const router=Router();router.use(requireAuth);
router.get('/',async(req,res)=>{
  const {role,id}=req.user;
  if(role==='client'){
    const a=await query(`SELECT id,action,details,created_at FROM activity_log WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8`,[id]);
    return res.json({stats:[],activity:a.rows});
  }
  const scope=role==='staff';
  const params=scope?[id]:[];
  const [users,leads,properties,clients,tasks,deals,visits,activity]=await Promise.all([
    role==='superadmin'
      ? query(`SELECT role,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE is_active)::int AS active FROM users GROUP BY role`)
      : query(`SELECT role,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE is_active)::int AS active FROM users WHERE organization_id=$1 GROUP BY role`,[req.user.organization_id]),
    query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='new')::int AS new FROM leads ${scope?'WHERE assigned_to=$1':''}`,params),
    query(`SELECT COUNT(*)::int AS total FROM properties`),
    query(`SELECT COUNT(*)::int AS total FROM clients`),
    query(`SELECT COUNT(*)::int AS total FROM tasks WHERE status<>'done' ${scope?'AND assigned_to=$1':''}`,params),
    query(`SELECT COUNT(*)::int AS total,COALESCE(SUM(deal_value),0)::numeric AS value FROM deals ${scope?'WHERE assigned_to=$1':''}`,params),
    query(`SELECT COUNT(*)::int AS total FROM site_visits WHERE scheduled_at>=CURRENT_DATE ${scope?'AND assigned_to=$1':''}`,params),
    scope
      ? query(`SELECT id,action,details,created_at FROM activity_log WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8`,[id])
      : query(`SELECT a.id,a.action,a.details,a.created_at,u.name FROM activity_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 8`)
  ]);
  const by=Object.fromEntries(users.rows.map(r=>[r.role,r]));
  const stats=[];
  if(role==='superadmin')stats.push({label:'Admins',value:by.admin?.total||0},{label:'Staff',value:by.staff?.total||0},{label:'Clients',value:by.client?.total||0},{label:'Active accounts',value:users.rows.reduce((n,r)=>n+r.active,0)});
  if(role==='admin')stats.push({label:'Staff',value:by.staff?.total||0},{label:'Clients',value:by.client?.total||0});
  stats.push({label:'Leads',value:leads.rows[0].total},{label:'New leads',value:leads.rows[0].new},{label:'Properties',value:properties.rows[0].total},{label:'Client profiles',value:clients.rows[0].total},{label:'Open tasks',value:tasks.rows[0].total},{label:'Deals',value:deals.rows[0].total},{label:'Deal value',value:Number(deals.rows[0].value)},{label:'Upcoming site visits',value:visits.rows[0].total});
  res.json({stats,activity:activity.rows});
});
export default router;
