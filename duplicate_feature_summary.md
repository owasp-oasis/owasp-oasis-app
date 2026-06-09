# Duplicate Vote Classification Feature — Implementation Summary

## Overview
Implemented a complete **duplicate vote classification system** for OASIS validators to identify and track duplicate/related vulnerability fix PRs. When consensus is reached on duplicate votes, the system automatically manages PR relationships and auto-closes merged duplicates.

## Architecture

### Core Design
- **`user_votes.parent_pr_id`**: Raw user-selected parent PR (immutable)
- **`pull_requests.duplicate_of`**: Canonical root after chain-walking (dynamically resolved)
- **`pull_requests.closed_as_duplicate`**: Auto-close tracking flag (separate from GitHub state)
- **Chain resolution**: Happens at vote time AND during sync (handles transitive updates)

### Key Consensus Rules
- Duplicate votes earn **full reputation** (comment_score, bonuses, peer reactions)
- **Most-cited parent wins** when duplicate consensus reached
- **Auto-close triggers** when consensus + merged parent detected
- Duplicates **show with badge** in leaderboard (not hidden)
- Contributors' `prs_worked` still **includes duplicates**

## Files Modified (10 total)

### Code Files (8)

1. **schema.sql**
   - `pull_requests`: Added `consensus_duplicate`, `duplicate_of`, `closed_as_duplicate`
   - `repos`: Added `duplicate_count` (separate from `open_prs`)
   - `contributors`: Added `duplicates` (decision count)
   - `pr_comments`: Added `duplicate_of` (cited parent PR)
   - `user_votes`: Added `parent_pr_id` (raw parent selection)
   - ALTER statements included for migration

2. **github.ts**
   - `parseDecision()`: Updated to recognize `'duplicate'` decision
   - `parseDuplicateParent()`: New parser extracting parent PR from markdown table

3. **types.ts**
   - `Decision` type: Added `'duplicate'` variant
   - `ParticipantData`: Added `'duplicate'` to decision enum
   - `CommentData`: Added optional `duplicateOf?: number` field

4. **vote.ts**
   - `handleVote()`: Added duplicate decision branch
   - Parent PR ID validation and chain resolution at vote time
   - Consensus checking (duplicate consensus = more duplicates than accept/modify/reject)
   - Dynamic parent chain-walking (max 10 hops)
   - `user_votes` insert with `parent_pr_id`
   - `contributors.duplicates` counter increment
   - GitHub comment generation (Duplicate Report Summary template)

5. **db.ts**
   - `upsertPR()`: Preserve `duplicate_of` and `closed_as_duplicate` across updates
   - `updateRepoPRCount()`: Count both `open_prs` and `duplicate_count`
   - `rebuildDuplicates()`: New function handling:
     - Chain resolution with loop detection
     - Consensus checking
     - Most-cited parent selection
     - GitHub API calls to post comments and close PRs
     - `closed_as_duplicate` flag management
   - `rebuildContributors()`: Count duplicates from `pr_participants`
   - `upsertComments()`: Store `duplicate_of` from parsed comments

6. **sync.ts**
   - Import `rebuildDuplicates` and `parseDuplicateParent`
   - Track `consensusDuplicate` count during comment processing
   - Handle duplicate decision parsing for both validator bots and human validators
   - Count duplicate votes in consensus weighting (+1 reactions)
   - Call `rebuildDuplicates()` before `rebuildContributors()` in both cron and manual sync paths

7. **leaderboard.ts**
   - `handleRepos()`: Include `duplicate_count` field and `total_duplicate` consensus sum
   - `handlePRs()`: Include `consensus_duplicate`, `duplicate_of`, `closed_as_duplicate`
   - `handleContributors()`: Include `duplicates` count
   - `handleContributorDetail()`: Include `duplicates` in contributor row

### Documentation Files (2)

8. **comment_templates.md**
   - Added **Duplicate Report** template with Parent PR and Notes fields

9. **README.md**
   - Added `'duplicate'` to validator decision list with workflow explanation
   - Documented auto-close behavior when consensus + merged parent

### Schema & Standards

10. **tooling-standard.md**
   - Version bumped to **1.3** (was 1.0)
   - Added `decision` enum: `accept`, `modify`, `reject`, `duplicate`
   - Updated `validation_result` schema with:
     - `decision` field (structured enum)
     - `parent_pr` field (number | null) for duplicate citations
   - Added full duplicate validation example with markdown-to-JSON mapping
   - Documented duplicate consensus behavior in OASIS workflow

## Workflow

### User Flow
1. Validator votes `duplicate` on a PR, citing parent PR #123
2. Vote stored in `user_votes` with `parent_pr_id = 123`
3. Consensus checked: if duplicates > accept/modify/reject, proceed to step 4
4. During sync, `rebuildDuplicates()`:
   - Resolves chain to canonical root (e.g., 123 → 456 → 789)
   - Sets `pull_requests.duplicate_of = 789`
   - If parent (789) is merged, auto-posts GitHub comment and closes PR
   - Sets `closed_as_duplicate = 1`

### Reputation
- Duplicate votes count toward `comment_score` and `peer_score`
- Early-mover, early-bird, and influencer bonuses apply
- No changes to existing reputation formulas

### Leaderboard
- PRs with `duplicate_of != NULL` show with duplicate badge
- `duplicate_count` visible on repos tab
- Contributors' `duplicates` count visible on contributors tab
- All data available via API

## Implementation Notes

- **No frontend changes required** — leaderboard already returns PR data
- **Full backward compatibility** — all new fields optional/defaulted
- **Safe migrations** — ALTER TABLE statements provided for existing D1 instances
- **Transaction safety** — vote consensus checking and chain resolution atomic where possible
- **Loop prevention** — max 10 hops in chain-walking
- **GitHub API calls** use worker's GITHUB_TOKEN for authentication

## Testing Checklist

- [x] TypeScript compilation successful (zero errors)
- [x] Schema changes syntactically valid
- [x] Vote handler accepts parent_pr_id
- [x] Chain resolution logic handles cycles
- [x] Consensus detection works
- [x] Auto-close posting comments
- [x] Reputation counting includes duplicates
- [x] Leaderboard APIs return new fields
- [x] Documentation complete

