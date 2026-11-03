-- SoftSpark EstateOne SaaS foundations. Additive and repeatable; no existing rows are dropped.
CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(180), phone VARCHAR(40), website TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active','trial','suspended','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;

INSERT INTO organizations(name,slug,status)
SELECT 'SoftSpark EstateOne Demo Realty','softspark-estateone-demo-realty','active'
WHERE NOT EXISTS (SELECT 1 FROM organizations);
UPDATE users SET organization_id=(SELECT id FROM organizations ORDER BY id LIMIT 1)
WHERE organization_id IS NULL;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id BIGSERIAL PRIMARY KEY, code VARCHAR(40) UNIQUE NOT NULL, name VARCHAR(100) NOT NULL,
  monthly_price NUMERIC(12,2) NOT NULL DEFAULT 0, annual_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  user_limit INTEGER NOT NULL DEFAULT 3, lead_limit INTEGER NOT NULL DEFAULT 100,
  property_limit INTEGER NOT NULL DEFAULT 50, features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO subscription_plans(code,name,monthly_price,annual_price,user_limit,lead_limit,property_limit,features) VALUES
('starter','Starter',999,9990,3,100,50,'{"crm":true,"marketplace":true,"reports":true}'::jsonb),
('professional','Professional',2999,29990,15,1000,500,'{"crm":true,"marketplace":true,"reports":true,"connect":true,"sales":true}'::jsonb),
('business','Business',5999,59990,50,5000,2500,'{"crm":true,"marketplace":true,"reports":true,"connect":true,"sales":true,"partners":true,"intelligence":true}'::jsonb),
('enterprise','Enterprise',0,0,999999,999999,999999,'{"all":true}'::jsonb)
ON CONFLICT(code) DO NOTHING;

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES subscription_plans(id), billing_cycle VARCHAR(12) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  status VARCHAR(24) NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','pending','past_due','cancelled','expired')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ends_at TIMESTAMPTZ, trial_ends_at TIMESTAMPTZ,
  gateway VARCHAR(30), gateway_customer_id TEXT, gateway_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org ON organization_subscriptions(organization_id,created_at DESC);
INSERT INTO organization_subscriptions(organization_id,plan_id,status,trial_ends_at,ends_at)
SELECT o.id,p.id,'trial',NOW()+INTERVAL '14 days',NOW()+INTERVAL '14 days' FROM organizations o CROSS JOIN subscription_plans p WHERE p.code='starter' AND NOT EXISTS(SELECT 1 FROM organization_subscriptions s WHERE s.organization_id=o.id);
CREATE TABLE IF NOT EXISTS billing_transactions (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id BIGINT REFERENCES organization_subscriptions(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL, currency VARCHAR(5) NOT NULL DEFAULT 'INR', status VARCHAR(24) NOT NULL DEFAULT 'created',
  gateway VARCHAR(30), gateway_order_id TEXT, gateway_payment_id TEXT, invoice_number VARCHAR(80),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant ownership columns are introduced on the existing business tables.
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['projects','properties','units','property_listings','property_images','leads','lead_followups','clients','tasks','site_visits','deals','bookings','payment_schedules','invoices','commissions','notifications','social_lead_events'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE',t);
      EXECUTE format('UPDATE %I SET organization_id=(SELECT id FROM organizations ORDER BY id LIMIT 1) WHERE organization_id IS NULL',t);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET DEFAULT NULLIF(current_setting(''app.organization_id'',true),'''')::bigint',t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(organization_id)', 'idx_'||t||'_organization',t);
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS channel_partners (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL, company_name VARCHAR(180), email VARCHAR(180), phone VARCHAR(40),
  partner_code VARCHAR(50) NOT NULL, commission_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','pending')),
  notes TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,partner_code)
);
CREATE TABLE IF NOT EXISTS partner_referrals (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_id BIGINT NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  referral_name VARCHAR(160), referral_phone VARCHAR(40), status VARCHAR(24) NOT NULL DEFAULT 'new',
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id), to_phone VARCHAR(40) NOT NULL, message TEXT NOT NULL,
  provider_message_id TEXT, status VARCHAR(24) NOT NULL DEFAULT 'queued', error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS marketplace_inquiries (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL, name VARCHAR(160) NOT NULL,
  email VARCHAR(180), phone VARCHAR(40) NOT NULL, message TEXT, source VARCHAR(40) NOT NULL DEFAULT 'marketplace',
  status VARCHAR(24) NOT NULL DEFAULT 'new', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS marketplace_settings (
  organization_id BIGINT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE, public_name VARCHAR(180), slug VARCHAR(180) UNIQUE,
  description TEXT, contact_email VARCHAR(180), contact_phone VARCHAR(40), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO marketplace_settings(organization_id,public_name,slug)
SELECT id,name,slug FROM organizations WHERE NOT EXISTS(SELECT 1 FROM marketplace_settings ms WHERE ms.organization_id=organizations.id) ON CONFLICT DO NOTHING;

UPDATE activity_log al SET organization_id=u.organization_id FROM users u WHERE al.user_id=u.id AND al.organization_id IS NULL;

-- Row-level security is the tenant boundary for all business data. The API sets
-- app.organization_id/app.is_superadmin per request inside a transaction.
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['projects','properties','units','property_listings','property_images','leads','lead_followups','clients','tasks','site_visits','deals','bookings','payment_schedules','invoices','commissions','notifications','social_lead_events','activity_log','organization_subscriptions','billing_transactions','channel_partners','partner_referrals','whatsapp_message_log','marketplace_inquiries'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_tenant_isolation') THEN
        EXECUTE format('CREATE POLICY %I ON %I USING (current_setting(''app.is_superadmin'',true) = ''true'' OR organization_id = NULLIF(current_setting(''app.organization_id'',true),'''')::bigint) WITH CHECK (current_setting(''app.is_superadmin'',true) = ''true'' OR organization_id = NULLIF(current_setting(''app.organization_id'',true),'''')::bigint)',t||'_tenant_isolation',t);
      END IF;
    END IF;
  END LOOP;
END $$;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organizations' AND policyname='organizations_tenant_isolation') THEN
  CREATE POLICY organizations_tenant_isolation ON organizations USING (
    current_setting('app.is_superadmin',true)='true' OR id=NULLIF(current_setting('app.organization_id',true),'')::bigint
    OR EXISTS(SELECT 1 FROM marketplace_settings ms WHERE ms.organization_id=organizations.id AND ms.enabled=true)
  ) WITH CHECK (current_setting('app.is_superadmin',true)='true' OR id=NULLIF(current_setting('app.organization_id',true),'')::bigint);
 END IF;
END $$;
ALTER TABLE marketplace_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='marketplace_settings' AND policyname='marketplace_settings_tenant_isolation') THEN
  CREATE POLICY marketplace_settings_tenant_isolation ON marketplace_settings USING (
    current_setting('app.is_superadmin',true)='true' OR organization_id=NULLIF(current_setting('app.organization_id',true),'')::bigint OR enabled=true
  ) WITH CHECK (current_setting('app.is_superadmin',true)='true' OR organization_id=NULLIF(current_setting('app.organization_id',true),'')::bigint);
 END IF;
END $$;
-- Public marketplace enquiries can only be inserted for a currently enabled company portal.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='marketplace_inquiries' AND policyname='marketplace_public_inquiry_insert') THEN
  CREATE POLICY marketplace_public_inquiry_insert ON marketplace_inquiries FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM marketplace_settings ms WHERE ms.organization_id=marketplace_inquiries.organization_id AND ms.enabled=true));
 END IF;
END $$;
