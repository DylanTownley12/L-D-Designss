-- ══════════════════════════════════════════════
--  L&D Designs — Agency Platform
--  Supabase Database Schema
--
--  How to run:
--  1. Go to supabase.com → your project
--  2. Click "SQL Editor" in the left sidebar
--  3. Paste this entire file and click "Run"
-- ══════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── LEADS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_name   TEXT NOT NULL,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    city            TEXT,
    postcode        TEXT,
    website         TEXT,
    website_status  TEXT DEFAULT 'unknown'
                    CHECK (website_status IN ('none','weak','decent','good','unknown')),
    google_rating   DECIMAL(3,1),
    google_reviews  INTEGER DEFAULT 0,
    instagram_url   TEXT,
    facebook_url    TEXT,
    source          TEXT DEFAULT 'manual',   -- yell, google_maps, manual, import
    status          TEXT DEFAULT 'new'
                    CHECK (status IN (
                        'new','analyzing','preview_ready','outreach_queued',
                        'outreach_sent','replied','interested','converted',
                        'not_interested','do_not_contact'
                    )),
    quality_score   INTEGER DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
    analysis_data   JSONB DEFAULT '{}',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── PREVIEWS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS previews (
    id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id               UUID REFERENCES leads(id) ON DELETE CASCADE,
    preview_url           TEXT,
    html_content          TEXT,
    personalization_data  JSONB DEFAULT '{}',
    template_version      TEXT DEFAULT 'v1',
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── OUTREACH MESSAGES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_messages (
    id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id               UUID REFERENCES leads(id) ON DELETE CASCADE,
    channel               TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp','instagram')),
    direction             TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
    subject               TEXT,
    body                  TEXT NOT NULL,
    status                TEXT DEFAULT 'draft'
                          CHECK (status IN (
                              'draft','queued','approved','sent',
                              'delivered','failed','replied'
                          )),
    scheduled_at          TIMESTAMPTZ,
    sent_at               TIMESTAMPTZ,
    sequence_day          INTEGER,           -- 1, 3, 7, 14
    ai_generated          BOOLEAN DEFAULT TRUE,
    approved_by_founder   BOOLEAN DEFAULT FALSE,
    twilio_sid            TEXT,              -- Twilio message SID for status tracking
    gmail_message_id      TEXT,              -- Gmail thread ID for reply detection
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── FOLLOW-UP SEQUENCES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_up_sequences (
    id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id          UUID REFERENCES leads(id) ON DELETE CASCADE UNIQUE,
    channel          TEXT NOT NULL,
    initial_sent_at  TIMESTAMPTZ,
    day_3_sent_at    TIMESTAMPTZ,
    day_7_sent_at    TIMESTAMPTZ,
    day_14_sent_at   TIMESTAMPTZ,
    stopped          BOOLEAN DEFAULT FALSE,
    stop_reason      TEXT,                  -- 'replied', 'not_interested', 'manual_stop'
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── NOTIFICATIONS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
    type        TEXT NOT NULL,              -- reply_received, new_lead, outreach_sent, preview_ready
    title       TEXT NOT NULL,
    body        TEXT,
    read        BOOLEAN DEFAULT FALSE,
    action_url  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── DEPLOYED WEBSITES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deployed_websites (
    id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id           UUID REFERENCES leads(id) ON DELETE SET NULL,
    business_name     TEXT,
    domain            TEXT,
    github_repo       TEXT,
    deploy_url        TEXT,
    status            TEXT DEFAULT 'pending'
                      CHECK (status IN ('pending','building','live','error')),
    payment_received  BOOLEAN DEFAULT FALSE,
    payment_amount    DECIMAL(10,2),
    payment_date      TIMESTAMPTZ,
    client_notes      TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── AGENT LOGS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_logs (
    id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    agent_name     TEXT NOT NULL,
    action         TEXT NOT NULL,
    lead_id        UUID REFERENCES leads(id) ON DELETE SET NULL,
    status         TEXT CHECK (status IN ('success','error','skipped','pending')),
    details        JSONB DEFAULT '{}',
    error_message  TEXT,
    duration_ms    INTEGER,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── MISSED CALL TEXT-BACK CLIENTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS textback_clients (
    id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_name         TEXT NOT NULL,
    owner_name            TEXT,
    phone                 TEXT NOT NULL,         -- client's business phone
    trade                 TEXT DEFAULT 'default', -- plumber, electrician, builder, etc.
    custom_message        TEXT,                  -- optional custom SMS template
    active                BOOLEAN DEFAULT TRUE,
    monthly_fee           DECIMAL(10,2) DEFAULT 49.00,
    total_textbacks_sent  INTEGER DEFAULT 0,
    last_textback_at      TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── MISSED CALL TEXT-BACK EVENTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS textback_events (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id       UUID REFERENCES textback_clients(id) ON DELETE CASCADE,
    caller_number   TEXT NOT NULL,
    message_sent    TEXT,
    success         BOOLEAN DEFAULT FALSE,
    error           TEXT,
    provider_sid    TEXT,
    fired_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_status       ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_city         ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_website      ON leads(website_status);
CREATE INDEX IF NOT EXISTS idx_leads_created      ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_quality      ON leads(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_lead      ON outreach_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status    ON outreach_messages(status);
CREATE INDEX IF NOT EXISTS idx_outreach_scheduled ON outreach_messages(scheduled_at)
                                                   WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_notif_unread       ON notifications(read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs         ON agent_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_textback_clients   ON textback_clients(active);
CREATE INDEX IF NOT EXISTS idx_textback_events    ON textback_events(client_id, fired_at DESC);

-- ── UPDATED_AT TRIGGER ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER leads_updated_at
        BEFORE UPDATE ON leads
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER follow_ups_updated_at
        BEFORE UPDATE ON follow_up_sequences
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER websites_updated_at
        BEFORE UPDATE ON deployed_websites
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
