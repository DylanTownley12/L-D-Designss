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

-- ── SPEND LOG ─────────────────────────────────────────────────────────
--  Estimated cost of every LLM/API call, so safety.py can enforce a daily cap.
CREATE TABLE IF NOT EXISTS spend_log (
    id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    agent         TEXT,
    model         TEXT,
    tokens_in     INTEGER DEFAULT 0,
    tokens_out    INTEGER DEFAULT 0,
    est_cost_gbp  NUMERIC(10,5) DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_spend_log_created ON spend_log(created_at DESC);

-- ══════════════════════════════════════════════
--  9-AGENT TEAM — coordination + revenue layer
--  Additive: references the existing leads table, safe to run on a live DB.
-- ══════════════════════════════════════════════

-- Task queue — the main handoff between agents (Scout→Gap→Judge→Maker→…)
CREATE TABLE IF NOT EXISTS agent_tasks (
    id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id        UUID REFERENCES leads(id) ON DELETE CASCADE,
    assigned_to    TEXT NOT NULL,          -- scout|gap|judge|maker|reach|executor|closer|profit|chief
    type           TEXT NOT NULL,          -- e.g. rank_lead, build_preview, draft_reply
    payload        JSONB DEFAULT '{}',
    status         TEXT DEFAULT 'queued'
                   CHECK (status IN ('queued','in_progress','done','failed','blocked')),
    priority       INTEGER DEFAULT 5,
    needs_approval BOOLEAN DEFAULT FALSE,
    result         JSONB DEFAULT '{}',
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_inbox ON agent_tasks(assigned_to, status, priority DESC);

-- Message board — cross-agent notes/flags that aren't full tasks
CREATE TABLE IF NOT EXISTS agent_messages (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    from_agent  TEXT NOT NULL,
    to_agent    TEXT,                       -- null = broadcast
    lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
    task_id     UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
    message     TEXT NOT NULL,
    read        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_unread ON agent_messages(to_agent, read, created_at DESC);

-- Approvals — nothing sends/spends/publishes without the founder tapping ✅
CREATE TABLE IF NOT EXISTS agent_approvals (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id     UUID REFERENCES agent_tasks(id) ON DELETE CASCADE,
    lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
    agent       TEXT,
    action      TEXT NOT NULL,              -- what happens on approve
    reason      TEXT,
    amount      NUMERIC(10,2) DEFAULT 0,
    preview     TEXT,                       -- exact content that goes live/out
    status      TEXT DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    decided_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_pending ON agent_approvals(status, created_at DESC);

-- Lead scores — Gap + Judge write their rankings here
CREATE TABLE IF NOT EXISTS lead_scores (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id      UUID REFERENCES leads(id) ON DELETE CASCADE,
    agent        TEXT NOT NULL,             -- gap | judge
    scores       JSONB DEFAULT '{}',
    total_score  NUMERIC(5,2),
    verdict      TEXT,                       -- GO | HOLD | REJECT (judge)
    evidence     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_scores_lead ON lead_scores(lead_id, created_at DESC);

-- Clients — converted, paying (the recurring £15/mo is the prize)
CREATE TABLE IF NOT EXISTS clients (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
    business_name   TEXT,
    setup_paid      NUMERIC(10,2) DEFAULT 0,
    monthly_hosting NUMERIC(10,2) DEFAULT 15,
    start_date      DATE DEFAULT CURRENT_DATE,
    status          TEXT DEFAULT 'active'
                    CHECK (status IN ('active','paused','churned')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

-- Revenue ledger — every payment, so Chief can track MRR vs the phase targets
CREATE TABLE IF NOT EXISTS revenue_logs (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
    lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
    type        TEXT NOT NULL,              -- setup | hosting | upsell
    amount      NUMERIC(10,2) NOT NULL,
    note        TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revenue_logs_time ON revenue_logs(recorded_at DESC);

-- Knowledge base — lessons agents learn (which angle converts, etc.)
-- embedding kept as JSONB so this needs no pgvector extension; switch to
-- vector(1536) later if you want true semantic search.
CREATE TABLE IF NOT EXISTS knowledge_base (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    topic       TEXT,
    content     TEXT NOT NULL,
    embedding   JSONB,
    source      TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_topic ON knowledge_base(topic);
