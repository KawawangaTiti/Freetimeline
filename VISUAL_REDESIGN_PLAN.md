# FreeTimeline — Visual Redesign Plan

> **Created:** 2026-06-09 · **Why:** the functional audit (`IMPROVEMENT_PLAN.md`, Phases 0–5) fixed how the apps *work* but never touched how they *look*. The owner needs the two apps to stop feeling dated ("parece de 1990"). This plan is the **visual** track and runs on top of the now-stable functional baseline.
>
> **Owner decisions (2026-06-09):** ① deep modern redesign of the apps · ② subtle, adaptive timeline grid (not fully gridded) · ③ redesign the Map view to actually work (don't disable).

## Ground rules (different from the functional phases)
- **Look before and after.** Every phase: headless-Chrome / puppeteer screenshot of the affected view *before*, make the change, screenshot *after*, and show the owner. The local server (`python3 -m http.server 8000`) + `/tmp/pup` puppeteer harness are already set up.
- **Don't regress function.** Keep `node --check` (engines) + inline-script syntax check green; do not rename internal view keys / data fields / handler names (the functional work depends on them). Visual layer only: CSS, markup structure, canvas draw styling.
- One commit per logical change; `node --check`; descriptive messages.
- Both apps (Universe + Biography) move together so they stay a family.

## Confirmed problems (seen in screenshots, 2026-06-09)
- **Toolbar (both apps):** a wall of small buttons, inconsistent styles (outline vs filled, purple/cyan), decorative glyph noise (✦ ◈ ↕), a raw "Row" slider, ~3 rows eating vertical space, no grouping/hierarchy. **Primary cause of the dated feel.**
- **Timeline canvas:** heavy vertical gridlines everywhere; flat, dated colored track-row fills; weak label typography.
- **Map / connections view:** near-invisible connection lines, flat node colors, tiny top controls, and a **z-index bug** (map controls sit under the zoom pill / over the tracks). Hard to read.
- **Dead Cloudflare scripts** in `universe.html` / `biography.html` → console 404s (this is the audit's **SEC-08 / US-6**).
- **OK already:** the home page (`index.html`) and the modals/forms (e.g. "+ New Event"). Leave their structure; only align tokens.

## Phases

### Phase V0 — Shared design tokens + control/button system
**Goal:** one visual language both apps draw from, so later phases are consistent.
**Do:** define a small token set (type scale, spacing scale, radii, elevation/shadows, a disciplined accent palette) and a consistent button/control style (primary / secondary / ghost / danger; one size system with proper touch targets). Apply as CSS variables + a few component classes in each app's `<style>`. No behaviour change.
**Verify:** screenshots look unchanged structurally but buttons/inputs read consistently; `node --check` + inline-script check green.

### Phase V1 — Toolbar / app chrome redesign (both apps)
**Goal:** kill the "1990s toolbar" feel.
**Do:** regroup controls into clear clusters (Create · View · Tools · Data) with a primary action that stands out; collapse rarely-used buttons behind a tidy "More"/overflow menu so the bar is one calm row, not three; apply the V0 button styles; drop decorative-glyph noise and the raw "Row" slider styling; raise the view-tabs into a proper segmented control; fix the **Map-button / zoom-pill stacking** (z-index + layout) so nothing overlaps.
**Verify:** before/after screenshots of both toolbars at desktop + mobile widths; every control still works (click-through in puppeteer).

### Phase V2 — Timeline canvas polish (both apps)
**Goal:** clean, modern canvas; subtle adaptive grid (owner's choice).
**Do:** replace the full grid with a **subtle, zoom-adaptive** set of guide lines (only major time marks, low contrast) + keep the ruler and a refined "Today" line; restyle track rows (soft depth/separators instead of flat slabs, better contrast); improve on-canvas label typography and event dots. Pure canvas-draw + CSS; no data/coordinate-math changes.
**Verify:** before/after screenshots zoomed in and out; confirm pan/zoom still smooth and Phase-1 visual fixes intact.

### Phase V3 — Map / connections view redesign (both apps)
**Goal:** make the relationship/connection map readable and correctly layered.
**Do:** make connection lines visible (weight/contrast/curve), give nodes/edges a sensible, legible color scheme, restyle the map's controls + legend, and fix stacking so controls sit above the canvas and clear of the zoom pill. Keep internal `switchView` keys unchanged (functional dependency).
**Verify:** before/after screenshots of the map in both apps; controls reachable and not overlapping.

### Phase V4 — Cleanup + cross-surface polish
**Do:** remove the dead Cloudflare injection scripts (SEC-08) → clears the 404s; sweep for any remaining visual inconsistencies across the apps and the marketing/legal pages; click every nav link to confirm none are broken; align the OK pages (home/modals) to the V0 tokens where cheap.
**Verify:** zero console 404s; nav link crawl clean.

### Phase V5 — Visual QA pass
**Do:** re-screenshot every view (both apps: timeline / characters / map / stats / list, key modals; + home) at desktop and mobile; assemble a before/after set for the owner; confirm no functional regression (engines parse, a quick interaction sweep throws no errors).

## Verification the OWNER does at the end
Open `http://127.0.0.1:8000/` and both apps and confirm: the apps no longer feel dated; toolbars are calm and grouped; the timeline isn't fully gridded; the Map is readable and nothing overlaps the zoom; links work.

## Mobile (added 2026-06-09 — owner requirement)
The owner needs the apps to work on phones, with the timeline running **top-to-bottom** (vertical scroll) on mobile. **Verified:** the engine already auto-switches to a vertical layout on touch + narrow screens (`ORIENTATION = isMobile ? 'vertical' : 'horizontal'`, `_detectIsMobile()` = `(max-width:820px) and (pointer:coarse)`), confirmed in device emulation. So the *functional* vertical layout already works — it just (a) can't be seen in a desktop browser (needs a touch device / devtools device mode) and (b) needs the same visual polish as desktop (mobile top bar, track pills, bottom bar, the grid). Treat mobile as a first-class target in every visual phase, not an afterthought.

> ### ▶ Execution log (visual track)
> - **2026-06-09 — Plan created.** Visual review done from screenshots; owner chose deep redesign + subtle grid + redesign Map.
> - **2026-06-09 — V0 toolbar (Universe) drafted + owner feedback.** First toolbar restyle (ghost buttons, segmented tabs, removed group boxes/labels) — owner: buttons "better" but still "meio estranho meio cansado" (push further: more contrast/life, less tired), and **do ALL the visual changes in one pass** so the whole thing can be judged working. Mobile must be functional (vertical timeline — already works, see above).
> - **2026-06-09 — V2 grid ✅ (both engines, commit 07b3835).** Removed the dense full-height/width minor gridlines; only faint, zoom-adaptive MAJOR guides cross the canvas now (alpha ~0.15). Applied to drawRuler + drawRulerVertical (desktop + mobile). Kills the "quadriculada" look.
> - **2026-06-09 — V0+V1 toolbars ✅ (Universe 7983185, Biography 6701ab2).** Both apps: tokens, ghost buttons with one confident primary (Universe blue / Biography gold), view tabs → segmented control, group boxes+labels dropped, brighter ghost text (fix "tired"), and ALL desktop toolbar icons/emoji stripped to clean text (mobile drawer keeps icons). Verified by screenshots (desktop + mobile).
>   - **STILL PENDING (next):** V3 Map redesign (visible links / sensible colours / z-index — the map's own controls vs the timeline zoom; the engine renders the map as SVG so this is deeper work), mobile *chrome* polish (the mobile top bar / track pills / bottom bar still use the old styling — the timeline itself is already clean + vertical), V4 cleanup (dead Cloudflare scripts → 404s), and a deeper aesthetic refinement pass if the owner still finds it "tired".
