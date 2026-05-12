# FreeTimeline — Post-Launch Backlog
> Items deliberately deferred from the 4-day pre-launch sprint.
> Work through these between offline deploy and AdSense approval (typically ~14-42 days),
> or after launch as time allows.

> Source of truth for each item is `PROJECT_REVIEW.md` (the original audit).
> Open it for the full "How to fix" / "How to see it yourself" detail.
## 🔴 Critical (re-check before deploy if any appear here)
_None outstanding._
## 🟠 High priority (do first)
## 🟡 Medium priority
### #012 — Privacy Policy says "no analytics today" but Cookie Policy implies there is none
- **What it is:** These are accurate today, but they need to stay accurate as soon as you add any analytics (Plausible, Matomo, Google Analytics, AdSense's own analytics, etc.). Make a mental note. No action required *now*, but flag in your roadmap.
- **Where it lives:** `privacy.html` line 354 ("FreeTimeline does *not* currently use Google Analytics…") and `cookies.html` section 4c ("FreeTimeline does not currently use Google Analytics… No analytics cookies are set by FreeTimeline.")
- **Difficulty:** N/A (informational)
- **Full detail:** see `PROJECT_REVIEW.md` issue #012.

### #019 — "Reading Mode" exists in Universe, missing in Biography
- **What it is:** Reading Mode (a softer warm-parchment palette for long sessions) was added to Universe but never ported to Biography. Biography users — who are exactly the long-session journalers Reading Mode was designed for — don't get it.
- **Where it lives:** - Universe: button at `universe.html` line 3903 (`id="reading-toggle-btn"`), handler defined inline at line 6075 (`window.toggleReadingMode = …`).
- **Difficulty:** Medium
- **Estimate:** 2 hours.
- **Full detail:** see `PROJECT_REVIEW.md` issue #019.

### #020 — "Continuity Tour" exists in Universe, missing in Biography
- **What it is:** Universe ships with two guided walkthroughs (Continuity Tour + Memory Tour). Biography only has Memory Tour.
- **Where it lives:** - Universe: button at `universe.html` line 3922 (`onclick="ContinuityTour.start()"`). Handler defined in `js/universe-timeline.js` (search for `ContinuityTour`).
- **Difficulty:** Medium-Hard (the Continuity Tour code is non-trivial).
- **Estimate:** Half a day.
- **Full detail:** see `PROJECT_REVIEW.md` issue #020.

### #030 — `biography.html` mobile drawer references functions that *are* defined inline (verified) but the architecture is fragile
- **What it is:** Mobile UI handlers are split across `js/biography-timeline.js` and `biography.html`'s inline scripts. Same in `universe.html`. Hard to maintain — when you move/rename a function, you may not know if it's the JS file or the HTML to edit.
- **Where it lives:** `biography.html` lines 4842-4974 — `bioMobile*` and `bioMobBlank*` helpers all defined inline at the bottom of the HTML file.
- **Difficulty:** Medium (proper fix). Trivial (comment-only).
- **Estimate:** 2 hours full / 5 min comment.
- **Full detail:** see `PROJECT_REVIEW.md` issue #030.

### #033 — `#consent-bar` on the homepage covers a large portion of the mobile viewport
- **What it is:** 42% of the small viewport height is a *lot* of bottom-bar real estate. On small phones the consent bar pushes the homepage content too far up.
- **Where it lives:** `index.html` style block, `@media (max-width: 767px)` section, around line 76 — `#consent-bar { … max-height: 42svh; … }`.
- **Difficulty:** Easy
- **Estimate:** 30 minutes.
- **Full detail:** see `PROJECT_REVIEW.md` issue #033.

### #034 — The canvas-based apps depend on touch gestures but don't visibly announce them
- **What it is:** Verify on a real phone: the touch instructions ("Drag to pan, pinch to zoom") may or may not be visible. The CSS is complex enough that I cannot guarantee from reading.
- **Where it lives:** `universe.html` line 3800, `biography.html` (similar) — the `#mobile-banner` div is `display: none` on actual mobile (`@media` rules). Mobile users instead get the `#bio-mobile-touch-note` block.
- **Difficulty:** Easy-Medium
- **Estimate:** 1 hour.
- **Full detail:** see `PROJECT_REVIEW.md` issue #034.

### #038 — Sticky "Start now — no sign-up" CTA on homepage right side overlaps the portal cards at certain widths
- **What it is:** It's fixed top-right and visible during all scroll. On tablet widths (720-1024px) it may overlap the right edge of the portal cards.
- **Where it lives:** `index.html` lines 77-93 — `.hero-sticky-cta { position: fixed; top: 80px; right: 24px; … }` only visible at viewports ≥720px.
- **Difficulty:** Easy
- **Estimate:** 30 minutes.
- **Full detail:** see `PROJECT_REVIEW.md` issue #038.

### #041 — Help/Keys buttons exist but I haven't verified they actually open useful content
- **What it is:** Need to test. The code in `js/universe-timeline.js` line 7852 references `OBS_HELP_SECTIONS` — looks like a substantial help system. Did not visually verify.
- **Where it lives:** Universe `UI.help()`, `UI.toggleKbd()`. Biography same.
- **Difficulty:** Easy (verification)
- **Estimate:** 15 minutes.
- **Full detail:** see `PROJECT_REVIEW.md` issue #041.

### #044 — Universe app uses the word "track" for a universe row; Biography uses "Life Track" — but the underlying data structure in *both* JS files is literally called `universes`
- **What it is:** The naming is confusing. UI text says "Life Track", but the data model and function names say "universe". When the user exports a JSON file from Biography and opens it in a text editor, they will see "universes" — which can be alarming for a *biography* file.
- **Where it lives:** - `js/biography-timeline.js` line 112: `const tracks = d.lifeTracks || d.universes || [];` — supports both names internally.
- **Difficulty:** Medium
- **Estimate:** Half a day (option 2), 1-2 days (option 1).
- **Full detail:** see `PROJECT_REVIEW.md` issue #044.

### #054 — URL hash state restoration accepts user-provided values
- **What it is:** Share-by-URL encodes view state (zoom level, pan position, filters) into the URL hash. If the parser doesn't validate ranges, a malicious URL could cause weird state (NaN positions, huge zoom values, infinite loops). Low real-world risk; worth confirming bounds-checking exists.
- **Where it lives:** `js/universe-timeline.js` section starting line 9485 ("URL HASH STATE"), `js/biography-timeline.js` line 8200 ("SHARE VIEW + URL HASH STATE").
- **Difficulty:** Easy
- **Estimate:** 1 hour.
- **Full detail:** see `PROJECT_REVIEW.md` issue #054.

### #055 — No Content-Security-Policy header (server config, not in the project files)
- **What it is:** No CSP means inline `<script>` blocks (you have lots) and unsanitised injected HTML can execute. With ~160 `.innerHTML =` sites, a CSP would be a strong second line of defence.
- **Where it lives:** Hosting layer (Cloudflare, the actual web server).
- **Difficulty:** Medium
- **Estimate:** 1-2 hours initial setup + ongoing tweaks.
- **Full detail:** see `PROJECT_REVIEW.md` issue #055.

### #058 — `<html lang="en">` everywhere, but the domain is `.pt` and the legal section claims Portuguese jurisdiction
- **What it is:** `lang="en"` correctly tells search engines the content is English, but Google may treat a `.pt` domain with English content as targeted at Portugal — which is fine if intentional. No bug, but flag for review when localisation rolls out (#051).
- **Where it lives:** Every page (`<html lang="en">`).
- **Full detail:** see `PROJECT_REVIEW.md` issue #058.


## 🟢 Low priority / polish
### #016 — Roadmap promises an "Accessibility pass" while accessibility is partially implemented
- **What it is:** The Roadmap lists "Accessibility pass" as a planned (not-yet-done) feature, but the code already has a substantial accessibility baseline (skip links, ARIA labels, `prefers-reduced-motion` support, focus-visible outlines). This isn't critical, but the way it reads makes the site sound less mature than it is.
- **Where it lives:** `roadmap.html` lines 273-275 (the "Planned" section).
- **Difficulty:** Trivial
- **Estimate:** 5 minutes.
- **Full detail:** see `PROJECT_REVIEW.md` issue #016.

### #028 — Sitemap and Cookie Policy/Privacy Policy carry no `lastmod` date matching the actual last edit
- **What it is:** Static placeholder dates. Will not auto-update.
- **Where it lives:** `sitemap.xml` all `<lastmod>2026-04-21</lastmod>`.
- **Difficulty:** Easy
- **Estimate:** 5 minutes.
- **Full detail:** see `PROJECT_REVIEW.md` issue #028.

### #036 — On viewports < 360px (very small phones, older devices) the hero pills collapse to single-column but the portal cards still need horizontal scroll in some places
- **What it is:** I haven't tested this width. Sub-360px is rare in 2026 — iPhone SE and very old Android only — but if it's broken there, AdSense reviewers using Lighthouse will see it.
- **Where it lives:** `index.html` `@media (max-width: 360px)` block.
- **Difficulty:** Medium
- **Estimate:** 1 hour.
- **Full detail:** see `PROJECT_REVIEW.md` issue #036.

### #037 — Visual style is dark/space-themed, but feels heavier than the marketing positioning ("simple, fast, free")
- **What it is:** Subjective: the dark theme is striking but doesn't match phrases like "for memory keepers", "your family history", which lean warm/personal. For Biography users especially, the cosmic palette feels off-tone.
- **Where it lives:** Across every page — the `--bg: #050611` very-dark background plus the animated star canvas in `index.html`.
- **Difficulty:** Medium-Hard
- **Estimate:** Days.
- **Full detail:** see `PROJECT_REVIEW.md` issue #037.

### #046 — Universe shows "Memory Tour" button — that's a Biography concept
- **What it is:** "Memory" is the Biography vocabulary ("Your memories, your museum"). In Universe it would more naturally be called "Continuity Tour" (which also exists separately). Having both buttons in Universe is fine, but the *name* "Memory Tour" feels Biography-flavoured.
- **Where it lives:** `universe.html` line 3923 — `<button class="btn" onclick="MemoryTour.start()" title="Start a read-only guided Memory Tour through your events one moment at a time">🎞 Memory Tour</button>`.
- **Difficulty:** Trivial
- **Estimate:** 5 minutes.
- **Full detail:** see `PROJECT_REVIEW.md` issue #046.

### #047 — Biography sidebar still says "People & Key Figures" — phrasing OK; Universe equivalent is "Codex" — feels too RPG
- **What it is:** "Codex" works for fiction, but the consistent biography vocabulary across the site is *People*. Make sure that tab is labelled appropriately for *its own context* (Codex stays in Universe; People stays in Biography). No bug — just confirming they're not crossed.
- **Where it lives:** Biography "People" tab (`switchView('people')`). Universe "Codex" tab.
- **Full detail:** see `PROJECT_REVIEW.md` issue #047.

### #048 — `feed.xml` advertises an RSS feed but no `<link rel="alternate" type="application/rss+xml">` on most pages
- **What it is:** Browsers (and RSS reader extensions) discover feeds via the `<link rel="alternate">` tag. Adding it to every page lets users subscribe from anywhere on the site.
- **Where it lives:** Only `index.html` line 117, `guides.html` line 264, and the guide articles have the RSS feed link. Other pages don't.
- **Difficulty:** Trivial
- **Estimate:** 10 minutes.
- **Full detail:** see `PROJECT_REVIEW.md` issue #048.

### #050 — `roadmap.html` says "Print & PDF export" is *planned* but the canvas-based apps cannot easily produce a usable print
- **What it is:** Just a flag — printing a giant pannable canvas is hard. If a user reads the roadmap and asks "when?", be prepared with a real estimate. This is purely a roadmap-honesty issue, not a code one.
- **Where it lives:** `roadmap.html` lines 260-263.
- **Full detail:** see `PROJECT_REVIEW.md` issue #050.

### #051 — "Localised UI" planned but no i18n scaffolding exists in either JS file
- **What it is:** No localisation framework, no string extraction, no language files. Going from this state to Portuguese-first will be a real project, not a feature flip. Plan accordingly.
- **Where it lives:** `roadmap.html` lines 277-280.
- **Full detail:** see `PROJECT_REVIEW.md` issue #051.

### #056 — `mailto:support@freetimeline.pt` and `mailto:privacy@freetimeline.pt` are publicly visible in many pages — spam exposure
- **What it is:** Bot scrapers harvest these addresses. Spam is inevitable.
- **Where it lives:** `about.html`, `contact.html`, `privacy.html`, `terms.html`, `cookies.html` (mailto links).
- **Difficulty:** N/A (informational).
- **Full detail:** see `PROJECT_REVIEW.md` issue #056.

### #061 — Privacy Policy doesn't explicitly disclose the Cloudflare WAF / DNS layer if hosted on Cloudflare
- **What it is:** Good — it's already disclosed. But verify: is Cloudflare *actually* your CDN/DNS? If not, remove the line. If yes, you may need a DPA (Data Processing Addendum) on file with them for GDPR — Cloudflare provides one. Document the link in your records.
- **Where it lives:** `privacy.html` line 351 — mentions Cloudflare as DNS/CDN host.
- **Difficulty:** Easy (administrative).
- **Full detail:** see `PROJECT_REVIEW.md` issue #061.

### #062 — Privacy Policy "Right to Erasure" — for a localStorage-only site, this is awkward
- **What it is:** The page says you can request erasure of data. But since the user's data is in their browser, the deletion mechanism is "clear browser data". The page mentions this. OK.
- **Where it lives:** `privacy.html` "Your Rights (GDPR)" section.
- **Full detail:** see `PROJECT_REVIEW.md` issue #062.


## ⚪ Cosmetic / nice-to-have
### #039 — The same `/* Part 12 A11y baseline */` CSS block is duplicated **three** times in `about.html`, `roadmap.html`
- **What it is:** Some build/template process pasted the same CSS three times. Pure size bloat — they're identical.
- **Where it lives:** `about.html` lines 303-321 (same `.footer-links .ft-cookie-prefs {…}` block repeated three times). `roadmap.html` lines 166-184 (same three repetitions). Probably others — search every page for the comment `--- PART 12: A11y baseline ---`.
- **Difficulty:** Easy
- **Estimate:** 30 minutes (across all affected files).
- **Full detail:** see `PROJECT_REVIEW.md` issue #039.

### #060 — Several pages have *two* `<script>(footer-year)</script>` blocks duplicating the same year-setting code
- **What it is:** Some pages set the same year twice or check both `ft-year` and `footer-year` IDs, only one of which is in the DOM.
- **Where it lives:** `cookies.html` line 79 (manual), then a footer block in shared snippets. Similar in `about.html`. Search for `getElementById('footer-year')` and `getElementById('ft-year')`.
- **Difficulty:** Easy
- **Estimate:** 30 minutes.
- **Full detail:** see `PROJECT_REVIEW.md` issue #060.

### #063 — `.DS_Store` should not be deployed
- **What it is:** macOS metadata file; not useful in production.
- **Where it lives:** Project root.
- **Difficulty:** Trivial.
- **Full detail:** see `PROJECT_REVIEW.md` issue #063.

### #067 — `let TRACK_H = 100;` and similar globals leak from the engine to the inline onclick handlers
- **What it is:** The toolbar's row-height slider uses `oninput="TRACK_H=+this.value; …"` — modifying a top-level global from inline HTML. Coupling, but works.
- **Where it lives:** `js/universe-timeline.js` line 24, `js/biography-timeline.js` similar.
- **Difficulty:** Medium.
- **Estimate:** 2 days, full refactor.
- **Full detail:** see `PROJECT_REVIEW.md` issue #067.

### #068 — The two engines are 95% duplicated code with minor renames
- **What it is:** Section banners in both files use identical names ("STATE", "UTILITY HELPERS", "RENDER ENGINE", etc.). Many functions are the same with `Universe`→`Biography` renames. Maintenance cost is 2x — any bugfix in one must be ported to the other.
- **Where it lives:** All of `js/universe-timeline.js` (9,908 lines) and `js/biography-timeline.js` (8,958 lines).
- **Full detail:** see `PROJECT_REVIEW.md` issue #068.

### #069 — Inline event handlers (`onclick="…"`) are everywhere — modern best practice is `addEventListener`
- **What it is:** Inline handlers prevent stricter Content-Security-Policy headers (#055), are harder to debug, and create the script-loading-order fragility you have today (engine functions, inline-script functions, mobile handlers all racing).
- **Where it lives:** Both apps' HTML files. Hundreds of `onclick="UI.foo()"` strings.
- **Full detail:** see `PROJECT_REVIEW.md` issue #069.


## 🟠 Owner-flagged priorities (not in PROJECT_REVIEW.md)
### Mobile timeline scroll direction
- **What it is:** Currently the canvas uses horizontal pan + pinch-zoom on phones. Long timelines on a phone require many swipes left-right. A vertical layout (time runs top-to-bottom on mobile breakpoint, life-tracks become columns) would be more natural for thumb scrolling.
- **Where it lives:** `js/universe-timeline.js` (functions `universeToCross`, `trackY`, `timeToMain`, the `ORIENTATION MODE SWITCH` and `AXIS MAPPING ABSTRACTION` sections); `js/biography-timeline.js` (same sections); both `universe.html` and `biography.html` for the canvas / minimap CSS rules; both apps' touch-gesture handlers.
- **Difficulty:** Hard. Touches the render engine, the gesture system, the minimap, and the time ruler.
- **Estimate:** 1-3 days, own focused sprint.

## 🐛 Bugs found during owner testing
_Owner adds entries here as they discover issues in real use._

<!-- Template:
### Short title
- **Found:** YYYY-MM-DD
- **Steps to reproduce:** ...
- **Browser / device:** ...
- **Expected vs actual:** ...
-->

## How to use this file
Open a fresh Claude Code session in the project folder. Say one of:

- *"Read POST_LAUNCH.md and execute the first 🟠 High-priority item, harsh mode, same rules as the 4-day sprint."*
- *"Work on POST_LAUNCH.md #044 only. Show me the diff first."*
- *"Read POST_LAUNCH.md and the latest 🐛 bug. Diagnose and fix."*

When an item is finished, append `✅ Done YYYY-MM-DD` to its heading the same way Day 1-4 marked PROJECT_REVIEW.md.
