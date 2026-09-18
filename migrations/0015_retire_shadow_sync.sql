-- Retire shadow sync pipeline tables after canonical promotion.
DROP TABLE IF EXISTS sync_shadow_entities;
DROP TABLE IF EXISTS sync_parity_runs;
DROP TABLE IF EXISTS sync_parity_differences;
