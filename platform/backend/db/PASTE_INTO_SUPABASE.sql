-- ════════════════════════════════════════════════════════════════════
--  L&D — TRADES / JARVIS schema.  PASTE THIS WHOLE FILE INTO:
--  Supabase → SQL Editor → New query → Run.
--
--  Safe to run on a live DB and safe to re-run (CREATE TABLE IF NOT EXISTS,
--  ADD COLUMN IF NOT EXISTS). It only ADDS trades tables + a few columns to
--  the existing textback_clients table. It does NOT touch your barber data.
--  Verification SELECTs at the very bottom should all return without error.
-- ════════════════════════════════════════════════════════════════════

-- pgcrypto/uuid is already enabled on Supabase; this is belt-and-braces.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── textback_clients: trade clients (SaaS trial / billing / portal tokens) ──
-- This table already exists (barber missed-call product). These columns add
-- the trades subscription lifecycle, portal links and billing fields.
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS town                TEXT;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS owner_phone         TEXT;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS plan_status         TEXT DEFAULT 'trial';
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS trial_start         DATE DEFAULT CURRENT_DATE;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS trial_end           DATE DEFAULT (CURRENT_DATE + 14);
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS converted_at        TIMESTAMPTZ;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS dashboard_token     TEXT;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS capture_token       TEXT;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS notify_homeowner    BOOLEAN DEFAULT FALSE;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS is_seed             BOOLEAN DEFAULT FALSE;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS avg_job_value       NUMERIC(10,2) DEFAULT 150;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS stripe_payment_link TEXT;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS telegram_chat_id    TEXT;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS monthly_fee         NUMERIC(10,2) DEFAULT 49;
ALTER TABLE textback_clients DROP CONSTRAINT IF EXISTS textback_clients_plan_status_check;
ALTER TABLE textback_clients ADD CONSTRAINT textback_clients_plan_status_check
    CHECK (plan_status IN ('trial','paying','churned','cancelled'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_textback_clients_dashtoken ON textback_clients(dashboard_token) WHERE dashboard_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_textback_clients_captoken  ON textback_clients(capture_token)   WHERE capture_token   IS NOT NULL;

-- ── captured_leads: homeowner enquiries captured FOR a client ──────────
CREATE TABLE IF NOT EXISTS captured_leads (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id       UUID REFERENCES textback_clients(id) ON DELETE CASCADE,
    name            TEXT,
    phone           TEXT NOT NULL,
    postcode        TEXT,
    job_type        TEXT,
    urgency         TEXT,
    job_description TEXT,
    photo_urls      JSONB DEFAULT '[]'::jsonb,
    ai_summary      TEXT,
    suggested_reply TEXT,
    source          TEXT DEFAULT 'web_form',
    status          TEXT DEFAULT 'new'  CHECK (status IN ('new','contacted','quoted','won','lost')),
    value_gbp       NUMERIC(10,2),
    is_seed         BOOLEAN DEFAULT FALSE,
    notified        BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
-- Bring older deployments up to date / widen the source check for Twilio later.
ALTER TABLE captured_leads ADD COLUMN IF NOT EXISTS job_type        TEXT;
ALTER TABLE captured_leads ADD COLUMN IF NOT EXISTS urgency         TEXT;
ALTER TABLE captured_leads ADD COLUMN IF NOT EXISTS photo_urls      JSONB DEFAULT '[]'::jsonb;
ALTER TABLE captured_leads ADD COLUMN IF NOT EXISTS ai_summary      TEXT;
ALTER TABLE captured_leads ADD COLUMN IF NOT EXISTS suggested_reply TEXT;
ALTER TABLE captured_leads ADD COLUMN IF NOT EXISTS is_seed         BOOLEAN DEFAULT FALSE;
ALTER TABLE captured_leads DROP CONSTRAINT IF EXISTS captured_leads_source_check;
ALTER TABLE captured_leads ADD CONSTRAINT captured_leads_source_check
    CHECK (source IN ('web_form','form','missed_call','manual','seed'));
CREATE INDEX IF NOT EXISTS idx_captured_leads_client ON captured_leads(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_captured_leads_status ON captured_leads(status);

-- ── prospects: the trade businesses WE sell to ─────────────────────────
CREATE TABLE IF NOT EXISTS prospects (
    id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_name       TEXT NOT NULL,
    phone               TEXT,
    phone_norm          TEXT,
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
    is_seed             BOOLEAN DEFAULT FALSE,
    last_called_at      TIMESTAMPTZ,
    demo_at             TIMESTAMPTZ,
    converted_client_id UUID REFERENCES textback_clients(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_prospects_status     ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_assigned   ON prospects(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_prospects_rank       ON prospects(rank_score DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_phone_norm ON prospects(phone_norm);

-- ── next_actions: scheduled follow-up on a prospect ───────────────────
CREATE TABLE IF NOT EXISTS next_actions (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    due_date    DATE,
    done        BOOLEAN DEFAULT FALSE,
    done_at     TIMESTAMPTZ,
    created_by  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_next_actions_prospect ON next_actions(prospect_id);
CREATE INDEX IF NOT EXISTS idx_next_actions_due      ON next_actions(due_date) WHERE done = FALSE;

-- ── tasks: general founder to-dos (tick to done) ──────────────────────
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

-- ── jarvis_log: every JARVIS turn (Telegram + web). Undo via prev_state. ──
CREATE TABLE IF NOT EXISTS jarvis_log (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    chat_id     TEXT,
    direction   TEXT,
    message     TEXT,
    tool_calls  JSONB,
    prev_state  JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jarvis_log_chat ON jarvis_log(chat_id, created_at DESC);

-- ── agent_events: live activity feed from every agent ─────────────────
CREATE TABLE IF NOT EXISTS agent_events (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    agent       TEXT NOT NULL,
    level       TEXT DEFAULT 'info' CHECK (level IN ('info','success','warn','error')),
    message     TEXT NOT NULL,
    data        JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_events_recent ON agent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent  ON agent_events(agent, created_at DESC);

-- ── decisions: JARVIS recommendation log ──────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
    id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    founder        TEXT,
    question       TEXT,
    recommendation TEXT,
    data           JSONB,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_decisions_recent ON decisions(created_at DESC);

-- ── activity_logs: append-only audit of meaningful writes ─────────────
CREATE TABLE IF NOT EXISTS activity_logs (
    id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    actor      TEXT,
    action     TEXT,
    entity     TEXT,
    entity_id  TEXT,
    detail     JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_recent ON activity_logs(created_at DESC);

-- ════════════════════════════════════════════════════════════════════
--  VERIFICATION — these should all run clean and show the new tables.
-- ════════════════════════════════════════════════════════════════════
SELECT 'tables' AS check, string_agg(table_name, ', ' ORDER BY table_name) AS present
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('prospects','captured_leads','next_actions','tasks',
                     'jarvis_log','agent_events','decisions','activity_logs');

SELECT 'prospects_cols' AS check, count(*) AS cols
FROM information_schema.columns WHERE table_name = 'prospects';

SELECT 'seed_prospects' AS check, count(*) AS rows FROM prospects WHERE is_seed;
SELECT 'captured_leads' AS check, count(*) AS rows FROM captured_leads;
-- Expect 8 tables listed above. Seed counts are 0 until you click "Seed demo".
