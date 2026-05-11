# FreeTimeline — Deploy Checklist

> Last updated: 2026-05-12. Walk this list top-to-bottom on deploy day.
> Every box should be **ticked** before you click "request review" in AdSense.
> Anything you can't verify yourself — stop and ask Claude Code before continuing.

---

## Pre-deploy (do once on your computer, before you upload)

### A. Sanity test the local files

- [ ] Double-click `index.html` in Finder. The site should open in your browser with the dark space-themed homepage.
- [ ] In your browser, hold Cmd+Option+I (Mac) or F12 (Windows) to open **Developer Tools**. Click the **Console** tab. There should be **no red error messages**. (Yellow warnings are OK.)
- [ ] Click **Guides** in the top nav. The 5 article cards should appear. Click each one — every guide must open (Day 1 fixed the broken links). Hit back after each.
- [ ] Click **Universe** portal. The Universe app should load with "Sample Universe A / B" and a sample event. Click **+ Event** and add a test event. Refresh the page. The event should still be there (localStorage works).
- [ ] Click **Home → Biography**. Add a test event. Refresh. Verify it persists.
- [ ] Delete the test events using the **Blank** button. A mobile-safe dialog should appear with two buttons — NOT the small grey browser-default confirm box. Cancel out.

### B. Cookie consent / AdSense gate

- [ ] In the same browser, open **Developer Tools → Application → Local Storage → `file://`** (or whatever shows your domain). Delete the key `ft_cookie_consent` if it exists. Reload `index.html`.
- [ ] **The bottom-of-screen consent banner should appear** with two equal-width buttons: "Reject all" and "Accept all".
- [ ] Click **Reject all**. The banner disappears. In Developer Tools → Network tab, reload the page and confirm **no request** goes to `pagead2.googlesyndication.com`. (Google AdSense is blocked when rejected.)
- [ ] Open `https://www.google.com/search` in the same tab to clear filters, come back, click **"Manage cookie preferences"** in the page footer. The banner should reopen. Now click **Accept all**. AdSense should now load (visible as a `googlesyndication.com` request in Network).
- [ ] Confirm `localStorage.ft_cookie_consent === "accepted"` in the Application tab.

### C. Mobile check (use Chrome / Firefox / Safari DevTools mobile preview)

- [ ] In your browser dev tools, click the small phone icon to switch to mobile preview. Select **"iPhone 14 Pro"** or any phone preset.
- [ ] Reload the homepage. Banner appears at the bottom, full-width. Buttons are large enough to tap with a finger.
- [ ] Open Universe app on mobile preview. Toolbar buttons should be at least 40 pixels tall (you should be able to tap them comfortably).
- [ ] Add an event on mobile preview, delete it using the **Blank** button. Confirm the mobile-safe dialog appears (NOT the tiny native confirm).

### D. Visual / link sanity

- [ ] Check that `og.png` opens directly in the browser: type `og.png` into the URL bar (replacing the page). You should see the FreeTimeline brand image.
- [ ] Check that `favicon.svg` opens: should show "FT" letters on dark background.
- [ ] In `Developer Tools → Network`, reload `index.html`. Look for any **red entries** (404s). If anything is red, note the URL — that's a broken link.

### E. Optional: Lighthouse audit

- [ ] In Chrome, open `index.html`, hit Cmd+Option+I, click the **Lighthouse** tab, select "Performance + Accessibility + Best Practices + SEO + Mobile", click **Analyze page load**.
- [ ] Write down the score. **No red items.** Yellow/orange items are OK to ship — note them for the post-launch backlog.

---

## Deploy day (when you're ready to push live)

### F. Final pre-push checks

- [ ] In Terminal, navigate to the project folder. Run:
  ```
  git status
  ```
  It should say **"working tree clean"**. If there are uncommitted changes, ask Claude Code about each before continuing.
- [ ] Run `git log --oneline | head -20` and confirm the most recent commit is from Day 4 (or whichever day you finished).

### G. What to upload to your web host

Upload **everything** in the project folder EXCEPT the following — these must NOT ship to production:

| Must NOT upload | Why |
|---|---|
| `.DS_Store` | Mac Finder metadata. Useless on a web server. |
| `.claude/` directory | Dev tooling, not for production. |
| `.git/` directory | Source-control history. Not needed on the server. |
| `.gitignore` | Source-control config. Harmless if uploaded but not needed. |
| `PROJECT_REVIEW.md` | Your private audit notes. Do NOT publish. |
| `DEPLOY_CHECKLIST.md` (this file) | Internal notes. Do NOT publish. |
| `POST_LAUNCH.md` | Internal backlog. Do NOT publish. |
| `node_modules/`, `*.bak`, `*.swp`, `*.log`, `.env` | Build/editor leftovers. None should exist, but skip if they do. |

**Should be uploaded:** every `.html`, the `guides/` folder, the `js/` folder, `og.png`, `favicon.svg`, `ads.txt`, `robots.txt`, `sitemap.xml`, `feed.xml`.

If you use Cloudflare Pages, Netlify, or Vercel, configure them to **ignore** the "must NOT upload" list. (Most honour `.gitignore` automatically; verify in the platform's deploy settings.)

If you use FTP / SFTP / `scp`, **manually exclude** those entries when uploading.

### H. Post-upload smoke test (every URL must return HTTP 200)

Open these URLs in a private/incognito window and confirm each loads — **no 404, no 403, no 500**:

- [ ] `https://freetimeline.pt/`
- [ ] `https://freetimeline.pt/index.html`
- [ ] `https://freetimeline.pt/about.html`
- [ ] `https://freetimeline.pt/contact.html`
- [ ] `https://freetimeline.pt/pricing.html`
- [ ] `https://freetimeline.pt/roadmap.html`
- [ ] `https://freetimeline.pt/privacy.html`
- [ ] `https://freetimeline.pt/terms.html`
- [ ] `https://freetimeline.pt/cookies.html`
- [ ] `https://freetimeline.pt/guides.html`
- [ ] `https://freetimeline.pt/universe.html`
- [ ] `https://freetimeline.pt/biography.html`
- [ ] `https://freetimeline.pt/guides/how-to-build-consistent-timeline-fantasy-novel.html`
- [ ] `https://freetimeline.pt/guides/why-local-browser-storage-safer-for-diary.html`
- [ ] `https://freetimeline.pt/guides/organizing-complex-storylines-multiple-characters.html`
- [ ] `https://freetimeline.pt/guides/creating-personal-memory-journal-tips.html`
- [ ] `https://freetimeline.pt/guides/timeline-mapping-tabletop-rpg-campaigns.html`
- [ ] `https://freetimeline.pt/ads.txt` (must show one line: `google.com, pub-4135034633295293, DIRECT, f08c47fec0942fa0`)
- [ ] `https://freetimeline.pt/robots.txt`
- [ ] `https://freetimeline.pt/sitemap.xml`
- [ ] `https://freetimeline.pt/feed.xml`
- [ ] `https://freetimeline.pt/favicon.svg`
- [ ] `https://freetimeline.pt/og.png`

### I. Repeat the consent banner test on the live site

- [ ] Open `https://freetimeline.pt/` in a fresh incognito window.
- [ ] Verify the cookie banner appears at the bottom.
- [ ] **Reject all** → no AdSense in Network tab.
- [ ] Reload, **Accept all** → AdSense loads. (Ads may appear empty for the first 24-72 hours after AdSense approval — that's normal.)

### J. Tell search engines + AdSense the site is live

- [ ] **Google Search Console:** log in, add `freetimeline.pt` as a property, verify ownership (by DNS or by uploading the verification file Google gives you). Then submit `https://freetimeline.pt/sitemap.xml` under **Sitemaps**.
- [ ] **AdSense:** log in, click **Sites → Request review** on `freetimeline.pt`. Review usually takes 1–14 days. You will get an email.

---

## Post-deploy (within 48 hours of going live)

- [ ] Open the live site in **two different browsers** (Chrome + Safari, or Chrome + Firefox). No console errors in either.
- [ ] Open the live site on a **real phone**. Walk every page. Confirm:
  - Banner appears + dismisses.
  - Universe and Biography apps load and accept input.
  - "Manage cookie preferences" reopens the banner.
- [ ] In Google Search Console, after 1-3 days, check **Coverage** to confirm pages are being indexed.
- [ ] Once AdSense approves, **at least one ad slot** should start filling within 24-72 hours. If it stays empty after 72 hours, log into AdSense → **Diagnostics** to see why.

---

## If anything goes wrong

Open a fresh Claude Code session in this project folder. Tell Claude Code which step failed and paste any error message. It can investigate without you having to interpret the technical details.

For consent/ad/cookie issues, the most common fixes are:
- Browser still has an old `ft_cookie_consent` value cached — clear localStorage and reload.
- `ads.txt` not reachable (some hosts cache the root path aggressively) — clear host cache.
- AdSense slot not yet filled — wait 72 hours after approval.
