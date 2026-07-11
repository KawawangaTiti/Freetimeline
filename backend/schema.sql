-- FreeTimeline — Cloudflare D1 schema (Level 2: accounts + publish + share)
-- Apply with:  wrangler d1 execute freetimeline --file backend/schema.sql
-- The DB lives in YOUR Cloudflare account — you own and control all of it.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,           -- uuid
  email        TEXT UNIQUE NOT NULL,       -- stored lowercase
  pw_hash      TEXT NOT NULL,              -- pbkdf2$iterations$saltB64$hashB64
  display_name TEXT,
  created_at   INTEGER NOT NULL            -- epoch ms
);

CREATE TABLE IF NOT EXISTS timelines (
  id         TEXT PRIMARY KEY,             -- uuid
  owner_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  app        TEXT NOT NULL DEFAULT 'universe',   -- 'universe' | 'biography'
  visibility TEXT NOT NULL DEFAULT 'private',    -- 'private' | 'public' | 'shared'
  data       TEXT NOT NULL,               -- the timeline JSON (same shape as export)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_timelines_owner ON timelines(owner_id);
CREATE INDEX IF NOT EXISTS idx_timelines_visibility ON timelines(visibility);

-- Explicit per-user access grants (for visibility = 'shared')
CREATE TABLE IF NOT EXISTS shares (
  timeline_id TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  permission  TEXT NOT NULL DEFAULT 'view',  -- 'view' | 'edit'
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (timeline_id, user_id),
  FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
