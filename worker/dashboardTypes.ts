/** Public, aggregate-only dashboard contract. No person identifiers. */
export interface DashboardTotals {
  registrations: number;
  active_reviewers_90d: number;
  projects: number;
  candidates: number;
  needs_review: number;
  trusted: number;
  accepted: number;
  closed: number;
  votes: number;
  accept: number;
  modify: number;
  reject: number;
  duplicate: number;
}
export interface DashboardProject {
  id: number; name: string; candidates: number;
  needs_review: number; trusted: number; accepted: number; closed: number;
}
export interface DashboardData {
  ok: true;
  generated_at: string;
  last_synced_at: string | null;
  sync_running: boolean;
  totals: DashboardTotals;
  projects: DashboardProject[];
  trend: { range: '30' | '90' | 'all'; from: string; to: string; points: { date: string; count: number }[] };
  activity: { from: string; to: string; days: { date: string; votes: number }[] };
  recent_fixes: { id: number; repo_name: string; number: number; title: string; status: string; updated_at: string | null }[];
}
