-- OWASP OASIS — D1 Database Schema
-- Run with: npx wrangler d1 execute oasis-db --file=schema.sql

CREATE TABLE IF NOT EXISTS registrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL DEFAULT '',
  email      TEXT    NOT NULL UNIQUE,
  github     TEXT    DEFAULT '',
  role       TEXT    DEFAULT '',
  ip_hash    TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  github     TEXT DEFAULT '',
  org        TEXT DEFAULT '',
  why        TEXT DEFAULT '',
  role       TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  UNIQUE(email, role)
);

CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_applications_email  ON applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_role   ON applications(role);
