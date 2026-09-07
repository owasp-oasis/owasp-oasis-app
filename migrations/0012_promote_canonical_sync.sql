-- Promote the bounded canonical Workspace synchronizer after three consecutive
-- shadow parity matches. The application no longer routes scheduled or manual
-- work through the legacy pipeline, but retains historical legacy run records.

INSERT INTO sync_state (key, value)
VALUES ('canonical_sync_enabled', '1')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
