-- These immutable GitHub PR IDs were confirmed as OpenGrep findings. Their
-- legacy report template used "What SAST Found" without naming the scanner,
-- so earlier syncs classified them as SAST (unknown).
UPDATE pull_requests
SET detection_tool = 'OpenGrep'
WHERE detection_tool = 'SAST (unknown)'
  AND id IN (
    3640539392, -- angular #19
    3640550055, -- angular #21
    3640571937, -- angular #24
    3640616118, -- angular #25
    3640248809, -- pandas #5
    3672870345, -- playwright #8
    3861709678, -- react #14
    3861811068, -- react #33
    3861817187, -- react #37
    3861840782  -- react #42
  );
