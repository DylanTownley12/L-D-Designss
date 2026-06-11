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

-- ══════════════════════════════════════════════
-- MIGRATION: Add call pipeline statuses + call log table (2026-06-07)
-- Run this in Supabase SQL Editor to enable the Calls page
-- ══════════════════════════════════════════════

-- Drop the old check constraint and replace with one that includes call stages
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
    CHECK (status IN (
        'new','analyzing','preview_ready','outreach_queued',
        'outreach_sent','replied','interested',
        'called','follow_up_required','payment_link_sent',
        'converted','not_interested','do_not_contact'
    ));

-- ══════════════════════════════════════════════
-- MIGRATION: Trades Lead-Capture Product + JARVIS OS (2026-06-10)
--   • Missed-call/text-back + capture form for trade CLIENTS
--   • The trades SALES pipeline (prospects we sell to)
--   • The JARVIS Telegram operator log (with undo)
-- Idempotent — safe to re-run. Paste into Supabase SQL Editor → Run.
-- ══════════════════════════════════════════════

-- ── textback_clients: SaaS trial / plan / portal tokens ───────────────
-- textback_clients already exists; these add the subscription lifecycle.
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS town             TEXT;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS owner_phone      TEXT;        -- client's own mobile
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS plan_status      TEXT DEFAULT 'trial';
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS trial_start      DATE DEFAULT CURRENT_DATE;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS trial_end        DATE DEFAULT (CURRENT_DATE + 14);
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS converted_at     TIMESTAMPTZ;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS dashboard_token  TEXT;        -- unguessable; client dashboard URL
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS capture_token    TEXT;        -- unguessable; public capture-form URL
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS notify_homeowner BOOLEAN DEFAULT FALSE;  -- opt-in confirmation SMS to caller
ALTER TABLE textback_clients DROP CONSTRAINT IF EXISTS textback_clients_plan_status_check;
ALTER TABLE textback_clients ADD CONSTRAINT textback_clients_plan_status_check
    CHECK (plan_status IN ('trial','paying','churned','cancelled'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_textback_clients_dashtoken ON textback_clients(dashboard_token) WHERE dashboard_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_textback_clients_captoken  ON textback_clients(capture_token)   WHERE capture_token   IS NOT NULL;

-- ── captured_leads: homeowner enquiries we capture FOR a client ───────
-- The product output the client sees on their dashboard. NOT the barber
-- `leads` table (that is the barber sales pipeline) — do not confuse them.
CREATE TABLE IF NOT EXISTS captured_leads (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id       UUID REFERENCES textback_clients(id) ON DELETE CASCADE,
    name            TEXT,
    phone           TEXT NOT NULL,
    postcode        TEXT,
    job_description TEXT,
    source          TEXT DEFAULT 'form'    CHECK (source IN ('form','missed_call','manual')),
    status          TEXT DEFAULT 'new'     CHECK (status IN ('new','contacted','quoted','won','lost')),
    value_gbp       NUMERIC(10,2),
    notified        BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_captured_leads_client ON captured_leads(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_captured_leads_status ON captured_leads(status);

-- ── prospects: trade businesses WE are selling the service to ─────────
CREATE TABLE IF NOT EXISTS prospects (
    id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_name       TEXT NOT NULL,
    phone               TEXT,
    phone_norm          TEXT,            -- last-9-digit normalised form, for dedupe
    town                TEXT,
    trade               TEXT DEFAULT 'plumber',
    status              TEXT DEFAULT 'to_call'
                        CHECK (status IN ('to_call','called','demo_booked','interested','not_interested','won','lost')),
    assigned_to         TEXT CHECK (assigned_to IN ('D','L')),
    call_notes          TEXT,
    has_mobile          BOOLEAN DEFAULT FALSE,
    is_emergency_trade  BOOLEAN DEFAULT FALSE,
    proximity_score     INTEGER DEFAULT 0,
    rank_score          INTEGER DEFAULT 0,
    source              TEXT DEFAULT 'manual',
    last_called_at      TIMESTAMPTZ,
    demo_at             TIMESTAMPTZ,
    converted_client_id UUID REFERENCES textback_clients(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prospects_status     ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_assigned   ON prospects(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_prospects_rank       ON prospects(rank_score DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_phone_norm ON prospects(phone_norm);

-- ── next_actions: scheduled follow-ups on a prospect ─────────────────
CREATE TABLE IF NOT EXISTS next_actions (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    due_date    DATE,
    done        BOOLEAN DEFAULT FALSE,
    done_at     TIMESTAMPTZ,
    created_by  TEXT,                    -- 'jarvis' | 'followup_agent' | founder
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_next_actions_prospect ON next_actions(prospect_id);
CREATE INDEX IF NOT EXISTS idx_next_actions_due      ON next_actions(due_date) WHERE done = FALSE;

-- ── jarvis_log: every Telegram turn (supports "undo") ────────────────
CREATE TABLE IF NOT EXISTS jarvis_log (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    chat_id     TEXT,
    direction   TEXT,                    -- 'in' (founder→JARVIS) | 'out' (JARVIS→founder)
    message     TEXT,
    tool_calls  JSONB,
    prev_state  JSONB,                   -- snapshot before a write, for undo
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jarvis_log_chat ON jarvis_log(chat_id, created_at DESC);

-- ── agent_events: live activity feed from every trades agent ──────────
CREATE TABLE IF NOT EXISTS agent_events (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    agent       TEXT NOT NULL,           -- scout|sales_prep|dial_manager|followup|reporter|lead_capture|jarvis
    level       TEXT DEFAULT 'info'      CHECK (level IN ('info','success','warn','error')),
    message     TEXT NOT NULL,
    data        JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_events_recent ON agent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent  ON agent_events(agent, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════
--  2026-06-11b — capture richness, seed flagging, tasks/decisions/activity
-- ══════════════════════════════════════════════════════════════════════
-- Seed flag so demo rows can be wiped before real calling (never overloads
-- the lead `source`, which stays web_form/missed_call for the Twilio future).
ALTER TABLE prospects        ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT FALSE;
ALTER TABLE captured_leads   ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT FALSE;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT FALSE;
-- Capture form richness + AI summary.
ALTER TABLE captured_leads   ADD COLUMN IF NOT EXISTS job_type        TEXT;
ALTER TABLE captured_leads   ADD COLUMN IF NOT EXISTS urgency         TEXT;
ALTER TABLE captured_leads   ADD COLUMN IF NOT EXISTS photo_urls      JSONB DEFAULT '[]'::jsonb;
ALTER TABLE captured_leads   ADD COLUMN IF NOT EXISTS ai_summary      TEXT;
ALTER TABLE captured_leads   ADD COLUMN IF NOT EXISTS suggested_reply TEXT;
-- Client billing / portal extras.
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS avg_job_value       NUMERIC(10,2) DEFAULT 150;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS stripe_payment_link TEXT;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS telegram_chat_id    TEXT;

-- General founder tasks (distinct from prospect-bound next_actions).
CREATE TABLE IF NOT EXISTS tasks (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title       TEXT NOT NULL,
    detail      TEXT,
    owner       TEXT CHECK (owner IN ('D','L')),
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
    client_id   UUID REFERENCES textback_clients(id) ON DELETE SET NULL,
    status      TEXT DEFAULT 'open' CHECK (status IN ('open','done')),
    due_date    DATE,
    is_seed     BOOLEAN DEFAULT FALSE,
    created_by  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    done_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner, status, due_date);

-- JARVIS recommendation log ("what should D do now?" → stored).
CREATE TABLE IF NOT EXISTS decisions (
    id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    founder        TEXT,
    question       TEXT,
    recommendation TEXT,
    data           JSONB,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_decisions_recent ON decisions(created_at DESC);

-- Append-only audit of every meaningful write.
CREATE TABLE IF NOT EXISTS activity_logs (
    id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    actor      TEXT,                    -- jarvis | agent:<name> | founder
    action     TEXT,
    entity     TEXT,
    entity_id  TEXT,
    detail     JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_recent ON activity_logs(created_at DESC);
