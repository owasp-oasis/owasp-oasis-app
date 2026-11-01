import type { ContributionRole } from '../../../worker/contributionRoles'
export interface Assignment {
  id: number; repo_id: number; repository: string; role: 'steward' | 'contact';
  status: 'active' | 'ended'; assigned_at: string; ended_at: string | null
}
export interface ContributionProfile {
  github_user_id: number; github_login: string; interests: ContributionRole[];
  other_interest: string; interests_updated_at: string | null; assignments: Assignment[]
}
export function roleName(role: Assignment['role']) { return role === 'steward' ? 'Repo steward' : 'Maintainer contact' }
