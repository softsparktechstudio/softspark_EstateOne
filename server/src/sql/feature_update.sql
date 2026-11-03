-- SoftSpark EstateOne feature update: follow-up workflow, partner projects, public registration. Safe to re-run.
ALTER TABLE lead_followups ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'contacted';
ALTER TABLE lead_followups ADD COLUMN IF NOT EXISTS source VARCHAR(80) NOT NULL DEFAULT 'Phone Call';
ALTER TABLE lead_followups ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'medium';
ALTER TABLE lead_followups ADD COLUMN IF NOT EXISTS stage VARCHAR(40) NOT NULL DEFAULT 'new';
ALTER TABLE lead_followups ADD COLUMN IF NOT EXISTS title VARCHAR(180);
ALTER TABLE channel_partners ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lead_followups_status ON lead_followups(status);
CREATE INDEX IF NOT EXISTS idx_lead_followups_user_schedule ON lead_followups(user_id, scheduled_at);

-- Public registration approval workflow. Existing accounts remain approved.
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved';
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
UPDATE users SET approval_status='approved' WHERE approval_status IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_pending_approval ON users(organization_id, approval_status, created_at DESC);
