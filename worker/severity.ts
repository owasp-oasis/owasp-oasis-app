/** Finding severity, shared by synchronization and live PR detail parsing. */
export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = typeof SEVERITIES[number];
export function normalizeSeverity(value: unknown): Severity | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return SEVERITIES.includes(normalized as Severity) ? normalized as Severity : null;
}
export function parseSeverity(title: string, body?: string | null): Severity | null {
  // Keep the existing title contract and precedence for older fixes.
  const legacy = title.match(/\b(critical|high|medium|low)\s+severity\b/i);
  if (legacy) return normalizeSeverity(legacy[1]);
  const text = (body ?? '').replace(/```[^\n]*\n[\s\S]*?```/g, '');
  const found: Severity[] = [];
  let inFindings = false;
  let severityColumn = -1;
  for (const line of text.split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+)/);
    if (heading) {
      inFindings = /^(What we found|Vulnerabilities Addressed)\s*$/i.test(heading[1].trim());
      severityColumn = -1;
      continue;
    }
    if (!inFindings) continue;
    const plain = line.replace(/\*\*|__/g, '').trim();
    const labelled = plain.match(/^(?:[-*+]\s*)?Severity\s*:\s*(critical|high|medium|low)\b/i);
    const finding = /^[-*+]\s*Finding\s*:/i.test(plain)
      ? plain.match(/\b(critical|high|medium|low)\s+severity\b/i) : null;
    const value = normalizeSeverity(labelled?.[1] ?? finding?.[1]);
    if (value) found.push(value);
    if (plain.startsWith('|')) {
      const cells = plain.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      const header = cells.findIndex(cell => /^Severity$/i.test(cell));
      if (header >= 0) severityColumn = header;
      else if (severityColumn >= 0) {
        const severity = normalizeSeverity(cells[severityColumn]);
        if (severity) found.push(severity);
      }
    }
  }
  // A grouped remediation uses the highest explicit finding severity.
  return SEVERITIES.slice().reverse().find(value => found.includes(value)) ?? null;
}
