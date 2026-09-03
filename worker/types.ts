/**
 * Shared TypeScript interfaces for the OWASP OASIS Cloudflare Worker.
 */

export interface Env {
  DB: D1Database;
  RATE_KV: KVNamespace;
  ASSETS: Fetcher;
  GITHUB_TOKEN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ADMIN_SECRET: string;
  HUBSPOT_TOKEN?: string;
  HUBSPOT_PROPERTY_MAP?: string;
  TOKEN_ENCRYPTION_KEY: string;
  ENVIRONMENT: string;
  OAUTH_CALLBACK_URL: string;
  SHADOW_SYNC_WORKFLOW?: Workflow<ShadowSyncParams>;
  CANONICAL_SYNC_WORKFLOW?: Workflow<CanonicalSyncParams>;
  ORPHAN_CLEANUP_WORKFLOW?: Workflow<OrphanCleanupParams>;
  HUBSPOT_SYNC_WORKFLOW?: Workflow<HubSpotSyncParams>;
  MANUAL_SYNC_JOB_WORKFLOW?: Workflow<ManualSyncJobParams>;
}

export interface OrphanCleanupActor {
  githubUserId: number | null;
  githubLogin: string;
  role: 'admin' | 'moderator' | 'member' | 'guest';
}

export interface OrphanCleanupParams {
  jobRunId: string;
  pipelineRunId: string;
  chunk: number;
  legacyParentRunId?: string;
  auditActor?: OrphanCleanupActor;
}

export type ShadowSyncParams =
  | { action: 'start'; legacyPipelineRunId: string; canonicalCutoffAt: string }
  | { action: 'repository'; pipelineRunId: string }
  | { action: 'pull_request'; pipelineRunId: string }
  | { action: 'finalize'; pipelineRunId: string };

export type CanonicalSyncParams =
  | { action: 'inventory'; pipelineRunId: string; pipelineKind?: WorkspacePipelineKind }
  | { action: 'sync'; pipelineRunId: string; pipelineKind?: WorkspacePipelineKind }
  | { action: 'reaction'; pipelineRunId: string; pipelineKind?: WorkspacePipelineKind }
  | { action: 'duplicate'; pipelineRunId: string; pipelineKind?: WorkspacePipelineKind };

export type WorkspacePipelineKind = 'legacy' | 'canonical';

export interface HubSpotSyncParams {
  jobRunId: string;
  chunk: number;
  maxQueueId: number;
  eligibleAt: string;
  auditActor?: OrphanCleanupActor;
}

export type ManualSyncJobKey =
  | 'repository_inventory'
  | 'pull_request_catalog'
  | 'upstream_merge_status'
  | 'pull_request_comments'
  | 'comment_reactions'
  | 'vote_projection'
  | 'duplicate_resolution'
  | 'contributor_scores';

export interface ManualSyncJobParams {
  jobRunId: string;
  pipelineRunId: string;
  jobKey: ManualSyncJobKey;
  pipeline: WorkspacePipelineKind;
  chunk: number;
  auditActor: OrphanCleanupActor;
}

export interface SyncResult {
  ok: boolean;
  message: string;
  stats: SyncStats;
  done?: boolean;
  cursor?: string;
  total_repos?: number;
}

export interface SyncStats {
  repos: number;
  prs: number;
  comments: number;
}

export interface ParticipantData {
  interactions: number;
  non_oasis_interactions: number;
  decision: 'accept' | 'modify' | 'reject' | 'duplicate' | null;
  reactions_received: number;
  reactions_given: number;  // reactions this contributor gave on OTHER people's OASIS comments
}

/**
 * One OASIS-template comment posted on a tracked PR.
 * Written to the pr_comments table during sync.
 */
export interface CommentData {
  id: number;            // GitHub comment ID (primary key)
  prId: number;
  repoName: string;
  prNumber: number;
  login: string;         // author of the comment
  decision: 'accept' | 'modify' | 'reject' | 'duplicate' | null;
  duplicateOf?: number;  // cited parent PR id (for duplicate decisions; optional)
  createdAt: string;     // ISO-8601
  prCreatedAt: string;   // ISO-8601, denorm from pull_requests.created_at
}

/**
 * One reaction on an OASIS-template comment.
 * Written to the comment_reactions table during sync.
 */
export interface ReactionData {
  commentId: number;   // FK → pr_comments.id
  reactor: string;     // GitHub login of the reactor
  content: string;     // '+1', '-1', 'heart', 'hooray', 'rocket', 'laugh', 'confused', etc.
  isPositive: boolean; // true for +1/heart/hooray/rocket/laugh; false for -1/confused
}

export interface PRResult {
  comments: number;
}

export type ValidationResult<T = string> =
  | { ok: true;  val: T }
  | { ok: false; error: string };

export interface ParsedQuery {
  sort: string;
  dir: 'ASC' | 'DESC';
  q: string;
}
