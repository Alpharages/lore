# Lore Platform — Web UI Technical Specification

Version: 1.0.0
Status: Draft for Implementation
Date: 2026-05-14

---

## 1. System Overview

The Web UI (`apps/web`) is a Next.js 15 App Router application added to the
existing Lore monorepo. It is a separate, independently deployable unit that
communicates exclusively with the Lore REST API (`lore-memory-mcp`) over HTTPS.
The Fastify server remains headless — the Web UI does not add SSR concerns to it.

### 1.1 Component Position in the Platform

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (desktop, ≥ 1024px)                                    │
│  apps/web — Next.js 15 App Router                               │
│  Port 3001 (dev) / served via Nginx or Vercel (prod)            │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS + session cookie (httpOnly)
                         │ axios — NEXT_PUBLIC_LORE_API_URL
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  lore-memory-mcp — Fastify REST API                             │
│  Port 3100 — existing, unchanged                                │
│  Auth: ADMIN_SECRET (Web UI sessions) + project API keys (MCP)  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Monorepo Structure

The repo is a pnpm workspace. The existing server code **stays at the
repository root** — nothing moves. `apps/web` is added as a new workspace
package alongside it.

```
/ (repo root)
├── package.json           # lore-memory-mcp server (unchanged)
├── src/                   # Fastify server source (unchanged)
├── pnpm-workspace.yaml    # updated: packages: ['apps/*']
├── turbo.json             # added
└── apps/
    └── web/               # new — Next.js 15 App Router
        └── package.json   # name: @lore/web
```

`pnpm-workspace.yaml` after update:

```yaml
packages:
  - 'apps/*'

allowBuilds:
  bcrypt: true
  esbuild: true
```

### 1.2 Deployment Strategy

| Environment | Web UI hosting       | API hosting          |
|---|---|---|
| Development | `localhost:3001`     | `localhost:3100`     |
| Production  | Vercel / Nginx       | Docker (unchanged)   |

The Web UI and API can be hosted independently. The only coupling is
`NEXT_PUBLIC_LORE_API_URL`.

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.x |
| Framework | Next.js (App Router) | 15.x |
| UI components | shadcn/ui (New York style) | latest |
| Styling | Tailwind CSS | 4.x |
| Component primitives | Radix UI (via shadcn) | latest |
| HTTP client | axios | latest |
| Server state | TanStack Query (`@tanstack/react-query`) | 5.x |
| Icons | Lucide React | latest |
| Syntax highlighting | shiki | latest |
| Charts | Recharts (via shadcn Chart) | latest |
| Fonts | Inter + Geist Mono via `next/font/google` | — |
| Package manager | pnpm | — |
| Linter | oxlint | — |
| Formatter | Prettier | — |

---

## 3. Environment Variables

```env
# Required
NEXT_PUBLIC_LORE_API_URL=https://lore.your-domain.com   # no trailing slash
WEB_UI_SECRET=<strong-random-password>                  # login password

# Optional
NODE_ENV=production
```

`NEXT_PUBLIC_LORE_API_URL` is embedded in the client bundle at build time.
`WEB_UI_SECRET` is server-only — never exposed to the client.

If either required variable is absent at startup, the app throws with a
descriptive message rather than running in a broken state.

---

## 4. Project Structure

```
apps/web/
├── app/
│   ├── layout.tsx               # Root layout — QueryClientProvider, ThemeProvider, fonts
│   ├── login/
│   │   └── page.tsx             # Login page (unauthenticated route)
│   ├── api/
│   │   └── auth/
│   │       ├── login/
│   │       │   └── route.ts     # POST /api/auth/login
│   │       └── logout/
│   │           └── route.ts     # POST /api/auth/logout
│   └── (dashboard)/             # Route group — requires session cookie
│       ├── layout.tsx           # App shell (AppSidebar + top bar)
│       ├── lessons/
│       │   └── page.tsx
│       ├── inbox/
│       │   └── page.tsx
│       ├── dashboard/
│       │   └── page.tsx
│       └── admin/
│           └── page.tsx
├── components/
│   ├── ui/                      # shadcn/ui copy-owned components
│   └── app/                     # Lore-specific composed components
│       ├── app-sidebar.tsx
│       ├── code-block.tsx
│       ├── empty-state.tsx
│       ├── filter-chips.tsx
│       ├── inbox-item.tsx
│       ├── lesson-card.tsx
│       ├── lesson-panel.tsx
│       ├── project-switcher.tsx
│       ├── provenance-dot.tsx
│       ├── search-bar.tsx
│       └── severity-badge.tsx
├── lib/
│   ├── axios.ts                 # Configured axios instance
│   ├── api.ts                   # Typed fetcher functions
│   ├── api-types.ts             # Response type definitions
│   ├── query-client.ts          # TanStack QueryClient singleton
│   └── config.ts                # Env var validation + exports
├── hooks/
│   ├── use-project.tsx          # useProject() context + provider
│   └── use-theme.tsx            # useTheme() context + provider
├── middleware.ts                # Session cookie guard
└── styles/
    └── globals.css              # Tailwind directives + CSS variable tokens
```

---

## 5. Authentication Specification

### 5.1 Session Mechanism

The Web UI uses a single shared password stored in `WEB_UI_SECRET`. This maps
to the `ADMIN_SECRET` model in the existing Fastify API — a logged-in Web UI
session has full admin access across all projects.

| Property | Value |
|---|---|
| Cookie name | `session` |
| `httpOnly` | `true` |
| `sameSite` | `strict` |
| `secure` | `true` in production, `false` in development |
| `maxAge` | `60 * 60 * 24 * 7` (7 days) |
| Storage | Cookie only — no `localStorage`, no JWT |

The cookie value is a signed random token generated on login and stored
server-side in memory (Next.js Route Handler). In v2 a simple in-memory
store is sufficient; persistence across restarts is not required.

### 5.2 Login Route Handler

```
POST /api/auth/login
Body: { password: string }
```

Implementation in `app/api/auth/login/route.ts`:

```typescript
export const POST = async (req: Request): Promise<Response> => {
  const { password } = await req.json();
  const secret = process.env.WEB_UI_SECRET;

  // Constant-time comparison to prevent timing attacks
  const valid = timingSafeEqual(
    Buffer.from(password),
    Buffer.from(secret ?? '')
  );

  if (!valid) {
    return Response.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const token = randomBytes(32).toString('hex');
  // Store token server-side (in-memory Map<token, expiry>)
  sessionStore.set(token, Date.now() + 7 * 24 * 60 * 60 * 1000);

  const response = Response.json({ ok: true });
  response.headers.set(
    'Set-Cookie',
    serialize('session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
  );
  return response;
};
```

### 5.3 Middleware Guard

`middleware.ts` runs on every request matching `/(dashboard)/**` and all
non-auth API routes. It reads the `session` cookie and validates it against
the in-memory store. Invalid or missing sessions redirect to `/login`.

```typescript
export const middleware = (request: NextRequest): NextResponse => {
  const session = request.cookies.get('session')?.value;
  if (!session || !sessionStore.has(session)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
};

export const config = {
  matcher: ['/((?!login|api/auth|_next|favicon).*)'],
};
```

### 5.4 API Authentication

The Web UI forwards the `session` cookie to the Lore API on every axios
request (`withCredentials: true`). The Fastify API must accept this cookie
and map it to admin access. The Fastify API already supports `ADMIN_SECRET`
header auth; the Web UI sends the secret as a request header set by the
axios interceptor using the same `WEB_UI_SECRET` value.

```
Web UI axios request → Authorization: Bearer <WEB_UI_SECRET> header
Fastify API → validates against ADMIN_SECRET env var
```

This avoids storing the secret in the client; the Next.js server injects
it into outbound axios requests via a server-side axios instance. Client
components use the client axios instance (cookie-based); server components
and Route Handlers use the server axios instance (secret-injected).

---

## 6. API Client Specification

### 6.1 axios Instance (`lib/axios.ts`)

```typescript
import axios, { type AxiosInstance } from 'axios';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: process.env.NEXT_PUBLIC_LORE_API_URL,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
  });

  // Normalize non-2xx responses into typed ApiError
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status ?? 0;
      const message = error.response?.data?.message ?? error.message;

      if (status === 401 && typeof window !== 'undefined') {
        window.location.href = '/login';
      }

      return Promise.reject(new ApiError(status, message));
    },
  );

  return client;
};

export const apiClient = createApiClient();
```

### 6.2 Fetcher Functions (`lib/api.ts`)

Each function wraps one API endpoint and returns the typed data directly
(not the full axios response). TanStack Query calls these as `queryFn`.

```typescript
import { apiClient } from './axios';
import type { Lesson, Propagation, Stats, Project } from './api-types';

export const fetchLessons = async (params: {
  q?: string;
  project?: string;
  tags?: string[];
  severity?: string[];
  category?: string;
}): Promise<Lesson[]> => {
  const { data } = await apiClient.get('/api/lessons/search', { params });
  return data.lessons;
};

export const fetchLesson = async (id: string): Promise<Lesson> => {
  const { data } = await apiClient.get(`/api/lessons/${id}`);
  return data;
};

export const fetchPropagations = async (project?: string): Promise<Propagation[]> => {
  const { data } = await apiClient.get('/api/propagations/pending', {
    params: { project },
  });
  return data.suggestions;
};

export const acceptPropagation = async (id: string): Promise<void> => {
  await apiClient.post(`/api/propagations/${id}/accept`);
};

export const rejectPropagation = async (id: string): Promise<void> => {
  await apiClient.post(`/api/propagations/${id}/reject`);
};

export const fetchStats = async (project?: string): Promise<Stats> => {
  const { data } = await apiClient.get('/api/stats', { params: { project } });
  return data;
};

export const fetchProjects = async (): Promise<Project[]> => {
  const { data } = await apiClient.get('/api/projects');
  return data.projects;
};

export const revokeApiKey = async (slug: string, keyId: string): Promise<void> => {
  await apiClient.delete(`/api/projects/${slug}/keys/${keyId}`);
};

export const regenerateApiKey = async (slug: string): Promise<{ key: string }> => {
  const { data } = await apiClient.post(`/api/projects/${slug}/keys/regenerate`);
  return data;
};
```

### 6.3 TanStack Query Client (`lib/query-client.ts`)

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

`QueryClientProvider` wraps the app in `app/layout.tsx`. A single
`queryClient` instance is created outside React's render cycle.

### 6.4 Query Key Conventions

All query keys follow the shape `[resource, ...scope]`:

| Data | Query key |
|---|---|
| Lesson search results | `['lessons', query, filters, projectSlug]` |
| Single lesson | `['lessons', id]` |
| Command palette search | `['lessons', 'palette', query]` |
| Pending propagations | `['propagations', projectSlug]` |
| Propagation count (badge) | `['propagations', 'count', projectSlug]` |
| Dashboard stats | `['stats', projectSlug]` |
| Projects list | `['projects']` |

---

## 7. State Management Architecture

| State | Mechanism | Scope |
|---|---|---|
| Search query + active filters | URL params (`?q=`, `?tags=`, `?severity=`) | Page session — shareable, browser-back works |
| Open lesson panel | URL param `?lesson=<id>` | Page session — deep-linkable |
| Active project | `localStorage['lore-project']` via `useProject()` | Persistent across sessions |
| Theme preference | `localStorage['lore-theme']` via `useTheme()` | Persistent across sessions |
| Session auth | `httpOnly` cookie | Persistent — 7-day TTL |
| Server data (all) | TanStack Query cache | In-memory, `staleTime: 30s` |
| Optimistic mutations | TanStack Query `onMutate` + `onError` rollback | In-memory only |

No global client state manager (Zustand, Redux) is used. All server data
lives in TanStack Query. All persistent user preferences live in
`localStorage`. URL params drive UI state that should survive a refresh or
be shareable via link.

### 7.1 `useProject()` Hook

```typescript
// hooks/use-project.tsx
interface ProjectContext {
  projectSlug: string | 'all';
  setProject: (slug: string | 'all') => void;
}

const ProjectContext = createContext<ProjectContext>({ projectSlug: 'all', setProject: () => {} });

export const ProjectProvider = ({ children }: { children: React.ReactNode }) => {
  const [projectSlug, setProjectSlug] = useState<string | 'all'>(() =>
    typeof window !== 'undefined'
      ? (localStorage.getItem('lore-project') ?? 'all')
      : 'all'
  );

  const setProject = (slug: string | 'all') => {
    setProjectSlug(slug);
    localStorage.setItem('lore-project', slug);
  };

  return (
    <ProjectContext.Provider value={{ projectSlug, setProject }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => useContext(ProjectContext);
```

---

## 8. Routing and Navigation

### 8.1 Route Structure

| Route | Page | Auth required |
|---|---|---|
| `/login` | Login | No |
| `/lessons` | Lesson search | Yes |
| `/inbox` | Propagation inbox | Yes |
| `/dashboard` | Stats + chart | Yes |
| `/admin` | Projects + API keys | Yes |

All authenticated routes are under the `(dashboard)` route group which
shares the app shell layout. The `(dashboard)` prefix is not part of the
URL.

### 8.2 URL Param Contracts

**Lessons page:**

| Param | Type | Description |
|---|---|---|
| `q` | string | Free-text search query |
| `tags` | comma-separated | Active stack tag filters |
| `severity` | comma-separated | Active severity filters (`critical,high`) |
| `category` | string | Active category filter |
| `lesson` | UUID | Open lesson panel |

Example: `/lessons?q=prisma+migration&severity=critical&lesson=abc-123`

### 8.3 Navigation Guards

`middleware.ts` enforces authentication on all routes except `/login` and
`/api/auth/*`. After login the user is always redirected to `/lessons`.
After logout the session cookie is cleared and the user is redirected to
`/login`.

---

## 9. Search Implementation

### 9.1 Debounce Strategy

Search input is debounced at 250ms using a `useDebounce` hook before the
URL param is updated. The URL param update triggers TanStack Query's
`useQuery` whose `queryFn` fires `fetchLessons`.

```typescript
const [inputValue, setInputValue] = useState(searchParams.get('q') ?? '');
const debouncedQuery = useDebounce(inputValue, 250);

// Effect: sync debounced value → URL param
useEffect(() => {
  const params = new URLSearchParams(searchParams.toString());
  if (debouncedQuery) {
    params.set('q', debouncedQuery);
  } else {
    params.delete('q');
  }
  router.replace(`/lessons?${params.toString()}`, { scroll: false });
}, [debouncedQuery]);

// Query: URL param drives the fetch
const { data, isLoading } = useQuery({
  queryKey: ['lessons', debouncedQuery, activeFilters, projectSlug],
  queryFn: () => fetchLessons({ q: debouncedQuery, ...activeFilters, project: projectSlug }),
  enabled: debouncedQuery.length >= 2 || debouncedQuery.length === 0,
});
```

### 9.2 Filter Chips

Filters are only shown after `data` is defined (first successful response).
Active filters append to URL params and are included in the `queryKey` so
TanStack Query manages separate cache entries per filter combination.

### 9.3 Cmd+K Palette

The palette registers a global `keydown` listener in the root layout:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setPaletteOpen(true);
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, []);
```

The palette reuses the `['lessons', 'palette', query]` TanStack Query key.
Because `staleTime` is 30 seconds, a query already fetched on the Lessons
page is served from cache instantly.

---

## 10. Optimistic Mutation — Propagation Inbox

The accept/reject flow is the only mutation that requires optimistic UI.
It uses TanStack Query's `onMutate` / `onError` pattern:

```typescript
const mutation = useMutation({
  mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
    action === 'accept' ? acceptPropagation(id) : rejectPropagation(id),

  onMutate: async ({ id }) => {
    // Cancel in-flight queries to avoid overwriting our optimistic update
    await queryClient.cancelQueries({ queryKey: ['propagations', projectSlug] });

    // Snapshot current list
    const previous = queryClient.getQueryData<Propagation[]>(['propagations', projectSlug]);

    // Optimistically remove the item
    queryClient.setQueryData<Propagation[]>(
      ['propagations', projectSlug],
      (old) => old?.filter((p) => p.id !== id) ?? []
    );

    return { previous };
  },

  onError: (_err, _vars, context) => {
    // Roll back to snapshot
    if (context?.previous) {
      queryClient.setQueryData(['propagations', projectSlug], context.previous);
    }
    toast({ title: 'Action failed.' });
  },

  onSuccess: () => {
    // Sync badge count
    queryClient.invalidateQueries({ queryKey: ['propagations', 'count', projectSlug] });
  },
});
```

Undo is implemented by calling the reverse mutation within the 5-second
toast window and calling `queryClient.setQueryData` directly to re-insert
the item at its original index (stored in a `useRef` before mutation).

---

## 11. Theme System

Tailwind dark mode uses the `class` strategy. The `ThemeProvider` applies
or removes the `dark` class on `<html>` on mount and on every preference
change.

To prevent flash of unstyled content (FOUC), a synchronous inline script
in `<head>` reads `localStorage['lore-theme']` and applies the class before
first paint:

```html
<script>
  (function () {
    const t = localStorage.getItem('lore-theme') || 'system';
    const dark =
      t === 'dark' ||
      (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  })();
</script>
```

All colors are implemented as CSS custom properties in `globals.css`.
shadcn/ui components consume these variables — no component-level
conditional logic exists for theme switching.

---

## 12. Component Architecture

### 12.1 Server vs. Client Components

| Component type | Rendering | Reason |
|---|---|---|
| Page layouts (`layout.tsx`) | Server | Static shell, no client state |
| Page components (`page.tsx`) | Server | Initial HTML, `searchParams` access |
| `SearchBar`, `FilterChips` | Client (`'use client'`) | Input state, debounce |
| `LessonCard`, `LessonPanel` | Client | URL param writes, Sheet open state |
| `InboxItem` | Client | Mutation, toast |
| `AppSidebar` | Client | Active route highlight |
| `ProjectSwitcher` | Client | `localStorage`, context |
| `ThemeProvider`, `QueryClientProvider` | Client | Context providers |
| `CodeBlock` | Server | shiki runs server-side; no hydration needed |

### 12.2 shadcn/ui Components Used

| Component | Used for |
|---|---|
| `Command` | Cmd+K command palette |
| `Input` | Search bar |
| `Badge` | Stack tags, severity, provenance |
| `Card` | Lesson cards |
| `Sheet` | Lesson detail slide-over |
| `Tabs` | Lesson panel Fix / Context / Code / Provenance |
| `Button` | Accept/Reject, Sign in, Admin actions |
| `Dialog` | API key revoke + regenerate confirm |
| `Toast` / `Toaster` | Action feedback + undo |
| `ScrollArea` | Lesson list, inbox, panel body |
| `Skeleton` | All loading states |
| `DropdownMenu` | Project switcher |
| `Table` | Admin panel |
| `Separator` | Panel section dividers |
| `Chart` | Dashboard memory growth trend (recharts wrapper) |

All shadcn/ui components are copy-owned in `components/ui/`. No runtime
dependency on a component library package.

---

## 13. Visual Design Tokens

Defined as CSS custom properties in `styles/globals.css`. Consumed by
Tailwind's `theme.extend.colors` via the shadcn/ui variable convention.

### 13.1 Color Tokens

```css
:root {
  --background: 0 0% 98%;          /* zinc-50  */
  --foreground: 240 5% 10%;        /* zinc-900 */
  --card: 0 0% 100%;               /* white    */
  --muted: 240 4.8% 95.9%;         /* zinc-100 */
  --muted-foreground: 240 3.8% 46.1%; /* zinc-500 */
  --border: 240 5.9% 90%;          /* zinc-200 */
  --primary: 243 75% 59%;          /* indigo-600 */
  --primary-foreground: 0 0% 100%; /* white    */
  --ring: 243 75% 59%;             /* indigo-600 */
}

.dark {
  --background: 240 10% 3.9%;      /* zinc-950 */
  --foreground: 0 0% 98%;          /* zinc-50  */
  --card: 240 10% 9%;              /* zinc-900 */
  --muted: 240 3.7% 15.9%;         /* zinc-800 */
  --muted-foreground: 240 5% 64.9%; /* zinc-400 */
  --border: 240 3.7% 15.9%;        /* zinc-800 */
  --primary: 234 89% 74%;          /* indigo-400 */
  --primary-foreground: 240 10% 3.9%; /* zinc-950 */
  --ring: 234 89% 74%;             /* indigo-400 */
}
```

### 13.2 Severity Colors (constant across themes)

```css
.severity-critical { color: theme('colors.red.500'); }
.severity-high     { color: theme('colors.orange.500'); }
.severity-medium   { color: theme('colors.yellow.500'); }
.severity-low      { color: theme('colors.blue.500'); }
```

### 13.3 Provenance Colors

```css
.provenance-review      { color: theme('colors.indigo.500'); }
.provenance-manual      { color: theme('colors.zinc.500'); }
.provenance-propagated  { color: theme('colors.emerald.500'); }
```

---

## 14. REST API Endpoints Consumed

All endpoints are on the existing Fastify server. No new endpoints are
introduced — the table below documents what the Web UI calls.

| Method | Path | Used by |
|---|---|---|
| `GET` | `/api/lessons/search?q=&project=&tags=&severity=` | Lessons page, Cmd+K |
| `GET` | `/api/lessons/:id` | LessonPanel (direct link) |
| `GET` | `/api/propagations/pending?project=` | Inbox page, sidebar badge |
| `POST` | `/api/propagations/:id/accept` | Inbox accept |
| `POST` | `/api/propagations/:id/reject` | Inbox reject |
| `GET` | `/api/stats?project=` | Dashboard |
| `GET` | `/api/projects` | Admin table, ProjectSwitcher |
| `DELETE` | `/api/projects/:slug/keys/:keyId` | Admin — revoke key |
| `POST` | `/api/projects/:slug/keys/regenerate` | Admin — regenerate key |
| `GET` | `/health` | Server-unreachable banner check |

---

## 15. Performance Constraints

| Metric | Target | Implementation |
|---|---|---|
| Search response to first result | < 500ms | 250ms debounce + API < 250ms |
| Cmd+K palette open | < 100ms | Global keydown listener, no async on open |
| Lesson panel open | < 200ms | Slide animation; data already in `['lessons', id]` cache if card was clicked |
| Page initial load (TTI) | < 2s on fast connection | App Router streaming + `loading.tsx` skeletons |
| Bundle size | < 200kB gzipped initial JS | Next.js automatic code splitting |

TanStack Query's `staleTime: 30_000` prevents redundant refetches during
normal usage. The `['lessons', 'palette', query]` key shares cache with
`['lessons', query, ...]` lookups, so Cmd+K results are often already warm.

---

## 16. Accessibility Implementation

| Requirement | Implementation |
|---|---|
| Skip link | `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>` as first element in every page layout |
| Focus rings | `focus-visible:ring-2 focus-visible:ring-ring` on all interactive elements via Tailwind |
| Icon button labels | `aria-label` on all icon-only buttons in `AppSidebar`, theme toggle, `ProvenanceDot` |
| Live regions | `aria-live="polite"` on search result count span and Toast region |
| Reduced motion | `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }` in `globals.css` |
| Semantic HTML | `<nav>`, `<main id="main-content">`, `<header>`, single `<h1>` per page, `<section>` for logical groups |
| Automated testing | `@axe-core/react` in CI — fails on `critical` or `serious` violations |
| WCAG target | 2.1 AA — all color pairs at 4.5:1 body, 3:1 large text, validated in both themes |

---

## 17. Build and Deployment

### 17.1 Turbo Pipeline

```json
// turbo.json (repo root)
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    }
  }
}
```

### 17.2 Development

```bash
# Start Web UI only
pnpm --filter @lore/web dev              # localhost:3001

# Start both API and Web UI via turbo
pnpm dev
```

### 17.3 Production Build (standalone)

`apps/web/next.config.ts` must set `output: 'standalone'`. This instructs
Next.js to produce a self-contained `apps/web/.next/standalone/` directory
that includes only the runtime files needed — no `node_modules` install
required in the production image.

```typescript
// apps/web/next.config.ts
const nextConfig = {
  output: 'standalone',
};
export default nextConfig;
```

```bash
pnpm --filter @lore/web build
# Output: apps/web/.next/standalone/
```

### 17.4 Dockerfile (`apps/web/Dockerfile`)

Multi-stage build. Build context is the **repo root** so the lockfile and
workspace manifests are available. Matches the existing server's Node.js 22
Alpine base.

```dockerfile
# Build stage
FROM node:22-alpine AS builder
WORKDIR /repo
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

# Copy workspace manifests first — maximises layer cache hits
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/

# Install only apps/web dependencies
RUN pnpm install --frozen-lockfile --filter @lore/web...

# Copy source and build
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_LORE_API_URL
ENV NEXT_PUBLIC_LORE_API_URL=$NEXT_PUBLIC_LORE_API_URL
RUN pnpm --filter @lore/web build

# Runner stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy Next.js standalone output (includes server.js + bundled node_modules)
COPY --from=builder /repo/apps/web/.next/standalone ./
# Static assets must be copied separately — standalone omits them
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001').then(r => r.status < 500 ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "apps/web/server.js"]
```

**`NEXT_PUBLIC_LORE_API_URL` is a build-time argument.** Next.js bakes
`NEXT_PUBLIC_*` variables into the client bundle at build time, so it must
be passed as a Docker `ARG`. Runtime `ENV` injection does not affect the
browser bundle.

### 17.5 Docker Compose

Add a `web` service to the existing `docker-compose.yml`:

```yaml
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        NEXT_PUBLIC_LORE_API_URL: ${NEXT_PUBLIC_LORE_API_URL}
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "127.0.0.1:3001:3001"
    depends_on:
      mcp-server:
        condition: service_started
```

`.env` must include:

```env
# Web UI
NEXT_PUBLIC_LORE_API_URL=https://lore.your-domain.com   # public-facing API URL
WEB_UI_SECRET=<strong-random-password>
```

**URL note:** `NEXT_PUBLIC_LORE_API_URL` must be the URL the **browser**
uses to reach the API — i.e., the public hostname, not the Docker-internal
`http://mcp-server:3100`. The Docker network name is only reachable by
containers; the browser runs on the user's machine.

| Environment | `NEXT_PUBLIC_LORE_API_URL` value |
|---|---|
| Local (docker compose) | `http://localhost:3100` (via mapped port) |
| Production | `https://lore.your-domain.com` |

### 17.6 Nginx

The existing `nginx/` config should be extended to proxy port 3001 for
the web service, e.g. at a separate subdomain (`lore-ui.your-domain.com`)
or path prefix (`/ui`). TLS termination follows the same pattern as the
existing `mcp-server` proxy.

---

## 18. Error Handling

| Scenario | Behavior |
|---|---|
| `401` from any axios request | Response interceptor redirects to `/login` |
| `5xx` / network error from search | `isError` state in `useQuery` → inline "Search unavailable." + retry button below search bar |
| Inbox mutation failure | `onError` rolls back optimistic update via TanStack Query context snapshot; Toast "Action failed." |
| Server unreachable (`/health` fails) | Non-blocking yellow banner: "Lore server unreachable. Retrying..." Auto-dismisses when health check recovers |
| Login failure (`401` from `/api/auth/login`) | Inline "Incorrect password." below password input — no page reload, no account lockout |
| Viewport < 1024px | Full-screen CSS overlay (no JS required): "Lore is best viewed on a desktop browser." |
