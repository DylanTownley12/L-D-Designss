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

-- ── Row Level Security: lock these tables to the backend only ─────────
-- The backend (db/client.py) uses the SERVICE ROLE key, which bypasses RLS.
-- Enabling RLS with NO policies means anon/public keys can read/write nothing
-- (the frontend never touches Supabase directly — it goes through the API).
ALTER TABLE prospects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE captured_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_actions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE jarvis_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs  ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
--  REVENUE OS v2 — data_mode (real/demo), opportunity scoring, website
--  qualification, on-demand preview + QA, alerts, CEO briefings.
--  All idempotent. Safe to re-run. Backfills existing seed rows to demo.
-- ════════════════════════════════════════════════════════════════════

-- ── data_mode on the four core tables (real vs demo). Backfill from is_seed. ──
ALTER TABLE prospects        ADD COLUMN IF NOT EXISTS data_mode TEXT NOT NULL DEFAULT 'real';
ALTER TABLE captured_leads   ADD COLUMN IF NOT EXISTS data_mode TEXT NOT NULL DEFAULT 'real';
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS data_mode TEXT NOT NULL DEFAULT 'real';
ALTER TABLE tasks            ADD COLUMN IF NOT EXISTS data_mode TEXT NOT NULL DEFAULT 'real';

UPDATE prospects        SET data_mode='demo' WHERE is_seed IS TRUE AND data_mode='real';
UPDATE captured_leads   SET data_mode='demo' WHERE is_seed IS TRUE AND data_mode='real';
UPDATE textback_clients SET data_mode='demo' WHERE is_seed IS TRUE AND data_mode='real';
UPDATE tasks            SET data_mode='demo' WHERE is_seed IS TRUE AND data_mode='real';

ALTER TABLE prospects        DROP CONSTRAINT IF EXISTS prospects_data_mode_check;
ALTER TABLE prospects        ADD  CONSTRAINT prospects_data_mode_check CHECK (data_mode IN ('real','demo'));
ALTER TABLE captured_leads   DROP CONSTRAINT IF EXISTS captured_leads_data_mode_check;
ALTER TABLE captured_leads   ADD  CONSTRAINT captured_leads_data_mode_check CHECK (data_mode IN ('real','demo'));
ALTER TABLE textback_clients DROP CONSTRAINT IF EXISTS textback_clients_data_mode_check;
ALTER TABLE textback_clients ADD  CONSTRAINT textback_clients_data_mode_check CHECK (data_mode IN ('real','demo'));
ALTER TABLE tasks            DROP CONSTRAINT IF EXISTS tasks_data_mode_check;
ALTER TABLE tasks            ADD  CONSTRAINT tasks_data_mode_check CHECK (data_mode IN ('real','demo'));

CREATE INDEX IF NOT EXISTS idx_prospects_data_mode      ON prospects(data_mode, status);
CREATE INDEX IF NOT EXISTS idx_captured_leads_data_mode ON captured_leads(data_mode);
CREATE INDEX IF NOT EXISTS idx_tasks_data_mode          ON tasks(data_mode, status);

-- captured_leads can now belong to a prospect's on-demand preview (no client yet).
ALTER TABLE captured_leads ADD COLUMN IF NOT EXISTS prospect_id UUID;
CREATE INDEX IF NOT EXISTS idx_captured_leads_prospect ON captured_leads(prospect_id);

-- ── prospects: website qualification + opportunity score + sales angle + preview ──
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website_url           TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website_status        TEXT DEFAULT 'unknown';  -- unknown|none|has_website
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website_quality       TEXT;                    -- poor|old|modern (only if has_website)
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website_status_source TEXT;                    -- paste|places|founder|ai
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reviews_status        TEXT;                    -- poor|ok|strong
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS local_demand          TEXT;                    -- high|normal|low
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS opportunity_score     INTEGER;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS score_factors         JSONB DEFAULT '[]'::jsonb;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS score_override        INTEGER;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS score_override_reason TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sales_angle           TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS angle_source          TEXT;                    -- ai|template
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS queue_ready           BOOLEAN DEFAULT FALSE;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS needs_data_reason     TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS capture_token         TEXT;                    -- live capture form for the prospect's demo preview
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS preview_id            UUID;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS preview_status        TEXT;                    -- none|draft|qa_failed|ready
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website_status_check  TEXT;                    -- last website-status check note
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS place_id              TEXT;                    -- Google Places id, for Lead Finder dedupe
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_captoken ON prospects(capture_token) WHERE capture_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_place_id ON prospects(place_id) WHERE place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_score ON prospects(opportunity_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_prospects_queue ON prospects(assigned_to, queue_ready, opportunity_score DESC NULLS LAST);

-- ── textback_clients: bundle pricing — one-off build fee + recurring MRR ──
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS build_fee     NUMERIC(10,2) DEFAULT 500;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS build_paid    BOOLEAN DEFAULT FALSE;
ALTER TABLE textback_clients ADD COLUMN IF NOT EXISTS build_paid_at TIMESTAMPTZ;

-- ── previews: link a preview to a prospect + deterministic QA gate (barber-safe) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='previews') THEN
    ALTER TABLE previews ADD COLUMN IF NOT EXISTS prospect_id   UUID;
    ALTER TABLE previews ADD COLUMN IF NOT EXISTS qa_status     TEXT;       -- pending|qa_failed|qa_passed|ready
    ALTER TABLE previews ADD COLUMN IF NOT EXISTS qa_reasons    JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE previews ADD COLUMN IF NOT EXISTS qa_checked_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_previews_prospect ON previews(prospect_id);
  END IF;
END $$;

-- ── alerts: backs the Mission Control RED ALERT banner (never silently drops) ──
CREATE TABLE IF NOT EXISTS alerts (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    kind        TEXT NOT NULL,   -- agent_fail|qa_failed|broken_preview|missing_phone|missing_owner|no_next_action|db_error|dead_pipeline
    severity    TEXT DEFAULT 'warn' CHECK (severity IN ('info','warn','error')),
    message     TEXT NOT NULL,
    entity      TEXT,
    entity_id   TEXT,
    data_mode   TEXT NOT NULL DEFAULT 'real',
    resolved    BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts(resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_dedupe ON alerts(kind, entity_id) WHERE resolved = FALSE;

-- ── briefings: the latest CEO briefing (shown in the UI + sent to OpenClaw) ──
CREATE TABLE IF NOT EXISTS briefings (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    kind        TEXT DEFAULT 'daily',
    text        TEXT NOT NULL,
    bottleneck  TEXT,
    metrics     JSONB DEFAULT '{}'::jsonb,
    data_mode   TEXT NOT NULL DEFAULT 'real',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_briefings_recent ON briefings(created_at DESC);

ALTER TABLE alerts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════
--  VERIFICATION — these should all run clean and show the new tables.
-- ════════════════════════════════════════════════════════════════════
SELECT 'tables' AS check, string_agg(table_name, ', ' ORDER BY table_name) AS present
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('prospects','captured_leads','next_actions','tasks',
                     'jarvis_log','agent_events','decisions','activity_logs',
                     'alerts','briefings');

SELECT 'prospects_cols' AS check, count(*) AS cols
FROM information_schema.columns WHERE table_name = 'prospects';

SELECT 'data_mode_cols' AS check, count(*) AS cols
FROM information_schema.columns
WHERE column_name = 'data_mode'
  AND table_name IN ('prospects','captured_leads','textback_clients','tasks');

SELECT 'prospects_by_mode' AS check, data_mode, count(*) AS rows FROM prospects GROUP BY data_mode;
SELECT 'captured_leads' AS check, count(*) AS rows FROM captured_leads;
-- Expect 10 tables listed, prospects has ~40 cols, data_mode_cols = 4.
-- Seed/real counts depend on what you've seeded. "Wipe demo" clears data_mode='demo' only.
