---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
lastStep: 14
project: Lore Platform
inputDocuments:
  - planning-artifacts/PRD.md
  - planning-artifacts/architecture.md
  - planning-artifacts/epics-and-stories.md
  - planning-artifacts/tech-spec.md
---

# Lore Platform — UX Design Specification

> This document is generated collaboratively through the BMAD UX Design workflow.
> Each section is appended as the workflow progresses through discovery, design decisions, and specifications.

## Executive Summary

### Project Vision

Lore is the institutional memory layer for BMAD-driven AI development teams. It captures lessons from code reviews, stores them with semantic embeddings, and propagates them across projects. The core value is invisible — AI agents query it automatically during every session and code review — but the Web UI is where humans interact with, curate, and observe that accumulated knowledge.

The UI exists to make the compounding effect tangible: to show what was learned, surface what propagated, and give project leads confidence that Lore is actively improving team quality.

### Target Users

**Developer (Primary)**
Software engineer using Cursor or Claude Code. Uses the CLI once for install; Lore then works invisibly. Visits the Web UI occasionally to browse lessons relevant to their work or triage the propagation inbox. Values speed and signal over completeness.

**Project Lead (Secondary)**
Tech lead responsible for project setup and AI-assistance quality. Initializes projects, reviews cross-project propagation suggestions, monitors lesson quality. Cares about the health of the team's institutional knowledge.

**Platform Administrator (Tertiary)**
DevOps or platform engineer maintaining Lore infrastructure. Manages Docker deployment, project registration, and API key lifecycle. Needs operational visibility — health, metrics, and key management.

### Key Design Challenges

- **Invisible value made visible:** Most of Lore's work happens automatically in agent sessions. The UI must surface this hidden activity (sessions started, lessons consulted, findings captured) to make the compounding value tangible — or users will doubt it's working.
- **Inbox as lightweight triage:** The propagation inbox must feel like a quick, insightful review ("here's something your sister project learned") not a ticket queue. If it feels like overhead, developers will ignore it.
- **Dense technical content:** Lessons contain code snippets, stack tags, root causes, and severity ratings. Information architecture is critical — progressive disclosure matters.
- **Developer-tool aesthetic expectations:** Self-hosted, technical users. They expect functional density, clear data, and fast interactions — not a consumer app.

### Design Opportunities

- Visualizing compounding memory growth over time (lesson count trends, stack coverage, sessions-to-lessons ratio)
- Propagation review as a learning moment — surfacing the *why* behind each suggestion
- Cross-project lesson discovery as a power feature for project leads
- A dashboard that answers: "Is Lore actually helping?" with real session and lesson stats

## Core User Experience

### Defining Experience

The defining interaction of the Lore Web UI is **knowledge search** — a developer or project lead typing a free-text query and immediately seeing relevant lessons from the team's accumulated memory. This mirrors how developers already think: "we hit this before, what was the fix?" The UI must answer that question in under two seconds with zero friction.

Everything else in the UI (inbox triage, admin, dashboards) is secondary to this core loop.

### Platform Strategy

**Architecture:** Separate Next.js application in the monorepo (e.g. `apps/web`), served independently from the Fastify API. The Next.js app communicates with the Lore REST API via API key authentication.

**Rationale:**
- Clean separation between API and UI codebases — the Fastify server stays headless
- Full access to the Next.js ecosystem (App Router, server components, streaming)
- Deployable independently — teams can host the UI on Vercel/Nginx while the API runs on Docker
- No SSR complexity for the API layer — the UI calls the REST API directly

**Device focus:** Desktop-first. Lore's users are developers at workstations. Mobile is not a priority for v2.

### Effortless Interactions

**Search must be completely effortless:**
- Single prominent search input — the first thing users see
- Results appear as-you-type (debounced, no submit button)
- Filters (stack tag, severity, category) appear after results, not before — don't gate search behind configuration
- No login friction for read access within the project context (API key already embedded in the app config)

**Inbox triage must require minimal thought:**
- Each propagation shows: lesson title, problem summary, why it was suggested, one-click accept/reject
- Default action is visible without scrolling
- Batch actions available for leads who have many pending suggestions

### Critical Success Moments

- **"Found it in 5 seconds"** — a developer searches for a vague symptom and lands on the exact lesson that solves their problem. This is the moment that converts skeptics.
- **"Lore is actually learning"** — a project lead visits the dashboard and sees new lessons captured from last week's code reviews without anyone manually entering them.
- **"That propagation was spot-on"** — a lead accepts a cross-project suggestion and immediately sees the value of the shared-memory model.
- **"Nothing to do today"** — an empty inbox after triaging. Completion feels good.

### Experience Principles

1. **Search is the product.** Every design decision is evaluated against: does this make search faster or slower?
2. **Show the machine working.** Surface Lore's automated activity (sessions, captured reviews, propagations queued) so the value is visible, not invisible.
3. **Triage, don't manage.** The inbox is not a to-do list — it's a quick decision surface. Minimize reading time per item.
4. **Density over decoration.** Developers trust tools that show them data clearly. Prefer information-dense layouts over visual flair.
5. **Never block on configuration.** Search works before any filters are set. The app is useful on first load.

## Desired Emotional Response

### Primary Emotional Goals

**Confidence is the north star emotion.** Every design decision — layout, search speed, result quality, copy tone — should increase the user's confidence that Lore has what they need and that they can find it. A developer who searches and finds the right lesson in seconds walks away more confident in their team's collective knowledge. A project lead who opens the dashboard and sees a healthy, growing lesson base feels confident the system is working.

Secondary feelings that support confidence:
- **Productivity** — users get in, find what they need, and get out. The UI never wastes their time.
- **Trust** — the system's automation (lesson capture, propagation) feels reliable, not mysterious.

### Emotional Journey Mapping

| Stage | Desired Feeling | Design Implication |
|---|---|---|
| First load | Oriented, not overwhelmed | Clean entry point, search front-and-center |
| Searching | Focused, expectant | Instant feedback, smooth as-you-type results |
| Finding a lesson | Confident, relieved | Clear, scannable lesson cards with the answer visible |
| Empty results | Encouraged, not defeated | Warm copy: "Your team hasn't hit this yet — you might be the first." |
| Inbox triage | In control, efficient | One decision per item, clear context, no ambiguity |
| Accepting a propagation | Smart, connected | Brief confirmation: "Added to your project's memory." |
| Viewing the dashboard | Impressed, trusting | Stats that show compounding growth — lessons captured, sessions run |
| Leaving the UI | Time-saved, confident | No lingering questions, task completed cleanly |

### Micro-Emotions

- **Confidence over skepticism** — search results must feel relevant, not noisy. One great result beats ten mediocre ones.
- **Efficiency over exhaustiveness** — users should feel done quickly, not like they need to read everything.
- **Trust over anxiety** — automated captures (from code reviews) should feel like good news, not surveillance.
- **Encouragement over shame** — empty states and missing data are opportunities, not failures.

### Design Implications

- **Confidence →** Semantic search with strong relevance ranking; highlight the matched reason in each result; show severity and stack-tag match clearly.
- **Encouraging empty states →** Never show a blank page. Empty search: suggest related tags or recent lessons. Empty inbox: celebrate it ("All caught up").
- **Time-saved →** Keyboard-first navigation, no required clicks between search and reading, lesson content scannable in 10 seconds.
- **Trust →** Show provenance on each lesson (captured from code review vs. manual) so users understand where knowledge comes from.

### Emotional Design Principles

1. **Lead with the answer.** Lesson cards show the fix and prevention rule first — users shouldn't have to read root cause to get value.
2. **Empty states tell a story.** Every empty state is an opportunity to explain what Lore will do when the memory grows, not just "nothing here yet."
3. **Celebrate the machine.** When Lore automatically captures a finding or queues a propagation, surface it as good news — the system is working.
4. **Never make users feel lost.** Clear navigation, consistent location of search, always one click back to the main experience.

## UX Pattern Analysis & Inspiration

### Inspiring Products Analysis

**Linear — keyboard-first project management**
Linear is the gold standard for developer-tool UX. Everything is reachable by keyboard, navigation is near-instant, and the information hierarchy is clean without being sparse. Their inbox pattern — each item actionable with a single keystroke, a visible count that wants to reach zero — is exactly the triage model Lore's propagation inbox should emulate. Their empty states ("You're all caught up") feel like a reward, not an absence.

**Sentry — structured technical event browsing**
Sentry handles dense, technical content (stack traces, metadata, tags) in a scannable, progressive-disclosure layout. The event list shows just enough to make a decision; clicking opens the full detail. Their filter sidebar appears contextually after you've seen results — not as a gate. Lore's lesson browser faces the same challenge: technical content needs to be scannable at the list level and rich at the detail level.

**Notion — knowledge base search**
Notion's search is instant, results appear before you finish typing, and the UI never makes you feel like you're querying a database. The search overlay (`Cmd+K`) is learned muscle memory for developers. Lore's search should feel equally fast and frictionless — a search box that responds before the user expects it to.

### Transferable UX Patterns

**Navigation Patterns:**
- **Sidebar + main content split** (Linear/Sentry) — persistent left nav with section shortcuts (Lessons, Inbox, Dashboard, Admin), main area responds to selection. Keyboard shortcuts `G L` for Lessons, `G I` for Inbox.
- **Command palette** (Linear) — `Cmd+K` to jump anywhere, search across lessons without navigating to the search page first.

**Interaction Patterns:**
- **As-you-type search with debounce** (Notion) — results update 200–300ms after keystroke, no submit button, query reflected in URL for shareability.
- **Progressive filter reveal** (Sentry) — show filter chips *after* initial results load, not before. Filters refine; they don't gate.
- **Inbox action keys** (Linear) — `A` to accept, `R` to reject, `J/K` to navigate items. Triage without touching the mouse.
- **Expandable cards** (Sentry) — lesson cards show title, severity, and the first line of the fix. Click to expand root cause, code example, provenance.

**Visual Patterns:**
- **Severity as color** (Sentry) — critical/high/medium/low mapped to a consistent color system. Developers read this instantly.
- **Tag pills** (Linear/GitHub) — stack tags as compact, colored pills. Scannable at a glance.
- **Provenance badge** (GitHub) — small label indicating lesson source ("from code review", "manual", "propagated") builds trust in the content.

### Anti-Patterns to Avoid

- **Search gated behind filters** — forcing users to select a project or stack tag before showing results.
- **Modal-heavy flows** — opening a modal to read a lesson breaks reading momentum. Use slide-over panels or inline expansion.
- **Dashboard as the home page** — charts are useful but not why users open the app. Search is the home page.
- **Pagination for lesson lists** — use infinite scroll or "load more". Numbered pages add friction.
- **Generic empty states** — "No results found" with no context. Every empty state should explain what will appear and how.

### Design Inspiration Strategy

**Adopt directly:**
- Linear's inbox triage pattern (keyboard shortcuts, zero-inbox reward state)
- Sentry's progressive filter reveal (filters appear after results)
- Notion's instant search feel (debounced, responsive, URL-reflected)

**Adapt for Lore:**
- Sentry's expandable event cards → Lore lesson cards (title + fix preview → expand for full detail)
- GitHub's provenance labeling → Lore's trust-tier badges ("captured from code review" carries more weight than "manual")

**Avoid:**
- Consumer app patterns (hero images, marketing copy, onboarding tours)
- Heavy dashboard-first layouts (Datadog, Grafana) — too complex for a knowledge tool
- Table-first data views — lessons are not rows in a spreadsheet

## User Journey Flows

### Journey 1 — Daily Search (Developer / Project Lead)

```
[Browser opens lore.team.com]
        │
        ▼
[Login page — if no active session]
  Enter password → Sign in
        │
        ▼
[Lessons page — search bar auto-focused]
        │
  Type query (e.g. "prisma migration")
        │
        ▼
[Results appear as-you-type · debounced 250ms]
  12 results sorted by relevance
  [CRITICAL] Prisma migrate dev resets shadow DB
  [HIGH] Missing await on Prisma transaction
        │
  Click lesson (or J/K + Enter)
        │
        ▼
[Slide-over panel opens — Fix tab default]
  Prevention rule + fix visible immediately
  Code example one tab away
        │
  ┌─────┴──────────┐
  │                │
Found it        Not right
  │             Esc → back to list
Close panel     Refine query
  ▼
[Session complete — under 30 seconds]
```

**UX requirements:** Session cookie persists 7 days · search auto-focused on load · panel close restores search focus · URL reflects query for shareability

---

### Journey 2 — Propagation Inbox Triage (Project Lead)

```
[Nav: Inbox — badge shows pending count]
        │
        ▼
[Inbox page — first item auto-focused]
  "3 pending suggestions"
  ┌──────────────────────────────────┐
  │ [CRITICAL] React useEffect       │ ← focused
  │ cleanup missing on async ops     │
  │ Shared: typescript, react        │
  │ 5 occurrences · high trust       │
  │ [Accept]  [Reject]   A · R      │
  └──────────────────────────────────┘
        │
  ┌─────┴──────────┐
  │                │
Press A          Press R
  │                │
Item fades out   Item fades out
Toast: "Added    Toast: "Dismissed"
to memory"       Undo 5s
  │
Next item auto-focuses
  │
[All actioned → empty state]
"All caught up."
```

**UX requirements:** Keyboard-first A/R/J/K · optimistic UI · undo 5s · empty state celebrates completion

---

### Journey 3 — First-Time Admin Setup

```
[Deploy with WEB_UI_SECRET env var]
        │
[Browser: lore.team.com → Login page]
  Enter WEB_UI_SECRET → Sign in
        │
        ▼
[Lessons page — empty state]
  "No lessons yet. Lessons are captured
   automatically from BMAD code reviews.
   Run lore install to connect developers."
        │
  Admin panel → Projects table
  API key shown → Share with team
        │
  Developers run lore install →
  First session + code review runs →
        │
[First lesson appears → memory is live]
```

**UX requirements:** Empty states explain the path forward · admin panel accessible immediately · no hidden setup steps

---

### Journey 4 — Cmd+K Quick Lookup (Power User)

```
[Any page]
  Press ⌘K
        │
[Command palette — instant, auto-focused]
  Type: "fastify error handler"
        │
[Results in palette]
  [HIGH] Fastify error handler missing...
  Press Enter
        │
[Slide-over opens over current page]
  Read fix → Press Esc × 2
        │
[Back to original page · ~15 seconds total]
```

**UX requirements:** Palette opens in < 100ms · Esc dismisses palette without navigating away · no page reload

## Design System Choice

### Decision

**shadcn/ui + Tailwind CSS**

shadcn/ui provides copy-owned, accessible components built on Radix UI primitives. Tailwind handles all styling via utility classes. There is no runtime component library dependency — components live in `apps/web/components/ui/` and are fully owned and customizable.

### Rationale

| Factor | Why shadcn/ui wins |
|---|---|
| Speed | Scaffold full pages in hours, not days |
| Accessibility | Radix primitives handle keyboard nav, ARIA, focus trapping by default |
| Customization | Components are source files — modify without fighting the library |
| Dark mode | Tailwind `dark:` variant + CSS variables, trivial to wire |
| Ecosystem | First-class Next.js App Router support, active community, broad component coverage |
| Team fit | No learning curve for developers already using Next.js |

### Component Inventory

Core shadcn/ui components needed for Lore's UI:

| Component | Used for |
|---|---|
| `Command` | `Cmd+K` command palette, global search overlay |
| `Input` | Primary search bar on lessons page |
| `Badge` | Stack tags, severity labels, provenance indicators |
| `Card` | Lesson cards in search results |
| `Sheet` | Slide-over panel for full lesson detail |
| `Separator` | Section dividers in lesson detail view |
| `Button` | Accept/reject in inbox, admin actions |
| `Dialog` | Confirmation prompts (revoke API key, delete lesson) |
| `Tabs` | Lesson detail sections (Fix / Root Cause / Prevention / Code) |
| `ScrollArea` | Lesson list, inbox items |
| `Skeleton` | Loading states for search results |
| `Toast` | Action confirmations (lesson accepted, key copied) |
| `DropdownMenu` | Filter chips, sort options |
| `Table` | Admin panel — projects, API keys |
| `Avatar` | Session/user attribution on lessons |

### Tailwind Configuration

Custom design tokens to add to `tailwind.config.ts`:

- **Color palette:** neutral grays base + a single brand accent (TBD in visual design step)
- **Typography scale:** `font-mono` for code snippets, `font-sans` for all UI text
- **Spacing:** default Tailwind scale is sufficient — no custom spacing needed
- **Dark mode:** `class` strategy (user-toggled or system-preference)

### File Structure

```
apps/web/
├── components/
│   ├── ui/          # shadcn/ui components (owned, copy-in)
│   └── app/         # Lore-specific composed components
├── app/             # Next.js App Router pages
└── styles/
    └── globals.css  # Tailwind directives + CSS variable theme tokens
```

### Constraints

- All custom components must use Tailwind utility classes only — no inline styles, no CSS modules
- Interactive components must be keyboard-accessible (Radix handles this if used correctly)
- All color choices must pass WCAG AA contrast ratio in both light and dark mode

## Core Interaction Mechanics

### Search Interaction Model

**Both: dedicated search page + `Cmd+K` overlay**

- **Primary:** Lessons page (`/lessons`) has a persistent search bar at the top. Results render below it as-you-type, debounced at 250ms. The query is reflected in the URL (`?q=prisma+migration`) for shareability and browser back-navigation.
- **Secondary:** `Cmd+K` opens a floating command palette overlay from anywhere in the app. Results show title + severity + first line of fix. `Enter` navigates to the lesson, `Esc` closes.

**Search result card anatomy (list view):**
```
[severity badge]  Lesson title                          [stack tags]
Fix: First sentence of the fix preview...
Captured from code review · 3 occurrences · typescript, prisma
```

**Filter behavior:** Filter chips (stack tag, severity, category) appear below the search bar *after* the first results load — never as a prerequisite.

### Lesson Detail

**Slide-over panel (Sheet)**

Clicking a lesson opens a right-side slide-over panel. The lesson list remains visible and interactive behind it. The panel URL updates (`/lessons?q=...&lesson=<id>`) — deep-linkable and bookmarkable.

**Panel tab structure:**
- **Fix** (default) — fix and prevention rule, shown first
- **Context** — problem statement, root cause
- **Code** — syntax-highlighted code example (if present)
- **Provenance** — source, trust tier, session reference, occurrence history

### Inbox Triage Model

**Feed view with keyboard shortcuts**

All pending propagations listed vertically. Each item shows:
```
[severity]  Lesson title
            Problem: one-sentence summary
            Why suggested: stack tag overlap (typescript, drizzle) · 2 occurrences
            [ Accept ]  [ Reject ]
```

Keyboard shortcuts: `J/K` to navigate, `A` to accept, `R` to reject, `U` to undo. Batch select available for large queues.

**Empty inbox state:** "All caught up. No pending suggestions for this project."

### Theme System

**Three modes: Light / Dark / System (auto)**

Tailwind `class` dark mode strategy + `ThemeProvider` context. User preference in `localStorage`. System mode reads `prefers-color-scheme`. Toggle in top-right nav bar. All shadcn/ui components use CSS variables — no component-level changes on theme switch.

### Keyboard Navigation Map

| Shortcut | Action |
|---|---|
| `Cmd+K` | Open command palette / global search |
| `G L` | Go to Lessons |
| `G I` | Go to Inbox |
| `G D` | Go to Dashboard |
| `G A` | Go to Admin |
| `J / K` | Navigate list items |
| `Enter` | Open focused item |
| `Esc` | Close panel / overlay |
| `A` | Accept focused inbox item |
| `R` | Reject focused inbox item |
| `?` | Show keyboard shortcut reference |

### Loading & Transition States

- **Search results:** Skeleton cards appear immediately on keystroke, replaced by real results on response
- **Slide-over:** 200ms ease-in-out slide, no blocking spinner
- **Inbox actions:** Optimistic UI — item fades out immediately, toast confirms in background, undo available for 5 seconds
- **Page navigation:** Next.js App Router `loading.tsx` skeleton for initial page loads only

## Authentication & Access Model

### Login

**Single admin token (Option 2).** The Web UI is protected by a password set via `WEB_UI_SECRET` environment variable on deploy. The login page presents a single password field. On correct entry a session cookie is issued (7-day expiry, `httpOnly`, `sameSite: strict`). No user accounts, no OAuth in v2.

**Login page design:**
- Centered card on a dark background
- Lore logo + "Welcome back" heading
- Single password input + "Sign in" button
- No username field — the password *is* the credential
- Error state: "Incorrect password" inline, no account lockout complexity in v2

### Access Scope

**Admin login = full platform access.** The logged-in admin sees all projects. This maps directly to the existing `ADMIN_SECRET` model in the backend which bypasses project-level RLS.

**Project switcher** in the top bar controls active project scope. All pages (Lessons, Inbox, Dashboard) filter to the selected project. An "All Projects" option provides the cross-project aggregate view for platform-level oversight.

**Per-developer login (v3):** Individual developers logging in with their project API key to see only their project's data is deferred to v3.

### Design Direction

**Direction A — Focus** is the chosen direction, with one addition: the top bar includes the project switcher dropdown (project name + chevron) to the right of the page title. The icon-only sidebar remains. This keeps the chrome minimal while giving the admin full project context control.

## Visual Design Foundation

### Brand Accent: Indigo

**Rationale:** Indigo sits at the intersection of intellectual depth and technical precision. It's the family used by Linear (our primary UX inspiration), so developers already associate it with fast, focused tools. It reads as trustworthy and knowledge-oriented without feeling corporate. It performs cleanly against neutral gray backgrounds in both light and dark modes.

### Color System

All tokens implemented as CSS custom properties in `globals.css`, consumed by shadcn/ui's variable system.

**Semantic tokens (light / dark):**

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--background` | `zinc-50` (#fafafa) | `zinc-950` (#09090b) | Page background |
| `--foreground` | `zinc-900` (#18181b) | `zinc-50` (#fafafa) | Primary text |
| `--card` | `white` (#ffffff) | `zinc-900` (#18181b) | Card/panel background |
| `--muted` | `zinc-100` (#f4f4f5) | `zinc-800` (#27272a) | Subtle backgrounds |
| `--muted-foreground` | `zinc-500` (#71717a) | `zinc-400` (#a1a1aa) | Secondary text, placeholders |
| `--border` | `zinc-200` (#e4e4e7) | `zinc-800` (#27272a) | Borders, dividers |
| `--primary` | `indigo-600` (#4f46e5) | `indigo-400` (#818cf8) | Brand accent, CTAs, active state |
| `--primary-foreground` | `white` | `zinc-950` | Text on primary backgrounds |
| `--ring` | `indigo-600` | `indigo-400` | Focus rings |

**Severity color system (consistent across light/dark):**

| Severity | Badge color | Meaning |
|---|---|---|
| `critical` | `red-500` | Blocking bug, data loss risk |
| `high` | `orange-500` | Significant issue, likely to recur |
| `medium` | `yellow-500` | Should be addressed, not urgent |
| `low` | `blue-500` | Minor, informational |

**Provenance badge colors:**

| Source | Color | Label |
|---|---|---|
| Code review (high trust) | `indigo-500` | "From review" |
| Manual save | `zinc-500` | "Manual" |
| Propagated from other project | `emerald-500` | "Propagated" |

### Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Page headings | Inter (system-ui) | 600 | `text-xl` / `text-2xl` |
| Section headings | Inter | 500 | `text-base` / `text-lg` |
| Body / UI text | Inter | 400 | `text-sm` (14px) |
| Labels, badges | Inter | 500 | `text-xs` (12px) |
| Code snippets | Geist Mono | 400 | `text-sm` (14px) |
| Search input | Inter | 400 | `text-base` (16px) |

**Font loading:** `next/font/google` for Inter + Geist Mono. Both subset to Latin, `display: swap`.

**Base size:** 14px body text — developer tools read better at 14px than 16px due to information density.

### Spacing & Layout

| Element | Value |
|---|---|
| Page max-width | `1280px` centered |
| Sidebar width | `240px` fixed |
| Main content padding | `px-6 py-6` |
| Card padding | `p-4` |
| Gap between list items | `gap-2` (8px) |
| Section gap | `gap-6` (24px) |

**Grid:** Sidebar + main is a simple flexbox row. Content areas use Tailwind's `space-y-*` for vertical rhythm.

### Iconography

**Lucide React** — bundled with shadcn/ui. Stroke-width 1.5, 16px and 20px sizes. Outline-only icons.

| UI Element | Icon |
|---|---|
| Search | `Search` |
| Lessons | `BookOpen` |
| Inbox | `Inbox` |
| Dashboard | `BarChart2` |
| Admin | `Settings` |
| Accept | `Check` |
| Reject | `X` |
| Propagated | `GitMerge` |
| Critical severity | `AlertCircle` |
| Code review source | `GitPullRequest` |

### Shadows & Elevation

| Element | Shadow |
|---|---|
| Cards | `shadow-sm` |
| Slide-over panel | `shadow-xl` (left edge only) |
| Command palette overlay | `shadow-2xl` |
| Dropdowns | `shadow-md` |
| Page background | none |

## Authentication & Access Model

### Login

**Single admin token (Option 2).** The Web UI is protected by a `WEB_UI_SECRET` environment variable set on deploy. The login page presents a single password field. On correct entry a session cookie is issued (7-day expiry, `httpOnly`, `sameSite: strict`). No user accounts, no OAuth in v2.

**Login page design:** Centered card on dark background · Lore logo + "Welcome back" · single password input + "Sign in" button · inline error "Incorrect password" on failure.

### Access Scope

**Admin login = full platform access.** Maps directly to `ADMIN_SECRET` in the backend — bypasses project-level RLS. The logged-in admin sees all projects.

**Project switcher** in the top bar (project name + chevron) controls active scope. All pages filter to the selected project. "All Projects" option gives cross-project aggregate view.

**v3 deferral:** Per-developer login with project API key is out of scope for v2.

### Design Direction

**Direction A — Focus** with one addition: project switcher dropdown in the top bar to the right of the page title. Icon-only sidebar retained.

## User Journey Flows

### Journey 1 — Daily Search (Developer / Project Lead)

```
[Browser opens lore.team.com]
        │
[Login page — if no active session]
  Enter password → Sign in
        │
[Lessons page — search bar auto-focused]
  Type query (e.g. "prisma migration")
        │
[Results appear as-you-type · debounced 250ms]
  12 results sorted by relevance
        │
  Click lesson (or J/K + Enter)
        │
[Slide-over panel — Fix tab default]
  Prevention rule + fix visible immediately
        │
  Found it → close panel
  Not right → Esc → refine query
[Session complete — under 30 seconds]
```

**UX requirements:** 7-day session cookie · search auto-focused on load · panel close restores search focus · URL reflects query

---

### Journey 2 — Propagation Inbox Triage (Project Lead)

```
[Nav: Inbox — badge shows pending count]
        │
[Inbox — first item auto-focused]
  [CRITICAL] React useEffect cleanup...
  Shared: typescript, react · 5 occ · high trust
  [Accept]  [Reject]   A · R
        │
  A → item fades · Toast "Added to memory" · Undo 5s
  R → item fades · Toast "Dismissed"    · Undo 5s
        │
  Next item auto-focuses → repeat
        │
[All actioned → "All caught up."]
```

**UX requirements:** Keyboard-first A/R/J/K · optimistic UI · undo 5s · empty state celebrates completion

---

### Journey 3 — First-Time Admin Setup

```
[Deploy with WEB_UI_SECRET] → Login
        │
[Lessons — empty state]
  "No lessons yet. Run lore install to connect developers."
        │
  Admin panel → share API key with team
  Developers run lore install → first review runs
        │
[First lesson appears — memory is live]
```

---

### Journey 4 — Cmd+K Quick Lookup (Power User)

```
[Any page] → ⌘K → palette opens instantly
  Type: "fastify error handler"
        │
[Results in palette] → Enter → slide-over opens
  Read fix → Esc × 2 → back to original page
[~15 seconds total]
```

## Component Strategy

### shadcn/ui — Use Directly

| Component | Where used |
|---|---|
| `Input` | Search bar |
| `Button` | Accept/Reject, Sign in, Admin actions |
| `Badge` | Severity, stack tags, provenance |
| `Sheet` | Lesson detail slide-over |
| `Tabs` | Fix / Context / Code / Provenance in panel |
| `Dialog` | API key revoke, lesson delete confirmation |
| `Toast` | Action feedback + undo |
| `ScrollArea` | Lesson list, inbox feed, panel body |
| `Skeleton` | All loading states |
| `Command` | Cmd+K palette |
| `DropdownMenu` | Project switcher, sort |
| `Table` | Admin panel |

### Custom Components

| Component | File | Purpose |
|---|---|---|
| `LessonCard` | `components/app/lesson-card.tsx` | List item: severity + title + fix preview + tags + provenance |
| `LessonPanel` | `components/app/lesson-panel.tsx` | Slide-over detail: 4 tabs, syntax-highlighted code |
| `SearchBar` | `components/app/search-bar.tsx` | Debounced input + filter chips + result count, synced to URL |
| `FilterChips` | `components/app/filter-chips.tsx` | Toggleable tag pills, appear after first results |
| `SeverityBadge` | `components/app/severity-badge.tsx` | `critical/high/medium/low` → consistent color + label |
| `ProvenanceDot` | `components/app/provenance-dot.tsx` | Colored dot: indigo=review, zinc=manual, emerald=propagated |
| `InboxItem` | `components/app/inbox-item.tsx` | Propagation card with focused/dismissed states |
| `ProjectSwitcher` | `components/app/project-switcher.tsx` | Top-bar dropdown, drives global `useProject()` context |
| `AppSidebar` | `components/app/app-sidebar.tsx` | 52px icon-only nav with badge + theme toggle |
| `EmptyState` | `components/app/empty-state.tsx` | Custom copy per context — never generic "no data" |
| `CodeBlock` | `components/app/code-block.tsx` | `shiki` syntax highlighting in lesson panel |

### State Architecture

| State | Storage | Reason |
|---|---|---|
| Search query + filters | URL params | Shareable, bookmarkable, browser back works |
| Active project | `localStorage` via context | Persists across sessions |
| Theme preference | `localStorage` via context | Persists across sessions |
| Session auth | `httpOnly` cookie | Secure, no client-side token |
| Open lesson panel | URL param `?lesson=<id>` | Deep-linkable |

## UX Consistency Patterns

### Loading States

| Situation | Pattern |
|---|---|
| Search results loading | `Skeleton` cards — appear immediately on keystroke |
| Lesson panel opening | 200ms slide — no spinner, content loads during animation |
| Page initial load | `loading.tsx` skeleton matching page layout |
| Background action (accept/reject) | Optimistic UI — no spinner, undo on failure |

### Empty States

| Context | Title | Description |
|---|---|---|
| Lessons — no query results | "No lessons match this search" | "Try broader terms, or remove filters." |
| Lessons — project has no lessons | "No lessons yet" | "Captured automatically from BMAD code reviews. Run `lore install` to connect developers." |
| Inbox — nothing pending | "All caught up" | "No pending suggestions. Propagation engine last ran 2h ago." |
| Dashboard — no sessions | "Memory starts here" | "Sessions will appear once developers run `lore install`." |

### Error States

| Error | Pattern |
|---|---|
| Search API failure | Inline below search: "Search unavailable." + Retry |
| Inbox action failure | Toast: "Action failed." + optimistic rollback |
| Login failure | Inline on form: "Incorrect password." |
| Server unreachable | Top banner (non-blocking): "Lore server unreachable." |

### Confirmation Patterns

| Action | Pattern |
|---|---|
| Revoke API key | `Dialog` — destructive confirm, red button |
| Delete project | `Dialog` — destructive confirm with cascade warning |
| Accept / Reject propagation | Optimistic + Toast + Undo 5s — no modal |
| Sign out | Instant, redirect to login |

### Toast Copy

| Event | Copy |
|---|---|
| Propagation accepted | "Added to your project's memory." |
| Propagation rejected | "Dismissed." |
| API key copied | "Copied to clipboard." |
| API key revoked | "API key revoked." |

### Keyboard Shortcut Map

| Shortcut | Action |
|---|---|
| `Cmd+K` | Open command palette |
| `G L` | Go to Lessons |
| `G I` | Go to Inbox |
| `G D` | Go to Dashboard |
| `G A` | Go to Admin |
| `J / K` | Navigate list items |
| `Enter` | Open focused item |
| `Esc` | Close overlay / panel (cascading) |
| `A` | Accept focused inbox item |
| `R` | Reject focused inbox item |
| `?` | Show shortcut reference |

## Responsive Design & Accessibility

### Responsive Strategy

**Desktop-first.** Minimum supported viewport: 1024px. No mobile support in v2.

| Breakpoint | Behavior |
|---|---|
| `≥ 1280px` | Full layout: 52px sidebar + main content, 1280px max-width |
| `1024px–1279px` | Sidebar retained, main content compresses cleanly |
| `< 1024px` | Not supported — "best viewed on desktop" notice |

### Accessibility Requirements (WCAG 2.1 AA)

| Requirement | Implementation |
|---|---|
| Color contrast | All pairs validated at AA (4.5:1 body, 3:1 large). Severity colors verified in both themes. |
| Keyboard navigation | Full access via Radix UI primitives. Tab order follows visual order. |
| Focus rings | `focus-visible:ring-2 ring-indigo-600` on all interactive elements |
| Screen reader | Semantic HTML · `aria-label` on icon buttons · `aria-live` on toasts + result counts |
| Reduced motion | `prefers-reduced-motion` — disable slide animations, use instant show/hide |
| Skip link | "Skip to main content" at top of every page |

### Testing Strategy

| Test | Tool | When |
|---|---|---|
| Contrast ratio | Browser DevTools | During implementation |
| Keyboard flows | Manual tab-through | Before each PR |
| Screen reader | VoiceOver (macOS) | Before v2 launch |
| Automated a11y | `@axe-core/react` | CI on every PR |
