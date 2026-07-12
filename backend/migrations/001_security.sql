-- Fase 0 security hardening — apply once to the existing DB:
--   wrangler d1 execute freetimeline --remote --file migrations/001_security.sql
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until INTEGER;
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key   TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket_key, window_start)
);
