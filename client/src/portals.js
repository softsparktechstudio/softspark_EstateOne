export const PORTALS = {
  superadmin: {
    label: 'Super Admin', blurb: 'Full control over the platform, admins and settings.', icon: '★',
    nav: [
      {to:'',label:'Dashboard',icon:'▦'},{to:'insights',label:'Analytics & Charts',icon:'▥'},{to:'users',label:'Users',icon:'☺'},{to:'approvals',label:'Registration Approvals',icon:'✓'},
      {to:'properties',label:'Properties & Projects',icon:'⌂'},{to:'leads',label:'Leads & Pipeline',icon:'↗'},{to:'followups',label:'Follow-ups',icon:'◷'},
      {to:'clients',label:'Clients',icon:'♙'},{to:'operations',label:'Tasks & Site Visits',icon:'✓'},
      {to:'deals',label:'Deals & Payments',icon:'₹'},{to:'reports',label:'Reports & Exports',icon:'▤'},
      {to:'connect',label:'SoftSpark EstateOne Connect',icon:'⌁'},{to:'intelligence',label:'SoftSpark EstateOne Intelligence',icon:'✦'},
      {to:'saas',label:'Company & Billing',icon:'▣'},{to:'partners',label:'Channel Partners',icon:'♧'},{to:'marketplace',label:'Public Marketplace',icon:'◎'},
      {to:'profile',label:'My Profile',icon:'⚙'}
    ]
  },
  admin: {
    label:'Admin',blurb:'Manage your real estate operations and team.',icon:'◆',
    nav:[
      {to:'',label:'Dashboard',icon:'▦'},{to:'insights',label:'Analytics & Charts',icon:'▥'},{to:'users',label:'Staff & Clients',icon:'☺'},{to:'approvals',label:'Registration Approvals',icon:'✓'},
      {to:'properties',label:'Properties & Projects',icon:'⌂'},{to:'leads',label:'Leads & Pipeline',icon:'↗'},{to:'followups',label:'Follow-ups',icon:'◷'},
      {to:'clients',label:'Clients',icon:'♙'},{to:'operations',label:'Tasks & Site Visits',icon:'✓'},
      {to:'deals',label:'Deals & Payments',icon:'₹'},{to:'reports',label:'Reports & Exports',icon:'▤'},
      {to:'connect',label:'SoftSpark EstateOne Connect',icon:'⌁'},{to:'intelligence',label:'SoftSpark EstateOne Intelligence',icon:'✦'},
      {to:'saas',label:'Company & Billing',icon:'▣'},{to:'partners',label:'Channel Partners',icon:'♧'},{to:'marketplace',label:'Public Marketplace',icon:'◎'},
      {to:'profile',label:'My Profile',icon:'⚙'}
    ]
  },
  staff: {
    label:'Staff',blurb:'Manage assigned enquiries, client follow-ups and site visits.',icon:'●',
    nav:[
      {to:'',label:'Dashboard',icon:'▦'},{to:'insights',label:'Analytics & Charts',icon:'▥'},{to:'leads',label:'My Leads',icon:'↗'},{to:'followups',label:'Follow-ups',icon:'◷'},
      {to:'clients',label:'My Clients',icon:'♙'},{to:'properties',label:'Properties',icon:'⌂'},
      {to:'operations',label:'Tasks & Site Visits',icon:'✓'},{to:'deals',label:'My Deals',icon:'₹'},
      {to:'reports',label:'My Reports',icon:'▤'},{to:'connect',label:'SoftSpark EstateOne Connect',icon:'⌁'},{to:'intelligence',label:'SoftSpark EstateOne Intelligence',icon:'✦'},{to:'profile',label:'My Profile',icon:'⚙'}
    ]
  },
  client: {
    label:'Client',blurb:'View available properties and manage your profile.',icon:'⌂',
    nav:[{to:'',label:'Dashboard',icon:'▦'},{to:'public-marketplace',label:'Open Marketplace',icon:'◎'},{to:'profile',label:'My Profile',icon:'⚙'}]
  }
};
export const isPortal=(p)=>Object.prototype.hasOwnProperty.call(PORTALS,p);
