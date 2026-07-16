# HANDOFF — read me first (then delete me)

This folder was created on 2026-07-16 by Dylan's cloud Claude session, which can only
push to the L&D Designs repo — so Build 1 was parked here for pickup. It is
**Vorbix OS Build 1 — complete**, per `CLAUDE.md` (the Vorbix briefing).

Your jobs, in order:

1. **Read `CLAUDE.md` in this folder** — it is the full Vorbix briefing and becomes
   the CLAUDE.md of the new repo.
2. **Move this folder to its own repo.** Create a new **private** GitHub repo called
   `vorbix-os` under Dylan's account. Copy everything in this folder to the repo
   root (`CLAUDE.md` stays at root). Delete this `_HANDOFF.md` after the move.
   Commit and push.
3. **Set up Obsidian sync with Dylan.** Steps are in `README.md` → "Obsidian setup".
   Walk him through it and verify one edit round-trips to GitHub.
4. **Clean up.** Once the new repo exists and Dylan confirms, the branch
   `claude/code-terminal-setup-v9loc5` on `DylanTownley12/L-D-Designss` can be
   deleted — Vorbix files don't belong in the L&D repo long-term.
5. **Start Build 2** (read-only eBay MCP server) exactly as specified in `CLAUDE.md`.
   Blocked until Dylan registers at developer.ebay.com (free). Secrets in env vars
   only, never committed; Codex security review before Dylan adds credentials.

Rules that bind you too: never invent data (rule 6), recommendations only (rule 7),
don't reorder the builds without Dylan's sign-off.
