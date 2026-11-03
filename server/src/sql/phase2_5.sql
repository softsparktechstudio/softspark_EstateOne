
-- SoftSpark EstateOne Phase 2–5 additive schema. Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  project_code VARCHAR(60) UNIQUE,
  description TEXT,
  project_type VARCHAR(60) NOT NULL DEFAULT 'Residential',
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  total_units INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  property_type VARCHAR(60) NOT NULL DEFAULT 'Apartment',
  listing_type VARCHAR(30) NOT NULL DEFAULT 'sale',
  description TEXT,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(20),
  bedrooms INTEGER,
  bathrooms INTEGER,
  area_sqft NUMERIC(12,2),
  price NUMERIC(16,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_project ON properties(project_id);

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  unit_number VARCHAR(50) NOT NULL,
  floor_number VARCHAR(30),
  block_name VARCHAR(80),
  unit_type VARCHAR(60),
  area_sqft NUMERIC(12,2),
  base_price NUMERIC(16,2) NOT NULL DEFAULT 0,
  final_price NUMERIC(16,2),
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, unit_number)
);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);

CREATE TABLE IF NOT EXISTS property_listings (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  headline VARCHAR(200),
  description TEXT,
  portal_name VARCHAR(80) NOT NULL DEFAULT 'Website',
  external_url TEXT,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_images (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  original_name TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  title VARCHAR(180),
  name VARCHAR(160) NOT NULL,
  email VARCHAR(160),
  phone VARCHAR(40),
  source VARCHAR(80) NOT NULL DEFAULT 'Manual',
  source_detail TEXT,
  social_platform VARCHAR(40),
  social_lead_id VARCHAR(120) UNIQUE,
  social_form_id VARCHAR(120),
  campaign_name VARCHAR(180),
  status VARCHAR(30) NOT NULL DEFAULT 'new',
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  budget_min NUMERIC(16,2),
  budget_max NUMERIC(16,2),
  property_type VARCHAR(60),
  city VARCHAR(100),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  client_id INTEGER,
  notes TEXT,
  next_follow_up TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

CREATE TABLE IF NOT EXISTS lead_followups (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  followup_type VARCHAR(40) NOT NULL DEFAULT 'call',
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome VARCHAR(80),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_followups_due ON lead_followups(scheduled_at);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(160),
  phone VARCHAR(40),
  alternate_phone VARCHAR(40),
  address TEXT,
  city VARCHAR(100),
  client_type VARCHAR(40) NOT NULL DEFAULT 'buyer',
  source VARCHAR(80),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_client_id_fkey;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_client_id_fkey') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_client_id_fkey FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  related_lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  related_client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_due ON tasks(assigned_to,due_at);

CREATE TABLE IF NOT EXISTS site_visits (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  feedback TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits(scheduled_at);

CREATE TABLE IF NOT EXISTS deals (
  id SERIAL PRIMARY KEY,
  deal_code VARCHAR(60) UNIQUE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deal_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(7,3) NOT NULL DEFAULT 0,
  stage VARCHAR(30) NOT NULL DEFAULT 'negotiation',
  expected_close_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  booking_number VARCHAR(60) UNIQUE,
  booking_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  booking_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'reserved',
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_schedules (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  milestone VARCHAR(120) NOT NULL,
  due_date DATE,
  amount NUMERIC(16,2) NOT NULL,
  paid_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  invoice_number VARCHAR(60) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(16,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commissions (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  payee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  payee_name VARCHAR(160),
  rate NUMERIC(7,3) NOT NULL DEFAULT 0,
  amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS social_lead_events (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(40) NOT NULL,
  external_lead_id VARCHAR(120) UNIQUE,
  payload JSONB NOT NULL,
  processing_status VARCHAR(30) NOT NULL DEFAULT 'received',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
