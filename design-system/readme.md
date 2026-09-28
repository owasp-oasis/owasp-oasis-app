# OASIS Design System

The design system for **OASIS** (Open Automated Security Initiative for Software), an officially accepted OWASP project. It covers two surfaces that share one brand:

- **Public site**: owasp-oasis.org marketing and information pages (Home, About, Overview, Support, Sponsors, News & Events, Brand Guide).
- **Workspace**: the signed-in application where validators review candidate fixes, vote, and track them upstream.

**Canonical sources**
- Brand foundations: `owasp-oasis/owasp-oasis-app@main` → `src/index.css`, `src/pages/BrandGuide.tsx`, `src/pages/Home.css`, `src/components/Nav.*`, `src/components/Footer.*`.
- Workspace: **OASIS Workspace v2** mockup (frozen copy in `ui_kits/workspace/`). It replaces the live `/workspace` pages.
- Preview features: `owasp-oasis/owasp-oasis-app@preview` → `Product/reputation-badging-system.md` (response badges, maintainer and upstream lifecycle).
- **Conflict rule:** when the live site and Workspace v2 disagree, **Workspace v2 wins** and the site should be updated to match.

Rule language: **MUST** = required; **SHOULD** = default unless there is a written reason; **MAY** = allowed judgment call.

---

## Index

| Path | What it is |
|---|---|
| `styles.css` | Entry point. Link this one file. Imports every token file. |
| `tokens/colors.css` | Palette, semantic aliases, severity, decisions, status, reserved dark tokens |
| `tokens/typography.css` | Font stacks and both type scales (site, Workspace) |
| `tokens/spacing.css` | Spacing, radii, layout sizes, breakpoints |
| `tokens/effects.css` | Shadows, blur, motion, z-index |
| `tokens/fonts.css` | Webfont loading (DM Serif Display, Geist, Geist Mono) |
| `tokens/base.css` | Resets, link and focus defaults |
| `guidelines/*.html` | Foundation specimen cards |
| `components/<group>/` | React primitives (`.jsx` + `.d.ts` + `.prompt.md`) and one card per group |
| `ui_kits/workspace/` | Canonical Workspace v2, fully interactive |
| `ui_kits/site/` | Public site page templates (Home, inner page) |
| `assets/logo/` | `oasis-logo.svg` (icon), `oasis-wordmark.svg`, `oasis-wordmark-full.svg` |
| `SKILL.md` | Agent Skill manifest |

**Components:** Button, Eyebrow, Card, Avatar · SeverityBadge, StatusChip, DecisionChip, LifecycleChip, CweTag · SearchInput, SegmentedFilter, Field, Checkbox · StatBlock, ConsensusBar, DiffView, DonorLogo · VoteBar · ResponseBadgeCard · Toast, EmptyState · SiteNav, AccountMenu, WorkspaceSidebar, SiteFooter.

**Intentional additions** (no counterpart in the live code, taken from Workspace v2 or the preview spec): LifecycleChip and ResponseBadgeCard (preview spec), VoteBar, ConsensusBar, DiffView, DonorLogo, SegmentedFilter, Checkbox rows, WorkspaceSidebar and AccountMenu (v2).

---

## 1. Brand foundations

### Name
- MUST write **OASIS** in all caps. Never "Oasis", "oasis", or "OWASP OASIS" as the standalone name.
- Spell out "Open Automated Security Initiative for Software" on first mention in formal documents.
- OWASP relationship, verbatim: *"OASIS is an officially accepted OWASP project."*
- The community is **Team OASIS**.

### Brand qualities and principles
- Qualities: **Urgency**, **Credibility**, **Community**.
- Principles (capitalized): **Impact**, **Credibility**, **Village**.

### Logo
| Variant | File | Use | Minimum |
|---|---|---|---|
| Icon | `oasis-logo.svg` | favicons, avatars, tight spaces | 24px high |
| Wordmark | `oasis-wordmark.svg` | **default**: nav (36px high), footer (28px) | 120px wide |
| Full lockup | `oasis-wordmark-full.svg` | formal documents, presentations | 200px wide |

- Clear space: at least 1× the shield height on all sides.
- Approved backgrounds: White `#fff`, Paper `#f7fbff`, Navy `#0b4f8a`. On any dark surface (navy, ink, gray-800) the wordmark MUST sit on a **white plate** (`#fff`, radius 8px, padding 8px 14px), as the site footer does.
- MUST NOT recolor, rotate, skew, add shadows or effects, place on photos or low-contrast grounds, or use PNG when SVG exists.
- **One logo per screen.** In Workspace the logo appears only in the SiteNav, never in the sidebar or in panels.
- OWASP co-branding: follow both guides; where they differ, OWASP rules govern the OWASP marks.

### Donor and partner logos (fix-automation tooling)
- MUST always be **full color**, the donor's original artwork, never recolored or monochromed.
- Fixed height: **20px** inside panels and meta rows; **32px** on the Sponsors page.
- Sit on the donor's own plate color (e.g. AppSecAI on `#fff`, DryRun Security on `#07111f`) with padding 6px 10px, radius 6px, 1px `--line` border.
- Clear space: 8px minimum around the plate.
- MUST NOT add the tool name as subtext under a donor logo. The `title` tooltip reads "Tooling donated by {name}".

---

## 2. Color system

Navy anchors the palette and a green "circuit" accent carries energy. All values are CSS custom properties; MUST NOT hard-code hex in new work.

### Base palette
| Token | Hex | Role |
|---|---|---|
| `--blue-dark` (Navy) | #0b4f8a | Primary brand. Logo shell, gradient start, text on green buttons, active nav text |
| `--blue` | #0f6fcf | Interactive: links, secondary buttons, eyebrows, focus of selection, checkboxes |
| `--blue-mid` | #1558d6 | Emphasis line in hero headlines (italic), hover on outline buttons |
| `--blue-hover` | #1280ed | Hover for `--blue` fills; gradient card end |
| `--blue-soft` | #e7f1ff | Selected rows, active nav fill, low-severity chip, icon boxes |
| `--blue-sky` | #9fd0ff | Mono labels on ink sections only |
| `--green` | #0d9e52 | Success, Accept solid, kicker text, "Do" callouts |
| `--green-bright` | #4cd964 | **Primary CTA background**, focus ring, eyebrows on navy |
| `--green-soft` | #e8f9ef | Success backgrounds, Accept soft fill, diff additions |
| `--green-ink` | #0b7a40 | Green text on green-soft |
| `--paper` | #f7fbff | Page background (site and Workspace) |
| `--ink` | #07111f | Primary text; dark section and toast background |
| `--ink-soft` | #243247 | Body text |
| `--muted` | #61738b | Captions, metadata, placeholders |
| `--gray-800` | #1e2d3d | Footer background |
| `--gray-600` | #4a5c70 | Inactive nav links, secondary text |
| `--gray-400` | #9aacbe | Disabled, footer text, line numbers |
| `--gray-200` | #e8edf5 | Inner dividers, table row rules |
| `--gray-100` | #f4f7fb | Table headers, code blocks, segmented track |

### Lines
- `--line` rgba(15,111,207,.16): default for **every** card, panel, table and input border.
- `--line-strong` rgba(15,111,207,.28): inputs, hovered or selected cards, quiet buttons.
- Borders are **blue-tinted, never neutral gray**. Use `--gray-200` only for dividers *inside* a bordered container.

### Gradients
- `--gradient-hero` (135°, #0b4f8a → #0f6fcf): inner-page heroes and the Workspace welcome banner **only**.
- `--gradient-card` (155°, navy → blue → #1280ed): the Home registration card only.
- `--gradient-wash`: faint blue-to-green tint behind the Home hero only.
- MUST NOT invent other gradients or use gradients on buttons, chips or cards.

### Semantic systems (Workspace)
Each has a soft background with dark text (chips) and, for decisions, a solid color (buttons and bars). All pairs pass **WCAG 2.2 AA (4.5:1)** at 10–14px.

**Severity** is the **only** color used to describe a finding.
| Level | bg | fg |
|---|---|---|
| Critical | #fee2e2 | #991b1b |
| High | #ffedd5 | #9a3412 |
| Medium | #fef9c3 | #854d0e |
| Low | #e7f1ff | #0b4f8a |

**CWE classes are neutral:** Geist Mono ID in `--ink` plus a plain-language name in `--ink-soft` (e.g. `CWE-22 Path traversal`). MUST NOT assign hues to CWE families.

**Validator decisions**
| Decision | Solid | Soft bg | Text | Key |
|---|---|---|---|---|
| Accept | #0d9e52 | #e8f9ef | #0b7a40 | A |
| Modify | #e0a800 | #fef9c3 | #854d0e | M |
| Reject | #d64545 | #fee2e2 | #991b1b | R |
| Duplicate | #5b21b6 | #ede9fe | #5b21b6 | D |
Solid colors are for fills with **white text only when the button is selected** (Modify selected uses #fff on #e0a800 at 14px/700, which passes only at large or bold sizes, so keep it ≥14px bold). Never use a solid decision color as body text.

**Candidate-fix status** (validator consensus)
| Status | bg | fg |
|---|---|---|
| Needs review | #fef9c3 | #854d0e |
| Trusted | #dcfce7 | #166534 |
| Accepted | #ede9fe | #5b21b6 |
| Withdrawn | #ffedd5 | #9a3412 |
| Rejected | #fee2e2 | #991b1b |

**Lifecycle** (maintainer and upstream, preview branch): see §11.

**Site badges** (marketing only): green #e6faea/#1a7a2e "Upstream accepted"; blue `--blue-soft`/`--blue-dark` "In validation"; purple #ede9fe/#5b21b6 "AI-generated".

### Contrast pairs (verified AA)
- `--ink` on `--paper`/white: 18.9:1 · `--ink-soft` on white: 13.6:1 · `--muted` on white: 4.9:1 (minimum for any meta text; MUST NOT go lighter for text).
- `--blue-dark` on `--green-bright` (primary button): 5.4:1 · white on `--blue`: 4.9:1 · white on navy: 8.3:1.
- `--gray-400` on `--gray-800` (footer): 4.9:1.
- On the gradient banner, body text MUST be white or `--blue-soft`; the green eyebrow `--green-bright` on navy is 5.4:1 (headline-scale mono only).

### Dark mode
Reserved only. `[data-theme="dark"]` aliases exist in `tokens/colors.css` so components written against semantic aliases will adapt later. MUST NOT ship a dark theme until it is designed.

---

## 3. Typography

Three typefaces, each with one job. MUST NOT mix them outside their roles.

| Family | Token | Weights | Role |
|---|---|---|---|
| **DM Serif Display** | `--serif` | 400 (+ italic) | Hero, page and section headings; Workspace screen titles and the welcome-banner headline. **Never** in body, UI controls, tables, chips or eyebrows. |
| **Geist** | `--sans` | 400 / 500 / 600 / 700 | All body, UI, navigation, buttons, table text |
| **Geist Mono** | `--mono` | 400 / 600 / 700 | Eyebrows, uppercase labels, chips, IDs (PR #, CWE, CVE), numbers in tables, timestamps, code, keyboard hints |

Font loading: production self-hosts via `@fontsource`; this package loads the same families from Google Fonts.

**Serif rule for Workspace:** serif MAY appear **once per screen**, as the screen title (34px) or the My queue banner headline (28px). Panels, tabs, dialogs and forms use Geist 700.

### Marketing scale
| Role | Font | Size | LH | Weight |
|---|---|---|---|---|
| Home headline | Serif | clamp(38px, 4vw, 48px) | 1.08 | 400 |
| Section h2 | Serif | clamp(34px, 4.3vw, 56px) | 1.03 | 400 |
| Inner page h1 | Sans | clamp(2rem, 5vw, 3rem) | 1.2 | 700 |
| Lede | Sans | clamp(18px, 2vw, 21px) | 1.55 | 400 |
| Section intro | Sans | 17px | 1.65 | 400, `--muted` |
| Card title h3 | Sans | 19px | 1.2 | 700 |
| Card body | Sans | 14.5px | 1.62 | 400, `--muted` |
| Body | Sans | 16px | 1.7 | 400 |
| Eyebrow | Mono | 12px, uppercase, .14em | — | 700, `--blue` |
| Kicker pill | Mono | 12px, .03em | — | 600, `--green` on `--green-soft` |

### Workspace scale (comfortable density)
| Role | Font | Size | Weight |
|---|---|---|---|
| Screen title | Serif | 34px / 1.15 | 400 |
| Banner headline | Serif | 28px / 1.2 | 400 |
| Panel / section title | Sans | 18px | 700 |
| PR title in detail | Sans | 20–22px | 700 |
| Nav links | Sans | 15px | 500 (600 active) |
| Body, form text | Sans | 14px / 1.6–1.7 | 400 |
| Table cells, meta | Sans | 13px | 400–600 |
| Code, diff | Mono | 12.5px / 1.7 | 400 |
| Field label | Mono | 11px uppercase .08em | 700 |
| Chip, stat label | Mono | 10px uppercase .06–.08em | 700 |

Minimums: body text MUST be ≥14px in Workspace and ≥16px on the site. Mono 10px is allowed only for uppercase chips and labels.

### Text rules
- Sentence case for all headings, buttons, tabs and menu items ("Candidate fixes", not "Candidate Fixes"). Exceptions: proper nouns and lifecycle state names, which are Title Case by spec (Maintainer Review, Merged Upstream).
- `text-wrap: pretty` on headings and paragraphs; measure ≤72ch for body.
- Numbers in tables and stats use Geist Mono or tabular Geist 700.

---

## 4. Spacing, grid, layout

### Spacing tokens (px)
2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 28 · 32 · 44 · 48 · 68 · 80 (`--space-1` … `--space-20`). Use `gap` on flex and grid, not margins between siblings.

Common values:
- Card padding: **22px** (site), **18–22px** (Workspace panels), 16px (compact rows).
- Page gutter: **24px** (Workspace content 24px 28px).
- Gap between cards: 16px (site grids), 20px (Workspace columns).
- Section padding (site): 80px (`.section`), 68px (Home sections), 48px (`.section-sm`).

### Radii
3 (inline code) · 4 (kbd, code chip) · 6 (inputs, nav links, small buttons) · 7 (sidebar items, menu rows, segmented items) · **8 (default: cards, buttons, panels)** · 10 (menus, toasts, stat panels) · 12 (Workspace hero banner) · 100/pill (chips, badges, kicker) · 50% (avatars).

### Elevation
Most surfaces are flat with a `--line` border. Shadows are navy-tinted and reserved:
- `--shadow` 0 18px 50px rgba(11,79,138,.14): modals, registration card.
- `--shadow-menu` 0 14px 36px rgba(11,79,138,.18): dropdowns (account menu).
- `--shadow-strong` .24: toast.
- `--shadow-btn-blue`: blue buttons only.
- MUST NOT put shadows on regular cards, table rows or chips.

### Layout frames
**Public site**
- Nav 72px today; SHOULD migrate to the 64px Workspace nav (conflict rule).
- Content container **1080px** max, 24px side padding (`.wrap` = min(1080px, 100% − 40px)).
- Page rhythm: page-hero (gradient) → alternating sections (paper / white / ink) → footer (gray-800).

**Workspace**
- Sticky SiteNav **64px** (frosted `--nav-bg` + 16px blur, `--line` bottom border, z 100).
- Sidebar **220px**, white, `--line` right border, sticky at top 64px, full remaining height.
- Content: fluid, paper background, padding 24px 28px. Screen header sticky at top 64px (z 20).
- Candidate fixes Split layout: list column (≈380–420px) + detail column (minmax(0,1fr)); detail tabs sticky at top 152px.

### Breakpoints
| Width | Behavior |
|---|---|
| ≥1280 | Site hero 2-col; 3–4-col grids |
| 1040–1279 | SiteNav shows @login; site grids 2-col |
| 768–1039 | SiteNav: tighter link padding (8px), avatar only (no @login) |
| <768 | SiteNav links collapse to hamburger sheet (full-width, 13px 24px rows); Workspace sidebar hidden |
| <680 | Site grids 1-col; full-width buttons in hero and final CTA |

Hit targets MUST be ≥44px on touch layouts; desktop controls may be 38px.

---

## 5. Iconography
- **Lucide** is the standard (open source, matches existing strokes). Load from CDN or `lucide-react`.
- Stroke 1.5 (16px menu icons), 2 (21px feature icons), 2.25 (17px icons inside buttons). Round caps and joins. `fill: none`, `stroke: currentColor`.
- Sizes: 12 (chevrons), 16 (menus, inputs), 17 (in buttons), 20–21 (feature and icon boxes).
- Icon boxes (site feature cards): 42px square, radius 8px, `--blue-soft`/`--blue` or `--green-soft`/`--green`.
- Arrows in CTAs sit to the **right** of the label.
- **No emoji** in product UI. (The live Brand Guide's principle cards use ⚡🔍🌐; replace them with Lucide `zap`, `search`, `globe` when that page is updated.)
- Unicode glyphs allowed only as decision marks in dense lists: ✓ Accept, ~ Modify, ✗ Reject, ⧉ Duplicate.

---

## 6. Navigation and menus

### Information architecture (reconciled naming map)
| Canonical label | Replaces (live / preview) | Route |
|---|---|---|
| **Workspace** (top nav) | Leaderboards → Workspace | `/workspace` |
| **My queue** | Dashboard (preview) | `/workspace` |
| **Candidate fixes** | PRs tab | `/workspace/fixes`, detail `/workspace/fixes/{repo}/{number}` |
| **Projects** | Projects | `/workspace/projects` |
| **Validators** | Contributors | `/workspace/validators` |
| **Maintainers** | Maintainers | `/workspace/maintainers` |
| **Fix automation** | Tools tab | `/workspace/fix-automation` (proposed) |
| **Preferences** | — | account menu → `/workspace/preferences` |
| **Sync status** | Sync status page | account menu → `/workspace/sync` |

Rationale: the Brand Guide's canonical terms are *candidate fix*, *validator* and *fix automation*; "PR" and "contributor" are listed as terms to avoid. Say "PR" only for GitHub objects (e.g. "Open on GitHub", "Parent PR number").

### SiteNav (global, one per page)
Order: logo · Home · About · Overview · **Workspace** · Support · Sponsors · News & Events · account area.
- Link: 15px/500 `--gray-600`, padding 6px 14px, radius 6px. Hover: `--blue` text on `--blue-soft`. Active: 600 `--blue-dark` on `--blue-soft`.
- Signed out: "Sign in" (outlined, `--gray-200` border) + "Join Team OASIS" (blue button).
- Signed in: **account pill** (38px, radius 999, avatar 28px + @login + chevron). Open state: white fill, `--line-strong` border, `--shadow-pill-open`, chevron rotated 180°.

### AccountMenu
Anchored right, 10px below the pill, 232px wide, radius 10, `--shadow-menu`. Header: login (14/700) + mono meta "Validator · Rank #7 · 48.6 rep". Items (14/600, 16px Lucide icon, row radius 7): **Preferences**, **Sync status**, divider, **Sign out**. Click outside or Esc closes it. Admin-only items go above the divider.

### WorkspaceSidebar
Mono eyebrow "Workspace" then items: My queue · Candidate fixes · Projects · Validators · Maintainers. Row: 14/600, padding 8px 10px, radius 7. Active: `--blue-soft` fill, `--blue-dark` text. Optional count pill (mono 11px). No logo and no account block in the sidebar.

### Mobile sheet (<768)
The hamburger (40px, three 22×2px navy bars) opens a full-width sheet under the nav with rows 16px, padding 13px 24px; the active row has a `--blue-soft` fill.

### Tabs (detail views)
Candidate fix detail tabs: **Summary · Details · Diff · Comments (n)**. Underline style: 14/600, active `--ink` with 2px `--blue` bottom border, inactive `--gray-600`. Tabs are sticky under the screen header. The selected tab MUST persist when the user switches to another fix.

---

## 7. Filters, search, sorting, preferences

### Order of controls (left → right, one toolbar row)
1. **SearchInput** (flex 1, max 360px), placeholder "Search PR #, repo, title, or CWE…"
2. **SegmentedFilter** for status: *Need my vote (n)* · *Open* · *Trusted* · *All*
3. **Project select** ("All projects" default)
4. **Layout switch**: Split · Table · Focus (mono key badges 1a/1b/1c)
5. Right-aligned: a "Using your preferences · Edit" indicator when preferences are applied

### Search behavior
- Matches repo, title, CWE ID, CWE name.
- Number queries: `14`, `#14` → PR numbers starting with 14; `react 14`, `react #14`, `react#14` → scoped to repo.
- Filters as you type (no submit); Esc clears when focused.

### Sorting
- Default sort for Candidate fixes: severity (critical → low), then most recent activity.
- Sortable table headers: 12px mono uppercase `--muted`; active column `--ink` with ▲/▼. One sort key at a time.

### Preferences (account menu → Preferences)
Sections in this order, each a white card:
1. **Watched repositories**: search field + Select all / Clear; checkbox rows; **selected items sort to the top**; mono language meta at the right.
2. **Vulnerability classes (CWE)**: same pattern, rows show `CWE-22 Path traversal`.
3. **Minimum severity**: segmented Low · Medium · High · Critical.
4. **Review defaults**: Hide closed · Hide fixes I voted on · Keyboard shortcuts on/off.
5. **Candidate fixes layout**: Split / Table / Focus.
6. **Diff view**: Split (default) / Unified.
7. **Reset to defaults** (quiet button, bottom).
- Changes save immediately (no Save button) and show a toast "Preferences saved".
- Lists honor preferences by default; a banner or chip "Filtered by your preferences · Show all" lets users bypass them per session.

---

## 8. Data display

- **Tables**: white card, `--line` border, radius 8; header row `--gray-100`, 12px mono uppercase `--muted`, 10–12px padding; body rows 13–14px, `--gray-200` rules; hover `--gray-100`; selected `--blue-soft` with 3px `--blue` inset left indicator *on the row*, not the card.
- **List rows (Split layout)**: title 14/600 (2-line clamp), meta line `repo#number · CWE · age` in 12px mono `--muted`, severity chip and status chip on the right; the focused row is `--blue-soft`.
- **StatBlock**: at most 4 numbers. On paper use a 1px-gap grid; on the gradient banner stack the stats vertically (label left, value right).
- **ConsensusBar**: 8px bar in decision solids plus a legend with mono counts.
- **DiffView**: file header `--gray-100` in 12px mono; lines 12.5px mono / 1.7; additions `--green-soft`/`--green-ink`, deletions #fee2e2/#991b1b; line numbers `--gray-400`. Default mode **Split** (user preference), toggle Unified.
- **PR description (Details tab)**: render the full GitHub body verbatim — headings 17px/700 with a `--gray-200` rule, paragraphs 14px/1.7, inline code `--code-bg`/`--blue-dark`, fenced code in a `--gray-100` block, Mermaid diagrams rendered with brand theme variables, `<details>` blocks as bordered expanders.
- Timestamps: relative in lists ("2d ago"), absolute on hover and in detail (`Jun 14, 2026`).

---

## 9. Status and severity systems (summary)
- A candidate fix shows **severity** (what's at stake), **status** (validator consensus) and, once past Trusted, a **lifecycle** chip. These are three separate chips; MUST NOT merge them.
- Chips: pill, padding 2px 8px, mono 10px/700, uppercase, soft bg + dark fg.
- The validator's own vote appears as a DecisionChip ("You voted Accept").

---

## 10. Forms and validation
- Labels: mono 11px/700 uppercase `--ink-soft`, above the field, 6px gap.
- **Required fields**: red asterisk ` *` in `--dec-reject` after the label. Mark required fields, not optional ones.
- Inputs: 38px min height, padding 9px 12px, radius 6, 1px `--line-strong`, 14px text. Focus: 3px `--focus-ring` outline, offset 3px.
- Errors: border `--dec-reject`, message 12px `--dec-reject-fg` below; say what's needed ("Required for Duplicate").
- **Vote form** (appears after choosing a decision):
  - Confidence: segmented Low · **Medium** (default) · High.
  - Recommended action: select (e.g. Merge, Revise, Close).
  - **Comments \***: textarea, required for every decision.
  - **Parent PR number \***: required only for Duplicate.
  - Actions: primary "Submit vote" (⌘/Ctrl+Enter) + quiet "Cancel" (Esc).
- Disable submit until the required fields are valid; never hide the reason.

---

## 11. Workflows

### Validator review loop
1. **My queue** banner: "{n} candidate fixes are waiting for your validation." → **Start reviewing** opens the highest-severity fix that needs my vote.
2. **Candidate fixes**: move with ↑/↓; the detail pane updates and the active tab is kept.
3. Read Summary → Details (full PR body) → Diff.
4. Choose a decision with **A / M / R / D** or the VoteBar.
5. Complete the vote form; submit with ⌘/Ctrl+Enter.
6. Toast "Vote recorded on {repo}#{n}"; the list advances to the next fix that needs a vote.

### Candidate-fix lifecycle (preview branch)
```
Needs Review → Trusted → Maintainer Review → Maintainer Accepted → Submitted Upstream → Merged Upstream
                              ├─ Changes Requested ↺ Maintainer Review         └─ Closed Without Merge
                              └─ Maintainer Declined
```
| Stage | Chip bg / fg |
|---|---|
| Needs Review | #fef9c3 / #854d0e |
| Trusted | #dcfce7 / #166534 |
| Maintainer Review | --blue-soft / --blue-dark |
| Changes Requested | #ffedd5 / #9a3412 |
| Maintainer Accepted | --green-soft / --green-ink |
| Maintainer Declined | --gray-200 / --gray-600 |
| Submitted Upstream | --blue-soft / --blue-dark |
| Merged Upstream | #ede9fe / #5b21b6 |
| Closed Without Merge | --gray-200 / --gray-600 |
- Validator decisions (Accept/Modify/Reject/Duplicate) and lifecycle states are **separate layers**; MUST NOT collapse them into a single "Accepted".
- "Closed Without Merge" is neutral gray, not red; a close is not automatically a rejection.
- **Workflow tab** (preview) on the fix detail: vertical timeline of stages with actor, timestamp and reason; maintainer actions are role-gated and need a confirmation step before any external GitHub write.

### Response badges (preview branch)
- **First Responder** (Achievement): cumulative count of first recognized responses.
- **Fast Responder** (Activity badge): ≥10 recognized responses in 90 days **and** ≥80% within 24h. Show both criteria separately.
- **Coverage Contributor** (Activity badge): 5 first responses in 180 days on requests waiting ≥72h.
- Shown on a **Badges** tab in the validator profile using ResponseBadgeCard. Each card states the meaning, earned or not-yet-earned, evidence, progress per criterion and when the clock starts.
- Copy MUST say "recognized OASIS vote", never "verified expertise". Badges never change reputation, rank or vote weight.

---

## 12. Keyboard and accessibility (WCAG 2.2 AA)
| Key | Action | Scope |
|---|---|---|
| ↑ / ↓ | Previous / next candidate fix | Candidate fixes |
| A / M / R / D | Choose Accept / Modify / Reject / Duplicate (toggle) | fix detail, when voting is allowed |
| ⌘/Ctrl + Enter | Submit vote | anywhere in the vote form |
| Esc | Blur field, then clear decision, then close menu | global |
- Shortcuts are ignored while typing in inputs, and are disabled if Preferences → Keyboard shortcuts is off.
- The shortcut letter is shown by **underlining the first letter** of the button label (2px, offset 3px), not with key boxes; buttons carry `aria-keyshortcuts`.
- Focus: 3px `rgba(76,217,100,.65)` outline, 3px offset, on every interactive element; never remove it.
- Provide a "Skip to content" link (ink pill, appears on focus).
- Color is never the only signal: chips always carry text; decision buttons carry labels.
- Menus use `role="menu"`/`menuitem`; tabs use `role="tablist"`/`tab` with `aria-selected`; toggles use `aria-pressed`.
- Respect `prefers-reduced-motion`: drop translate and hover lifts, keep opacity changes.

---

## 13. Feedback states
- **Toast**: bottom-center, 24px from the bottom, ink bg, white 14px, radius 10, `--shadow-strong`, optional green dot for success; auto-dismisses after **2.6s**; one at a time. For confirmations only.
- **Inline error**: under the field or at the top of the panel, `--dec-reject-bg` background with `--dec-reject-fg` text; says what happened and what to do.
- **Empty state**: dashed `--line-strong` border, white, centered; title 16/700, body 14 `--muted`, one quiet action ("Clear filters").
- **Loading**: skeleton rows in `--gray-100` with the exact row height; for renders such as diagrams, muted mono text "Rendering diagram…". No spinners over 1s without text.
- **Sync status**: Healthy uses the green dot and `--green`; Degraded uses high-severity colors; Failed uses critical colors.

---

## 14. Motion and interaction states
- Durations: 150ms (color), **180ms** (button transform, shadow, background), 260ms (toast enter). Easing: `cubic-bezier(.2,.7,.2,1)`.
- Buttons: hover opacity .9 + translateY(-1px); active translateY(0); disabled opacity .45, `not-allowed`.
- Links: `--blue`, no underline; underline on hover.
- Rows and menu items: hover `--gray-100` (or `--blue-soft` + `--blue` text for nav); selected `--blue-soft`.
- Nothing bounces, spins or animates on load. The account chevron rotates 180° when open.

---

## 15. Voice, tone, microcopy
**Voice:** Direct · Urgent · Technically credible · Community-first · Unpretentious.

| Context | Tone |
|---|---|
| Homepage hero | Bold, declarative |
| Validator onboarding | Welcoming, step-by-step |
| **Workspace** | Action-oriented; help people find the next useful task |
| Errors | Calm, actionable, never blame the user |
| Press | Factual, cite data, few adjectives |

**Canonical terms** (use these; avoid the alternatives in parentheses): candidate fix (patch, suggestion, PR) · validator (reviewer, judge) · fix automation (AI, bot) · project owner (lead, champion) · maintainer (upstream developer) · upstream submission (sending, pushing) · upstream acceptance (merge, sign-off) · validation (testing, QA) · credibility-weighted (reputation-based).

**Approved messages (verbatim):** Tagline "Fix open source. Together." · CTA "Join Team OASIS. Validate a fix today." · Footer "Open source powers the world. Vibe hacking exploits it. Team OASIS fixes it."

**Microcopy patterns**
- Buttons: verb first, sentence case: "Start reviewing", "Submit vote", "Open on GitHub", "Reset to defaults".
- Counts in labels: "Need my vote 8", "Comments (2)".
- Toasts: past tense plus object: "Vote recorded on react#14", "Preferences saved".
- Empty: say why, then the next step: "Nothing needs your vote. Your filters hide 12 candidate fixes."
- Numbers: spell out one to nine in prose; numerals for 10+ and always in UI data.
- Oxford comma. No exclamation marks in UI. No "click here". Links describe the destination.

---

## 16. Do / Don't
| Do | Don't |
|---|---|
| One green primary button per view | Two green CTAs side by side |
| Blue-tinted `--line` borders | Neutral gray card borders |
| Severity is the only colored descriptor of a finding | A hue per CWE family |
| Serif for one title per Workspace screen | Serif panel headings, tabs, chips or eyebrows |
| Logo once, in the SiteNav | Logo in the sidebar or inside panels |
| Donor logo full color at fixed height | Recolored donor logo or a tool name under it |
| Underlined shortcut letter | Key-cap boxes on decision buttons |
| Separate status, lifecycle and decision chips | A single generic "Accepted" |
| Flat cards with borders | Drop shadows on every card |
| Account and Preferences in the SiteNav menu | A second account block in the sidebar |
| Lucide icons, currentColor | Emoji or hand-drawn icons |
| "Closed Without Merge" in gray | Red for a neutral close |

---

## Content fundamentals (for agents)
Write as OASIS speaking to peers: second person in UI ("your validation"), first person plural in marketing ("we help stop that"). Short declarative sentences, precise security terms, no hype and no superlatives. No emoji.

## Visual foundations (for agents)
Light, cool, paper-blue interface. Navy and blue do the structural work, green marks action and success, and mono labels give it a technical feel. Surfaces are flat white cards on paper with blue-tinted hairlines; elevation is rare. Gradients appear only on hero surfaces. No photos in the product; the site uses headshots only on About. There are no textures, patterns or illustrations: the logo shield is the only brand graphic, and MUST NOT be redrawn.
