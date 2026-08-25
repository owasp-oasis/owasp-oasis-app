-- Bandit rule identifiers describe findings, not distinct detection tools.
-- Consolidate all stored Bandit rule labels into the canonical tool name.
UPDATE pull_requests
SET detection_tool = 'Bandit'
WHERE detection_tool IS NOT NULL
  AND (
    LOWER(TRIM(detection_tool)) = 'bandit'
    OR LOWER(TRIM(detection_tool)) LIKE 'bandit %'
    OR LOWER(TRIM(detection_tool)) LIKE 'bandit(%'
  );
