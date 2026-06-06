# L&D Designs — 9-Agent OpenClaw Growth Team

Built while you were out. This is the full writeup + your to-do list. Read the top bit, do the 4 steps, you're live.

---

## ⚡ YOUR TO-DO (in order — ~10 min total)

1. **Revoke + replace the GitHub token** → https://github.com/settings/tokens
   Delete the old one (it was on-screen, treat it as burned), make a new fine-grained one (repo: `L-D-Designss`, 90-day expiry). Next `git push` will ask for username `dylantownley12` + the new token as the password — it only asks once.

2. **Run the SQL** → Supabase → SQL Editor → paste all of `platform/backend/db/migrations.sql` → Run.
   It's `IF NOT EXISTS` throughout, so it's safe to re-run. Creates: `spend_log` + the 7 team tables (`agent_tasks`, `agent_messages`, `agent_approvals`, `lead_scores`, `clients`, `revenue_logs`, `knowledge_base`).

3. **Deploy the backend** → `git push` (after step 1). Railway auto-deploys. This ships the safety guardrails + the `/api/team` coordination API the agents need.

4. **Turn the agents on** → they're already registered. To start the daily schedule:
   ```bash
   openclaw approvals list        # approve the pending cron scope request (from my probe)
   bash platform/openclaw/schedule_agents.sh
   ```
   (Creating cron jobs needs a device-scope approval — that's an OpenClaw security gate I deliberately did **not** self-approve while you were out.)

**Optional but smart:** before relying on them, run one agent by hand to confirm it can reach the API (see *Caveats* §6):
```bash
openclaw agent --agent chief --local --message "Run your job. Curl /api/team/summary and summarise. JSON only."
```

---

## What this is

Your 9-agent system, built **for real** inside OpenClaw (it does support multiple isolated agents — `agents add`, `agent`, `cron`). Each agent is a Baz-pattern workspace (`SOUL.md`/`AGENTS.md`/`TOOLS.md`/`MEMORY.md`) under `~/.openclaw/workspaces/<name>/`.

### The key design decision (why it's safe)

The agents **think, score, draft, and coordinate** over your Supabase. They **never send, post, deploy, or spend** — anything that would do that gets **staged as an approval** for you. Your existing FastAPI backend stays the "hands" (Google Places lead-finding, preview generation, the guarded send queue). The agents are the "brains" on top.

**Why not the literal build (9 agents doing everything themselves)?** Because that's a *second outreach pipeline* running next to your backend — two systems messaging the same barbers = exactly the over-sending that got you banned. One send path, behind the guardrails, is the rule. This also matches your own prompt: Executor/Closer/Reach all say "stage for approval, never send."

### The team & schedule

| Agent | Role | Runs | Hands off to |
|---|---|---|---|
| 🔍 scout | triage new leads + angle | 06:00 | gap |
| 📊 gap | rank opportunity 0–10 | 06:20 | judge (if ≥7) |
| ⚖️ judge | sceptical GO/HOLD/REJECT | 06:40 | maker (if GO) |
| 🎨 maker | plan the preview site | 07:00 | reach |
| ✍️ reach | write outreach + marketing | 07:20 | executor |
| 🛠️ executor | assemble + **stage for approval** | 07:40 | → you |
| 🤝 closer | draft replies (never sends) | hourly 9–8 | → you |
| 📈 profit | analytics + 1 A/B test | 20:00 | chief |
| 🧭 chief | coordinate + founder summary | 07:00 & 20:00 | — |

They coordinate through two shared channels in your DB: the **task queue** (`agent_tasks`) for handoffs, and the **message board** (`agent_messages`) for notes. Chief reads it all each morning.

---

## What I changed (everything's in your working tree, **not committed** — review with `git status`/`git diff`)

**Backend — safety guardrails (increment 1 + 2):**
- `safety.py` *(new)* — spend cap, kill-switch (alert-mode), per-channel send caps, founder alerts
- `config.py` — safety knobs (all overridable via Railway vars)
- `tasks/scheduler.py` — every cost/send cron now passes through the guard; watchdog/health/briefing stay un-gated
- `agents/outreach_writer.py` — logs real token spend so the cap has data
- `api/agents.py` — `wa-queue` now hard-capped at `MAX_WHATSAPP_PER_DAY` (ban protection)
- `db/migrations.sql` — `spend_log` + 7 team tables

**Backend — team coordination:**
- `api/team.py` *(new)* — the `/api/team/*` API the agents call (tasks, messages, approvals, scores, knowledge, summary)
- `main.py` — registers the team router

**OpenClaw:**
- `platform/openclaw/build_agents.py` *(new)* — generator (source of truth for the 9 agents)
- `platform/openclaw/register_agents.sh` *(new)* — ✅ already run; 9 agents registered
- `platform/openclaw/schedule_agents.sh` *(new)* — you run this (step 4)
- `~/.openclaw/workspaces/<9 agents>/` *(new)* — 36 workspace files
- Git remote — token stripped, credential helper set

---

## Safety knobs (Railway vars — defaults are sane, change only if needed)

| Var | Default | Does |
|---|---|---|
| `SAFETY_ENABLED` | `true` | master switch — set `false` to disable all guards instantly |
| `DAILY_SPEND_CAP_GBP` | `2.00` | backend LLM spend per day before guarded jobs halt |
| `MAX_WHATSAPP_PER_DAY` | `10` | hard WhatsApp ceiling (your ban protection) |
| `MAX_INSTAGRAM_PER_DAY` | `20` | " |
| `SAFETY_KILL_SWITCH_DAYS` | `30` | no-revenue window |
| `SAFETY_KILL_SWITCH_MODE` | `alert` | `alert` = warn only · `pause` = block sends. Left on **alert** because you're pre-revenue — a silent auto-pause would brick you at the worst time. |

---

## ⚠️ Caveats — read these (honest list)

1. **Not deployed / not committed.** I couldn't push (I removed the leaked token; the new one is yours to add). Everything is in the working tree for you to review + commit.
2. **SQL not run yet** — agents' `/api/team` calls will error until you do step 2.
3. **Agent tool access is the one thing I couldn't fully verify.** Registration + the gateway running them is confirmed. Whether each isolated agent can actually execute `curl`/`web_fetch` to hit `/api/team` needs one live test turn (step "Optional" above) — I didn't want to spend tokens / poke the live gateway harder while you were out. If they can't curl, the fix is enabling the shell/web_fetch tool for the agent profile.
4. **The spend cap does NOT cover the OpenClaw agents' own tokens.** Their Haiku usage bills through OpenClaw's Anthropic key, separate from the backend. They're cheap (Haiku, light-context, ~once daily) but uncapped by `spend_log`. Keep the cron frequency low (it is) — or disable any agent with `openclaw cron disable ld-<name>`.
5. **`FOUNDER_PHONE` mismatch** — `ceo_agent.py`/`config.py` use `07301181878`, but Baz reaches you on `07504683058`. If your 8am briefing isn't landing, that's why.
6. **Minor hardening:** OpenClaw warned `plugins.allow is empty`. Consider `openclaw config set plugins.allow '["whatsapp","anthropic"]'`.
7. **Telegram intentionally skipped** — you already have founder email + Baz-on-WhatsApp + the dashboard. Approvals surface at `GET /api/team/approvals`; wire a dashboard panel to show/Approve them (next build if you want it).

---

## How to undo any of it
- Stop an agent firing: `openclaw cron disable ld-<name>`
- Remove an agent entirely: `openclaw agents delete <name>`
- Disable all guardrails: set `SAFETY_ENABLED=false` in Railway
- The 7 new tables + `spend_log` are additive — dropping them doesn't touch your existing data.

💈 Built safe, built real, nothing fires till you say go.
