-- Semgrep renamed its open-source scanner edition from OSS to CE. Keep the
-- Workspace identity current while preserving all accumulated finding data.
UPDATE pull_requests
SET detection_tool = 'Semgrep CE'
WHERE detection_tool = 'Semgrep OSS';
