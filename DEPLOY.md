# Deploy — FreeTimeline

## Topology

- **Host:** GitHub Pages, serving this repo from the `pages` remote
  (`https://github.com/KawawangaTiti/Freetimeline.git`).
- **DNS / CDN:** Cloudflare sits in front of the domain and proxies/caches
  requests to GitHub Pages.
- **Domain:** `freetimeline.pt` (see `CNAME` at the repo root — this is what
  tells GitHub Pages which custom domain to serve under).
- **Build:** none. This is a static HTML/CSS/vanilla-JS site with no build
  step, no bundler, no server-side code. Whatever is committed is exactly
  what gets served.

## How a deploy actually happens

Deploy = push to the branch that GitHub Pages is configured to serve
(check the repo's Settings → Pages → "Branch" on GitHub; historically this
has been `main` or a dedicated `gh-pages`/`deploy` branch — confirm before
assuming). Once GitHub Pages picks up the new commit it rebuilds the static
site automatically, usually within a minute or two. There is no separate
deploy command, no CI pipeline to trigger, and no artifact to upload —
`git push pages <branch>` (or a merge into the served branch) is the entire
deploy.

### Rollback

Since deploy is just "whatever is on the served branch," rollback is a
plain git revert:

```bash
git revert <bad-commit-sha>
git push pages <branch>
```

or, to roll back to a known-good commit without rewriting history:

```bash
git revert --no-edit <bad-commit-sha>..HEAD
git push pages <branch>
```

Avoid `git reset --hard` + force-push on the served branch — it rewrites
history that Cloudflare/GitHub Pages caches may still be pointing at, and
makes the rollback itself harder to audit later. A revert commit is safer
and keeps the history honest.

## Security headers — why this is split across two places

GitHub Pages serves static files directly and gives you **no way to set
custom HTTP response headers** from inside the repo. It does not read a
`_headers` file, a `netlify.toml`, or any GitHub Pages equivalent — that
mechanism only exists on Cloudflare Pages, Netlify, and similar platforms
that run their own edge layer with per-request config. This repo is
deployed to GitHub Pages, not Cloudflare Pages, so **any `_headers` file
placed here would be silently ignored** — don't add one and don't expect
one to do anything.

Because of that gap, security headers for this site are split into two
layers:

1. **In-repo defence (this repo):** a `<meta http-equiv="Content-Security-Policy" ...>`
   tag baked into each page's `<head>` (added during the security-hardening
   phase). This is the only header-like control that HTML itself can carry,
   and it's what actually reaches the browser regardless of host — GitHub
   Pages serves the HTML byte-for-byte, meta tags included.

2. **Cloudflare-side headers (owner action required, NOT in this repo):**
   real HTTP response headers can only be injected at the Cloudflare edge,
   since Cloudflare proxies every request to GitHub Pages before it reaches
   the visitor. The site owner must configure these manually in the
   Cloudflare dashboard under **Rules → Transform Rules → HTTP Response
   Header Modification** (or via a Cloudflare Worker, if finer control is
   ever needed):

   | Header | Value |
   |---|---|
   | `X-Content-Type-Options` | `nosniff` |
   | `Referrer-Policy` | `strict-origin-when-cross-origin` |
   | `X-Frame-Options` | `DENY` (equivalently, CSP `frame-ancestors 'none'`) |
   | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

   These four are not committed anywhere in this repository because there
   is no repo-level mechanism on GitHub Pages that can deliver them — they
   only take effect once configured by hand in the Cloudflare dashboard for
   the `freetimeline.pt` zone. If Cloudflare is ever removed from in front
   of the domain, these headers stop applying and the in-repo CSP meta tag
   becomes the only line of defence.

## Custom 404 page

`404.html` at the repo root is picked up automatically by GitHub Pages for
any unmatched path — no configuration needed beyond the file existing at
the root of the served branch. Its internal links use root-absolute paths
(`/about.html`, not `about.html`) because a 404 can be served from any
depth of URL, and relative links would resolve against the broken URL's
path rather than the site root.
