# FreeTimeline — Full Project Audit & Master Review

> Generated 2026-05-11. Review-only — no project files were modified.
> Working dir: `/Users/allanismaeasequia/Desktop/Break0ut/WORK/HUB 8MAY/freetimeline`

---

## 1. Executive Summary

**Overall health score: 4 / 10.**

The site has real, well-built pieces — the two timeline apps are large, ambitious, and mostly functional. But the *outer shell* (legal pages, AdSense setup, default app data, the cookie consent system, the marketing copy) has serious, easy-to-spot problems that almost certainly caused the AdSense rejection and will hurt first-impression trust. Most are fixable in hours, not days.

### Top 5 things that will block deployment

1. **The "Manage cookie preferences" button is fake on every page.** It just shows a pop-up that says *"Part 15... planned... until wired in, no personalised ads are loaded"*. EU/UK visitors are promised a consent banner in your Cookie Policy and Privacy Policy — they don't get one. (#001)
2. **`about.html` contains the sentence "We don't show you ads. We don't sell your information."** You are applying for AdSense. A reviewer reading this assumes the application is mistaken or dishonest. (#002)
3. **The Universe app opens with "Liga BRT", "Liga Knokout", "40 Graus", "Other"** as the four default universes. These look like leftover personal data. Anyone visiting your site for the first time sees this. (#003)
4. **The site has zero actual ad slots.** AdSense's script is loaded on the homepage only, and nowhere on the site is there an `<ins class="adsbygoogle">` block telling Google where to put an ad. AdSense cannot approve a site that gives it nowhere to display ads. (#004)
5. **Hardcoded Marvel/DC sample content baked into the JavaScript.** The Universe engine ships with about 36 Marvel/DC references (X-Men, Cyclops, Magneto, Secret Wars, Cape Citadel, etc.) as the example timeline. That is copyrighted content presented as the default product demo — both an IP risk and an AdSense red flag. (#005)

### Top 5 most likely AdSense rejection reasons

1. **No ads placed anywhere** (loader on homepage only, no ad slots). (#004)
2. **Site looks "under construction":** "Team photo coming soon" placeholder on About, broken Open Graph images (`og.png` / `og-image.png` don't exist), no favicon, no `ads.txt`. (#006, #007, #008, #009)
3. **Cookie consent / EU compliance is a stub.** Your Cookie Policy and Privacy Policy promise an IAB TCF v2.2 consent banner; the code shows a placeholder alert instead. (#001)
4. **Marketing copy directly contradicts running ads** ("We don't show you ads", "We don't have a business model that depends on your data" in About). (#002)
5. **Copyrighted brand content as default demo** (Marvel/DC sample data in the Universe app). (#005)

### Honest verdict on the 4-day timeline

**Achievable, but only if you cut.** The site does NOT need:
- An IAB TCF v2.2 Consent Management Platform on launch (Day 1 acceptable: a simple "Accept / Reject all" banner that actually sets the `ft_cookie_consent` value the Cookie Policy already promises).
- New features.
- Mobile polish on every modal.

It *must* have, before AdSense re-submission:
- A real consent banner (even a basic one) that matches what the legal pages say.
- Replacement of the default Marvel/DC and "Liga BRT" sample data with neutral, original demo data.
- Removal of the "We don't show you ads" contradiction.
- Working Open Graph image + favicon.
- An `ads.txt` file in the site root.
- At least 1-2 actual `<ins class="adsbygoogle">` ad slots on the homepage and inside guides — and the AdSense loader on every page that has them.
- Honest, working "Manage cookie preferences" link.

That is a 1.5-2-day job with Claude Code. Day 3 should be QA across mobile/desktop. Day 4 is buffer + resubmit.

If you try to also fix the ~150+ smaller issues in this document inside 4 days, **you will run out of time**. Prioritise the 🔴 items, then 🟠 items in `#040`–`#060` (the visible app bugs). Everything else can wait until after re-approval.

---

## 2. File Inventory

| Path | Purpose (plain English) | Approx size | Status |
|---|---|---|---|
| `index.html` | Marketing homepage with the two big portal cards | 53 KB | 🟡 |
| `about.html` | "About us" page | 14 KB | 🔴 (contradicts AdSense) |
| `contact.html` | Contact page — email + a "form" that just opens your email client | 14 KB | 🟡 |
| `cookies.html` | Cookie Policy (long, well-written, but factually wrong) | 17 KB | 🔴 |
| `privacy.html` | Privacy Policy (long, mostly accurate) | 18 KB | 🟡 |
| `terms.html` | Terms of Service | 15 KB | 🟢 |
| `roadmap.html` | Public "what we're building" page | 12 KB | 🟢 |
| `pricing.html` | "We're free + FAQ" page | 16 KB | 🟢 |
| `guides.html` | Hub linking to the 5 article guides | 12 KB | 🟡 |
| `universe.html` | The fictional-universe timeline editor — HTML shell with toolbar, modals | 223 KB / 6,219 lines | 🟡 |
| `biography.html` | The life-story timeline editor — HTML shell | 238 KB / 6,151 lines | 🟡 |
| `feed.xml` | RSS feed for the guides | 4 KB | 🟢 |
| `sitemap.xml` | Sitemap listing every page | 3 KB | 🟢 |
| `guides/how-to-build-consistent-timeline-fantasy-novel.html` | Guide article | 21 KB | 🟢 |
| `guides/why-local-browser-storage-safer-for-diary.html` | Guide article | 19 KB | 🟢 |
| `guides/organizing-complex-storylines-multiple-characters.html` | Guide article | 21 KB | 🟢 |
| `guides/creating-personal-memory-journal-tips.html` | Guide article | 22 KB | 🟢 |
| `guides/timeline-mapping-tabletop-rpg-campaigns.html` | Guide article | 22 KB | 🟢 |
| `js/universe-timeline.js` | The Universe app engine (canvas drawing, save/load, modals, etc.) | 405 KB / 9,908 lines | 🟡 |
| `js/biography-timeline.js` | The Biography app engine — sibling of Universe | 873 KB / 8,958 lines | 🟡 |
| `js/guides-enhance.js` | Adds reading-time, table-of-contents and "Related guides" to guide articles | 7.5 KB / 172 lines | 🟢 |

### Files you might not know exist or expect

- **`.DS_Store`** (Mac Finder metadata, 8 KB). Should not be deployed. (#070)
- **No `ads.txt`** — Google strongly recommends/expects this. (#008)
- **No `robots.txt`** — not strictly required but expected by crawlers. (#071)
- **No `favicon.ico` / `favicon.png`** — every browser tab shows a default blank icon. (#009)
- **No `og.png`** — the social-share image your homepage references doesn't exist. (#006)
- **No `og-image.png`** — every guide article's structured data points to this filename; it doesn't exist either, and the homepage uses a *different* name (`og.png`). (#007)
- **No images of any kind in the project root or `guides/`** — every visual is either an emoji or a CSS gradient.

---

## 3. Findings, Grouped by Category

> Issues are numbered sequentially (#001…). You can later say to Claude Code, *"work on #017"*, and it will know what to do.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low · ⚪ Cosmetic.

---

## 🔴 Critical / blocks deployment

### #001 — "Manage cookie preferences" is fake on every page  ✅ Done 2026-05-11

- **Category:** Critical / blocks deployment · Legal compliance · AdSense
- **Severity:** 🔴 Critical
- **Where:** Every HTML page footer. Search any of `about.html`, `cookies.html`, `index.html`, `terms.html`, `privacy.html`, `roadmap.html`, `pricing.html`, `guides.html`, every file in `guides/` — last `<script>` tag.
- **What's wrong:** The button labelled "Manage cookie preferences" in the footer runs `alert('The cookie consent banner is delivered by our IAB TCF v2.2 CMP (planned in Part 15). Until it is wired in, no personalised ads are loaded.');` instead of opening a real consent UI. The `cookies.html` and `privacy.html` pages explicitly tell EU/UK visitors that personalised ads are gated behind this banner. The banner does not exist.
- **Why it matters:** AdSense reviewers from EU/EEA jurisdictions will see (a) no working consent flow, (b) a Privacy Policy and Cookie Policy that promise one. That is a near-automatic rejection. It is also a GDPR exposure on a `.pt` domain.
- **How to see it yourself:** Open any page → scroll to the bottom of the footer → click "Manage cookie preferences". You will get the placeholder alert.
- **How to fix:**
  1. Decide between a real CMP (Google Funding Choices is free and certified) or a hand-rolled "Accept all / Reject all" banner. For a 4-day timeline, hand-rolled is realistic; for long-term, Funding Choices is recommended.
  2. The Cookie Policy already names the localStorage key it should set: `ft_cookie_consent`. Wire the banner to set this key when the user clicks Accept/Reject.
  3. Show the banner once per visitor (when the key is missing) and re-open it from the "Manage cookie preferences" button.
  4. Replace the placeholder `alert(...)` script in every HTML page (it appears once per page near the bottom). Same script is duplicated in: `index.html`, `about.html`, `contact.html`, `cookies.html`, `guides.html`, `pricing.html`, `privacy.html`, `roadmap.html`, `terms.html`, every file in `guides/`.
- **Difficulty:** Medium
- **Time estimate:** Half a day for a minimal banner, 1-2 days for Funding Choices integration.
- **Can Claude Code do this for me?** Yes (just ask: "fix #001"). It can scaffold a minimal banner and replace the placeholder script in every page. For Funding Choices you'll need a Google AdSense account screen-by-screen — but the page integration is automatable.
- **Risk if skipped:** Almost guaranteed AdSense rejection. Potential GDPR complaint exposure.

---

### #002 — About page directly contradicts running AdSense  ✅ Done 2026-05-11

- **Category:** Critical / blocks deployment · AdSense · Content auditor
- **Severity:** 🔴 Critical
- **Where:** `about.html` lines 360-363, inside the `.highlight-box` titled *"What Makes Us Different"*.
- **What's wrong:** The page says, word for word: *"We don't have a business model that depends on your data. We don't show you ads. We don't sell your information."* The site loads Google AdSense and has a Cookie Policy that disclosure ad tracking cookies.
- **Why it matters:** An AdSense human reviewer reads this page and concludes the publisher is either confused or deceptive. The whole application falls apart on a single sentence. Even after approval, this is a reputational risk — any visitor reading About and then seeing an ad concludes the same thing.
- **How to see it yourself:** Open `about.html` → scroll to the dark box headed *"What Makes Us Different"* — the second sentence says "We don't show you ads."
- **How to fix:**
  1. Rewrite this section to reflect reality. The honest framing already exists in `pricing.html`: *"Ads pay for the domain, hosting, and continued development… EU/UK visitors must consent before personalised ads are shown."*
  2. Suggested new copy (use your own voice): *"Our business model is simple: lightweight, non-personalised advertising pays for the site, and the timelines themselves stay on your device. We never look at what you write — we can't, because nothing leaves your browser."*
  3. Also update the `<meta name="description">` if it claims "no tracking" — currently it says *"no tracking, just your stories"* (line 7). That is misleading given AdSense is loaded.
- **Difficulty:** Easy
- **Time estimate:** 15 minutes.
- **Can Claude Code do this for me?** Yes — but the *exact wording* should be your decision. Tell Claude Code the tone you want.
- **Risk if skipped:** AdSense rejection for misrepresentation. Permanent reputational risk.

---

### #003 — Universe app opens with personal-looking default data ("Liga BRT", "Liga Knokout", "40 Graus")

- **Category:** Critical / blocks deployment · End-user · AdSense
- **Severity:** 🔴 Critical
- **Where:**
  - **The default state** is baked into `js/universe-timeline.js`, line 80, inside the `let S = {...}` block.
  - **The "Universes" dropdown chips** are *also* pre-rendered into `universe.html` line 3963 — so even before any JavaScript loads, the four names render visibly.
- **What's wrong:** A first-time visitor opens `universe.html` and sees four pre-named universes labelled "Liga BRT", "Liga Knokout", "40 Graus" and "Other", and a long sample timeline. These names are not English, not generic, and look like the developer forgot to clear personal data before shipping.
- **Why it matters:** This is the single worst first impression on the site. Users assume the tool is broken or someone else's data is leaking through. AdSense reviewers see it too.
- **How to see it yourself:** Open `universe.html` → look at the top filter bar → there is a dropdown that lists exactly those four names.
- **How to fix:**
  1. Replace the default sample state (line 80 of `js/universe-timeline.js`) with **two or three neutrally-named example universes** — e.g. "Example Story", "Sample Campaign", "Other". The point of sample data is to demonstrate the tool, not to ship someone's personal project.
  2. Remove the pre-rendered chips from `universe.html` line 3963 (the `<span id="uni-toggle-chips">` block) — let the JavaScript build them at runtime. Having the chips hardcoded in two places guarantees they will drift apart later.
  3. Also fix the pre-rendered Marvel/DC sample events (see #005).
- **Difficulty:** Easy
- **Time estimate:** 30 minutes — 1 hour.
- **Can Claude Code do this for me?** Yes — tell it which universe/event names you want as the demo.
- **Risk if skipped:** Looks unprofessional, blocks AdSense, frustrates first users.

---

### #004 — No ad slots on the entire site; loader only on homepage  ✅ Done 2026-05-11 — Manual placements (no Auto Ads). 17 slots across index (2), guides hub (1), 5 guide articles (2 each = 10), about/pricing/roadmap/contact (1 each). AdSense library is gated through `js/ft-consent.js` — only loads after the user accepts the cookie banner. NOT placed on terms/privacy/cookies/universe/biography. Slot ID 5213958958 applied 2026-05-11.

- **Category:** AdSense · Critical
- **Severity:** 🔴 Critical
- **Where:**
  - `index.html` lines 4-32: the AdSense loader script (publisher ID `ca-pub-4135034633295293`).
  - No file anywhere in the project contains `<ins class="adsbygoogle">` (verified with grep).
  - No other HTML page (`universe.html`, `biography.html`, guides, legal) includes the AdSense loader at all.
- **What's wrong:** The site has applied for AdSense, includes the `google-adsense-account` meta tag, and lazy-loads the AdSense library on the homepage — but there is nowhere on the site for an ad to appear. AdSense's automated and human reviewers visit a sample of pages and look for ad slots; they find none.
- **Why it matters:** This is one of the most common AdSense rejection causes — "Site does not comply with Google policies" or "Low value content" rejections often reduce to this. Even if approved, you'd earn $0 because there's nowhere to render.
- **How to see it yourself:** Open the Developer Tools in your browser (right-click → Inspect → Elements tab) on `index.html` and search the HTML for `adsbygoogle`. You'll see the loader URL but no `<ins>` ad slot tags.
- **How to fix:**
  1. Decide which pages will host ads. Reasonable: homepage, every guide article (top + bottom), and the apps (a single banner above the toolbar, mobile-friendly). The legal pages should *not* show ads (AdSense rules — and they have little organic value to advertisers anyway).
  2. Add the AdSense loader to every page that will host ads — currently it's only in `index.html`. Move the lazy-loading script into a shared partial or just paste it into each page.
  3. Inside each chosen page, add a responsive ad unit (`<ins class="adsbygoogle" …></ins>`) where ads should appear, and an `<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>` right after.
  4. Get your ad unit slot IDs from AdSense → Ads → Ad units once you have any units configured.
  5. Add `data-ad-test="on"` while developing so you don't burn real ad impressions in testing.
- **Difficulty:** Medium
- **Time estimate:** Half a day.
- **Can Claude Code do this for me?** Partly. Claude Code can paste the markup pattern into every chosen page. **You** have to log into AdSense and create the ad units (or use Auto Ads, which is even simpler — see fix #004b).
- **Risk if skipped:** No revenue. Likely AdSense rejection.

#### #004b — Quick alternative: Auto Ads

If picking placements feels overwhelming, AdSense **Auto Ads** is one-click: you enable it in your AdSense console and Google picks placements automatically. The only on-page change is making sure the AdSense loader is on every page that should show ads. For a 4-day deadline this is the recommended path. Claude Code can prepare the page changes; you flip the switch in AdSense.

---

### #005 — Marvel/DC copyrighted content shipped as default Universe sample  ✅ Done 2026-05-11

- **Category:** Critical · AdSense · Legal
- **Severity:** 🔴 Critical
- **Where:** `js/universe-timeline.js` line 80 onwards (inside the giant `let S = {...}` object). About 36 references to: *X-Men, Magneto, Cyclops, Marvel Girl, Beast, Iceman, Angel, Cape Citadel, Secret Wars, Battleworld*, etc.
- **What's wrong:** The default demo timeline is populated with real Marvel/DC characters and storylines. This is third-party copyrighted intellectual property used as default product content.
- **Why it matters:**
  - AdSense and other ad networks reject sites that look like they distribute copyrighted material.
  - Marvel/Disney's IP team is unlikely to sue a free local-storage tool — but you do not want them or Google to *think* you might.
  - It also gives the wrong tone — the homepage suggests the tool is for "your own original stories", but the default content is fan-fiction-flavoured.
- **How to see it yourself:** Open `universe.html`. The default events on the timeline include "X-Men Founded", "Secret Wars I", etc. You can also open `js/universe-timeline.js` and search for "X-Men" — it appears multiple times.
- **How to fix:**
  1. Replace the sample state with original, generic example content. Suggested: a short fictional kingdom timeline (3-5 events) + a personal story example, or a public-domain history sample (Roman timeline, French Revolution, Renaissance, etc.).
  2. Keep the data structure (`events`, `subEvents`, `media`, `notes`, `universes`) identical so the engine still loads it. Only the text changes.
  3. Make sure the new sample data also fixes #003 (universe names).
- **Difficulty:** Easy-Medium (lot of text to swap, structure is simple).
- **Time estimate:** 1-2 hours.
- **Can Claude Code do this for me?** Yes. Ask it to "replace the default Marvel/DC sample data in `js/universe-timeline.js` with neutral example content" and review the result.
- **Risk if skipped:** AdSense rejection. Theoretical IP risk.

---

### #006 — Open Graph image (`og.png`) does not exist  ✅ Done 2026-05-11

- **Category:** Critical · SEO · Marketing
- **Severity:** 🔴 Critical
- **Where:** Referenced in `index.html` lines 43 and 51. Also referenced in the WebSite/Organization JSON-LD block (line 71).
- **What's wrong:** When someone shares your homepage link on Facebook, Twitter, WhatsApp, LinkedIn, Discord, etc., the social-share preview tries to fetch `https://freetimeline.pt/og.png`. That file does not exist in the project.
- **Why it matters:** Every social share will show a broken-image placeholder. AdSense reviewers also visit URLs and a broken OG image is one of many "under-construction" signals.
- **How to see it yourself:** Once deployed, paste your URL into Facebook's "Sharing Debugger" (developers.facebook.com/tools/debug/) or look at the preview in any chat app. Or just open `https://freetimeline.pt/og.png` in a browser — it 404s.
- **How to fix:**
  1. Create a 1200×630px PNG image with the FreeTimeline brand and tagline.
  2. Save it as `og.png` at the project root.
  3. If you don't have design tools handy, an AI image generator can produce a simple version. Or Claude Code can produce an SVG and you convert to PNG.
- **Difficulty:** Easy-Medium (design work).
- **Time estimate:** 30 minutes — 2 hours depending on care.
- **Can Claude Code do this for me?** Partly. It can produce an SVG mock-up; you (or another tool) would need to export to PNG at the right size.
- **Risk if skipped:** Broken social previews; AdSense "under construction" signal.

---

### #007 — Guides reference a *different* OG image filename (`og-image.png`) that also doesn't exist  ✅ Done 2026-05-11

- **Category:** Critical · SEO · Inconsistency
- **Severity:** 🔴 Critical
- **Where:** Every file in `guides/*.html`, inside the JSON-LD `Article` block (`"image":"https://freetimeline.pt/og-image.png"`). Same string in lines around 324, 331, 343, etc.
- **What's wrong:** The homepage uses `og.png`. The five guide articles use `og-image.png` — a different filename. Neither exists.
- **Why it matters:** Even when you fix #006, the guides will still reference a non-existent image. Inconsistent filenames suggest two different versions of the codebase merged together. Schema.org `Article` requires the `image` field to point to a real file or Google's structured-data tools will flag it.
- **How to see it yourself:** Open any file in `guides/` and search for `og-image.png`. None of those filenames map to a real file in your folder.
- **How to fix:**
  1. Decide on one canonical OG image filename. Recommended: `og.png` at the site root, and let every article use the same one (most articles use the brand image, not a per-article hero image).
  2. Replace `og-image.png` with `og.png` in all 5 guide articles.
  3. Optionally: per-article OG images for stronger SEO — but skip this for the 4-day deadline.
- **Difficulty:** Easy
- **Time estimate:** 10 minutes (5 search-and-replace operations).
- **Can Claude Code do this for me?** Yes ("fix #007").
- **Risk if skipped:** Broken social previews on every guide; structured-data warnings in Google Search Console.

---

### #008 — Missing `ads.txt`  ✅ Done 2026-05-11

- **Category:** Critical · AdSense
- **Severity:** 🔴 Critical
- **Where:** Project root — file should be at `https://freetimeline.pt/ads.txt`. Not present.
- **What's wrong:** Google AdSense recommends every publisher post an `ads.txt` file declaring which ad networks are authorised to sell inventory on the domain. Without it, AdSense shows a warning in the publisher dashboard and some advertisers will not bid on your inventory.
- **Why it matters:** Not strictly required for *approval*, but it is one of the first things the AdSense console checks after approval, and reviewers have been documented to expect it.
- **How to see it yourself:** Once deployed, `https://freetimeline.pt/ads.txt` will return 404.
- **How to fix:** Create a file at the project root named exactly `ads.txt` containing one line:
  ```
  google.com, pub-4135034633295293, DIRECT, f08c47fec0942fa0
  ```
  (using the publisher ID you already have in `index.html` line 4).
- **Difficulty:** Trivial
- **Time estimate:** 2 minutes.
- **Can Claude Code do this for me?** Yes ("fix #008").
- **Risk if skipped:** AdSense console nag; some advertisers won't bid; minor approval risk.

---

### #009 — Missing favicon  ✅ Done 2026-05-11

- **Category:** Critical · Branding · Trust
- **Severity:** 🔴 Critical
- **Where:** No `<link rel="icon">` tag anywhere; no `favicon.ico` / `favicon.png` file at the project root.
- **What's wrong:** Every browser tab shows the generic blank document icon, both in the tab strip and in bookmarks. To a visitor and to an AdSense reviewer, this is a strong signal of "site is incomplete".
- **How to see it yourself:** Open any page. Look at the browser tab — there is no icon next to the title.
- **How to fix:**
  1. Create a small square logo image (suggested: 512×512 PNG). Use your existing infinity-symbol brand element.
  2. Save it as `favicon.png` at the root.
  3. Add this line to the `<head>` of every page:  `<link rel="icon" type="image/png" href="/favicon.png">`
  4. Ideally also produce a 32×32 `favicon.ico` and an Apple-touch-icon. For the 4-day timeline, the single PNG above is enough.
- **Difficulty:** Easy
- **Time estimate:** 30 minutes (design + paste).
- **Can Claude Code do this for me?** Partly — it can add the `<link>` tags. **You** need to provide the image.
- **Risk if skipped:** Unprofessional appearance; AdSense reviewer red flag.

---

## 🔴 Likely AdSense rejection causes

(See also #001, #002, #004, #005, #006, #007, #008, #009 above.)

### #010 — `cookies.html` lists wrong localStorage keys  ✅ Done 2026-05-11

- **Category:** AdSense · Legal · GDPR · Inconsistency
- **Severity:** 🔴 Critical
- **Where:** `cookies.html` section 4a, the "Strictly Necessary" table. Lists `ft_universe_*` and `ft_bio_*` as the keys.
- **What's wrong:** The actual localStorage keys used by the apps are completely different:
  - Universe app: `inf_universe_v4`, `ft_uni_view_v1`, `ft_uni_history_v1`, `ft_uni_universes_v1`
  - Biography app: `inf_biography_v1`, `ft_bio_view_v1`, `ft_bio_settings_v1`
  - The Cookie Policy lists `ft_cookie_consent` — that key is **never written** by any code today (the banner that would write it doesn't exist; see #001).
- **Why it matters:** GDPR transparency requires you to disclose what you actually store. This page documents fictional keys and omits the real ones that hold the user's personal data. AdSense reviewers who check policy accuracy will fail this.
- **How to see it yourself:** Open `cookies.html` and read section 4a. Then open any of the apps and look at the browser's developer tools → Application → Local Storage → `freetimeline.pt`. The key names will not match the policy.
- **How to fix:** Rewrite the table to match reality. Suggested rows:
  - `inf_universe_v4` — Saves Universe Timeline data (events, characters, settings)
  - `inf_biography_v1` — Saves Biography Timeline data (people, events, notes)
  - `ft_uni_view_v1` / `ft_bio_view_v1` — Remembers your last zoom/pan position
  - `ft_uni_history_v1` — Stores up to 10 autosave snapshots for the Universe app
  - `ft_uni_universes_v1`, `ft_bio_settings_v1` — App preferences
  - `ft_cookie_consent` — Cookie consent record (after fix #001)
- **Difficulty:** Easy
- **Time estimate:** 30 minutes.
- **Can Claude Code do this for me?** Yes.
- **Risk if skipped:** GDPR exposure; AdSense rejection.

---

### #011 — Privacy Policy claims "no tracking" in meta description  ✅ Done 2026-05-11

- **Category:** AdSense · Marketing · Honesty
- **Severity:** 🟠 High
- **Where:** `about.html` line 7 — `<meta name="description" content="… No accounts, no tracking, just your stories.">`. Similar phrasing in pricing.html.
- **What's wrong:** AdSense by definition tracks for ad personalisation. Saying "no tracking" in a meta description that may show in Google search results contradicts the AdSense Cookie Policy.
- **How to fix:** Change "no tracking" to "private timelines" or "no personal account required" — phrasing that is both true and brand-positive. The detailed Cookie Policy already explains the AdSense tracking honestly.
- **Difficulty:** Easy
- **Time estimate:** 10 minutes.
- **Can Claude Code do this for me?** Yes.

---

### #012 — Privacy Policy says "no analytics today" but Cookie Policy implies there is none

- **Category:** Legal · Inconsistency
- **Severity:** 🟡 Medium
- **Where:** `privacy.html` line 354 ("FreeTimeline does *not* currently use Google Analytics…") and `cookies.html` section 4c ("FreeTimeline does not currently use Google Analytics… No analytics cookies are set by FreeTimeline.")
- **What's wrong:** These are accurate today, but they need to stay accurate as soon as you add any analytics (Plausible, Matomo, Google Analytics, AdSense's own analytics, etc.). Make a mental note. No action required *now*, but flag in your roadmap.
- **Difficulty:** N/A (informational)
- **Risk if skipped:** Future GDPR drift.

---

### #013 — Privacy/Terms last-updated dates are stale (`April 21, 2026`)  ✅ Done 2026-05-11

- **Category:** Legal · Trust
- **Severity:** 🟡 Medium
- **Where:** `privacy.html` line 271, `terms.html` line 248, `cookies.html` line 41.
- **What's wrong:** All three pages say "Last Updated: April 21, 2026". Today is 2026-05-11, and you are *about* to make material changes (consent banner, real localStorage key disclosure, etc.).
- **How to fix:** After you complete the fixes in #001 and #010, bump these dates to the deployment date. Don't bump them now — bump them after the substantive legal-content changes are in.
- **Difficulty:** Trivial
- **Time estimate:** 1 minute (3 edits).
- **Can Claude Code do this for me?** Yes.
- **Risk if skipped:** Reviewer notices a "Last Updated 2026-04-21" date that doesn't match the content they're reading.

---

### #014 — "Team photo coming soon" placeholder in About  ✅ Done 2026-05-11

- **Category:** AdSense · Trust · Under-construction
- **Severity:** 🟠 High
- **Where:** `about.html` lines 400-402. A dashed-border box with the literal text "Team photo coming soon" inside.
- **What's wrong:** "Coming soon" placeholders are an AdSense rejection signal — they read as "site not finished".
- **How to fix:** Either:
  - (a) Remove the placeholder box entirely, and rewrite the surrounding "The Team" paragraph to not need an image (e.g. "FreeTimeline is built by an independent developer based in Portugal…").
  - (b) Replace with a real photo or a brand graphic. For a one-person project, an honest "Independent project, built solo" line is fine.
- **Difficulty:** Easy
- **Time estimate:** 15 minutes.
- **Can Claude Code do this for me?** Yes (you decide which option).
- **Risk if skipped:** AdSense "under construction" rejection.

---

### #015 — Pricing page advertises features that don't exist ("Chrono Ledger", "Encrypted cloud sync")  ✅ Done 2026-05-11

- **Category:** AdSense · Marketing · Trust
- **Severity:** 🟡 Medium
- **Where:** `pricing.html` lines 126-135 (the "Pro" tier card) and lines 158-170 (the FAQ "Are any paid features planned?").
- **What's wrong:** The Pricing page advertises a planned "Pro" tier including "End-to-end encrypted cloud sync" and a "Chrono Ledger module". Neither exists, and the closest item on the roadmap (`roadmap.html`) is "Encrypted local backup files" — completely different from "cloud sync". An AdSense reviewer or a customer reading "encrypted cloud sync" expects, well, encrypted cloud sync.
- **How to fix:**
  1. Either remove the Pro card entirely (recommended for a single-developer project — promising paid plans you don't have is fragile) or
  2. Soften the wording: "(planned, not committed)" and align it with the Roadmap. Currently the Pricing page promises sync; the Roadmap admits it's just local backup files.
- **Difficulty:** Easy
- **Time estimate:** 15 minutes.
- **Can Claude Code do this for me?** Yes (you decide tone).
- **Risk if skipped:** Reviewer/visitor distrust.

---

### #016 — Roadmap promises an "Accessibility pass" while accessibility is partially implemented

- **Category:** SEO · Trust · Minor
- **Severity:** 🟢 Low
- **Where:** `roadmap.html` lines 273-275 (the "Planned" section).
- **What's wrong:** The Roadmap lists "Accessibility pass" as a planned (not-yet-done) feature, but the code already has a substantial accessibility baseline (skip links, ARIA labels, `prefers-reduced-motion` support, focus-visible outlines). This isn't critical, but the way it reads makes the site sound less mature than it is.
- **How to fix:** Move "Accessibility baseline" to the "Shipped" section, and rename the Planned item to something more specific ("Full screen-reader audit", "Keyboard-only canvas navigation", etc.).
- **Difficulty:** Trivial
- **Time estimate:** 5 minutes.
- **Can Claude Code do this for me?** Yes.

---

## 🟠 Broken features & bugs

### #017 — The AdSense loader on `index.html` lazy-loads on first user interaction; but the actual ad-slot push is missing

- **Category:** Functional · AdSense
- **Severity:** 🟠 High
- **Where:** `index.html` lines 7-33 (the lazy-load IIFE).
- **What's wrong:** Even after the AdSense JS loads, no code calls `(adsbygoogle = window.adsbygoogle || []).push({})` to tell AdSense to render. With Auto Ads enabled in the AdSense console that's not needed, but with manual placements it is. As written, the loader is technically wasted bandwidth.
- **How to fix:** Either:
  1. Enable Auto Ads in your AdSense account and add the `data-ad-client` attribute the AdSense docs require, *or*
  2. Add manual `<ins class="adsbygoogle">` units (see #004) and the matching `push({})` script after each.
- **Difficulty:** Easy
- **Time estimate:** 30 minutes.
- **Can Claude Code do this for me?** Yes.

---

### #018 — Universe uses native `confirm()` for destructive actions; Biography has a custom mobile-safe dialog — feature parity break  ✅ Done 2026-05-11 — Part 1 (Day 1): `js/ft-confirm.js` shared module + Universe `blankTimeline`. Part 2 (Day 2): `ftConfirmGate` helper added; delEvent/delChar/delSE/delUni/catEditorResetDefaults migrated in both engines; affiliationEditorRemove + catEditorRemove conditional confirms migrated in both engines; Biography blankTimeline migrated; load-replace import flow migrated in both engines; context-menu single-line confirms delegated to delUni's internal gate. Remaining native `confirm()` lines are fallback paths inside `if (typeof ftConfirm !== 'function')` guards.

- **Category:** Functional · UX · Inconsistency
- **Severity:** 🟠 High
- **Where:**
  - `js/biography-timeline.js` lines 2860, 4741, 4866, 4905, 4968, 4983, 5049, 5085, 5298, 5299, 5339 — all use `confirm()`. But `biography.html` lines 4036-4049 *also* implements a beautiful custom mobile-safe blank-confirm dialog (`bio-mob-blank-confirm`) that is only used for the "Clear all" action.
  - `js/universe-timeline.js` lines 3195, 5320, 5460, 5499, 5728, 5743, 5809, 5845 — all use native `confirm()`. **No** custom mobile dialog exists for Universe.
- **What's wrong:**
  1. Mobile browsers display native `confirm()` dialogs differently and sometimes drop them silently — destructive actions can fire without user confirmation.
  2. Biography has the custom dialog for *one* action (Clear All) but uses native confirm for the rest (delete event, delete character, etc.). Inconsistent.
  3. Universe has no custom dialog at all — same destructive actions, worse mobile experience.
- **How to fix:**
  1. Generalise the custom `bio-mob-blank-confirm` dialog into a reusable confirm modal (no library needed — vanilla JS).
  2. Replace every `confirm(...)` call in both engines with this modal (returning a Promise).
  3. Same dialog component in both Universe and Biography.
- **Difficulty:** Medium
- **Time estimate:** Half a day.
- **Can Claude Code do this for me?** Yes — but test the result on a phone before deploying.
- **Risk if skipped:** Users accidentally delete data on mobile.

---

### #019 — "Reading Mode" exists in Universe, missing in Biography

- **Category:** Functional · Feature parity
- **Severity:** 🟡 Medium
- **Where:**
  - Universe: button at `universe.html` line 3903 (`id="reading-toggle-btn"`), handler defined inline at line 6075 (`window.toggleReadingMode = …`).
  - Biography: no equivalent button anywhere; `toggleReadingMode` does not exist.
- **What's wrong:** Reading Mode (a softer warm-parchment palette for long sessions) was added to Universe but never ported to Biography. Biography users — who are exactly the long-session journalers Reading Mode was designed for — don't get it.
- **How to fix:**
  1. Read the Universe implementation (`universe.html` line 6075-ish).
  2. Port to Biography with the equivalent palette swap.
  3. Add a "Read" toolbar button to Biography's `<div id="toolbar">` block.
- **Difficulty:** Medium
- **Time estimate:** 2 hours.
- **Can Claude Code do this for me?** Yes ("port Reading Mode from Universe to Biography").
- **Risk if skipped:** Feature drift.

---

### #020 — "Continuity Tour" exists in Universe, missing in Biography

- **Category:** Functional · Feature parity
- **Severity:** 🟡 Medium
- **Where:**
  - Universe: button at `universe.html` line 3922 (`onclick="ContinuityTour.start()"`). Handler defined in `js/universe-timeline.js` (search for `ContinuityTour`).
  - Biography: no equivalent (only "Memory Tour", which is a different feature).
- **What's wrong:** Universe ships with two guided walkthroughs (Continuity Tour + Memory Tour). Biography only has Memory Tour.
- **How to fix:** Decide whether "Continuity Tour" is meaningful for Biography (it walks through chronological causal threads — useful for Biography too). If yes, port the logic. If no, document the deliberate omission so future maintainers don't think it's an oversight.
- **Difficulty:** Medium-Hard (the Continuity Tour code is non-trivial).
- **Time estimate:** Half a day.
- **Can Claude Code do this for me?** Partly — you need to decide if it should exist.

---

### #021 — Default sample data in Biography (need to check) may also include personal info  ✅ Done 2026-05-11

- **Category:** Functional · End-user
- **Severity:** 🟠 High
- **Where:** `js/biography-timeline.js` around line 5440 (`SAMPLE DATA` section header — verify default state).
- **What's wrong:** Worth verifying that Biography's default sample state is also neutral and English (not personal-looking like Universe's "Liga BRT"). I didn't fully audit Biography's sample data — please check this with Claude Code before launch.
- **How to fix:** Open `biography.html` in a private browser window. The default content shown is the Biography sample data. If it looks personal or non-English, replace it with neutral example content the same way you'll fix Universe in #003.
- **Difficulty:** Easy
- **Time estimate:** 30 minutes (audit + replace if needed).
- **Can Claude Code do this for me?** Yes — ask "audit Biography's default sample data and replace any personal-looking content with neutral examples".

---

### #022 — Mobile filter strip in Biography says "Loading…" forever if no Life Tracks exist  ✅ Done 2026-05-11

- **Category:** Functional · UX
- **Severity:** 🟡 Medium
- **Where:** `biography.html` line 3989 — `<span id="uni-toggle-hint" style="…">Loading…</span>` is the initial state until JavaScript replaces it.
- **What's wrong:** If JavaScript fails (broken state, error, slow loading), users see "Loading…" forever with no fallback or error message.
- **How to fix:** After 5 seconds with no replacement, show a fallback message ("No life tracks yet — click + Life Track to start"). Use a simple `setTimeout` watchdog.
- **Difficulty:** Easy
- **Time estimate:** 30 minutes.

---

### #023 — Contact form pretends to be a form but is actually a `mailto:` trigger

- **Category:** UX · Trust · Functional
- **Severity:** 🟠 High
- **Where:** `contact.html` lines 424-455.
- **What's wrong:** The `<form action="mailto:support@freetimeline.pt" method="post" enctype="text/plain">` is the historical "mailto form" pattern. Many users will:
  - Fill in the form expecting it to *send*.
  - Submit, see their email client pop up (or not, if they don't have one configured) — and assume something went wrong.
  - Lose the message.
- **Why it matters:** First-impression frustration. Many modern users have no desktop email client; for them the form does nothing.
- **How to fix:** Pick one approach:
  1. **Simplest (recommended for 4-day timeline):** Remove the form entirely. Keep only the big "Email us directly" button (lines 408-418) which is honest and works. Add a sentence: "If you don't have an email client, just copy the address above."
  2. **Proper:** Wire the form to a real backend (Cloudflare Worker, Netlify Forms, Formspree, etc.).
  3. **Compromise:** Keep the form but change the JS so that on submit it constructs a `mailto:` URL with the values pre-filled and opens it. Currently the form just dumps form-encoded text into the email body — illegible for most users.
- **Difficulty:** Easy (option 1), Medium (option 3), Hard (option 2).
- **Time estimate:** 15 min — half a day.
- **Can Claude Code do this for me?** Yes — tell it which option.

---

### #024 — Commented-out Discord placeholder in `contact.html`

- **Category:** Cleanup
- **Severity:** ⚪ Cosmetic
- **Where:** `contact.html` lines 474-483 — an HTML comment block containing `<!-- … href="https://discord.gg/REPLACE_WITH_INVITE" … -->`
- **What's wrong:** Dead code with a placeholder. Cosmetic only.
- **How to fix:** Either delete the comment or, when you have a Discord, replace `REPLACE_WITH_INVITE` and uncomment.
- **Difficulty:** Trivial
- **Time estimate:** 30 seconds.

---

### #025 — Sitemap omits `roadmap.html`

- **Category:** SEO
- **Severity:** 🟢 Low
- **Where:** `sitemap.xml` lines 1-100. The file lists every other top-level HTML page but does not include `roadmap.html`.
- **What's wrong:** Search engines won't discover the roadmap page through your sitemap. Minor SEO issue.
- **How to fix:** Add a `<url>` block for `roadmap.html` to `sitemap.xml` (priority 0.5 is fine).
- **Difficulty:** Trivial
- **Time estimate:** 2 minutes.
- **Can Claude Code do this for me?** Yes.

---

### #026 — `feed.xml` lastBuildDate is hardcoded ("Tue, 21 Apr 2026 12:00:00 GMT") and all five articles have identical `pubDate`

- **Category:** SEO · RSS
- **Severity:** 🟡 Medium
- **Where:** `feed.xml` lines 9, 16, 24, 32, 40, 48.
- **What's wrong:** Every guide article was "published" on the same day (April 21, 2026), and the feed's `lastBuildDate` matches. This signals to an RSS reader that all articles dropped at once — which is true, but looks like spam content to crawlers.
- **How to fix:** Either:
  1. Space the `pubDate` values out (e.g. one a week starting in early April), or
  2. Use real publication dates if you have them (since this is the launch, all five being recent is fine if dated correctly).
  3. Update `lastBuildDate` to today's date.
- **Difficulty:** Easy
- **Time estimate:** 10 minutes.
- **Can Claude Code do this for me?** Yes.

---

### #027 — Guide articles' JSON-LD `Article` blocks use `datePublished: "2024-01-15"` but `feed.xml` says April 2026

- **Category:** SEO · Consistency
- **Severity:** 🟡 Medium
- **Where:** Every file in `guides/*.html`, inside the first JSON-LD script: `"datePublished":"2024-01-15"`. Also `"dateModified":"2026-04-21"`.
- **What's wrong:** The schema says the article was published Jan 15 2024. The RSS feed says April 21 2026. Search engines will see conflicting metadata.
- **How to fix:** Set both fields to the date you actually want shown — the same date you set in `feed.xml`'s `<pubDate>`.
- **Difficulty:** Easy
- **Time estimate:** 15 minutes (5 articles).
- **Can Claude Code do this for me?** Yes.

---

### #028 — Sitemap and Cookie Policy/Privacy Policy carry no `lastmod` date matching the actual last edit

- **Category:** SEO
- **Severity:** 🟢 Low
- **Where:** `sitemap.xml` all `<lastmod>2026-04-21</lastmod>`.
- **What's wrong:** Static placeholder dates. Will not auto-update.
- **How to fix:** Manually bump on deployment, or generate the sitemap from a script.
- **Difficulty:** Easy
- **Time estimate:** 5 minutes.

---

### #029 — `index.html` hero section says "Universe Timeline" features include "Marvel & DC storylines" — inconsistent with #005 fix  ✅ Done 2026-05-11

- **Category:** Content auditor · IP
- **Severity:** 🟠 High
- **Where:** `index.html` line 321 — `<span class="map-tag tc-uni …">Marvel &amp; DC storylines</span>` inside the "What can you map?" tag cloud.
- **What's wrong:** The homepage explicitly invites users to map "Marvel & DC storylines". Same IP concern as #005, plus it directly contradicts your "make it your own original universe" positioning.
- **How to fix:** Replace with something like *"Shared comic-book universes"* or *"Superhero franchises"* — the same idea expressed without naming Marvel/DC. Or drop the tag entirely and rely on "Original fantasy worlds" + "Shared universe fan projects" which are already there.
- **Difficulty:** Trivial
- **Time estimate:** 2 minutes.
- **Can Claude Code do this for me?** Yes.
- **Risk if skipped:** AdSense + IP concerns.

---

### #030 — `biography.html` mobile drawer references functions that *are* defined inline (verified) but the architecture is fragile

- **Category:** Code quality
- **Severity:** 🟡 Medium
- **Where:** `biography.html` lines 4842-4974 — `bioMobile*` and `bioMobBlank*` helpers all defined inline at the bottom of the HTML file.
- **What's wrong:** Mobile UI handlers are split across `js/biography-timeline.js` and `biography.html`'s inline scripts. Same in `universe.html`. Hard to maintain — when you move/rename a function, you may not know if it's the JS file or the HTML to edit.
- **How to fix:** Long-term: move all inline mobile handlers into the JS file. Short-term (4-day timeline): leave it; document with a comment block at the top of each inline script: `/* MOBILE UI HANDLERS — keep these in sync with js/biography-timeline.js's main code */`.
- **Difficulty:** Medium (proper fix). Trivial (comment-only).
- **Time estimate:** 2 hours full / 5 min comment.

---

### #031 — `universe.html` line 3963 hardcodes universe chips that should be JS-rendered  ✅ Done 2026-05-11 — pre-rendered chips were already removed by #005 (Day 1). Day 3 sweep also caught a stray Marvel/DC reference in the index.html Universe portal card description; replaced with generic "shared comic-book universes" wording.

- **Category:** Functional · Architecture
- **Severity:** 🟠 High
- **Where:** `universe.html` line 3963 — `<span id="uni-toggle-chips">` is *pre-populated* with the four chips (Liga BRT, etc.).
- **What's wrong:** When JavaScript loads it replaces these chips, but for the half-second between paint and JS execution, users see the hardcoded names. Worse, if JS fails to load (slow connection, blocked extension), users *only* see the hardcoded names with no way to interact.
- **How to fix:** Leave the `<span id="uni-toggle-chips">` empty. The JS already rebuilds it on load. (Also see #003.)
- **Difficulty:** Trivial
- **Time estimate:** 2 minutes.
- **Can Claude Code do this for me?** Yes.

---

## 🟠 Mobile & responsive

### #032 — Cookie consent stub alert is a usability disaster on mobile

- **Category:** Mobile · Critical (overlaps #001)
- **Severity:** 🟠 High
- **Where:** Every page's "Manage cookie preferences" inline script.
- **What's wrong:** `alert(...)` on mobile pops a system-level dialog that's hard to dismiss on iOS and looks alarming. Even after #001 is fixed, the temporary state is bad.
- **How to fix:** Either fix #001 properly, or as a stopgap replace `alert(...)` with a small floating toast that says "Cookie preferences coming soon."
- **Difficulty:** Easy
- **Time estimate:** 1 hour stopgap; otherwise rolled into #001.

---

### #033 — `#consent-bar` on the homepage covers a large portion of the mobile viewport

- **Category:** Mobile · UX
- **Severity:** 🟡 Medium
- **Where:** `index.html` style block, `@media (max-width: 767px)` section, around line 76 — `#consent-bar { … max-height: 42svh; … }`.
- **What's wrong:** 42% of the small viewport height is a *lot* of bottom-bar real estate. On small phones the consent bar pushes the homepage content too far up.
- **How to fix:** Reduce `max-height` to something like `28svh` for mobile, and let the bar scroll internally if its text doesn't fit.
- **Difficulty:** Easy
- **Time estimate:** 30 minutes.

---

### #034 — The canvas-based apps depend on touch gestures but don't visibly announce them

- **Category:** Mobile · UX
- **Severity:** 🟡 Medium
- **Where:** `universe.html` line 3800, `biography.html` (similar) — the `#mobile-banner` div is `display: none` on actual mobile (`@media` rules). Mobile users instead get the `#bio-mobile-touch-note` block.
- **What's wrong:** Verify on a real phone: the touch instructions ("Drag to pan, pinch to zoom") may or may not be visible. The CSS is complex enough that I cannot guarantee from reading.
- **How to fix:** Open both apps on a real phone. If the touch hint isn't visible, simplify the CSS so it always shows above the canvas the first time.
- **Difficulty:** Easy-Medium
- **Time estimate:** 1 hour.
- **Can Claude Code do this for me?** Partly — testing must be on a real device.

---

### #035 — Native browser `confirm()` on mobile (see #018)

(See #018 above — duplicate category.)

---

### #036 — On viewports < 360px (very small phones, older devices) the hero pills collapse to single-column but the portal cards still need horizontal scroll in some places

- **Category:** Mobile
- **Severity:** 🟢 Low
- **Where:** `index.html` `@media (max-width: 360px)` block.
- **What's wrong:** I haven't tested this width. Sub-360px is rare in 2026 — iPhone SE and very old Android only — but if it's broken there, AdSense reviewers using Lighthouse will see it.
- **How to fix:** Test in Chrome DevTools at 320px width. Fix any horizontal-scroll occurrences (search for `overflow-x:` to find candidates).
- **Difficulty:** Medium
- **Time estimate:** 1 hour.

---

## 🟡 Visual & design

### #037 — Visual style is dark/space-themed, but feels heavier than the marketing positioning ("simple, fast, free")

- **Category:** Visual · Brand
- **Severity:** 🟢 Low (subjective)
- **Where:** Across every page — the `--bg: #050611` very-dark background plus the animated star canvas in `index.html`.
- **What's wrong:** Subjective: the dark theme is striking but doesn't match phrases like "for memory keepers", "your family history", which lean warm/personal. For Biography users especially, the cosmic palette feels off-tone.
- **How to fix:** Consider a light-theme toggle (the cookie-preferences-style footer button could have one too). For 4-day deadline, skip — but flag for the roadmap.
- **Difficulty:** Medium-Hard
- **Time estimate:** Days.

---

### #038 — Sticky "Start now — no sign-up" CTA on homepage right side overlaps the portal cards at certain widths

- **Category:** Visual
- **Severity:** 🟡 Medium
- **Where:** `index.html` lines 77-93 — `.hero-sticky-cta { position: fixed; top: 80px; right: 24px; … }` only visible at viewports ≥720px.
- **What's wrong:** It's fixed top-right and visible during all scroll. On tablet widths (720-1024px) it may overlap the right edge of the portal cards.
- **How to fix:** Either hide it on tablet, or move it to a position that won't collide.
- **Difficulty:** Easy
- **Time estimate:** 30 minutes.

---

### #039 — The same `/* Part 12 A11y baseline */` CSS block is duplicated **three** times in `about.html`, `roadmap.html`

- **Category:** Visual · Code quality
- **Severity:** ⚪ Cosmetic
- **Where:** `about.html` lines 303-321 (same `.footer-links .ft-cookie-prefs {…}` block repeated three times). `roadmap.html` lines 166-184 (same three repetitions). Probably others — search every page for the comment `--- PART 12: A11y baseline ---`.
- **What's wrong:** Some build/template process pasted the same CSS three times. Pure size bloat — they're identical.
- **How to fix:** Delete the duplicates. Each page only needs one copy.
- **Difficulty:** Easy
- **Time estimate:** 30 minutes (across all affected files).
- **Can Claude Code do this for me?** Yes.

---

## 🟡 Usability (incl. for elderly users)

### #040 — Toolbar tooltips use unfamiliar Unicode symbols (⧖, ⬡, ◉, ⛶) without text labels in many cases

- **Category:** Usability · Elderly
- **Severity:** 🟠 High
- **Where:** `universe.html` lines 3869-3924 — the entire toolbar uses symbol+text pairs like `⧖ Timeline`, `⬡ Codex`, `⬡ Map`, `◉ Archive`, `▤ List`. Some buttons are symbol-only (the trash glyph, the file glyphs).
- **What's wrong:** For a 70-year-old non-technical user (you, your audience), Unicode geometric symbols are essentially noise. The text alongside ("Timeline", "Codex") helps but the symbols don't aid comprehension — they distract.
- **Why it matters:** "Codex", "Archive", "Map" are also jargon for an audience that just wants to organise a family history or novel.
- **How to fix:**
  1. Rename "Codex" → "Characters" (Universe) or "People" (already in Biography).
  2. Rename "Archive" → "Stats" or "Summary" (Universe).
  3. Rename "Map" → "Relationships" or "Connections" (Biography already calls it "Relationships" — good).
  4. Either drop the geometric Unicode symbols entirely or pair them with a recognisable emoji.
  5. Make sure every icon button has a visible text label, not just a tooltip.
- **Difficulty:** Easy-Medium
- **Time estimate:** 2 hours.
- **Can Claude Code do this for me?** Yes — tell it the labels you want.

---

### #041 — Help/Keys buttons exist but I haven't verified they actually open useful content

- **Category:** Usability · Verification needed
- **Severity:** 🟡 Medium
- **Where:** Universe `UI.help()`, `UI.toggleKbd()`. Biography same.
- **What's wrong:** Need to test. The code in `js/universe-timeline.js` line 7852 references `OBS_HELP_SECTIONS` — looks like a substantial help system. Did not visually verify.
- **How to fix:** Open both apps, click Help, click Keys. Make sure both modals open and content is readable and useful. If broken, file a follow-up issue.
- **Difficulty:** Easy (verification)
- **Time estimate:** 15 minutes.

---

### #042 — Buttons use 11-12px font in the toolbars — small for older eyes

- **Category:** Usability · Elderly
- **Severity:** 🟡 Medium
- **Where:** `universe.html` toolbar — buttons use `font-size:11.5px` in inline styles in many places. Biography similar.
- **What's wrong:** 11-12px is below comfortable reading size for users 65+. Buttons also have small padding.
- **How to fix:** Bump toolbar button font-size to 13-14px and increase padding. May force toolbar wrap on narrow desktop — adjust the wrap behaviour accordingly.
- **Difficulty:** Easy-Medium (cascading CSS impact).
- **Time estimate:** 2-3 hours.

---

### #043 — App onboarding is non-existent

- **Category:** Usability
- **Severity:** 🟠 High
- **Where:** Both apps. No first-run tutorial, no contextual hints, no empty state when there are zero events.
- **What's wrong:** A new user opens Universe → sees pre-populated Marvel data (#005) and four pre-named universes (#003). They have no idea what's *their* data vs the sample. There's no "Welcome — here's how to add your first event" overlay.
- **How to fix:** After #003 and #005 are fixed (sample data replaced with neutral examples), add a small first-run overlay or empty-state card that explains:
  - "These are example events — feel free to delete them and add your own."
  - "Click + Event to add the first event in your timeline."
  - "Your data is saved automatically in this browser. Export a JSON backup regularly."
- **Difficulty:** Medium
- **Time estimate:** Half a day.

---

## 🟡 Biography ↔ Universe content misplacement

> The user explicitly said "things in Biography that belong in Universe and vice versa". I scanned both files for crossed wires. Here's what I found.

### #044 — Universe app uses the word "track" for a universe row; Biography uses "Life Track" — but the underlying data structure in *both* JS files is literally called `universes`

- **Category:** Biography ↔ Universe inconsistency
- **Severity:** 🟡 Medium
- **Where:**
  - `js/biography-timeline.js` line 112: `const tracks = d.lifeTracks || d.universes || [];` — supports both names internally.
  - `js/biography-timeline.js` line 478: `S.lifeTracks || S.universes` — the same fallback.
  - `js/biography-timeline.js` line 440: `function universeToCross(vIdx)` — function names use "universe" in Biography.
  - `biography.html` line 3898: `<button … onclick="UI.addUniverse()" …>+ Life Track</button>` — UI says "Life Track" but the function it calls is `addUniverse`.
- **What's wrong:** The naming is confusing. UI text says "Life Track", but the data model and function names say "universe". When the user exports a JSON file from Biography and opens it in a text editor, they will see "universes" — which can be alarming for a *biography* file.
- **How to fix:**
  1. Decide on one term per app. UX-wise, "Life Track" is correct in Biography and "Universe" in Universe.
  2. Either rename the Biography functions/data to use `lifeTracks` (matching UI), or keep the data model uniform but make the JSON export rename `universes` → `lifeTracks` on save.
  3. Option 2 is safer — touches less code. Option 1 is cleaner but a multi-hour refactor.
- **Difficulty:** Medium
- **Time estimate:** Half a day (option 2), 1-2 days (option 1).
- **Can Claude Code do this for me?** Yes — choose option, ask Claude Code to execute.
- **Risk if skipped:** Confused power-users; export files look wrong.

---

### #045 — Both apps' default sample data lives at lines 6277 (Universe) and 5440 (Biography) — verify Biography sample is neutral

(Cross-reference with #003 and #021. The default sample data should be obviously fake and labelled "Example".)

---

### #046 — Universe shows "Memory Tour" button — that's a Biography concept

- **Category:** Biography ↔ Universe content misplacement
- **Severity:** 🟢 Low
- **Where:** `universe.html` line 3923 — `<button class="btn" onclick="MemoryTour.start()" title="Start a read-only guided Memory Tour through your events one moment at a time">🎞 Memory Tour</button>`.
- **What's wrong:** "Memory" is the Biography vocabulary ("Your memories, your museum"). In Universe it would more naturally be called "Continuity Tour" (which also exists separately). Having both buttons in Universe is fine, but the *name* "Memory Tour" feels Biography-flavoured.
- **How to fix:** In Universe, rename the button to something universe-flavoured: "Chronicle Tour" or "Story Tour" or "Playback". The underlying function name (`MemoryTour.start()`) can stay.
- **Difficulty:** Trivial
- **Time estimate:** 5 minutes.
- **Can Claude Code do this for me?** Yes.

---

### #047 — Biography sidebar still says "People & Key Figures" — phrasing OK; Universe equivalent is "Codex" — feels too RPG

- **Category:** Biography ↔ Universe content tone
- **Severity:** 🟢 Low
- **Where:** Biography "People" tab (`switchView('people')`). Universe "Codex" tab.
- **What's wrong:** "Codex" works for fiction, but the consistent biography vocabulary across the site is *People*. Make sure that tab is labelled appropriately for *its own context* (Codex stays in Universe; People stays in Biography). No bug — just confirming they're not crossed.

---

## 🟡 Missing features the code implies should exist

### #048 — `feed.xml` advertises an RSS feed but no `<link rel="alternate" type="application/rss+xml">` on most pages

- **Category:** Missing feature
- **Severity:** 🟢 Low
- **Where:** Only `index.html` line 117, `guides.html` line 264, and the guide articles have the RSS feed link. Other pages don't.
- **What's wrong:** Browsers (and RSS reader extensions) discover feeds via the `<link rel="alternate">` tag. Adding it to every page lets users subscribe from anywhere on the site.
- **How to fix:** Add `<link rel="alternate" type="application/rss+xml" href="/feed.xml" title="FreeTimeline Guides">` to the `<head>` of every page.
- **Difficulty:** Trivial
- **Time estimate:** 10 minutes.
- **Can Claude Code do this for me?** Yes.

---

### #049 — Cookie Policy promises a localStorage key `ft_cookie_consent` but no code ever writes it

(Same as #001 — covered there.)

---

### #050 — `roadmap.html` says "Print & PDF export" is *planned* but the canvas-based apps cannot easily produce a usable print

- **Category:** Missing feature (low priority)
- **Severity:** 🟢 Low
- **Where:** `roadmap.html` lines 260-263.
- **What's wrong:** Just a flag — printing a giant pannable canvas is hard. If a user reads the roadmap and asks "when?", be prepared with a real estimate. This is purely a roadmap-honesty issue, not a code one.

---

### #051 — "Localised UI" planned but no i18n scaffolding exists in either JS file

- **Category:** Missing feature
- **Severity:** 🟢 Low (informational)
- **Where:** `roadmap.html` lines 277-280.
- **What's wrong:** No localisation framework, no string extraction, no language files. Going from this state to Portuguese-first will be a real project, not a feature flip. Plan accordingly.

---

## 🟡 Security & data integrity

### #052 — `.innerHTML = ` is used in ~160 places across both JS engines

- **Category:** Security · XSS surface
- **Severity:** 🟠 High
- **Where:** Both `js/universe-timeline.js` and `js/biography-timeline.js`.
- **What's wrong:** Each `.innerHTML = ` is a potential XSS injection point if user-controlled text reaches it without escaping. The good news: Biography defines an `esc()` helper at line 102 and an `escapeHTML()` at lines 481 and 730, and uses them. The bad news: 160 call sites is a lot to audit manually, and I did not verify each one.
- **How to fix:**
  1. Spot-check 10-20 random `.innerHTML =` lines. For each, trace the variables — do they come from `S` (user data) or from constants?
  2. Wherever user data (event titles, character names, notes, descriptions) flows into `.innerHTML` without going through `esc()`/`escapeHTML()`, fix.
  3. Especially audit: the HTML import path (`Store.importFile`). User-provided HTML files are imported and rendered. This is the highest-risk path.
- **Difficulty:** Medium-Hard
- **Time estimate:** Half a day for spot check; 1-2 days for full audit.
- **Can Claude Code do this for me?** Partly — Claude Code can systematically grep `.innerHTML` sites and flag the ones using state data. **You** decide which ones need fixing.
- **Risk if skipped:** A malicious imported file could run JavaScript on the user's browser, exfiltrate localStorage, etc. Low real-world risk (the threat model is friend-shares-file-with-friend), but real.

---

### #053 — HTML import (`.html` files) is supported but I did not verify the sanitisation

- **Category:** Security · Data integrity
- **Severity:** 🟠 High
- **Where:** `universe.html` line 3926 and `biography.html` line 3905: `<input type="file" id="file-in" accept=".html,.json">`. The handler is `Store.importFile(event)`.
- **What's wrong:** Importing user-provided HTML is dangerous. The export likely produces self-contained HTML (with the saved JSON embedded). If a malicious imported file contains script tags, *what stops them from running?* — depends on how the importer parses the file. I did not audit the importer code.
- **How to fix:** Find the `Store.importFile` definition in each JS file and verify:
  1. The importer extracts only the embedded JSON, not the whole HTML.
  2. Any embedded JSON is parsed with `JSON.parse` (not `eval`).
  3. The result is validated against the expected schema before saving.
- **Difficulty:** Medium
- **Time estimate:** 1 hour audit; up to half a day to fix if broken.
- **Can Claude Code do this for me?** Yes — ask "audit Store.importFile in both engines for HTML-import safety".

---

### #054 — URL hash state restoration accepts user-provided values

- **Category:** Security · Mild
- **Severity:** 🟡 Medium
- **Where:** `js/universe-timeline.js` section starting line 9485 ("URL HASH STATE"), `js/biography-timeline.js` line 8200 ("SHARE VIEW + URL HASH STATE").
- **What's wrong:** Share-by-URL encodes view state (zoom level, pan position, filters) into the URL hash. If the parser doesn't validate ranges, a malicious URL could cause weird state (NaN positions, huge zoom values, infinite loops). Low real-world risk; worth confirming bounds-checking exists.
- **How to fix:** Add range validation to the hash parser. Reject NaN/Infinity. Clamp to legal min/max.
- **Difficulty:** Easy
- **Time estimate:** 1 hour.

---

### #055 — No Content-Security-Policy header (server config, not in the project files)

- **Category:** Security · Deployment
- **Severity:** 🟡 Medium
- **Where:** Hosting layer (Cloudflare, the actual web server).
- **What's wrong:** No CSP means inline `<script>` blocks (you have lots) and unsanitised injected HTML can execute. With ~160 `.innerHTML =` sites, a CSP would be a strong second line of defence.
- **How to fix:** When deploying, configure a Content-Security-Policy header. Start with `Content-Security-Policy-Report-Only` to detect breakage before enforcing. Allow AdSense + Google Fonts + your own origin.
- **Difficulty:** Medium
- **Time estimate:** 1-2 hours initial setup + ongoing tweaks.

---

### #056 — `mailto:support@freetimeline.pt` and `mailto:privacy@freetimeline.pt` are publicly visible in many pages — spam exposure

- **Category:** Security · Minor
- **Severity:** 🟢 Low
- **Where:** `about.html`, `contact.html`, `privacy.html`, `terms.html`, `cookies.html` (mailto links).
- **What's wrong:** Bot scrapers harvest these addresses. Spam is inevitable.
- **How to fix:**
  - Use a contact form with a server-side backend (heavyweight).
  - Or obfuscate the addresses (JavaScript reveals on click). Imperfect but reduces volume.
  - Or accept it and rely on inbox filtering.
- **Difficulty:** N/A (informational).

---

## 🟢 SEO & metadata

### #057 — Guides' BreadcrumbList JSON-LD truncates the article name with ellipsis ("How to Build a Consistent Timeline for Y…")

- **Category:** SEO
- **Severity:** 🟢 Low
- **Where:** Every `guides/*.html` file's second JSON-LD block.
- **What's wrong:** The breadcrumb's third item name is truncated to ~40 chars ending in `…`. Google's documentation says the `name` field should be the full breadcrumb label.
- **How to fix:** Replace the ellipsis-truncated text with the full title.
- **Difficulty:** Trivial
- **Time estimate:** 10 minutes (5 articles).
- **Can Claude Code do this for me?** Yes.

---

### #058 — `<html lang="en">` everywhere, but the domain is `.pt` and the legal section claims Portuguese jurisdiction

- **Category:** SEO · I18n
- **Severity:** 🟡 Medium
- **Where:** Every page (`<html lang="en">`).
- **What's wrong:** `lang="en"` correctly tells search engines the content is English, but Google may treat a `.pt` domain with English content as targeted at Portugal — which is fine if intentional. No bug, but flag for review when localisation rolls out (#051).

---

### #059 — Guides hub `<a href="how-to-build-consistent-timeline-fantasy-novel.html">` is relative without the `guides/` prefix  ✅ Done 2026-05-11

- **Category:** SEO · 🔴 Bug
- **Severity:** 🔴 Critical (re-classified)
- **Where:** `guides.html` lines 291, 301, 311, 321, 331 — every `<a href="…" class="guide-card">`.
- **What's wrong:** The `guides.html` file lives at the project root. The article files live in `guides/`. The links are written as `href="how-to-build-consistent-timeline-fantasy-novel.html"` (relative to current location) — so the browser will try to fetch `/how-to-build-consistent-timeline-fantasy-novel.html` (project root), not `/guides/how-to-build-consistent-timeline-fantasy-novel.html`. **The article links from the hub are broken.**
- **Why it matters:** Visitors clicking any guide on the hub page will hit a 404. This is one of the worst possible UX problems on a content-driven site, and AdSense reviewers will flag it. The sitemap and RSS feed point to the correct `/guides/…` paths so they are fine — but the hub page links are wrong.
- **How to see it yourself:** Once deployed, open `https://freetimeline.pt/guides.html` and click any guide card. You'll get 404 Not Found.
- **How to fix:** Add `guides/` prefix to all 5 `<a href="…">` URLs in `guides.html`. Result: `href="guides/how-to-build-consistent-timeline-fantasy-novel.html"` (etc).
- **Difficulty:** Trivial
- **Time estimate:** 5 minutes.
- **Can Claude Code do this for me?** Yes ("fix #059").
- **Risk if skipped:** Site looks broken from the moment a visitor opens the guides hub. **Promote this to your Day-1 critical fix list.**

---

### #060 — Several pages have *two* `<script>(footer-year)</script>` blocks duplicating the same year-setting code

- **Category:** Code quality / SEO (minor)
- **Severity:** ⚪ Cosmetic
- **Where:** `cookies.html` line 79 (manual), then a footer block in shared snippets. Similar in `about.html`. Search for `getElementById('footer-year')` and `getElementById('ft-year')`.
- **What's wrong:** Some pages set the same year twice or check both `ft-year` and `footer-year` IDs, only one of which is in the DOM.
- **How to fix:** Pick one ID convention (`footer-year` is used most). Remove the unused one.
- **Difficulty:** Easy
- **Time estimate:** 30 minutes.

---

## 🟢 Legal / cookies / privacy accuracy

(Most legal issues are covered above — #001, #010, #011, #012, #013.)

### #061 — Privacy Policy doesn't explicitly disclose the Cloudflare WAF / DNS layer if hosted on Cloudflare

- **Category:** Legal · GDPR
- **Severity:** 🟢 Low
- **Where:** `privacy.html` line 351 — mentions Cloudflare as DNS/CDN host.
- **What's wrong:** Good — it's already disclosed. But verify: is Cloudflare *actually* your CDN/DNS? If not, remove the line. If yes, you may need a DPA (Data Processing Addendum) on file with them for GDPR — Cloudflare provides one. Document the link in your records.
- **How to fix:** Confirm hosting layer; sign Cloudflare DPA if needed.
- **Difficulty:** Easy (administrative).

---

### #062 — Privacy Policy "Right to Erasure" — for a localStorage-only site, this is awkward

- **Category:** Legal · GDPR
- **Severity:** 🟢 Low
- **Where:** `privacy.html` "Your Rights (GDPR)" section.
- **What's wrong:** The page says you can request erasure of data. But since the user's data is in their browser, the deletion mechanism is "clear browser data". The page mentions this. OK.
- **How to fix:** No action needed; just confirm a user's GDPR-erasure request (sent to privacy@freetimeline.pt) is realistically answerable — server logs only.

---

## ⚪ Clutter to delete

### #063 — `.DS_Store` should not be deployed

- **Category:** Clutter
- **Severity:** ⚪ Cosmetic
- **Where:** Project root.
- **What's wrong:** macOS metadata file; not useful in production.
- **How to fix:** Delete locally or `.gitignore` if/when you start using Git. Make sure your deploy process excludes it.
- **Difficulty:** Trivial.

---

### #064 — Duplicated `.ft-cookie-prefs` CSS block in `about.html`, `roadmap.html`, etc.

(Same as #039 — counted once.)

---

### #065 — Commented-out Discord placeholder in `contact.html`

(Same as #024 — counted once.)

---

### #066 — Hardcoded universe chips in `universe.html` line 3963

(Same as #031 — counted once.)

---

## ⚪ Code-quality cleanups (nice-to-have, post-launch)

### #067 — `let TRACK_H = 100;` and similar globals leak from the engine to the inline onclick handlers

- **Category:** Code quality
- **Severity:** ⚪ Cosmetic
- **Where:** `js/universe-timeline.js` line 24, `js/biography-timeline.js` similar.
- **What's wrong:** The toolbar's row-height slider uses `oninput="TRACK_H=+this.value; …"` — modifying a top-level global from inline HTML. Coupling, but works.
- **How to fix:** Long-term, move all engine state behind an FT_UNI/FT_BIO namespace setter. The namespace exists already (FT_UNI is created) but not consistently used. Not urgent.
- **Difficulty:** Medium.
- **Time estimate:** 2 days, full refactor.

---

### #068 — The two engines are 95% duplicated code with minor renames

- **Category:** Code quality
- **Severity:** ⚪ Cosmetic
- **Where:** All of `js/universe-timeline.js` (9,908 lines) and `js/biography-timeline.js` (8,958 lines).
- **What's wrong:** Section banners in both files use identical names ("STATE", "UTILITY HELPERS", "RENDER ENGINE", etc.). Many functions are the same with `Universe`→`Biography` renames. Maintenance cost is 2x — any bugfix in one must be ported to the other.
- **How to fix:** A future major refactor to extract a shared engine module that both apps depend on. Out of scope for this audit.

---

### #069 — Inline event handlers (`onclick="…"`) are everywhere — modern best practice is `addEventListener`

- **Category:** Code quality
- **Severity:** ⚪ Cosmetic
- **Where:** Both apps' HTML files. Hundreds of `onclick="UI.foo()"` strings.
- **What's wrong:** Inline handlers prevent stricter Content-Security-Policy headers (#055), are harder to debug, and create the script-loading-order fragility you have today (engine functions, inline-script functions, mobile handlers all racing).
- **How to fix:** Not urgent. Address during a future refactor.

---

### #070 — `.DS_Store` (already listed in #063).

### #071 — No `robots.txt`  ✅ Done 2026-05-11

- **Category:** SEO · Code quality
- **Severity:** 🟢 Low
- **Where:** Project root.
- **What's wrong:** Missing `robots.txt`. Crawlers infer permissive behaviour but explicit is better.
- **How to fix:** Create a minimal `robots.txt`:
  ```
  User-agent: *
  Allow: /
  Sitemap: https://freetimeline.pt/sitemap.xml
  ```
- **Difficulty:** Trivial
- **Time estimate:** 2 minutes.

---

## 5. The Two Apps — Deep Dive

### 5A. Universe Timeline (`universe.html` + `js/universe-timeline.js`)

#### Tab-by-tab walkthrough

| Tab | Button label | What it does | Status / notes |
|---|---|---|---|
| Timeline | `⧖ Timeline` | The canvas — pan/zoom horizontally, events laid out by year | 🟡 Works, but opens with broken sample data (#003 #005) |
| Codex | `⬡ Codex` | Browse and manage character dossiers | 🟡 Works; "Codex" name confusing (#040) |
| Map | `⬡ Map` | Connection graph between events/characters | 🟡 Works (verify yourself) |
| Archive | `◉ Archive` | Statistics view | 🟡 "Archive" name is misleading — these are stats (#040) |
| List | `▤ List` | Accessibility list view of all events by year | 🟡 Works |

#### Toolbar feature inventory

Working features I see wired up: Add Event, Add Universe, Categories editor, Organizations editor, Row Height slider, Today, Reset, Undo, Redo, Keys, Help, Reading Mode toggle, Fit, Jump, Share, Save HTML, JSON export, Load, Blank, Stats, Story, Continuity Tour, Memory Tour, Range Config.

Worth verifying yourself: Share Link round-trip (does pasting the share URL back actually restore the view?), Continuity Tour playback, Memory Tour playback.

#### What's exposed on `window.FT_UNI`

The engine reserves `window.FT_UNI` as the future module surface (line 19 of `js/universe-timeline.js`). The "TIMELINE ENGINE EXPORTS" section at line 8795 registers live state, view, modal stack, persistence and render entry points. Not all internal functions are exposed — you can still call them via the inline `onclick` handlers, but if you wanted to script Universe from the browser console, only the FT_UNI surface is officially supported.

#### Import / export round-trip integrity

The engine supports JSON export and HTML export (a self-contained portable file). The import path supports both. Risk areas (already flagged):
- HTML import security (#053)
- No version-skew handling visible — if you bump `inf_universe_v4` to `_v5`, old exports may not import. Verify by exporting v4, then changing the version constant, then trying to import.

#### Share-by-URL integrity

Implemented at `js/universe-timeline.js` line 9485 (`URL HASH STATE`). I did not test round-trip. Things to verify:
- Does sharing a view of a specific universe, zoomed in, with a filter applied, restore *all three* when opened?
- Does it survive copy/paste through messaging apps that mangle long URLs?

#### Undo/redo correctness

`History.undo()` / `History.redo()` are wired to the toolbar. Code in section starting line 6198 ("UNDO / REDO HISTORY"). Worth verifying:
- After 10 actions, does undo unwind all 10?
- After undo then a new action, is redo correctly invalidated?
- Mobile gesture support (back-swipe gesture is not the same as undo).

#### Mobile-specific issues for the canvas

Universe has a separate mobile header (`#mob-header`) and a bottom action bar (`#bot-bar`). The desktop toolbar is hidden on mobile. **Verify on a real phone:** can you actually open a modal, edit an event, save? The desktop UX is the polished path; mobile is less tested.

---

### 5B. Biography Timeline (`biography.html` + `js/biography-timeline.js`)

#### Tab-by-tab walkthrough

| Tab | Button label | What it does | Status / notes |
|---|---|---|---|
| Timeline | `Timeline` | Canvas — life events plotted across time | 🟡 Works |
| People | `People` | Directory of people/key figures | 🟡 Works |
| Relationships | `Relationships` | Connection map | 🟡 Works |
| Stats | `Stats` | Biography statistics | 🟡 Works |
| List view | `List view` | Year-grouped list | 🟡 Works |

#### Toolbar inventory

Wired: Add Event, Add Life Track, Save HTML, Save JSON, Load, Blank (with mobile-safe confirm — see #018), Categories editor, Groups editor, Today, Jump, Story, Fit, Share, Reset, Undo, Redo, Stats panel, Memory Tour, Keys, Range, Help. **Missing vs. Universe:** Reading Mode (#019), Continuity Tour (#020). Re-skin of Universe with warm tones — the colours match the Biography brand.

#### What's exposed on `window.FT_BIO`

Same pattern as `FT_UNI` (line 9 of `js/biography-timeline.js`).

#### Mobile-specific: Biography is *better*

Biography has a more thoughtfully designed mobile experience:
- Custom mobile-safe confirm dialog (`bio-mob-blank-confirm`).
- Quick-action search in the mobile drawer.
- Clear sectioned drawer ("Data & Backup", "Views", "Create", "Organise", "Navigate").
- The patterns that work here should be back-ported to Universe (#018).

#### Cross-app drift

| Feature | Universe | Biography |
|---|---|---|
| Reading Mode | ✅ | ❌ (#019) |
| Continuity Tour | ✅ | ❌ (#020) |
| Memory Tour | ✅ | ✅ |
| Custom mobile blank-confirm | ❌ (#018) | ✅ (partial — only on Clear) |
| Mobile drawer with sections | ❌ | ✅ |
| Mobile drawer action-search | ❌ | ✅ |
| Star-canvas background | (homepage only) | (no) |
| Connection map | ✅ "Map" | ✅ "Relationships" |
| Filter dropdown for Status | ✅ | ❌ (only Cat / Tone / People) |
| Filter dropdown for Tags | ✅ | ❌ |

---

## 6. AdSense Rejection — Dedicated Section

This site has many AdSense risk factors. Ranked by likelihood:

| # | Issue | Issue ID |
|---|---|---|
| 1 | No ad units anywhere; loader is on homepage only | #004 |
| 2 | About page says "We don't show you ads" | #002 |
| 3 | Default Universe content includes Marvel/DC copyrighted material | #005 |
| 4 | Marketing meta tag says "no tracking" | #011 |
| 5 | Cookie consent banner is a placeholder alert | #001 |
| 6 | Cookie Policy lists wrong localStorage keys | #010 |
| 7 | No favicon | #009 |
| 8 | No Open Graph image (and inconsistent filename between homepage and articles) | #006 #007 |
| 9 | No `ads.txt` | #008 |
| 10 | "Team photo coming soon" placeholder on About | #014 |
| 11 | Pre-rendered "Liga BRT" / "40 Graus" universe names visible on first load | #003 |
| 12 | Hub links to guides are broken (404 — wrong path) | #059 |
| 13 | "Marvel & DC storylines" tag on homepage map | #029 |
| 14 | Pricing page promises features that don't exist | #015 |
| 15 | Last-updated dates on legal pages are stale | #013 |

### Minimum viable fix list before re-submitting

In strict order:
1. **#059** — fix broken guide links (5-minute fix; otherwise reviewer sees 404 errors).
2. **#002** — remove "We don't show you ads" from About.
3. **#001** — wire a working consent banner.
4. **#005** + **#003** + **#029** — strip Marvel/DC and "Liga" content.
5. **#010** — fix Cookie Policy key list.
6. **#011** — fix "no tracking" meta description.
7. **#014** — remove "Team photo coming soon".
8. **#006** + **#007** + **#009** — create OG image and favicon.
9. **#008** — add `ads.txt`.
10. **#004** — place 1-3 actual ad units; load AdSense on every page that has one.
11. **#013** — bump last-updated dates.

That sequence is the minimum bar for a serious re-submission.

---

## 7. Prioritized Action Plan — "The 4-Day Sprint"

> This is honest. If you try to do everything in the audit you will not deploy. The Day-X groupings below assume ~6 hours of focused work per day with Claude Code helping.

### Day 1 — Stop the bleeding (the visible-bad-stuff fixes)

- **Morning (3 hrs)**
  - #059 — fix broken guide links (5 min).
  - #003 + #005 + #029 — replace Marvel/DC and "Liga BRT" sample data with neutral example data (2 hrs).
  - #002 — rewrite the About "We don't show you ads" paragraph (15 min).
  - #014 — replace "Team photo coming soon" (15 min).
- **Afternoon (3 hrs)**
  - #011 — fix "no tracking" meta description (10 min).
  - #015 — soften or remove Pricing Pro tier promises (15 min).
  - #009 — generate a simple favicon and wire it everywhere (1 hr).
  - #008 — add `ads.txt` (5 min).
  - #071 — add `robots.txt` (5 min).
  - #018 (part 1) — start the unified mobile confirm-dialog refactor (1.5 hrs — finish Day 2).

**End-of-day check:** Open the site in Chrome dev tools on phone-size viewport. Click around. Should look 80% more "real" than this morning.

### Day 2 — Legal + AdSense plumbing

- **Morning (3 hrs)**
  - #001 — minimal consent banner (Accept all / Reject all, writes `ft_cookie_consent`). Replace the placeholder alert on every page. (2 hrs)
  - #010 — fix Cookie Policy localStorage key table to match reality. (30 min)
  - #013 — bump last-updated dates on Privacy, Terms, Cookies. (5 min)
  - #018 (part 2) — finish the mobile-safe confirm dialog refactor. (30 min)
- **Afternoon (3 hrs)**
  - #006 + #007 — generate an OG image, place it at `/og.png`, fix the inconsistent filename in all 5 guides. (1.5 hrs — most time is design.)
  - #004 / #004b — decide on Auto Ads vs. manual placements. Place AdSense loader on every page. Add 1-3 ad units. (1.5 hrs)

**End-of-day check:** The site has working consent, working ads, accurate legal pages, real OG previews. AdSense application is now defensible.

### Day 3 — App polish & QA

- **Morning (3 hrs)**
  - #021 — audit Biography sample data, replace any personal-looking content. (30 min)
  - #031 — remove hardcoded universe chips from `universe.html`. (5 min)
  - #022 — Biography "Loading…" fallback. (30 min)
  - #040 — rename "Codex" → "Characters", "Archive" → "Stats" in Universe. (30 min)
  - #042 — bump toolbar font sizes for readability. (1 hr)
  - #024 — strip Discord placeholder. (1 min)
  - #025 — add roadmap.html to sitemap. (2 min)
  - #026 + #027 — fix RSS/JSON-LD dates to be consistent. (15 min)
  - #057 — fix BreadcrumbList truncation. (10 min)
- **Afternoon (3 hrs)**
  - Mobile QA on a real phone:
    - All five guide links work.
    - Cookie banner appears and dismisses.
    - Both apps load and basic editing works.
    - Mobile drawer in Biography opens, closes, search works.
    - Universe toolbar reachable on mobile.
  - Fix anything broken (budget 2 hrs for unknowns).

### Day 4 — Final QA + AdSense re-submission

- **Morning (3 hrs)** — Lighthouse audit. Fix anything red. Verify in Chrome, Safari, Firefox.
- **Lunch** — Deploy to production. Verify `https://freetimeline.pt/ads.txt`, `/sitemap.xml`, `/feed.xml`, `/og.png` all return 200.
- **Afternoon (3 hrs)**
  - AdSense re-submission checklist (see below).
  - Walk through your site as an AdSense reviewer would: 5 random visitor journeys.
  - Submit.

### AdSense re-submission checklist

Before you click "request review" in AdSense, verify each:

- [ ] `https://freetimeline.pt/ads.txt` returns the correct line with your publisher ID
- [ ] `https://freetimeline.pt/og.png` displays an image
- [ ] `https://freetimeline.pt/favicon.png` (or `.ico`) displays an icon
- [ ] Every guide link from `https://freetimeline.pt/guides.html` works (no 404s)
- [ ] About page no longer says "We don't show you ads"
- [ ] Universe opens with neutral example data, not Marvel/DC or "Liga BRT"
- [ ] Cookie consent banner appears for new visitors and dismisses with a clickable Accept/Reject
- [ ] "Manage cookie preferences" footer link re-opens the banner
- [ ] Cookie Policy table matches the real localStorage keys (`inf_universe_v4`, `inf_biography_v1`, etc.)
- [ ] At least 2 ad slots are visible on the homepage and/or in a guide article (with `data-ad-test="on"` removed once you've verified once)
- [ ] AdSense loader script is on every page that hosts an ad
- [ ] Privacy and Terms last-updated dates match today's deployment

### What you should NOT try to do in 4 days

- A full IAB TCF v2.2 CMP integration (use Google Funding Choices later)
- Refactoring the two giant JS engines into a shared module (#068)
- Full XSS audit of all 160 `.innerHTML =` sites (#052) — spot-check the import path only (#053)
- Localised UI (#051)
- Adding a real contact-form backend (#023) — keep the email link approach
- Print/PDF export (#050)

---

## 8. Nuke List

Files, features, sections you should consider deleting outright rather than fixing.

| Item | Why |
|---|---|
| The `<form>` block in `contact.html` lines 424-455 | Pretends to send; users get confused. The big "Email us directly" button (lines 408-418) is honest and works. |
| The commented-out Discord placeholder in `contact.html` lines 474-483 | Dead code. Re-add when you have a Discord. |
| The "Team photo coming soon" box in `about.html` lines 400-402 | "Under construction" signal. Rewrite the surrounding paragraph to not need an image. |
| The pre-rendered `<span id="uni-toggle-chips">` content in `universe.html` line 3963 | The JS rebuilds it on load anyway. Leaving hardcoded chips guarantees drift. |
| The duplicated `.ft-cookie-prefs` CSS blocks in `about.html`, `roadmap.html`, etc. (three repetitions per file) | Pure size bloat. |
| The "Marvel & DC storylines" map-tag in `index.html` line 321 | IP risk; replace with neutral wording. |
| The Pro tier card in `pricing.html` lines 126-135 (or at minimum the FAQ claim about "encrypted cloud sync") | You don't have these features and the roadmap doesn't even promise them. |
| All Marvel/DC sample data in `js/universe-timeline.js` (line 80 onwards) | IP risk; signals "fan project" not "product". |
| The placeholder `alert(...)` cookie-prefs script in every HTML file's last `<script>` tag | After #001, this disappears anyway. |
| `.DS_Store` in the project root | macOS junk. |

---

## 9. Glossary

- **AdSense** — Google's ad network for website owners. Pays you when visitors view/click ads on your site.
- **`ads.txt`** — A plain-text file at your site root that lists which ad networks are allowed to sell ads on your site. Industry standard; helps fight ad fraud.
- **API** (Application Programming Interface) — A way one program talks to another. The site doesn't use one because there's no server.
- **Auto Ads** — An AdSense option where Google decides where to place ads, instead of you choosing each spot.
- **Backend** — A server that runs code, like a database. This site doesn't have one; everything is in the browser.
- **Breadcrumb** — The "Home > Guides > Article" trail at the top of pages.
- **Canvas** — An HTML element where JavaScript can draw arbitrary graphics. Both apps use canvas for their timelines.
- **CMP** (Consent Management Platform) — A small software piece that handles "Accept / Reject cookies" banners and remembers user choices.
- **CSP** (Content-Security-Policy) — A web security header that tells the browser which scripts and resources are allowed to run. Not currently configured.
- **DPA** (Data Processing Agreement) — A legal contract required under GDPR when a vendor processes personal data on your behalf.
- **GDPR** — EU privacy regulation. Sites visited from EU/UK must give users a real choice about ad tracking.
- **Hash state** — Information stored in the part of a URL after the `#` symbol (e.g. `freetimeline.pt/universe.html#year=1500&zoom=2`). Used to share specific views.
- **IAB TCF v2.2** — The advertising industry's standardised consent framework. Your Cookie Policy references it but no implementation exists.
- **IIFE** (Immediately Invoked Function Expression) — A JavaScript pattern that runs code in a private scope, like `(function() {…})();`. Used heavily in this project.
- **innerHTML** — A property of every HTML element that lets JavaScript replace its contents with new HTML. Powerful but a common source of XSS vulnerabilities.
- **JSON** — A simple text format for storing structured data. Both apps export to JSON.
- **JSON-LD** — A way to embed structured metadata in a page so search engines can understand it. Your pages have several of these blocks.
- **localStorage** — A browser feature that lets a website save up to ~10 MB of data on the user's device, persisting between visits. The apps use this for all data.
- **Open Graph (OG)** — A protocol for the image and text that show when someone shares your URL on social media.
- **Publisher ID** — Your unique AdSense identifier; visible in your code as `ca-pub-4135034633295293`.
- **RSS** — A standard format for publishing a feed of articles that readers can subscribe to.
- **Sitemap** — A list (in XML format) of all your site's pages, submitted to search engines.
- **Sample data** / **default state** — The example content shipped with the app so a first-time user sees something instead of an empty screen.
- **XSS** (Cross-Site Scripting) — A class of security bugs where malicious user input gets executed as code in another user's browser.

---

## 10. How To Use This Document

This file is a work-list. To use it:

1. **Read sections 1 and 7 first** (Executive Summary + 4-Day Sprint). Decide whether the scope feels achievable. If 4 days is too aggressive, push the deadline.
2. **Walk through Day 1's tasks one issue at a time.** For each issue, start a fresh Claude Code session and say: *"Open `PROJECT_REVIEW.md` and work on #001"* — Claude Code will read this file, find the issue, and propose changes. Review the diff before accepting.
3. **For issues where I marked "Can Claude Code do this for me? Partly" or "No, manual decision",** make your decision *first*, then tell Claude Code your choice. Example: *"For #023, I want option 1 — remove the form entirely. Apply the changes."*
4. **Test as you go.** After each issue is fixed, open the relevant page in your browser and verify the fix worked. Don't trust the code — trust the visible result.
5. **Keep this file updated.** As you fix issues, you can ask Claude Code to mark them done in this document (e.g. by appending a `✅ Done 2026-05-11` tag).
6. **Re-run an audit when you're ready to re-submit AdSense.** Many issues here are not in the AdSense critical path — but you'll discover new ones as you change the site. Ask: *"Re-audit `freetimeline.pt`-style site for AdSense submission risks since `PROJECT_REVIEW.md`."*
7. **If something in this document is wrong** (I'm not infallible — I skimmed two 9k-line scripts), tell Claude Code and it will update the document.

Good luck. The site has good bones. The problems are mostly cosmetic, content, or compliance — not deep architecture. A focused 4-day push will get you across the line.

---

*End of `PROJECT_REVIEW.md`.*
