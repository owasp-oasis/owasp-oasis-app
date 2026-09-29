import type { PanelPR } from '../../components/PRPanel/PRPanel'
import type { WorkspacePreferences } from '../../workspacePreferences'
export interface CandidateFix extends PanelPR {
  repo_id: number; updated_at: string; participants: number; merged_upstream: number
  consensus_duplicate: number; comment_count: number; language?: string | null
  maintainer_decision?: string | null; maintainer_decision_at?: string | null; upstream_status?: string | null
}
export const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 }
export function finding(pr: Pick<CandidateFix, 'title'>) {
  return { severity: pr.title.match(/\b(critical|high|medium|low)\s+severity/i)?.[1].toLowerCase() ?? 'unknown', cwe: pr.title.match(/CWE-\d+/i)?.[0].toUpperCase() ?? '', cweName: pr.title.match(/CWE-\d+\s*\(([^)]+)\)/i)?.[1] ?? '' }
}
export function fixStatus(pr: PanelPR & Partial<CandidateFix>) {
  if (pr.merged_upstream && pr.state === 'closed') return 'Accepted'
  if (pr.state === 'closed') return pr.consensus_accept > 0 ? 'Withdrawn' : 'Rejected'
  const total = pr.consensus_accept + pr.consensus_modify + pr.consensus_reject
  return (pr.participants ?? 0) >= 10 && total > 0 && pr.consensus_accept / total >= .75 ? 'Trusted' : 'Needs review'
}
export function lifecycle(pr: Partial<CandidateFix>) {
  if (pr.upstream_status === 'merged') return 'Merged Upstream'
  if (pr.upstream_status === 'closed') return 'Closed Without Merge'
  if (pr.upstream_status === 'changes_requested') return 'Upstream Changes Requested'
  if (pr.upstream_status === 'failed') return 'Submission Failed'
  if (['open','pending'].includes(pr.upstream_status ?? '')) return 'Submitted Upstream'
  if (pr.maintainer_decision === 'declined') return 'Maintainer Declined'
  if (pr.maintainer_decision === 'accepted') return 'Maintainer Accepted'
  if (pr.maintainer_decision === 'changes_requested') return pr.maintainer_decision_at && pr.updated_at && pr.updated_at > pr.maintainer_decision_at ? 'Maintainer Review' : 'Changes Requested'
  return ''
}
export function matchesSearch(pr: CandidateFix, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const bareNumber = q.match(/^#?(\d+)$/)
  if (bareNumber) return String(pr.number).startsWith(bareNumber[1])
  const scopedNumber = q.match(/^(.+?)(?:\s+#?\s*|#)(\d+)$/)
  if (scopedNumber) return pr.repo_name.toLowerCase().includes(scopedNumber[1].trim()) && String(pr.number).startsWith(scopedNumber[2])
  const { cwe, cweName } = finding(pr)
  return `${pr.repo_name} ${pr.title} ${cwe} ${cweName}`.toLowerCase().includes(q)
}
export function matchesPreferences(pr: CandidateFix, preferences: WorkspacePreferences, votes: ReadonlyMap<number, unknown>) {
  const { severity, cwe } = finding(pr)
  return (!preferences.repositories.length || preferences.repositories.includes(pr.repo_id)) &&
    (!preferences.cwes.length || preferences.cwes.includes(cwe)) &&
    (preferences.minimumSeverity === 'low' || severityOrder[severity] >= severityOrder[preferences.minimumSeverity]) &&
    (!preferences.hideClosed || pr.state === 'open') && (!preferences.hideVoted || !votes.has(pr.id))
}
export function sortFixes(data: CandidateFix[]) {
  return [...data].sort((a,b) => severityOrder[finding(b).severity] - severityOrder[finding(a).severity] || Date.parse(b.updated_at || '') - Date.parse(a.updated_at || '') || a.id-b.id)
}
export const fixPath = (pr: Pick<CandidateFix,'repo_name'|'number'>) => `/workspace/fixes/${encodeURIComponent(pr.repo_name)}/${pr.number}`
export function relativeTime(iso?: string) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return 'Unknown'
  const days = Math.max(0, Math.floor((Date.now()-Date.parse(iso))/86400000))
  return days ? `${days}d ago` : 'today'
}
