#!/usr/bin/env bash
# register_agents.sh — register the 9 L&D agents into OpenClaw as ISOLATED agents.
#
# Safe by design:
#   * Idempotent — skips any agent that already exists.
#   * Never touches 'main' (Baz).
#   * No channel bindings — these agents are cron-triggered, they do NOT listen on
#     WhatsApp (only Baz does). That avoids the 440 session conflict.
#
# Run AFTER `python3 build_agents.py` has written the workspaces.
set -uo pipefail

WORKSPACES="$HOME/.openclaw/workspaces"
MODEL="anthropic/claude-haiku-4-5"
AGENTS=(scout gap judge maker reach executor closer profit chief)

echo "Existing agents:"
openclaw agents list 2>/dev/null || { echo "!! gateway not reachable — start it first"; exit 1; }
echo ""

existing="$(openclaw agents list --json 2>/dev/null || echo '')"

for a in "${AGENTS[@]}"; do
  if printf '%s' "$existing" | grep -q "\"$a\""; then
    echo "• $a already registered — skipping"
    continue
  fi
  if [ ! -d "$WORKSPACES/$a" ]; then
    echo "!! $WORKSPACES/$a missing — run build_agents.py first; skipping $a"
    continue
  fi
  echo "→ adding $a"
  openclaw agents add "$a" \
    --workspace "$WORKSPACES/$a" \
    --model "$MODEL" \
    --non-interactive \
    --json \
    && echo "  ✅ $a added" \
    || echo "  ❌ $a failed (see error above)"
done

echo ""
echo "Final agent list:"
openclaw agents list
