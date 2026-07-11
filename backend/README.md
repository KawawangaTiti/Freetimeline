# FreeTimeline API (Cloudflare) — setup

The backend for **accounts + publish + share**. It runs in **your** Cloudflare
account: the database (D1) and files (R2) are yours, and the auth logic is ours
(no third-party auth service). Passwords are hashed with PBKDF2 (WebCrypto),
sessions are stateless JWTs. **~0€** at this scale.

> Nothing here is live until you run the steps below. The main site is unaffected.

## One-time setup (≈10 min)

```bash
# 0) install the CLI and sign in (opens a browser)
npm i -g wrangler
wrangler login

cd backend

# 1) create the database and put its id in wrangler.toml (database_id = "…")
wrangler d1 create freetimeline

# 2) create the tables
wrangler d1 execute freetimeline --remote --file schema.sql

# 3) (optional) bucket for map images
wrangler r2 bucket create freetimeline-maps

# 4) set the session secret (a long random string)
wrangler secret put JWT_SECRET        # paste e.g. output of: openssl rand -base64 48

# 5) deploy
wrangler deploy
```

Wrangler prints your API URL, e.g. `https://freetimeline-api.<you>.workers.dev`.
(Optionally map a custom route like `https://api.freetimeline.pt` in the Cloudflare
dashboard → Workers → your worker → Triggers.)

## Wire the site to it

1. In `js/ft-account.js`, set `API` to your Worker URL.
2. Add `<script src="js/ft-account.js" defer></script>` to `universe.html` and
   `biography.html` (it's intentionally not loaded yet).
3. Add the API origin to the site's meta-CSP `connect-src`.

## Endpoints (all JSON; auth via `Authorization: Bearer <token>`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/register` | – | `{email,password,displayName?}` → `{token,user}` |
| POST | `/api/login` | – | `{email,password}` → `{token,user}` |
| GET | `/api/me` | ✓ | current user |
| GET | `/api/timelines` | ✓ | `{mine[], sharedWithMe[]}` |
| POST | `/api/timelines` | ✓ | `{title,app,visibility,data}` → `{id}` |
| GET | `/api/timelines/:id` | ✓ | owner/shared/public → `{timeline,permission}` |
| PUT | `/api/timelines/:id` | ✓ | update `data/title/visibility` (owner/editor) |
| DELETE | `/api/timelines/:id` | ✓ | owner only |
| POST | `/api/timelines/:id/share` | ✓ | `{email,permission}` (owner only) |
| GET | `/api/public/:id` | – | public read |

## Notes
- **Access model:** `private` (owner only), `public` (anyone can read), `shared`
  (explicit per-user grants in `shares`, `view`/`edit`). Enforced server-side.
- **RGPD:** this stores user data → update the privacy policy, add the API origin
  as a subprocessor note, and keep the promise wording as "data stays local by
  default; leaves only when you sign in / publish / share".
- **Local dev:** `wrangler dev` runs it at `http://localhost:8787`.
