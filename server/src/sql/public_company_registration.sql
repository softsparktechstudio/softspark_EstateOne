-- Public company signup: distinguish a first Admin created with a new company.
-- Suspended organization + disabled marketplace represent the pending-review state.
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_type VARCHAR(24) NOT NULL DEFAULT 'existing_company';
CREATE INDEX IF NOT EXISTS idx_users_registration_type_pending
  ON users(registration_type, approval_status, created_at DESC);
