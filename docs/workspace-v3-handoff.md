# Handoff: OASIS Workspace Redesign

## Overview
This is a redesign of the signed-in Workspace app at owasp-oasis.org/workspace — the tool validators use to review AI-generated "candidate fixes" for open-source vulnerabilities, vote on them, and track them through to an upstream merge. It replaces the current `/workspace` pages and reconciles their navigation and terminology with the main site.

## About the design files
Everything under `reference/` is an **HTML design reference**, built as an interactive prototype — not production code to copy directly. `OASIS-Workspace-v3.html` is the full clickable prototype (open it in a browser to click through every screen and state). `OASIS-Style-Guide.html` is a readable spec of every rule below, with live-rendered examples. **Your job is to recreate this design in the target codebase's existing stack** (`owasp-oasis-app`, a React + TypeScript app — see `src/pages/*.tsx`, `src/components/*.tsx`), using its existing routing, component, and build patterns. Do not embed or iframe the HTML files in production.

## Fidelity
**High-fidelity.** Colors, type, spacing, and copy in the prototype are final. Match them exactly rather than approximating.

## Design system
`design-system/` is the full token and component package this redesign is built from — treat it as the source of truth for every value:
- `design-system/readme.md` — the complete written spec (read this first; it's more detailed than this README on every subsystem: color, type, spacing, icons, nav, filters, data display, forms, workflows, badges, accessibility, motion, voice).
- `design-system/tokens/*.css` — colors, typography, spacing, effects, fonts as CSS custom properties. Port these into the codebase's actual styling system (CSS modules, styled-components, Tailwind config, etc. — whatever `owasp-oasis-app` already uses); don't introduce a second styling approach.
- `design-system/components/<group>/*.jsx` + `.d.ts` — reference React implementations of each primitive (Button, SeverityBadge, VoteBar, DiffView, etc.) with inline styles. These show exact structure and behavior; reimplement them idiomatically in the target codebase (e.g. as styled/typed components using its conventions), don't paste the inline-style JSX as-is.
- `design-system/assets/logo/` — the three approved logo SVGs.

## Screens / views
All screens live inside the Workspace shell: a 64px sticky top nav (shared with the public site) + a 220px sticky left sidebar with 5 sections, over a `--paper` background.

### 1. Site nav (global, shared with marketing site)
- 64px, sticky top:0, frosted (`--nav-bg` background-color + 16px backdrop-blur), `--line` bottom border, z-index 100.
- Left: OASIS wordmark (36px tall) → link to Home.
- Center: nav links (Home, About, Overview, Workspace, Support, Sponsors, News & Events), 15px/500 `--gray-600`; active item ("Workspace") is 600 weight, `--blue-dark` text on `--blue-soft` pill background.
- Right, signed in: account pill (38px height, pill radius, `--line` border, white background, `--shadow-pill`) containing a 28px circular avatar (GitHub avatar image with navy-initials fallback if it 404s), "@{login}", and a chevron. Clicking opens the AccountMenu.
- Right, signed out: "Sign in" (outlined button) + "Join Team OASIS" (blue filled button).
- Responsive: ≥1280 full nav; 1040–1279 tighter link padding, still shows @login; 768–1039 avatar only, no @login text; <768 collapses non-nav links into a hamburger sheet.

### 2. AccountMenu (dropdown)
- Anchored to the account pill, opens 10px below, right-aligned, 232px wide, white, `--line` border, 10px radius, `--shadow-menu`.
- Header block: login name (14/700) + mono meta line "Validator · Rank #{n} · {rep} rep".
- Items in fixed order: **Preferences**, **Sync status**, divider, **Sign out**. Each row 14/600, 7px radius, hover `--gray-100`.
- Closes on outside click or Esc.

### 3. WorkspaceSidebar
- 220px wide, white background, `--line` right border, sticky at top:64px, full height.
- Mono eyebrow label "WORKSPACE" (10px, uppercase, letter-spacing .12em, `--muted`).
- Six nav rows, 14/600, 7px radius, 8px/10px padding: **My queue**, **Candidate fixes**, **Projects**, **Validators**, **Maintainers**, **Teams**. Active row: `--blue-soft` background, `--blue-dark` text. Optional trailing count pill (mono, 11px) on any row.
- No logo, no account controls here — those live only in the top nav.

### 4. My queue (Workspace home)
- Optional serif (DM Serif Display, 400, 28px) welcome banner on a `--gradient-hero` background: "{n} candidate fixes are waiting for your validation." + a "Start reviewing" primary button that jumps straight into the highest-severity fix that still needs the signed-in user's vote.
- Below: a small StatBlock (max 4 numbers: your votes, reputation, 90-day rank, etc.) and a short list preview of the queue.

### 5. Candidate fixes (the main review screen — 3 interchangeable layouts)
Toolbar (sticky, directly under the sidebar/nav header, same row every layout):
Search input (flex, max 360px, placeholder "Search PR #, repo, title, or CWE…", live-filtering, matches repo/title/CWE id/name and PR-number patterns like `14`, `#14`, `react#14`) → status SegmentedFilter (Need my vote (n) / Open / Trusted / All) → project select ("All projects" default) → layout switch (Split / Table / Focus) → right-aligned "Using your preferences · Edit" indicator when the user's saved filters are narrowing the list.

**Split layout** (default): left column ≈380–420px scrollable list of fix rows (title 14/600 2-line clamp, meta line `repo#number · CWE · age` in 12px mono `--muted`, severity + status chips on the right, focused row `--blue-soft`); right column is the detail panel (flexible width), both independently height-capped to the viewport so the sticky toolbar/nav never scroll out of view even when a PR description is very long.

**Table layout**: same rows as a sortable table (severity, status, repo, CWE, age columns; `--gray-100` header, `--gray-200` row rules, one sort key at a time with ▲/▼); clicking a row opens the detail as a right-side drawer (fixed, `min(640px, 94vw)` wide, full height, `--shadow-strong`, closes with an ✕ button or Esc).

**Focus layout**: one fix at a time, centered, max-width 880px card with `--shadow`; prev/next controls to move through the queue without a list visible.

**Detail panel** (shared across all three layouts):
- Header: fix title (20–22px/700), repo + PR number, severity chip, status chip, lifecycle chip (once applicable).
- Tab bar (sticky under the header): **Summary · Details · Diff · Comments (n)** — 14/600 underlined-on-active tabs (2px `--blue` bottom border), plus a right-aligned **Expand/Collapse** button (Lucide icon + label) that opens the panel as a centered full-screen overlay (`min(1040px, 94vw)` wide, near-full height, backdrop) for reading long content, and collapses back to the normal split/table/focus position. The selected tab persists when the user moves to a different fix.
- **Summary tab**: condensed overview — description, key stats, ConsensusBar (stacked bar of Accept/Modify/Reject/Duplicate vote counts + mono-count legend).
- **Details tab**: the entire GitHub PR body rendered verbatim — headings, paragraphs, inline/fenced code, embedded images, Mermaid diagrams (themed with the brand tokens), and `<details>` blocks as expanders. (The live example pulled into the prototype is a real PR: `github.com/owasp-oasis/react/pull/14`, a CWE-22 path-traversal fix.)
- **Diff tab**: DiffView component — file header, then a code diff. Default mode is **Split** (side-by-side), togglable to Unified, per the user's saved preference. Additions on `--green-soft`/`--green-ink`, deletions on `#fee2e2`/`#991b1b`, line numbers in `--gray-400`.
- **Comments tab**: threaded comments; each validator's own recorded vote surfaces as a DecisionChip inline ("You voted Accept").
- **Voting**: a VoteBar of four buttons — Accept / Modify / Reject / Duplicate — each with its first letter underlined (2px, 3px offset) as the visual key hint, not a keycap box. Selecting one reveals the vote form: Confidence (segmented Low/Medium/High, Medium default), Recommended action (select), **Comments** (textarea, required — red asterisk after the label), and for Duplicate only, **Parent PR number** (required, red asterisk). Primary "Submit vote" button (also triggered by ⌘/Ctrl+Enter) and a quiet "Cancel" (also triggered by Esc). On submit: a bottom-center toast ("Vote recorded on {repo}#{n}") and the list auto-advances to the next fix needing a vote.
- **Fix-automation panel**: shows the donor/partner tooling logos (AppSecAI, DryRun Security, etc.) that generated the candidate fix, each full-color, fixed 20px height, on its own plate color, 6px/10px padding, 6px radius, 1px `--line` border, tooltip "Tooling donated by {name}". Never recolor these logos or caption them with the tool name.

### 6. Projects / Validators / Maintainers
Same toolbar + table/card conventions as Candidate fixes, scoped to their own entities (projects being watched, the validator leaderboard, and upstream maintainers). Maintainer-facing actions (accept/decline/request changes on a submitted-upstream fix) are role-gated and require a confirmation step before any external GitHub write.

### 7. Preferences (opened from the AccountMenu)
A stack of white cards, in this order:
1. **Watched repositories** — search field, Select all / Clear, checkbox rows (language shown as mono meta on the right); checked items sort to the top of the list.
2. **Vulnerability classes (CWE)** — identical pattern, rows read like `CWE-22 Path traversal`.
3. **Minimum severity** — segmented Low/Medium/High/Critical.
4. **Review defaults** — toggles: hide closed fixes, hide fixes I've already voted on, keyboard shortcuts on/off.
5. **Candidate fixes layout** — Split/Table/Focus.
6. **Diff view** — Split (default)/Unified.
7. **Reset to defaults** (quiet button).
Every change saves immediately (no explicit Save button) with a "Preferences saved" toast. Elsewhere, list screens show a "Filtered by your preferences · Show all" affordance to bypass the saved filters for the current session.

### 8. Sync status (opened from the AccountMenu)
Per-repo sync health: Healthy (green dot, `--green`), Degraded (high-severity colors), Failed (critical colors), with the last sync time and an inline error message (what happened + what to do) for any failed repo.

### 9. Teams (new in v3)
Sidebar item **Teams** after Maintainers (`/workspace/teams`). Full rules, screen→component map, copy and states are in `design-system/readme.md` §17; the product source of truth is `owasp-oasis-app@preview` (`src/pages/workspace/TeamsTab.tsx`, `TeamWorkspace.tsx`, `teamApi.ts`, `TeamMemberSearch.tsx`, `TeamRepositorySearch.tsx`, `src/components/VoteForm.tsx`, `ContributorPanel.tsx`). **Reuse the existing preview API and data model** (`/api/teams/*`, D1 migrations 0007–0011); this redesign changes presentation only.
- **List**: tagline + "+ Create team" (signed-in); tabs **Your teams** (count) / **Explore teams**; Your teams inbox (Accept invitation · Accept ownership · Pending request); Explore leaderboard with All time (accepted outcomes, then validations) / Last 90 days (validations + per active contributor); search; directory rows (TeamAvatar, name, description or "An OASIS community team", "Owner · Invite only"); empty states.
- **Create team**: name* (80), description (500), how people join (By invitation only / Open membership), Team logo (Choose an icon | Custom image), optional homepage banner. Create opens the new team immediately.
- **Team workspace**: header (TeamAvatar, optional banner, "You’re the owner/an admin/a member", mode, status; "Invite members" or "Find a review"). Sections: Stats & activity · Members · Repository focus · Team administration (owner/admin only). Non-members see public stats + join panel only (Sign in with GitHub / Accept invitation / Request to join → Request pending / invitation-only note / not accepting new members).
- **Stats & activity**: 3 public metrics; Your Team badges (Team member, Team contributor — earned or in progress) + profile-level public opt-in; members-only recent activity; Leave team (non-owners) behind "Membership options" + ConfirmDialog.
- **Members**: live invite search (≥2 chars, excludes members and pending invites, "Invite @name by username" fallback); join requests (Accept/Decline); roster with search, "(you)", Manage (owner: Make admin/member; owner/admin: Remove + ConfirmDialog); pending invitations.
- **Repository focus**: live add search; focused list with "Find reviews →" (Candidate fixes filtered by repo) and Remove.
- **Team administration**: details, how people join, contribution badge bar (3/5/10/25 only), public badge display (Members only / Allow opted-in members…), Team visuals; Save changes enabled only when changed. Owner-only: Transfer ownership (recipient accepts; pending notice) and Archive/Reactivate, each behind ConfirmDialog. Archived teams lock settings and hide manage actions.
- **Vote form**: "Credit this validation" select at the top (Personal only + active teams you belong to); locked after submission.
- **Validator profile**: "Team badges · Shared by the member and Team admin", shown only when the Team allows public display **and** the member opted in.
- **Invariants**: one validation → one individual → at most one Team; Team stats aggregate & public; roster/activity/focus/attribution member-only; Team badges private by default; Team badges ≠ individual response badges; validator consensus, maintainer decisions and upstream outcomes stay separate layers.
- **Not simulated in the prototype** (implement from preview): loading ("Loading teams…"), error + Retry, partial media-upload failure warning after creation, suspended status.

## Interactions & behavior
- **Keyboard** (Candidate fixes screen, ignored while typing in a field, and disabled entirely if the user turned off "Keyboard shortcuts" in Preferences):
  - `↑` / `↓` — move to the previous/next fix in the current list; the active detail tab stays selected across the move.
  - `A` / `M` / `R` / `D` — choose Accept/Modify/Reject/Duplicate (press the same key again to clear the choice).
  - `⌘/Ctrl + Enter` — submit the vote form from anywhere inside it.
  - `Esc` — blur the focused field, else clear the current decision, else close the open menu/drawer, in that order.
- **Sticky layering**: top nav (0px) → screen header (64px) → toolbar row (≈128–133px) all remain fixed while the list/detail content scrolls beneath them; both the list and detail columns are height-capped to `calc(100vh - ~244px)` with internal scrolling so a long PR body can never push the sticky elements off-screen.
- **Expand/Collapse**: the detail panel's tab bar carries a button that promotes it to a centered, near-full-screen overlay (with a dismissible backdrop) for reading long content, and demotes it back to its normal position in the current layout.
- **Toasts**: bottom-center, dark (`--ink`) background, auto-dismiss after 2.6s, one at a time, confirmations only (e.g. "Vote recorded on react#14", "Preferences saved").
- **Motion**: 150ms color transitions, 180ms for button transform/shadow/background, 260ms toast enter, easing `cubic-bezier(.2,.7,.2,1)`. Buttons lift 1px and drop to 90% opacity on hover; disabled buttons are 45% opacity with a not-allowed cursor. Respect `prefers-reduced-motion` (drop translates/lifts, keep opacity fades).
- **Focus states**: every interactive element gets a 3px `rgba(76,217,100,.65)` outline, 3px offset — never suppressed.

## State management
Minimum state the real implementation needs:
- Signed-in user (login, avatar, role, rank, reputation).
- Per-screen list state: search query, status filter, project filter, layout choice, sort column/direction, and (derived) the filtered/sorted row set.
- Selected fix id, selected detail tab, detail-panel expanded/collapsed flag.
- In-progress vote draft per fix (decision, confidence, recommended action, comment text, parent PR number) until submitted.
- Teams: my teams + roles, inbox (invites, ownership offers, pending requests), directory + leaderboard period, open team id + section (keep both in the URL, as preview does), per-team settings draft, vote-form team choice (cleared after submit).
- User preferences object (watched repos, watched CWE classes, minimum severity, review-default toggles, default layout, default diff mode) — persisted server-side per user (the prototype persists it to `localStorage` only as a stand-in).
- Toast queue (one visible at a time).
- Sync status per watched repo (health, last synced, last error).

## Design tokens
Full machine-readable tokens are in `design-system/tokens/*.css` — import/port these rather than retyping values. Highlights:
- **Brand**: Navy `--blue-dark #0b4f8a`, Blue `--blue #0f6fcf`, Green Bright `--green-bright #4cd964` (primary CTA fill), Paper `--paper #f7fbff`, Ink `--ink #07111f`.
- **Borders**: `--line rgba(15,111,207,.16)` on every card/panel/table/input — always blue-tinted, never neutral gray.
- **Severity**: Critical `#fee2e2`/`#991b1b`, High `#ffedd5`/`#9a3412`, Medium `#fef9c3`/`#854d0e`, Low `#e7f1ff`/`#0b4f8a`.
- **Validator decisions**: Accept `#0d9e52`/`#e8f9ef`/`#0b7a40`, Modify `#e0a800`/`#fef9c3`/`#854d0e`, Reject `#d64545`/`#fee2e2`/`#991b1b`, Duplicate `#5b21b6`/`#ede9fe`/`#5b21b6` (solid/soft-bg/text).
- **Status**: Needs review `#fef9c3`/`#854d0e`, Trusted `#dcfce7`/`#166534`, Accepted `#ede9fe`/`#5b21b6`, Withdrawn `#ffedd5`/`#9a3412`, Rejected `#fee2e2`/`#991b1b`.
- **Type**: DM Serif Display 400 (one screen title or banner headline per screen, never smaller UI), Geist 400/500/600/700 (everything else), Geist Mono 400/600/700 (labels, chips, IDs, code, timestamps). Body text minimum 14px in Workspace.
- **Spacing**: 2/4/6/8/10/12/14/16/20/24/28/32/44/48/68/80px scale; radii 3/4/6/7/8/10/12/pill/50%; nav 64px, sidebar 220px, content padding 24px/28px.
- **Elevation**: flat + `--line` border by default; shadows reserved for modals/menus/toasts only (`--shadow`, `--shadow-menu`, `--shadow-strong`).

## Assets
- `design-system/assets/logo/oasis-logo.svg` (icon), `oasis-wordmark.svg` (default nav/footer mark), `oasis-wordmark-full.svg` (formal lockup) — also duplicated under `reference/logo/svg/`.
- Donor/partner logos (AppSecAI, DryRun Security) are pulled live from their own public brand asset URLs in the prototype (see the Diff-tab/fix-automation section of `OASIS-Workspace-v3.html`) — source real, licensed assets for production use rather than hotlinking.
- GitHub avatars: `https://github.com/{login}.png?size={2x}` with a navy-initials circular fallback on load error.

## Files
- `reference/OASIS-Workspace-v3.html` (+ `image-slot.js`) — the full interactive Workspace prototype including Teams (open directly in a browser; every screen, layout, and state described above is in here and clickable).
- `reference/OASIS-Style-Guide.html` — the same design system rendered as a readable, illustrated spec document.
- `reference/support.js` — runtime helper the prototype's HTML depends on to render (not needed by the production app).
- `reference/logo/` — logo SVGs.
- `design-system/` — full token/component package (see "Design system" above); `design-system/readme.md` is the canonical detailed spec for every rule referenced in this document.
