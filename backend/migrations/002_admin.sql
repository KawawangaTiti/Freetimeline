-- Fase 2 admin — apply once:
--   wrangler d1 execute freetimeline --remote --file migrations/002_admin.sql
ALTER TABLE users ADD COLUMN suspended_at INTEGER;      -- NULL = active
ALTER TABLE users ADD COLUMN suspended_reason TEXT;

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL,
  actor_email TEXT NOT NULL,      -- denormalised, survives user delete
  action      TEXT NOT NULL,      -- 'user.suspend' | 'user.delete' | 'timeline.delete' | ...
  target_type TEXT NOT NULL,      -- 'user' | 'timeline'
  target_id   TEXT,
  detail      TEXT,               -- JSON
  ip          TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
