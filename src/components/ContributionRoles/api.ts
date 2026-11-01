import type { ContributionRole } from '../../../worker/contributionRoles'
export interface ContributionProfile {
  github_user_id: number; github_login: string; interests: ContributionRole[];
  other_interest: string; interests_updated_at: string | null
}
