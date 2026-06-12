---
name: trade-preview-standards
description: "L&D Designs preview engine standards and QA contract. Use when building, redesigning, reviewing, or rebuilding prospect preview pages (v3 engine, platform/backend/agents/preview_qa.py), changing preview templates, hero variants, OG cards, or running the v3 rollout (build samples → build ALL → promote). Also use when judging preview design quality or comparing design directions."
---

# Trade Preview Standards

Prospect previews ARE the product L&D sells. A preview must look like a £1,500
agency build, load fast on a cracked phone screen, and never lie. This skill is
the contract every preview change must honour.

## The hard QA contract (deterministic gate — never break these)

Every generated page MUST contain:
- Section ids: `quote`, `book`, `services`, `process`, `area`, `faq`
- Exact class strings: `class="badges"`, `class="mc"` (mobile call bar)
- A `<form>` carrying the prospect's real capture token, posting to `/api/capture/{token}`
- A `tel:` link when the prospect has a phone (no phone → CTAs point to `#book`,
  page correctly lands in needs_review)
- **The ONLY prices anywhere: £199 and £29.** Any other £ amount fails QA.
- No placeholder text (lorem ipsum, "your business name", TBD, coming soon, xxxx)

## Honesty rules (these sell BECAUSE they're real)

- Real Google reviews, rating, review count, photos only — never fabricated
- Never invent: certifications, years in business, guarantees, availability
  ("24/7"), awards, response times
- Generic-honest fallbacks are fine: "Fully insured", "Free quotes"
- Every photo needs a fallback chain (real photo → trade stock → branded
  gradient). A dead image URL must never show a broken-image icon.

## Design standards

- **Mobile-first.** Judge at 390px before desktop. Tradesmen's customers are on
  phones; so is the tradesman when Dylan WhatsApps him the link.
- **Variant-seeded.** Hero layout × font personality × shape seeded from
  prospect id — no two prospects in the same town may look templated.
- **Per-trade palettes** (`_ACCENTS` in preview_qa.py): plumber blue, heating
  orange, electrician gold, roofer teal, drainage cyan.
- **Speed budget:** <3s on mobile. Hero ~1100px/q72, gallery 640px, lazy-loaded.
- A stressed homeowner must find the phone number / booking CTA in 2 seconds.

## The rollout safety model (never bypass)

- Previews are **stored HTML snapshots** — design changes show only after rebuild
- Rebuilds keep the SAME URL (already-sent links upgrade silently, never 404)
- Bulk builds SKIP promoted/live pages; a failing rebuild NEVER overwrites a
  promoted page; only the founder promotes (`POST /api/sales/prospects/{id}/v3/promote`)
- Phased rollout: `POST /api/sales/v3/build?limit=3` → founder reviews → big
  limit → `GET /api/sales/v3/status` → per-prospect promote

## Verification protocol (nothing ships unseen)

1. Render ALL hero variants + edge cases: no reviews, no photos, no phone,
   no rating, very long business names
2. Check structurally: balanced tags, JS IIFE closed (`})();`), no `f.name`
   form-property bugs, valid JSON-LD
3. Screenshot desktop AND 390px mobile (Playwright when available). Confirm no
   invisible sections (`.fx` must reveal), booking JS fires, no sideways scroll
4. Always produce BEFORE/AFTER screenshots for the founder

## The design-pass lesson (learned twice on 12 Jun 2026 — don't be third)

Polish is not transformation. Two sessions independently "improved" previews and
the founder couldn't tell the difference. For any redesign:
- Use the ui-ux-pro-max skill's STYLE LIBRARY (bold looks), not just its rules
- Present 2–3 **genuinely different directions** on ONE real prospect (think:
  "different agencies built these"), founder picks, THEN port the winner across
  trades/variants
- The bar: unmistakably different at arm's length on a phone
