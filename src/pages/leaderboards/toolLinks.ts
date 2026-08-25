const TOOL_URLS: Readonly<Record<string, string>> = {
  appsecai: 'https://www.appsecai.io/',
  bandit: 'https://github.com/pycqa/bandit',
  dryrun: 'https://www.dryrun.security/',
  'dryrun security': 'https://www.dryrun.security/',
  metis: 'https://github.com/arm/metis',
  semgrep: 'https://github.com/semgrep/semgrep',
  'semgrep oss': 'https://github.com/semgrep/semgrep',
}

export function getToolUrl(name: string): string | null {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return TOOL_URLS[key] ?? null
}
