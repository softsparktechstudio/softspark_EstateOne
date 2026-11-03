import { Router } from 'express';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
const router=Router();router.use(requireAuth);
const DATE_FIELDS={leads:'created_at',properties:'created_at',clients:'created_at',deals:'created_at',bookings:'booking_date',payments:'due_date',tasks:'due_at',site_visits:'scheduled_at',invoices:'invoice_date',commissions:'created_at'};
const REPORTS={
 leads:{title:'Leads',sql:`SELECT id,name,email,phone,source,social_platform,status,priority,city,created_at FROM leads`,staff:'assigned_to'},
 properties:{title:'Properties',sql:`SELECT id,title,property_type,listing_type,city,state,price,status,created_at FROM properties`},
 clients:{title:'Clients',sql:`SELECT id,name,email,phone,city,client_type,source,created_at FROM clients`},
 deals:{title:'Deals',sql:`SELECT id,deal_code,client_id,property_id,deal_value,commission_rate,stage,expected_close_date,created_at FROM deals`,staff:'assigned_to'},
 bookings:{title:'Bookings',sql:`SELECT id,booking_number,client_id,property_id,unit_id,total_amount,booking_amount,status,booking_date,created_at FROM bookings`},
 payments:{title:'Payment Schedules',sql:`SELECT id,booking_id,milestone,due_date,amount,paid_amount,status,created_at FROM payment_schedules`},
 tasks:{title:'Tasks',sql:`SELECT id,title,assigned_to,due_at,priority,status,created_at FROM tasks`,staff:'assigned_to'},
 site_visits:{title:'Site Visits',sql:`SELECT id,client_id,lead_id,property_id,assigned_to,scheduled_at,status,feedback,created_at FROM site_visits`,staff:'assigned_to'},
 invoices:{title:'Invoices',sql:`SELECT id,booking_id,invoice_number,invoice_date,due_date,subtotal,tax_amount,total_amount,status,created_at FROM invoices`,adminOnly:true},
 commissions:{title:'Commissions',sql:`SELECT id,deal_id,booking_id,payee_user_id,payee_name,rate,amount,status,due_date,created_at FROM commissions`,adminOnly:true}
};
router.get('/summary',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const scope=req.user.role==='staff';
  const [leads,properties,clients,deals,tasks,visits]=await Promise.all([
    query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='new')::int AS new,COUNT(*) FILTER(WHERE status='won')::int AS won FROM leads ${scope?'WHERE assigned_to=$1':''}`,scope?[req.user.id]:[]),
    query('SELECT COUNT(*)::int AS total FROM properties'),
    query('SELECT COUNT(*)::int AS total FROM clients'),
    query(`SELECT COUNT(*)::int AS total,COALESCE(SUM(deal_value),0)::numeric AS value FROM deals ${scope?'WHERE assigned_to=$1':''}`,scope?[req.user.id]:[]),
    query(`SELECT COUNT(*)::int AS total FROM tasks WHERE status<>'done' ${scope?'AND assigned_to=$1':''}`,scope?[req.user.id]:[]),
    query(`SELECT COUNT(*)::int AS total FROM site_visits WHERE scheduled_at>=CURRENT_DATE ${scope?'AND assigned_to=$1':''}`,scope?[req.user.id]:[])
  ]);
  res.json({leads:leads.rows[0],properties:properties.rows[0],clients:clients.rows[0],deals:deals.rows[0],openTasks:tasks.rows[0].total,upcomingVisits:visits.rows[0].total});
});
router.get('/export',requireRole('superadmin','admin','staff'),async(req,res)=>{
  const type=String(req.query.type||'leads');const format=String(req.query.format||'csv').toLowerCase();
  const spec=REPORTS[type];if(!spec)return res.status(400).json({error:'Unsupported report type'});
  if(req.user.role==='staff'&&!spec.staff)return res.status(403).json({error:'This report is not available to staff'});
  if(spec.adminOnly&&!['superadmin','admin'].includes(req.user.role))return res.status(403).json({error:'This report is restricted to administrators'});
  const params=[];let sql=spec.sql;const conditions=[];
  if(req.user.role==='staff'){params.push(req.user.id);conditions.push(`${spec.staff}=$${params.length}`);}
  const start=req.query.start_date?String(req.query.start_date):'';const end=req.query.end_date?String(req.query.end_date):'';
  const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
  if((start&&!validDate(start))||(end&&!validDate(end)))return res.status(400).json({error:'Dates must use YYYY-MM-DD format.'});
  if(start&&end&&start>end)return res.status(400).json({error:'Start date must be on or before end date.'});
  const dateField=DATE_FIELDS[type]||'created_at';
  if(start){params.push(start);conditions.push(`${dateField} >= $${params.length}::date`);}
  if(end){params.push(end);conditions.push(`${dateField} < ($${params.length}::date + INTERVAL '1 day')`);}
  if(conditions.length)sql+=` WHERE ${conditions.join(' AND ')}`;
  sql+=' ORDER BY id DESC LIMIT 10000';
  const {rows}=await query(sql,params);
  const stamp=new Date().toISOString().slice(0,10);
  const filename=`softspark-estateone-${type}-${stamp}`;
  if(format==='csv'){
    const headers=rows.length?Object.keys(rows[0]):[];
    const cell=(v)=>{let s=v===null||v===undefined?'':v instanceof Date?v.toISOString():String(v);if(/^[=+@\\-\\t\\r]/.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`;};
    const csv=[headers.map(cell).join(','),...rows.map(r=>headers.map(h=>cell(r[h])).join(','))].join('\r\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="${filename}.csv"`);return res.send('\uFEFF'+csv);
  }
  if(format==='xlsx'){
    const sheet=XLSX.utils.json_to_sheet(rows);
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,spec.title.slice(0,31));
    const buffer=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="${filename}.xlsx"`);return res.send(buffer);
  }
  if(format==='pdf'){
    res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${filename}.pdf"`);
    const doc=new PDFDocument({size:'A4',layout:'landscape',margin:32});doc.pipe(res);
    doc.fontSize(18).fillColor('#1d4ed8').text(`SoftSpark EstateOne — ${spec.title}`);
    doc.moveDown(.4).fontSize(8).fillColor('#64748b').text(`Generated ${new Date().toLocaleString()} · ${rows.length} records`);
    doc.moveDown();
    if(!rows.length)doc.fontSize(11).fillColor('#334155').text('No records found for this report.');
    else{
      const headers=Object.keys(rows[0]);const usable=doc.page.width-doc.page.margins.left-doc.page.margins.right;
      const widths=headers.map(()=>usable/headers.length);const rowH=22;
      const drawRow=(vals,header=false)=>{
        if(doc.y+rowH>doc.page.height-doc.page.margins.bottom){doc.addPage();}
        const y=doc.y;let x=doc.page.margins.left;
        vals.forEach((v,i)=>{doc.rect(x,y,widths[i],rowH).fillAndStroke(header?'#eaf1ff':'#ffffff','#dbe3f0');doc.fillColor('#0f172a').fontSize(header?7:6).text(String(v??'').slice(0,42),x+3,y+6,{width:widths[i]-6,height:rowH-8,ellipsis:true});x+=widths[i];});
        doc.y=y+rowH;
      };
      drawRow(headers,true);rows.forEach(r=>drawRow(headers.map(h=>r[h] instanceof Date?r[h].toISOString().slice(0,10):r[h]),false));
    }
    return doc.end();
  }
  return res.status(400).json({error:'format must be csv, xlsx or pdf'});
});
export default router;
