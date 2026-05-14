# Lore Platform — Web UI Epics and Stories (v2)

Version: 1.0.0
Status: Draft for Implementation
Date: 2026-05-14

---

## Overview

Five epics covering the Lore Platform v2 Web UI (`apps/web`). Stories are ordered
by dependency — Epic 7 (Foundation) must be substantially complete before any later
epic can be built or tested end-to-end.

The Web UI is a separate Next.js App Router application in the monorepo. It
communicates with the existing Lore Fastify REST API via API key authentication.
The UX design specification at `planning-artifacts/ux-design-specification.md`
is the authoritative visual and interaction reference for all stories in this file.

---

## Functional Requirements Summary

| ID | Requirement |
|---|---|
| UI-FR-01 | `apps/web` Next.js App Router scaffold in monorepo with shadcn/ui + Tailwind CSS |
| UI-FR-02 | Login page — single password via `WEB_UI_SECRET` env var, `httpOnly` session cookie (7-day, `sameSite: strict`) |
| UI-FR-03 | Three-mode theme — Light / Dark / System, Tailwind `class` strategy, preference in `localStorage` |
| UI-FR-04 | App shell — 52px icon-only sidebar, top bar with project switcher, 1280px max-width layout |
| UI-FR-05 | Project switcher — dropdown in top bar, global `useProject()` context, "All Projects" cross-project view |
| UI-FR-06 | Lesson search — `/lessons` page, debounced 250ms, as-you-type, query reflected in URL `?q=` |
| UI-FR-07 | `LessonCard` — severity badge, title, fix preview, stack tags, provenance dot |
| UI-FR-08 | `FilterChips` — stack tag / severity / category filters that appear after first results load |
| UI-FR-09 | `LessonPanel` slide-over — right-side Sheet, Fix / Context / Code / Provenance tabs, URL param `?lesson=<id>` |
| UI-FR-10 | `CodeBlock` — shiki syntax highlighting in lesson panel Code tab |
| UI-FR-11 | Cmd+K global command palette — opens < 100ms from any page, Esc dismisses without navigating |
| UI-FR-12 | Propagation inbox — `/inbox`, vertical feed, accept/reject per item |
| UI-FR-14 | Optimistic UI + undo — inbox accept/reject fades immediately, undo Toast for 5 seconds |
| UI-FR-15 | Dashboard — `/dashboard`, stats cards (lessons, sessions, propagations), memory growth chart |
| UI-FR-16 | Admin panel — `/admin`, projects table, API key copy/revoke (with Dialog confirm) |
| UI-FR-17 | Empty states — custom copy per context (search, inbox, dashboard, first-time setup) |
| UI-FR-18 | Error states — inline search error, toast rollback, login error, server-unreachable banner |
| UI-FR-19 | Skip link — "Skip to main content" on every page |
| UI-FR-20 | Automated a11y — `@axe-core/react` in CI on every PR |

## Non-Functional Requirements Summary

| ID | Requirement |
|---|---|
| UI-NFR-01 | Search results rendered < 500ms from keystroke (debounce 250ms + API < 250ms) |
| UI-NFR-02 | Cmd+K palette opens in < 100ms |
| UI-NFR-03 | Desktop-first — minimum supported viewport 1024px; show notice below that |
| UI-NFR-04 | WCAG 2.1 AA — all color pairs 4.5:1 body, 3:1 large text, in both light and dark themes |
| UI-NFR-05 | `prefers-reduced-motion` — disable all slide/fade animations when set |

---

## Epic 7 — Web UI Foundation

**Goal:** Stand up the `apps/web` Next.js application with the full design system,
session authentication, theme switching, and app shell. All Web UI epics depend on
this epic being substantially complete.

**Acceptance (epic-level):** A running Next.js app at `localhost:3001` shows a
login page, accepts `WEB_UI_SECRET`, sets a 7-day `httpOnly` session cookie,
renders the 52px icon-only sidebar + project switcher shell, and switches between
light, dark, and system themes.

**Covers:** UI-FR-01, UI-FR-02, UI-FR-03, UI-FR-04, UI-FR-05

---

### Story 7.1 — Monorepo Scaffold

**As a** developer,
**I want** the `apps/web` Next.js application bootstrapped in the monorepo,
**so that** all subsequent Web UI stories have a consistent, correctly configured
foundation to build on.

**Acceptance Criteria:**

- [ ] `pnpm-workspace.yaml` is updated to add `packages: ['apps/*']` alongside the existing `allowBuilds` entries — no existing server code moves
- [ ] `turbo.json` is created at the repo root with `build`, `dev`, and `lint` pipeline tasks
- [ ] `apps/web/` is created as a Next.js 15 App Router application with `package.json` name `@lore/web`
- [ ] `pnpm install` from repo root installs all `apps/web` dependencies without touching the server's `node_modules`
- [ ] `pnpm --filter @lore/web dev` starts the dev server at `localhost:3001`
- [ ] `pnpm --filter @lore/web build` compiles without errors
- [ ] shadcn/ui is initialised — `components/ui/` exists with at least `button` and `input` copied in
- [ ] Tailwind CSS is configured with `darkMode: 'class'`
- [ ] CSS custom properties matching the color token table in UX spec §Visual Design are defined in `styles/globals.css` for both `:root` (light) and `.dark`
- [ ] Inter and Geist Mono are loaded via `next/font/google`, scoped to `<html>` in `app/layout.tsx`
- [ ] `NEXT_PUBLIC_LORE_API_URL` env var is read in `lib/config.ts`; missing var throws at startup
- [ ] `pnpm lint` and `pnpm format:check` exit 0 from within `apps/web`

- [ ] `apps/web/next.config.ts` sets `output: 'standalone'`
- [ ] `apps/web/Dockerfile` is a two-stage build (builder + runner) using `node:22-alpine`, matching the existing server image; build context is the repo root
- [ ] `NEXT_PUBLIC_LORE_API_URL` is passed as a Docker `ARG` in the Dockerfile (baked into client bundle at build time)
- [ ] `docker-compose.yml` is updated with a `web` service that builds from `apps/web/Dockerfile`, maps `127.0.0.1:3001:3001`, and declares `depends_on: mcp-server`

**Technical Notes:**

- The existing server package at the repo root is untouched — only `pnpm-workspace.yaml` and `turbo.json` are added at the root level
- Package name: `@lore/web`
- Port: `3001` (API runs on `3100`)
- shadcn/ui init command: `pnpm dlx shadcn@latest init` — choose New York style, zinc base
- `NEXT_PUBLIC_LORE_API_URL` must be the public-facing API URL (browser-accessible), not the Docker-internal hostname

---

### Story 7.2 — Login Page and Session Auth

**As an** administrator,
**I want** a login page that accepts the `WEB_UI_SECRET` password,
**so that** the Web UI is protected and a session persists for 7 days without
re-entry.

**Acceptance Criteria:**

- [ ] `GET /login` renders a centered card on the page background with: Lore wordmark, "Welcome back" heading, single unlabelled password input, "Sign in" button
- [ ] No username field is present
- [ ] `POST /api/auth/login` (Next.js Route Handler) reads `WEB_UI_SECRET` from `process.env`, compares with submitted password using a constant-time comparison, and on match sets a `session` cookie: `httpOnly: true`, `sameSite: 'strict'`, `secure: true` in production, `maxAge: 60 * 60 * 24 * 7`
- [ ] On incorrect password the form shows "Incorrect password." inline below the input; no page reload
- [ ] `POST /api/auth/logout` clears the session cookie and redirects to `/login`
- [ ] Next.js middleware in `middleware.ts` checks for a valid session cookie on all routes except `/login` and `/api/auth/*`; unauthenticated requests redirect to `/login`
- [ ] After login the user is redirected to `/lessons`
- [ ] `WEB_UI_SECRET` missing from env throws an error at startup with a clear message
- [ ] No user enumeration — timing of correct vs. incorrect response is indistinguishable

---

### Story 7.3 — Theme System

**As a** user,
**I want** to switch between light, dark, and system themes,
**so that** the UI matches my workstation preference.

**Acceptance Criteria:**

- [ ] `ThemeProvider` wraps the app in `app/layout.tsx` and exposes a `useTheme()` hook
- [ ] Theme preference is stored in `localStorage` under key `lore-theme`
- [ ] System mode reads `prefers-color-scheme` via `window.matchMedia`
- [ ] Switching theme applies or removes the `dark` class on `<html>` without a full page reload
- [ ] All shadcn/ui components update appearance via CSS variables only — no component-level conditional styles
- [ ] Theme toggle is a three-state icon button (sun / moon / monitor) in the top bar
- [ ] Default theme on first load (no `localStorage` value) is System
- [ ] No flash of unstyled content — theme class is applied before first paint (script in `<head>`)

---

### Story 7.4 — App Shell

**As a** user,
**I want** a consistent sidebar and top bar on every page after login,
**so that** navigation is always reachable and the current project scope is visible.

**Acceptance Criteria:**

- [ ] `AppSidebar` is a 52px-wide icon-only left nav rendered in `app/(dashboard)/layout.tsx`
- [ ] Sidebar contains four icon buttons in order: Lessons (`BookOpen`), Inbox (`Inbox`), Dashboard (`BarChart2`), Admin (`Settings`)
- [ ] Active page icon is highlighted with `--primary` color; tooltip shows page name on hover
- [ ] Inbox icon shows a badge with the count of pending propagations fetched via `useQuery({ queryKey: ['propagations', 'count', projectSlug] })` in the layout
- [ ] Top bar contains: page title (left), `ProjectSwitcher` dropdown (center-right), theme toggle (far right)
- [ ] `ProjectSwitcher` uses `useQuery({ queryKey: ['projects'], queryFn: fetchProjects })` to load all registered projects
- [ ] "All Projects" is the first option in the project switcher and is the default
- [ ] Selected project is persisted in `localStorage` under key `lore-project`
- [ ] `useProject()` context hook returns `{ projectId, projectSlug, setProject }` and is accessible from any child component
- [ ] All pages (Lessons, Inbox, Dashboard, Admin) re-fetch data when the selected project changes
- [ ] Layout max-width is `1280px` centered with `px-6 py-6` main content padding

---

### Story 7.5 — API Client and TanStack Query Setup

**As a** developer,
**I want** a typed API client wired to TanStack Query,
**so that** all pages fetch data with caching, loading states, and error handling
without boilerplate.

**Acceptance Criteria:**

- [ ] `axios` and `@tanstack/react-query` are installed in `apps/web`
- [ ] `lib/axios.ts` creates and exports a configured `apiClient` axios instance:
  - `baseURL` from `NEXT_PUBLIC_LORE_API_URL`
  - `withCredentials: true` so the session cookie is forwarded automatically
  - `headers: { 'Content-Type': 'application/json' }`
  - A response interceptor that redirects to `/login` on `401`
  - A response interceptor that throws a typed `ApiError({ status, message })` on any non-2xx so callers never handle raw `AxiosError`
- [ ] `lib/api.ts` exports plain typed async fetcher functions built on `apiClient` — one per endpoint: `fetchLessons`, `fetchLesson`, `fetchPropagations`, `fetchStats`, `fetchProjects`, etc.; each function returns the unwrapped response data type
- [ ] `QueryClient` is instantiated once in `lib/query-client.ts` with `staleTime: 30_000` and `retry: 1`
- [ ] `QueryClientProvider` wraps the app in `app/layout.tsx`
- [ ] Response types for all endpoints are defined in `lib/api-types.ts`
- [ ] No direct `axios` or `fetch` calls exist outside `lib/axios.ts` and `lib/api.ts` in `apps/web`
- [ ] All data-fetching components use `useQuery` (reads) or `useMutation` (writes) — no `useEffect`+fetch patterns

---

## Epic 8 — Lesson Discovery

**Goal:** The complete lesson search experience — search bar, result cards, filter
chips, slide-over panel, syntax-highlighted code, and the Cmd+K command palette.
This is the primary user-facing feature of the Web UI.

**Acceptance (epic-level):** A logged-in admin can open the Lessons page, type a
free-text query, see LessonCards appear as they type, filter by stack tag and
severity, click a card to open the LessonPanel slide-over, read the Fix tab with
code highlighted in the Code tab, and open the same flow via Cmd+K from any page.

**Covers:** UI-FR-06, UI-FR-07, UI-FR-08, UI-FR-09, UI-FR-10, UI-FR-11

---

### Story 8.1 — Lessons Page and SearchBar

**As a** developer,
**I want** a search bar that shows lesson results as I type,
**so that** I can find relevant lessons in under 5 seconds without any configuration.

**Acceptance Criteria:**

- [ ] `/lessons` page renders `SearchBar` as the primary element, auto-focused on mount
- [ ] Input is debounced at 250ms — no API call fires until 250ms after the last keystroke
- [ ] Query is reflected in URL `?q=<value>` and restored on page load / browser back
- [ ] Data is fetched via `useQuery({ queryKey: ['lessons', query, filters, projectSlug], queryFn: () => fetchLessons({ q: query, ...filters, project: projectSlug }), enabled: query.length >= 2 || query.length === 0 })`
- [ ] Results render as `LessonCard` components in a `ScrollArea` below the search bar
- [ ] A result count is shown ("12 lessons" / "1 lesson") when results are present
- [ ] `Skeleton` cards (matching LessonCard height) render while `isLoading` is true; replaced by real results when data arrives
- [ ] Empty query state shows the project's most recently captured lessons (up to 20)
- [ ] No search is triggered for queries shorter than 2 characters
- [ ] Results are sorted by relevance score descending

---

### Story 8.2 — LessonCard Component

**As a** developer,
**I want** lesson results to show severity, title, fix preview, and tags at a glance,
**so that** I can decide whether to open a lesson before clicking.

**Acceptance Criteria:**

- [ ] `LessonCard` (`components/app/lesson-card.tsx`) renders: `SeverityBadge`, lesson title, fix preview (first sentence, truncated at 120 chars), stack tag pills, `ProvenanceDot`
- [ ] `SeverityBadge` (`components/app/severity-badge.tsx`) renders `critical` (red-500), `high` (orange-500), `medium` (yellow-500), `low` (blue-500) consistently in light and dark modes
- [ ] Stack tags render as compact `Badge` pills; more than 4 tags collapse to "+N more"
- [ ] `ProvenanceDot` (`components/app/provenance-dot.tsx`) is a 6px colored dot: indigo-500 for code review, zinc-500 for manual, emerald-500 for propagated; tooltip shows source label on hover
- [ ] Clicking anywhere on the card opens the `LessonPanel` and appends `?lesson=<id>` to the URL
- [ ] Card has `shadow-sm`, `p-4` padding, rounded corners, and a hover state that raises to `shadow-md`
- [ ] Cards are keyboard-focusable; `Enter` on a focused card opens the panel

---

### Story 8.3 — FilterChips

**As a** developer,
**I want** to narrow lesson results by stack tag, severity, or category,
**so that** I can zero in on lessons relevant to my current context.

**Acceptance Criteria:**

- [ ] `FilterChips` (`components/app/filter-chips.tsx`) renders below the search bar and above the result list
- [ ] Filter chips are hidden until the first results have loaded — they never appear before results
- [ ] Three filter groups: Stack Tag (multiselect from tags present in results), Severity (critical / high / medium / low), Category (from lesson categories present in results)
- [ ] Active filters are reflected in URL params (`?tags=typescript,prisma&severity=critical`)
- [ ] Selecting a filter re-triggers the search with the additional constraint
- [ ] Multiple filters within a group are OR; across groups are AND
- [ ] A "Clear filters" link appears when any filter is active; clicking resets all filters
- [ ] Filter chip counts ("typescript (4)") reflect the number of matching results

---

### Story 8.4 — LessonPanel Slide-Over

**As a** developer,
**I want** to read a lesson's fix, context, code, and provenance in a side panel,
**so that** the lesson list stays visible and I can quickly move to the next result.

**Acceptance Criteria:**

- [ ] `LessonPanel` (`components/app/lesson-panel.tsx`) is a right-side `Sheet` component
- [ ] Panel opens with a 200ms ease-in-out slide animation
- [ ] Panel URL is `?lesson=<id>` — deep-linkable and bookmarkable; navigating to this URL directly opens the panel
- [ ] Four tabs in order: **Fix** (default), **Context**, **Code**, **Provenance**
- [ ] **Fix tab:** prevention rule (bold) + full fix text
- [ ] **Context tab:** problem statement + root cause
- [ ] **Code tab:** syntax-highlighted code example via `CodeBlock` (hidden if no code in lesson)
- [ ] **Provenance tab:** source label, trust tier, session reference (linked if session ID present), occurrence count, first/last seen dates
- [ ] Panel body scrolls independently via `ScrollArea`
- [ ] Closing the panel removes `?lesson=<id>` from the URL and restores focus to the search bar
- [ ] Pressing Esc closes the panel

---

### Story 8.5 — CodeBlock with shiki

**As a** developer,
**I want** code examples in lesson panels to be syntax-highlighted,
**so that** code is readable at a glance without copy-pasting it into an editor.

**Acceptance Criteria:**

- [ ] `CodeBlock` (`components/app/code-block.tsx`) uses shiki for server-side syntax highlighting
- [ ] Language is determined from the lesson's `language` field; defaults to `typescript` if absent
- [ ] Code renders in Geist Mono at `text-sm`
- [ ] A "Copy" icon button in the top-right corner copies raw code to the clipboard and shows a Toast "Copied to clipboard."
- [ ] Background color is `--muted` in both light and dark modes; no separate shiki theme conflict
- [ ] Long lines wrap or scroll horizontally — no overflow beyond the panel width
- [ ] The component renders correctly with SSR (no `useEffect` hydration flash)

---

### Story 8.6 — Cmd+K Global Command Palette

**As a** power user,
**I want** to search lessons from any page without navigating away,
**so that** I can look up a fix in under 15 seconds while working elsewhere.

**Acceptance Criteria:**

- [ ] Pressing `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux) opens the command palette from any page
- [ ] Palette opens in < 100ms — keyboard listener is registered globally in the root layout
- [ ] Palette is implemented with the shadcn/ui `Command` component rendered in a `Dialog`
- [ ] Free-text input is auto-focused when the palette opens
- [ ] Results show: severity badge, lesson title, fix preview (first 80 chars)
- [ ] Results are debounced at 250ms and fetched via `useQuery({ queryKey: ['lessons', 'palette', query], queryFn: () => fetchLessons({ q: query }), enabled: query.length >= 2 })` — shares the same cache as the Lessons page
- [ ] Pressing `Enter` on a result navigates to `/lessons?q=<query>&lesson=<id>`, opening the panel
- [ ] Pressing `Esc` closes the palette without navigating; the user stays on the current page
- [ ] Palette closes automatically after `Enter` navigation
- [ ] A "Search lessons..." placeholder is shown when the input is empty

---

## Epic 9 — Propagation Inbox

**Goal:** A lightweight triage UI for cross-project propagation suggestions. Users
accept or reject each suggestion via buttons, with optimistic UI and a 5-second
undo window.

**Acceptance (epic-level):** A logged-in admin can view all pending propagations for
the selected project, accept or reject each via buttons, see the item disappear
immediately with a toast + undo option, and reach an "All caught up" empty state
after triaging all items.

**Covers:** UI-FR-12, UI-FR-14, UI-FR-17 (inbox empty state), UI-FR-18 (inbox error)

---

### Story 9.1 — Inbox Page and Feed Layout

**As a** project lead,
**I want** to see all pending propagation suggestions in a single feed,
**so that** I can triage them without hunting across multiple views.

**Acceptance Criteria:**

- [ ] `/inbox` page renders a vertical feed of `InboxItem` components in a `ScrollArea`
- [ ] Page heading shows "Inbox" and a count badge: "3 pending" (singular "1 pending" when count is 1)
- [ ] Items are fetched via `useQuery({ queryKey: ['propagations', projectSlug], queryFn: () => fetchPropagations(projectSlug) })`
- [ ] Items are sorted by severity descending (critical first), then by created date descending
- [ ] `Skeleton` items (matching InboxItem height) are shown while loading
- [ ] The sidebar `Inbox` icon badge count matches the heading count and updates after triage actions
- [ ] When "All Projects" is selected in the project switcher, the inbox shows propagations across all projects, each item showing the target project name

---

### Story 9.2 — InboxItem Component

**As a** project lead,
**I want** each propagation suggestion to show me what it is and why it was suggested,
**so that** I can make an accept/reject decision without opening a separate detail view.

**Acceptance Criteria:**

- [ ] `InboxItem` (`components/app/inbox-item.tsx`) renders: `SeverityBadge`, lesson title, "Problem:" one-sentence summary, "Why suggested:" line showing stack tag overlap and occurrence count, "Accept" and "Reject" buttons
- [ ] "Accept" button is primary-colored (`--primary`); "Reject" button is muted/outline
- [ ] Accept icon is `Check`, Reject icon is `X` (Lucide)
- [ ] Item has a distinct focused state (indigo left border, slightly elevated background) when focused via Tab
- [ ] Clicking the lesson title opens a read-only view of the lesson (can reuse `LessonPanel` in read-only mode, or navigate to `/lessons?lesson=<id>`)
- [ ] Item is accessible — `Accept` and `Reject` buttons have descriptive `aria-label` attributes including the lesson title

---

### Story 9.3 — Optimistic UI and Undo Toast

**As a** project lead,
**I want** accept/reject actions to feel instant with an undo option,
**so that** triage is fast and mistakes are recoverable.

**Acceptance Criteria:**

- [ ] Accept and reject are handled by a `useMutation` with `onMutate` for optimistic updates: `onMutate` snapshots the current `['propagations', projectSlug]` cache, removes the item, and returns the snapshot as `context`
- [ ] On "Accept" click: item fades out immediately (CSS opacity + height transition, 150ms) via the optimistic cache update; a Toast appears: "Added to your project's memory." with an "Undo" link
- [ ] On "Reject" click: same fade-out; Toast "Dismissed." with "Undo"
- [ ] `onSuccess`: `queryClient.invalidateQueries({ queryKey: ['propagations'] })` to sync the sidebar badge count
- [ ] "Undo" in the toast is clickable for 5 seconds; clicking it fires the reverse mutation and re-inserts the item via `queryClient.setQueryData` at its original position
- [ ] `onError`: TanStack Query rolls back via `context` (snapshot), item reappears; Toast shows "Action failed." with no undo
- [ ] Toast duration is 5 seconds for success; 8 seconds for failure
- [ ] Multiple items can be actioned in quick succession without UI glitches — each undo timer is independent

---

### Story 9.4 — Inbox Empty State

**As a** project lead,
**I want** the inbox to celebrate an empty queue,
**so that** reaching zero pending items feels like a reward, not an absence.

**Acceptance Criteria:**

- [ ] When no pending propagations exist, `EmptyState` renders with title "All caught up" and description "No pending suggestions. Propagation engine last ran [relative time] ago."
- [ ] The "last ran" time is sourced from the propagation engine metadata endpoint; falls back to "recently" if unavailable
- [ ] The empty state does not show the item skeleton or any loading indicator
- [ ] After the last item is actioned (and no undo is triggered), the empty state appears with a smooth fade-in (100ms)
- [ ] Empty state renders correctly for both a project-scoped inbox and the "All Projects" view

---

## Epic 10 — Dashboard and Admin

**Goal:** Operational visibility for project leads and platform administrators.
The dashboard shows memory growth stats; the admin panel manages projects and API
keys.

**Acceptance (epic-level):** A logged-in admin can view lesson count, session count,
and propagation stats on the dashboard, see a trend chart of lesson growth, view all
registered projects in a table, copy a project's API key to clipboard, and revoke
a key via a destructive confirm dialog.

**Covers:** UI-FR-15, UI-FR-16, UI-FR-17 (dashboard empty state)

---

### Story 10.1 — Dashboard Stats Cards

**As a** project lead,
**I want** to see at-a-glance metrics on memory growth and system activity,
**so that** I can confirm Lore is actively capturing knowledge.

**Acceptance Criteria:**

- [ ] `/dashboard` page renders four stat cards: Total Lessons, Sessions Run (all time), Propagations Sent, Propagations Accepted
- [ ] Stats are fetched via `useQuery({ queryKey: ['stats', projectSlug], queryFn: () => fetchStats(projectSlug) })`
- [ ] Each card shows: metric label, large numeric value, and a secondary line (e.g. "+3 this week" if delta data is available)
- [ ] `Skeleton` cards are shown while loading
- [ ] When "All Projects" is selected, stats aggregate across all projects
- [ ] When the project has no sessions yet, all cards show "0" (not blank) and the "Memory starts here" empty state renders below the cards with copy: "Sessions will appear once developers run `lore install`."

---

### Story 10.2 — Memory Growth Trend Chart

**As a** project lead,
**I want** to see lesson count growing over time,
**so that** I can visualise the compounding effect of Lore's automated captures.

**Acceptance Criteria:**

- [ ] Dashboard renders a line/area chart below the stats cards showing weekly lesson count over the last 12 weeks
- [ ] Chart uses the shadcn/ui `Chart` component (recharts-based)
- [ ] X-axis: week labels (e.g. "May 5", "May 12"); Y-axis: lesson count
- [ ] Chart line color is `--primary` (indigo); fill below line is `--primary` at 10% opacity
- [ ] When fewer than 2 data points exist the chart is hidden and the "Memory starts here" empty state is shown instead
- [ ] Chart renders correctly in both light and dark mode (axis labels use `--muted-foreground`)
- [ ] Chart is not interactive (no tooltips required for v2) — static visual only

---

### Story 10.3 — Admin Projects Table

**As a** platform administrator,
**I want** to see all registered projects in a table,
**so that** I have a single place to audit what is connected to Lore.

**Acceptance Criteria:**

- [ ] `/admin` page renders a `Table` with columns: Name, Slug, Stack Tags, Lesson Count, Created Date
- [ ] Data is fetched via `useQuery({ queryKey: ['projects'], queryFn: fetchProjects })` (admin-authenticated via session cookie which the API maps to `ADMIN_SECRET`)
- [ ] Stack tags render as `Badge` pills (same style as lesson cards), capped at 5 visible + "+N more"
- [ ] Created Date renders as relative time ("3 days ago") with full date in a `title` attribute
- [ ] Table rows are sorted by created date descending (newest first)
- [ ] `Skeleton` rows are shown while loading (5 placeholder rows)
- [ ] An "Add Project" button links to the API registration flow (out of scope for v2 UI — button opens a `Dialog` with a code snippet showing the `POST /api/projects/register` curl command)

---

### Story 10.4 — API Key Management

**As a** platform administrator,
**I want** to copy and revoke project API keys from the admin panel,
**so that** I can manage access without touching the server directly.

**Acceptance Criteria:**

- [ ] Each project row in the admin table has a "Keys" action that expands an inline row or opens a `Sheet` showing the project's API key (masked: `lore_slug_••••••••••••••••••••••••`)
- [ ] A "Copy" icon button calls `GET /api/projects/:slug/key` (admin endpoint that returns the masked key reference) — note: the plain-text key is not stored, so Copy copies the key identifier; if re-generation is needed the user must revoke and regenerate
- [ ] A "Regenerate" button calls `POST /api/projects/:slug/keys/regenerate` and displays the new plain-text key exactly once in a `Dialog` with a "Copy and close" button and a warning: "This is the only time this key will be shown."
- [ ] A "Revoke" button opens a `Dialog` with: title "Revoke API key?", body "This will immediately invalidate the key for [project name]. Agents using this key will lose access.", a red "Revoke" confirm button, and a "Cancel" button
- [ ] Revoke and regenerate each use a `useMutation`; `onSuccess` calls `queryClient.invalidateQueries({ queryKey: ['projects'] })` to refresh the table
- [ ] On revoke confirm: mutation fires `DELETE /api/projects/:slug/keys/:keyId`; `onSuccess` shows Toast "API key revoked." and the key row updates to "No active key"
- [ ] On any mutation error: Dialog closes and a Toast shows "Action failed. Please try again."

---

## Epic 11 — Accessibility and Quality

**Goal:** WCAG 2.1 AA compliance across all pages, automated accessibility testing
in CI, reduced motion support, and consistent error and unsupported-viewport states.

**Acceptance (epic-level):** All pages pass `@axe-core/react` with zero violations
in CI, all animations are suppressed when `prefers-reduced-motion: reduce` is set,
and viewports below 1024px display a visible "best viewed on desktop" notice.

**Covers:** UI-FR-18 (all error states), UI-FR-19, UI-FR-20, UI-NFR-03, UI-NFR-04, UI-NFR-05

---

### Story 11.1 — WCAG AA Contrast and Semantic Markup

**As a** user with accessibility needs,
**I want** the Web UI to meet WCAG 2.1 AA standards,
**so that** the product is usable regardless of visual ability or input device.

**Acceptance Criteria:**

- [ ] Every page has a "Skip to main content" anchor as the first focusable element; clicking it moves focus to `<main>`
- [ ] All body text color pairs achieve at least 4.5:1 contrast ratio in both light and dark themes
- [ ] All large text and UI component color pairs achieve at least 3:1 contrast ratio in both themes
- [ ] Severity badge colors (red/orange/yellow/blue) are verified at AA in both themes; yellow (`medium`) uses dark text on the badge if contrast requires it
- [ ] All interactive elements show `focus-visible:ring-2 ring-indigo-600` focus ring — no interactive element loses focus visibility
- [ ] All icon-only buttons (`AppSidebar` icons, `ProvenanceDot` tooltip triggers, theme toggle) have an `aria-label`
- [ ] `aria-live="polite"` is applied to the search result count and to the Toast region
- [ ] Semantic HTML is used throughout: `<nav>`, `<main>`, `<header>`, `<section>`, heading hierarchy (`h1` once per page)
- [ ] Tab order follows visual reading order on all pages

---

### Story 11.2 — axe-core CI Setup

**As a** developer,
**I want** automated accessibility testing to run on every PR,
**so that** regressions are caught before code is merged.

**Acceptance Criteria:**

- [ ] `@axe-core/react` is installed as a dev dependency in `apps/web`
- [ ] A CI job (GitHub Actions or equivalent) runs axe against at minimum: `/login`, `/lessons`, `/inbox`, `/dashboard`, `/admin`
- [ ] The CI job fails if any axe violation is reported at `critical` or `serious` impact level
- [ ] axe is run against both light and dark theme variants of each page
- [ ] Test results are reported in the CI summary — violation count and page URL

---

### Story 11.3 — Reduced Motion Support

**As a** user with vestibular sensitivity,
**I want** animations to be disabled when I have set `prefers-reduced-motion`,
**so that** the UI does not cause discomfort.

**Acceptance Criteria:**

- [ ] A global CSS rule in `globals.css` applies `transition: none !important; animation: none !important` when `@media (prefers-reduced-motion: reduce)` is active
- [ ] `LessonPanel` slide-over uses instant show/hide (no 200ms slide) under reduced motion
- [ ] Cmd+K command palette uses instant show/hide under reduced motion
- [ ] InboxItem fade-out on accept/reject uses instant removal under reduced motion
- [ ] Theme switch (dark class toggle) has no CSS transition under reduced motion
- [ ] All Radix UI components inherit reduced-motion via the global CSS rule without component-level changes

---

### Story 11.4 — Error States and Viewport Notice

**As a** user,
**I want** clear, recoverable error messages and a notice when my viewport is too small,
**so that** I always understand what went wrong and how to recover.

**Acceptance Criteria:**

- [ ] **Search API failure:** an inline message renders below the search bar: "Search unavailable." with a "Try again" button that re-triggers the last query
- [ ] **Inbox action failure:** the rejected/accepted item reappears (optimistic rollback) and a Toast shows "Action failed." (see Story 9.3)
- [ ] **Login failure:** "Incorrect password." renders inline below the password input without a page reload (see Story 7.2)
- [ ] **Server unreachable:** a non-blocking top banner (yellow background, full-width) shows "Lore server unreachable. Retrying..." when API health check returns a network error; banner auto-dismisses when the server comes back
- [ ] **< 1024px viewport:** a full-screen overlay shows "Lore is best viewed on a desktop browser. Please use a viewport wider than 1024px." — implemented via a `@media (max-width: 1023px)` CSS rule so it requires no JavaScript
- [ ] All error states include a way to retry or recover — no dead-end error screens

---

## Story Dependency Order

```
7.1 Scaffold
  └─ 7.2 Login
       └─ 7.3 Theme
            └─ 7.4 App Shell
                 └─ 7.5 API Client
                      ├─ 8.1 Lessons Page
                      │    ├─ 8.2 LessonCard
                      │    │    └─ 8.3 FilterChips
                      │    └─ 8.4 LessonPanel
                      │         └─ 8.5 CodeBlock
                      ├─ 8.6 Cmd+K Palette
                      ├─ 9.1 Inbox Page
                      │    ├─ 9.2 InboxItem
                      │    │    └─ 9.3 Optimistic UI + Undo
                      │    └─ 9.4 Inbox Empty State
                      ├─ 10.1 Dashboard Stats
                      │    └─ 10.2 Trend Chart
                      └─ 10.3 Admin Table
                           └─ 10.4 API Key Management

11.1 WCAG + Semantic Markup  ← runs in parallel with 8–10
11.2 axe-core CI             ← after 11.1
11.3 Reduced Motion          ← after 7.3 Theme
11.4 Error States            ← after corresponding feature stories
```
