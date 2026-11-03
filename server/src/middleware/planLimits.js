import { query } from '../db.js';

export function enforcePlanLimit(resource) {
  return async (req,res,next) => {
    if (req.user.role === 'superadmin') return next();
    const org = Number(req.user.organization_id || 0);
    if (!org) return res.status(403).json({ error: 'Your user account is not assigned to a company.' });
    const { rows } = await query(`SELECT s.status,s.ends_at,p.user_limit,p.lead_limit,p.property_limit
      FROM organization_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id
      WHERE s.organization_id=$1 AND s.status IN ('active','trial') ORDER BY s.created_at DESC LIMIT 1`, [org]);
    const plan=rows[0];
    if (!plan || !['active','trial'].includes(plan.status) || (plan.ends_at && new Date(plan.ends_at)<new Date()))
      return res.status(402).json({ error: 'Your subscription is inactive or expired. Open Company & Billing to renew it.' });
    const config={users:{table:'users',limit:plan.user_limit,where:"organization_id=$1 AND role <> 'superadmin'"},leads:{table:'leads',limit:plan.lead_limit,where:'organization_id=$1'},properties:{table:'properties',limit:plan.property_limit,where:'organization_id=$1'}}[resource];
    if(!config)return next();
    const count=await query(`SELECT COUNT(*)::int AS total FROM ${config.table} WHERE ${config.where}`,[org]);
    if(count.rows[0].total>=config.limit)return res.status(402).json({error:`Your ${resource} limit (${config.limit}) for the current plan has been reached. Upgrade your plan to continue.`});
    next();
  };
}
