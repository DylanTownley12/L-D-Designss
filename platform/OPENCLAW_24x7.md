# OpenClaw 24/7 — make the agent team run round the clock

OpenClaw (Baz + the 9 growth agents) runs on **your machine**, not on Railway.
If your machine sleeps, logs out, or the gateway crashes — the whole team stops
and, until now, nothing told you. This doc is the one-time setup that fixes
that, plus the schedule that gets full value from the team.

There are two halves:

1. **Backend (already done, deploys with the repo):** a dead-man's switch on
   Railway watches for team activity every 30 minutes. If the team leaves no
   trace for `OPENCLAW_SILENCE_HOURS` (default 3h) between 07:00–22:00, you get
   an alert via Telegram/Gmail (deliberately NOT WhatsApp — that channel dies
   with the machine). It auto-resolves and messages "back up" on recovery.
   Chief's hourly health check now counts as the pulse automatically.

2. **Your machine (do once, ~10 minutes):** the steps below.

---

## Step 1 — stop the machine sleeping

A laptop lid-close or desktop sleep kills everything. Either:

- **Desktop/laptop staying home:** disable suspend —
  `sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target`
  (and in GNOME settings: Power → Automatic Suspend → Off. Laptop: also set
  "ignore lid close" — `HandleLidSwitch=ignore` in `/etc/systemd/logind.conf`.)
- **Better long-term:** move `~/.openclaw` to a small always-on box — a ~£4/month
  VPS or a Raspberry Pi. Same setup steps apply there.

## Step 2 — keep services running after logout/reboot

`openclaw-gateway` is a *user* service: by default it dies when you log out
and doesn't start on boot. Fix both:

```bash
loginctl enable-linger $USER
systemctl --user enable openclaw-gateway.service
```

## Step 3 — auto-restart if the gateway crashes

```bash
systemctl --user edit openclaw-gateway.service
```

Paste in the editor that opens, save, exit:

```ini
[Service]
Restart=always
RestartSec=10
```

Then:

```bash
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway.service
systemctl --user status openclaw-gateway.service   # should say "active (running)"
```

## Step 4 — the 24/7 schedule (full-potential cadence)

Check what's there now with `openclaw cron list`, then set the team to this
cadence. The principle: **chief is the hourly pulse, closer is the fast loop
(speed-to-lead wins deals), the build chain runs before you wake up.**

| Agent    | When                          | Why |
|----------|-------------------------------|-----|
| chief    | **hourly, 24/7**              | Health check + self-heal. Doubles as the heartbeat the watchdog listens for. |
| scout    | 05:30 daily + 12:30 top-up    | Fresh leads triaged before the day starts, again at lunch. |
| gap      | 06:00 + 13:00                 | Scores whatever scout found. |
| judge    | 06:20 + 13:20                 | GO/HOLD/REJECT on the scored batch. |
| maker    | 06:40 + 13:40                 | Preview plans for the GOs. |
| reach    | 07:00 + 14:00                 | Outreach drafts ready before send windows. |
| executor | every 2h, 08:00–20:00         | Drains the WA/email queue inside daily caps all day, not one morning burst. |
| closer   | **every 30–60min, 08:00–21:00** | Replies drafted within the hour. Speed-to-lead is the single biggest conversion lever. |
| profit   | 20:00 daily + Sunday 18:00 weekly | Day's numbers + weekly A/B verdicts. |
| Baz      | always-on (gateway)           | Inbound WhatsApp answered instantly, any hour. |

Caps still apply — executor can run all day without sending more than
`MAX_WHATSAPP_PER_DAY`; running often just means the allowance is spent at the
*right moments* instead of 7am all at once.

## Step 5 — WhatsApp session stability (unchanged rules, they matter more now)

- **Never** close the TUI terminal (status 440 conflict kills the session)
- **Never** open WhatsApp Web in a browser
- If 440 happens anyway: `openclaw channels login --channel whatsapp` and rescan the QR

## Step 6 — make sure the down-alert can reach your phone

On **Railway → backend service → Variables**, make sure these are set so the
watchdog's Telegram path works (it falls back to Gmail if not):

- `TELEGRAM_BOT_TOKEN` — your JARVIS bot token
- `FOUNDER_CHAT_IDS` — your Telegram chat id (comma-separated if both founders)
- Optional: `OPENCLAW_SILENCE_HOURS` — default 3; lower to 2 once chief is
  reliably hourly.

## Step 7 — test it (2 minutes)

```bash
# 1. Fake a heartbeat — proves the liveness pipe works end-to-end:
curl -X POST https://l-d-designss-production.up.railway.app/api/team/heartbeat \
  -H 'Content-Type: application/json' -d '{"agent":"chief","note":"manual test"}'

# 2. Real test: stop the gateway before work one morning —
systemctl --user stop openclaw-gateway.service
# → within ~3.5h you should get the 🔴 Telegram/Gmail alert.
systemctl --user start openclaw-gateway.service
# → next chief run, you get the ✅ recovery message. Then never do this again.
```

## Optional — explicit heartbeats from every agent

Chief's hourly health check is enough for the watchdog. If you want per-agent
liveness in the logs too, add this one-liner to each agent's `HEARTBEAT.md`
curl set (swap the agent name):

```bash
curl -s -X POST $BACKEND/api/team/heartbeat \
  -H 'Content-Type: application/json' -d '{"agent":"scout"}'
```
