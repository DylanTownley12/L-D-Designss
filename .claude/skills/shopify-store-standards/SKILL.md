---
name: shopify-store-standards
description: "L&D Designs Shopify quality contract. Use when building, redesigning, restyling, reviewing, or auditing ANY Shopify store, storefront, theme, product page, collection, or store copy — new stores or the connected store. Also use when adding products, writing product descriptions, choosing or generating store imagery, or judging whether a store looks like 'AI slop' vs an agency build."
---

# Shopify Store Standards

A store must look like a real brand hired a real designer — not like AI filled
in a template. "AI slop" is not one mistake, it's a recipe: default fonts +
invented copy + mismatched images + every section the same layout. This skill
is the contract that breaks the recipe. Work the gates in order; never skip one.

## Gate 0 — inputs before pixels (slop starts here)

Never start building from a one-line request. Get these from the founder first
(ask — don't invent):

1. **What it sells** — real product list: names, prices, variants. 3+ products.
2. **Who buys it** — one specific sentence ("30-something gym lads who hate
   supplements aisles", not "everyone who loves fitness").
3. **2–3 reference brands/stores** whose look he rates (steal direction, not pixels).
4. **Photos** — real ones if they exist. If not, agree an art-directed AI image
   plan (see Imagery below) before generating anything.

Claude inventing all four of these IS the slop machine. One clarifying message
up front beats a store nobody wants.

## Gate 1 — direction before build

- Load the `ui-ux-pro-max` skill and pick from its STYLE LIBRARY — a named
  style + palette + font pairing chosen for the actual buyer, not for Claude's taste.
- Build **2–3 genuinely different** homepage mockups (hero + product card as
  standalone HTML, screenshotted). The bar: "different agencies built these" —
  not three shades of one idea.
- Founder picks on his phone → THEN build the store. Never build a full store
  on an unpicked direction. (Same lesson as the preview engine, learned twice:
  polish is not transformation.)

## The slop blacklist (hard fails — self-check before showing anything)

**Typography & colour**
- Display font is Inter / Roboto / Poppins / Montserrat / Lato / Open Sans →
  fail. Pick a characterful display face + a workhorse body font (Shopify font
  library or Google Fonts).
- Purple→blue gradient on white → fail.
- Accent colour used once and never again → fail. One palette: 1 dominant,
  1 accent, neutrals — accent repeats in nav, buttons, links, section breaks.

**Copy** (read every line aloud in the buyer's voice)
- Banned: "Elevate", "Discover", "Unleash", "Indulge", "Welcome to our store",
  "Your one-stop shop", "Premium quality", "Crafted with care/passion",
  "Curated collection", "Elevate your lifestyle".
- "Shop Now" on every button → fail. Vary CTA by intent ("See the range",
  "Build yours", "Size guide").
- Specificity test: every claim carries a fact — material, number, origin,
  timeframe. "Quality materials" fails; "3mm full-grain Italian leather" passes.
- Short sentences. Contractions. One idea per sentence. No AI essay rhythm.

**Imagery**
- picsum/unsplash hotlinks, Dawn placeholder art, broken images, "image coming
  soon" → fail.
- Mixed image DNA (one white-background render, one moody lifestyle shot, one
  obviously-AI fever dream) → fail. Write ONE style bible per store — lighting,
  backdrop family, colour grade, lens language — and every image obeys it.
- Generating images (higgsfield MCP): put the style bible in EVERY prompt;
  `remove_background` for clean product cutouts; consistent grade across the set.
- All images upload via the Shopify `upload-image` tool → use the returned CDN
  URL. Local paths and hotlinks fail.

**Structure & trust**
- The same section layout stacked 5× (full-width image + centred text, repeat)
  → fail. Rhythm: alternate full-bleed / split / grid / editorial band / quote slab.
- Missing favicon, OG image, real announcement bar, About page with a real
  story, contact page, or policies → not done. Buyers smell it, so does Shopify.
- Fake anything — reviews, "1,000+ happy customers", countdown timers, trust
  badges you don't hold → fail forever. Real or absent. (House rule, same as
  previews: honesty sells BECAUSE it's real.)

## Store mechanics (Shopify MCP)

- `get-shop-info` first — confirm WHICH store is connected before writing anything.
- Products/collections/pages/discounts: use the dedicated MCP tools.
- Product descriptions: hook in the buyer's words → what it is (specifics) →
  short spec list → shipping/guarantee facts. 80–150 words, no essays.
- **Theme code: never the live theme** (the MCP blocks live-theme writes anyway).
  Workflow: create/duplicate an UNPUBLISHED theme → edit via `themeFilesUpsert`
  (`graphql_schema` → `validate_graphql_codeblocks` → `graphql_mutation`;
  `search_docs_chunks` for section/schema examples) → preview at
  `https://{domain}/?preview_theme_id={theme_id}` → the founder publishes in
  admin when happy. Publishing is HIS click, always.
- Dawn is a fine skeleton; default Dawn settings are the slop. Minimum theme
  pass: fonts, colour scheme, button/corner language, section spacing, custom
  hero, custom product card. Keep CSS in one custom asset so edits stay
  surgical and reversible.
- `get-new-store-previews` (brand-new stores only) outputs a skeleton, never a
  deliverable — the full contract above still applies to whatever it generates.

## Verification (nothing ships unseen — the founder can't run code)

1. Playwright screenshots (chromium at `/opt/pw-browsers/chromium`): **390px
   AND 1440px** — homepage, one collection, one product page, cart.
2. Self-grade against the blacklist; fix every fail BEFORE the founder sees it.
3. Send before/after screenshots, phone-width first. The bar: unmistakably
   different at arm's length on a phone.
4. Password-protected storefronts: a password-wall screenshot proves nothing —
   use the theme share/preview link or get the storefront password
   (admin → Online Store → Preferences) so screenshots show the actual store.
