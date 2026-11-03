-- Enforce tenant policies even when the runtime DB role owns the tables.
-- Super Admin requests remain cross-tenant through app.is_superadmin=true.
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects','properties','units','property_listings','property_images','leads',
    'lead_followups','clients','tasks','site_visits','deals','bookings',
    'payment_schedules','invoices','commissions','notifications',
    'social_lead_events','activity_log','organization_subscriptions',
    'billing_transactions','channel_partners','partner_referrals',
    'whatsapp_message_log','marketplace_inquiries'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    END IF;
  END LOOP;
END $$;
