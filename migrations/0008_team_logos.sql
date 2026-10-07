-- Optional curated Team logo marks. Existing Teams keep the initials fallback.
ALTER TABLE teams ADD COLUMN logo_key TEXT NOT NULL DEFAULT 'initials';
