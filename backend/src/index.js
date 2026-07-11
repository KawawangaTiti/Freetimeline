/* FreeTimeline API — Cloudflare Worker (Level 2: accounts + publish + share).
 *
 * Runs in YOUR Cloudflare account. No third-party auth service — we own the user
 * logic. Passwords are hashed with PBKDF2-HMAC-SHA256 (WebCrypto, native to the
 * Workers runtime — no libraries, no bundler). Sessions are stateless JWT (HS256)
 * carried in the Authorization header (not cookies → no cross-site cookie issues).
 *
 * Bindings (see wrangler.toml):
 *   env.DB            D1 database
 *   env.MAPS          R2 bucket (optional — map images)
 * Secrets (wrangler secret put …):
 *   env.JWT_SECRET    long random string used to sign sessions
 * Vars:
 *   env.ALLOWED_ORIGIN  e.g. "https://freetimeline.pt" (CORS)
 */

const PBKDF2_ITERS = 100000; // Cloudflare Workers caps PBKDF2 at 100k iterations (WebCrypto limit)
const JWT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export default {
  async fetch(request, env) {
    const origin = corsOrigin(request.headers.get('Origin') || '', env);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
    try {
      const res = await route(request, env);
      return cors(res, origin);
    } catch (err) {
      return cors(json({ error: err.message || 'Server error' }, err.status || 500), origin);
    }
  }
};

/* Reflect the request Origin when it's allowed (prod + localhost for dev), else prod. */
function corsOrigin(origin, env) {
  const prod = env.ALLOWED_ORIGIN || 'https://freetimeline.pt';
  if (origin === prod || origin === 'https://www.freetimeline.pt') return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return prod;
}

async function route(request, env) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;

  if (p === '/' || p === '/api' || p === '/api/health') return json({ ok: true, service: 'freetimeline-api' });

  // ---- auth ----
  if (p === '/api/register' && m === 'POST') return register(request, env);
  if (p === '/api/login' && m === 'POST') return login(request, env);
  if (p === '/api/me' && m === 'GET') { const u = await requireUser(request, env); return json({ user: publicUser(u) }); }

  // ---- public read (no auth) ----
  let mm;
  if ((mm = p.match(/^\/api\/public\/([\w-]+)$/)) && m === 'GET') return getPublic(env, mm[1]);

  // ---- timelines (auth) ----
  if (p === '/api/timelines' && m === 'GET') return listTimelines(request, env);
  if (p === '/api/timelines' && m === 'POST') return createTimeline(request, env);
  if ((mm = p.match(/^\/api\/timelines\/([\w-]+)$/))) {
    if (m === 'GET') return getTimeline(request, env, mm[1]);
    if (m === 'PUT') return updateTimeline(request, env, mm[1]);
    if (m === 'DELETE') return deleteTimeline(request, env, mm[1]);
  }
  if ((mm = p.match(/^\/api\/timelines\/([\w-]+)\/share$/)) && m === 'POST') return shareTimeline(request, env, mm[1]);

  return json({ error: 'Not found' }, 404);
}

/* ============================ auth ============================ */

async function register(request, env) {
  const { email, password, displayName } = await readJson(request);
  const em = normEmail(email);
  if (!em || !em.includes('@')) throw httpError(400, 'A valid email is required.');
  if (!password || password.length < 8) throw httpError(400, 'Password must be at least 8 characters.');
  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(em).first();
  if (exists) throw httpError(409, 'That email is already registered.');
  const id = crypto.randomUUID();
  const pw_hash = await hashPassword(password);
  await env.DB.prepare('INSERT INTO users (id, email, pw_hash, display_name, created_at) VALUES (?,?,?,?,?)')
    .bind(id, em, pw_hash, (displayName || '').slice(0, 80) || null, Date.now()).run();
  const user = { id, email: em, display_name: displayName || null };
  return json({ token: await signJwt(user, env), user: publicUser(user) });
}

async function login(request, env) {
  const { email, password } = await readJson(request);
  const em = normEmail(email);
  const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(em).first();
  if (!u || !(await verifyPassword(password || '', u.pw_hash))) throw httpError(401, 'Wrong email or password.');
  return json({ token: await signJwt(u, env), user: publicUser(u) });
}

async function requireUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = await verifyJwt(token, env);
  if (!payload) throw httpError(401, 'Please sign in.');
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first();
  if (!u) throw httpError(401, 'Please sign in.');
  return u;
}

/* ========================= timelines ========================= */

async function listTimelines(request, env) {
  const u = await requireUser(request, env);
  const mine = await env.DB.prepare(
    'SELECT id, title, app, visibility, updated_at, created_at FROM timelines WHERE owner_id = ? ORDER BY updated_at DESC'
  ).bind(u.id).all();
  const shared = await env.DB.prepare(
    `SELECT t.id, t.title, t.app, t.visibility, t.updated_at, t.created_at, s.permission
       FROM timelines t JOIN shares s ON s.timeline_id = t.id
      WHERE s.user_id = ? ORDER BY t.updated_at DESC`
  ).bind(u.id).all();
  return json({ mine: mine.results || [], sharedWithMe: shared.results || [] });
}

async function createTimeline(request, env) {
  const u = await requireUser(request, env);
  const b = await readJson(request);
  const data = JSON.stringify(b.data ?? {});
  if (data.length > 4_000_000) throw httpError(413, 'Timeline is too large (max ~4 MB).');
  const id = crypto.randomUUID(), now = Date.now();
  await env.DB.prepare('INSERT INTO timelines (id, owner_id, title, app, visibility, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, u.id, (b.title || 'Untitled').slice(0, 200), b.app === 'biography' ? 'biography' : 'universe',
      visOf(b.visibility), data, now, now).run();
  return json({ id, updated_at: now });
}

async function getTimeline(request, env, id) {
  const u = await requireUser(request, env);
  const t = await env.DB.prepare('SELECT * FROM timelines WHERE id = ?').bind(id).first();
  if (!t) throw httpError(404, 'Not found.');
  const perm = await accessLevel(env, t, u.id);
  if (!perm) throw httpError(403, 'You do not have access to this timeline.');
  return json({ timeline: rowToTimeline(t), permission: perm });
}

async function getPublic(env, id) {
  const t = await env.DB.prepare('SELECT * FROM timelines WHERE id = ? AND visibility = ?').bind(id, 'public').first();
  if (!t) throw httpError(404, 'Not found or not public.');
  return json({ timeline: rowToTimeline(t) });
}

async function updateTimeline(request, env, id) {
  const u = await requireUser(request, env);
  const t = await env.DB.prepare('SELECT * FROM timelines WHERE id = ?').bind(id).first();
  if (!t) throw httpError(404, 'Not found.');
  const perm = await accessLevel(env, t, u.id);
  if (perm !== 'owner' && perm !== 'edit') throw httpError(403, 'You cannot edit this timeline.');
  const b = await readJson(request);
  const fields = [], vals = [];
  if (b.data !== undefined) { const d = JSON.stringify(b.data); if (d.length > 4_000_000) throw httpError(413, 'Too large.'); fields.push('data = ?'); vals.push(d); }
  if (b.title !== undefined) { fields.push('title = ?'); vals.push(String(b.title).slice(0, 200)); }
  if (b.visibility !== undefined && perm === 'owner') { fields.push('visibility = ?'); vals.push(visOf(b.visibility)); }
  if (!fields.length) return json({ ok: true });
  const now = Date.now(); fields.push('updated_at = ?'); vals.push(now); vals.push(id);
  await env.DB.prepare(`UPDATE timelines SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true, updated_at: now });
}

async function deleteTimeline(request, env, id) {
  const u = await requireUser(request, env);
  const t = await env.DB.prepare('SELECT owner_id FROM timelines WHERE id = ?').bind(id).first();
  if (!t) throw httpError(404, 'Not found.');
  if (t.owner_id !== u.id) throw httpError(403, 'Only the owner can delete this.');
  await env.DB.prepare('DELETE FROM timelines WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function shareTimeline(request, env, id) {
  const u = await requireUser(request, env);
  const t = await env.DB.prepare('SELECT owner_id FROM timelines WHERE id = ?').bind(id).first();
  if (!t) throw httpError(404, 'Not found.');
  if (t.owner_id !== u.id) throw httpError(403, 'Only the owner can share this.');
  const b = await readJson(request);
  const target = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(normEmail(b.email)).first();
  if (!target) throw httpError(404, 'No user with that email. They must register first.');
  const permission = b.permission === 'edit' ? 'edit' : 'view';
  await env.DB.prepare('INSERT OR REPLACE INTO shares (timeline_id, user_id, permission, created_at) VALUES (?,?,?,?)')
    .bind(id, target.id, permission, Date.now()).run();
  // sharing implies the timeline is at least 'shared'
  await env.DB.prepare("UPDATE timelines SET visibility = 'shared' WHERE id = ? AND visibility = 'private'").bind(id).run();
  return json({ ok: true });
}

/* Returns 'owner' | 'edit' | 'view' | null for a user against a timeline row. */
async function accessLevel(env, t, userId) {
  if (t.owner_id === userId) return 'owner';
  if (t.visibility === 'public') return 'view';
  const s = await env.DB.prepare('SELECT permission FROM shares WHERE timeline_id = ? AND user_id = ?').bind(t.id, userId).first();
  if (s) return s.permission === 'edit' ? 'edit' : 'view';
  return null;
}

/* ========================= helpers ========================= */

function visOf(v) { return v === 'public' || v === 'shared' ? v : 'private'; }
function normEmail(e) { return String(e || '').trim().toLowerCase(); }
function publicUser(u) { return { id: u.id, email: u.email, displayName: u.display_name || null }; }
function rowToTimeline(t) {
  let data = {}; try { data = JSON.parse(t.data); } catch (_) {}
  return { id: t.id, title: t.title, app: t.app, visibility: t.visibility, data, updated_at: t.updated_at, created_at: t.created_at };
}
async function readJson(request) { try { return await request.json(); } catch (_) { throw httpError(400, 'Invalid JSON body.'); } }
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
function cors(res, origin) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}

/* ---- password hashing: PBKDF2-HMAC-SHA256 (WebCrypto) ---- */
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITERS);
  return `pbkdf2$${PBKDF2_ITERS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iters = parseInt(parts[1], 10), salt = unb64(parts[2]), expected = unb64(parts[3]);
  const bits = new Uint8Array(await pbkdf2(password, salt, iters));
  return timingSafeEqual(bits, expected);
}
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
}
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }

/* ---- JWT HS256 (WebCrypto) ---- */
async function signJwt(user, env) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Date.now();
  const payload = { sub: user.id, email: user.email, iat: Math.floor(now / 1000), exp: Math.floor((now + JWT_TTL_MS) / 1000) };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = await hmac(data, env.JWT_SECRET);
  return `${data}.${b64urlBytes(new Uint8Array(sig))}`;
}
async function verifyJwt(token, env) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const sig = await hmac(data, env.JWT_SECRET);
  if (b64urlBytes(new Uint8Array(sig)) !== parts[2]) return null;
  let payload; try { payload = JSON.parse(unb64urlStr(parts[1])); } catch (_) { return null; }
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  return payload;
}
async function hmac(data, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
}

/* ---- base64 / base64url ---- */
function b64(bytes) { let s = ''; for (const x of bytes) s += String.fromCharCode(x); return btoa(s); }
function unb64(str) { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function b64url(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlBytes(bytes) { return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64urlStr(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
