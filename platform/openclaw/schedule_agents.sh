#!/usr/bin/env bash
# schedule_agents.sh — schedule each L&D agent via OpenClaw cron (Europe/London).
#
# Each job runs ONE isolated agent turn with a "do your job" nudge. The agent then
# pulls its inbox from /api/team, does its work, hands off, and stages anything that
# needs approval. --session isolated keeps each run off Baz's live WhatsApp session.
#
# Idempotent: removes a prior job of the same name before re-adding.
# Run AFTER register_agents.sh.
set -uo pipefail

NUDGE="Run your daily job now per your SOUL.md and AGENTS.md. Pull your inbox from the /api/team endpoints, do your work, hand off to the next agent, and STAGE anything that needs sending or spending as an approval. Output JSON only."

# agent : 5-field cron (min hour dom mon dow), Europe/London
declare -A CRON=(
  [scout]="0 6 * * *"
  [gap]="20 6 * * *"
  [judge]="40 6 * * *"
  [maker]="0 7 * * *"
  [reach]="20 7 * * *"
  [executor]="40 7 * * *"
  [closer]="0 9-20 * * *"
  [profit]="0 20 * * *"
  [chief]="0 7,20 * * *"
)

for a in "${!CRON[@]}"; do
  name="ld-$a"
  openclaw cron rm "$name" >/dev/null 2>&1 || true
  echo "→ scheduling $a  ('${CRON[$a]}')"
  openclaw cron add \
    --name "$name" \
    --cron "${CRON[$a]}" \
    --agent "$a" \
    --session isolated \
    --light-context \
    --message "$NUDGE" \
    && echo "  ✅ $name scheduled" \
    || echo "  ❌ $name failed — check 'openclaw cron add --help'"
done

echo ""
echo "Scheduled jobs:"
openclaw cron list
