# Agent Guide — Training Tool

Everything a coding agent (Claude, Copilot, Cursor, etc.) needs to know to work on this project correctly and efficiently. Read this file before making any changes.

---

## 1. What this project is

An internal training management platform for **training teams**. Coordinators create and manage training classes for casino table games (Blackjack, Baccarat, etc.) across properties in **BC, AB, and ON**. Trainers run the classes; students (trainees) attend them.

The app tracks: classes, schedules, drill/test scores, daily reports, trainer assignments, student enrollments, and logged hours (for payroll).

---

## 2. Repository layout

```
TrainingTool/
├── api/index.ts                  # Vercel serverless entry — re-exports server/src/index.ts
├── server/                       # Express REST API (TypeScript)
│   └── src/
│       ├── index.ts              # Express app bootstrap (middleware stack)
│       ├── lib/
│       │   ├── supabase.ts       # Supabase client (service role key — bypasses RLS)
│       │   ├── encryption.ts     # AES-256-GCM field-level encryption
│       │   └── audit.ts          # Immutable audit log writer
│       ├── middleware/
│       │   ├── auth.ts           # JWT validation + role extraction (requireAuth, requireCoordinator, requirePayrollAdmin); sets req.userEmail
│       │   ├── error.ts          # Global error handler (hides stack traces in prod)
│       │   └── security.ts       # Additional security headers (helmet backup)
│       ├── migrations/
│       │   └── 001_add_attendance_to_progress.sql  # ALTER TABLE to add attendance column
│       └── routes/
│           ├── index.ts          # Router assembly — middleware order matters (see below)
│           ├── profiles.ts       # GET /profiles/me, GET /profiles?role=&search=
│           ├── classes.ts        # CRUD /classes, /classes/by-name/:name
│           ├── drills.ts         # CRUD /classes/:classId/drills
│           ├── trainers.ts       # CRUD /classes/:classId/trainers
│           ├── enrollments.ts    # CRUD /classes/:classId/enrollments
│           ├── schedule.ts       # CRUD /classes/:classId/schedule + GET /schedule (global)
│           ├── reports.ts        # CRUD /classes/:classId/reports + GET /reports (global) + GET /reports/:id (nested)
│           ├── hours.ts          # CRUD /classes/:classId/hours
│           ├── payroll.ts        # GET /payroll/trainers, GET /payroll/students (aggregated hour summaries)
│           ├── studentProgress.ts # GET /students/progress?email= (coordinator-only aggregated student view)
│           └── selfService.ts    # GET /me/trainer-dashboard, GET /me/trainee-progress (all authenticated users)
├── web/                          # React SPA (TypeScript + Vite + Tailwind)
│   └── src/
│       ├── App.tsx               # Route tree (BrowserRouter + all route definitions)
│       ├── main.tsx              # React entry point
│       ├── contexts/
│       │   ├── AuthContext.tsx    # Session + role + signOut (useAuth hook)
│       │   ├── ClassesContext.tsx # Cached active/archived class lists (useClasses hook)
│       │   ├── ClassDetailContext.tsx # Cached class detail data for all tab sections (useClassDetail hook)
│       │   └── ToastContext.tsx  # Toast notification system (useToast hook)
│       ├── layouts/
│       │   ├── ProtectedLayout.tsx   # Auth gate + coordinator sidebar / non-coordinator header
│       │   └── CoordinatorRoute.tsx  # Role guard wrapper (redirects non-coordinators)
│       ├── components/
│       │   ├── CoordinatorLayout.tsx  # Dark sidebar nav (mobile drawer + desktop persistent)
│       │   ├── LoginForm.tsx          # Email/password form
│       │   ├── GoogleLoginForm.tsx    # Google OAuth button
│       │   ├── CreateClassModal.tsx   # Class creation modal form
│       │   ├── EditClassModal.tsx    # Class editing modal form (same fields as create, pre-filled)
│       │   ├── Pagination.tsx        # Shared pagination component (configurable itemLabel)
│       │   ├── ReportsFilterBar.tsx   # Filter bar for reports page (province, site, search, etc.)
│       │   ├── ReportsTable.tsx       # Sortable table for reports
│       │   ├── ScheduleFilterBar.tsx  # Filter bar for schedule page
│       │   ├── ScheduleTable.tsx      # Sortable table for schedule
│       │   ├── ReportPreviewModal.tsx # Report preview + PDF download
│       │   ├── ConfirmDialog.tsx     # Reusable confirmation dialog (replaces window.confirm)
│       │   ├── Skeleton.tsx          # SkeletonText, SkeletonCard, SkeletonTable loading components
│       │   ├── PayrollFilterBar.tsx   # Filter bar for payroll pages (person type, date range, CSV export)
│       │   └── PayrollTable.tsx       # Sortable payroll summary table with totals footer
│       ├── pages/
│       │   ├── LoginView.tsx           # Public login page
│       │   ├── DashboardContent.tsx     # Coordinator dashboard (live summary cards, today's sessions, active classes)
│       │   ├── DashboardView.tsx       # Dashboard wrapper — dispatches to TrainerDashboard, TraineeDashboard, or DashboardContent based on role
│       │   ├── ClassesPage.tsx         # Class list + create button + filter bar (province, site, game type, search)
│       │   ├── ClassDetailView.tsx     # Slug → name conversion wrapper
│       │   ├── ClassDetailPage.tsx     # Tabbed class detail (fetches class by name)
│       │   ├── ClassDetail/            # Tab sections:
│       │   │   ├── ClassOverviewSection.tsx
│       │   │   ├── ClassScheduleSection.tsx
│       │   │   ├── ClassStudentsSection.tsx
│       │   │   ├── ClassTrainersSection.tsx
│       │   │   ├── ClassDrillsSection.tsx
│       │   │   └── ClassReportsSection.tsx   # includes "Attended?" checkbox column per trainee
│       │   ├── RosterPage.tsx          # Reusable trainer/student list (role prop); trainee rows are clickable → /students/progress/:email
│       │   ├── ReportsPage.tsx         # Cross-class daily reports (server-side filtering, sorting, pagination)
│       │   ├── SchedulePage.tsx        # Upcoming schedule across classes (server-side filtering, sorting, pagination)
│       │   ├── SettingsContent.tsx      # Profile display + sign-out
│       │   ├── InProgressPage.tsx       # "Work in progress" placeholder (kept for fallback)
│       │   ├── TrainerPayrollPage.tsx   # Trainer payroll hour summaries
│       │   ├── StudentPayrollPage.tsx   # Student payroll hour summaries
│       │   ├── StudentProgressPage.tsx  # Per-student progress view (enrolled classes, ratings, drill times, attendance) — coordinator-only
│       │   ├── TrainerDashboard.tsx     # Self-service dashboard for trainers (assigned classes, upcoming schedule)
│       │   └── TraineeDashboard.tsx     # Self-service dashboard for trainees (enrolled classes, schedule, progress, drill times)
│       ├── lib/
│       │   ├── supabase.ts       # Supabase client (anon key — respects RLS)
│       │   ├── apiClient.ts      # Typed HTTP client (api.classes.list(), api.reports.get(), etc.)
│       │   ├── reportPdf.ts      # HTML report generation (browser print-to-PDF)
│       │   └── utils.ts          # Helpers: classSlug(), formatTime(), etc.
│       ├── hooks/
│       │   └── usePayrollQuery.ts # Shared payroll filter/sort/pagination hook (parameterized by personType)
│       └── types/index.ts        # All shared TypeScript types (single source of truth)
├── vercel.json                   # Deployment config (builds both server + web)
├── package.json                  # Root package (minimal)
├── tsconfig.json                 # Root TypeScript config
├── claude.md                     # Claude Code instructions
├── README.md                     # Vision + tech stack + phased roadmap
├── CURRENT_STATE.md              # Implementation status snapshot
└── roadmap.md                    # Classes page feature checklist
```

---

## 3. Tech stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React + TypeScript | 19 |
| Build | Vite | 8 |
| Styling | Tailwind CSS | 3 |
| Routing | React Router | 7 |
| Backend | Express | 4 |
| Language | TypeScript | 5.9 |
| Database | PostgreSQL via Supabase | — |
| Auth | Supabase Auth (email/password + Google OAuth) | — |
| Security | Helmet, express-rate-limit, AES-256-GCM | — |
| Hosting | Vercel (frontend + serverless API), Railway (standalone backend) | — |

---

## 4. Architecture patterns you MUST follow

### 4.1 TypeScript conventions
- **Use `type` over `interface`** — except where `interface` is already used (e.g. the existing types in `types/index.ts` use `interface` and that's fine to continue).
- **Never use `enum`** — use string literal unions: `type DrillType = 'drill' | 'test'`
- **Never use `any`** without explicit approval.
- All types live in `web/src/types/index.ts` — this is the single source of truth for data shapes. Add new types here first.

### 4.2 API pattern
Every backend route follows this structure:
```typescript
router.get('/path', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase.from('table').select('*')...
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)  // Global error handler in middleware/error.ts
  }
})
```

Key patterns:
- All routes use `try/catch` with `next(err)` for error propagation.
- Supabase error code `PGRST116` means "no rows found" — return 404.
- Write operations on reports/hours use `logAudit()` for compliance tracking.
- The `writeLimiter` from `server/src/index.ts` is applied to sensitive write endpoints.
- All route files export a named Router (e.g. `export const classesRouter = Router()`).

### 4.3 Frontend data flow
```
Component → api.resource.method() → fetch()/authHeaders() → Express API → Supabase → PostgreSQL
```
- **Never call Supabase directly from components** (except for auth via `supabase.auth`). All data goes through `apiClient.ts`.
- `apiClient.ts` automatically attaches the JWT from `supabase.auth.getSession()`.
- Use the `useAuth()` hook for session/role/signOut. Use `useClasses()` for the cached class list.

### 4.4 Route middleware order (critical)
In `server/src/routes/index.ts`:
1. `requireAuth` — applied to ALL routes (no anonymous access); sets `req.userId`, `req.userRole`, and `req.userEmail`
2. `profilesRouter` — mounted BEFORE `requireCoordinator` (all authenticated users need `/profiles/me`)
3. `selfServiceRouter` — mounted BEFORE `requireCoordinator` (trainers and trainees access `/me/trainer-dashboard` and `/me/trainee-progress`)
4. `requireCoordinator` — applied to all subsequent routers
5. All other routers (classes, drills, trainers, enrollments, schedule, reports, hours, payroll, studentProgress)

**If you add a new route that non-coordinators need**, mount it BEFORE `requireCoordinator`.

### 4.5 URL slug convention
- Class names are used as URL slugs: `"BJ APR 01"` → `/classes/BJ-APR-01`
- Hyphens are disallowed in class names (they're the slug separator).
- `ClassDetailView.tsx` converts the slug back: `BJ-APR-01` → `BJ APR 01`.
- The API then looks up the class by name via `GET /classes/by-name/:name`.

### 4.6 Reports — nested data pattern
Reports are the most complex entity. A single report has:
- Main row in `class_daily_reports`
- Trainer links in `class_daily_report_trainers` (many-to-many)
- Timeline items in `class_daily_report_timeline_items` (ordered by position)
- Trainee progress in `class_daily_report_trainee_progress` (per-student ratings)
- Drill/test times in `class_daily_report_drill_times` (per-student time/score recordings)

**GET** fetches all five tables in parallel via `Promise.all`.
**PUT** uses a full-replace strategy: delete all nested rows, then re-insert. No merge/diff logic.

### 4.6.1 Drill times — per-student recording
Each report can include drill/test results per student:
- `time_seconds` for drills (timed activities — compared against `par_time_seconds` from `class_drills`)
- `score` for tests (scored activities — compared against `target_score` from `class_drills`)
- The UI renders a student × drill grid with color-coded inputs (green = met par/target, amber = missed)
- The PDF report includes drill times as a **separate page** (page-break-before) with color-coded cells
- The table is designed for future self-service recording by trainers and students (the `enrollment_id` + `drill_id` + `report_id` structure supports this without schema changes)
- After saving a report, the `reportCacheRef` for that report is invalidated so "View PDF" re-fetches fresh data

### 4.7 Color palette
The Training Tool brand colors are defined in `web/tailwind.config.js`:
- `tt-darkest`: `#081C30` — sidebar gradient start
- `tt-dark`: `#134270` — primary brand color, sidebar gradient end
- `tt-navy`: `#131371`
- `tt-teal`: `#137171`
- `tt-blue`: `#1E69B3`

Use white backgrounds with `#134270` accents for the main UI. Sidebar uses the dark gradient.

### 4.10 Toast notifications

`ToastContext` provides a global toast system. Use `useToast()` to get the `toast(message, type)` function.

Types: `'success'` (green), `'error'` (red), `'info'` (blue). Auto-dismiss after 4 seconds.

**Always add toast calls** after async mutations (create, update, delete, archive). Pattern:
```ts
const { toast } = useToast()
try {
  await api.resource.delete(id)
  toast('Item deleted', 'success')
} catch (err) {
  toast((err as Error).message, 'error')
}
```

### 4.11 Confirmation dialogs

Use `<ConfirmDialog>` instead of `window.confirm()` for all destructive or significant actions. Pattern:
```ts
const [confirmState, setConfirmState] = useState<{ ... } | null>(null)
// On action: setConfirmState({ title, message, confirmLabel, confirmVariant, onConfirm })
// Render: <ConfirmDialog open={confirmState !== null} ... onCancel={() => setConfirmState(null)} />
```
Use `confirmVariant: 'danger'` for destructive actions, `'primary'` for non-destructive.

### 4.12 Loading states

Use skeleton components from `components/Skeleton.tsx` instead of "Loading..." text:
- `<SkeletonText>` — single animated line
- `<SkeletonCard lines={n}>` — card placeholder
- `<SkeletonTable rows={n} cols={n}>` — table placeholder

### 4.13 Modal animations

All modals use CSS animations defined in `index.css`:
- Backdrop: `animate-backdrop-in` (fade in 0.2s)
- Content: `animate-modal-in` (slide up + fade in 0.25s)

Add these classes to any new modals.

### 4.14 ClassDetailContext — shared class detail data

`ClassDetailContext` provides cached trainers, enrollments, schedule, reports, hours, and drills for the class detail page. It fetches all six data sets once via `Promise.all` when the page mounts, then shares them across every tab section.

**Provider:** `ClassDetailProvider` wraps all tab sections in `ClassDetailPage`. It accepts a `classId` prop and fetches all data on mount.

**Hook:** `useClassDetail()` — returns all cached data plus individual refresh functions.

**Refresh functions:** Each data type has its own refresh function so a mutation in one tab can update only the relevant cache:
- `refreshTrainers()` — re-fetches trainer assignments
- `refreshEnrollments()` — re-fetches student enrollments
- `refreshSchedule()` — re-fetches schedule slots
- `refreshReports()` — re-fetches daily reports
- `refreshHours()` — re-fetches logged hours
- `refreshDrills()` — re-fetches drills/tests

**Pattern:** Tab sections read data from the context instead of fetching their own. After a mutation (create, update, delete), the section calls the appropriate refresh function to update the shared cache. Example:
```ts
const { trainers, refreshTrainers } = useClassDetail()

// After adding a trainer:
await api.trainers.create(classId, payload)
await refreshTrainers()
toast('Trainer added', 'success')
```

This eliminates redundant API calls — previously trainers were fetched 4 times, enrollments 3 times, and schedule 3 times across the different tab sections.

---

## 5. Authentication and authorization

### Frontend auth flow
1. User signs in via Supabase Auth (LoginForm or GoogleLoginForm).
2. `AuthContext` listens for auth state changes, fetches the role from the `profiles` table.
3. `ProtectedLayout` checks `session` and `role` — redirects to `/login` if unauthenticated.
4. `CoordinatorRoute` redirects non-coordinators to `/dashboard`.

### Backend auth flow
1. Frontend sends `Authorization: Bearer <JWT>` via `apiClient.ts`.
2. `requireAuth` middleware validates JWT via `supabase.auth.getUser(token)`, then fetches `profiles.role`.
3. Sets `req.userId`, `req.userRole`, and `req.userEmail` on the Express Request object.
4. `requireCoordinator` checks `req.userRole === 'coordinator'`.
5. Self-service routes (`/me/*`) use `req.userEmail` to scope data to the calling user — no coordinator-supplied ID needed.

### Roles
| Role | Access |
|------|--------|
| `coordinator` | Full CRUD on all class management endpoints + student progress view |
| `trainer` | Own profile (`/profiles/me`) + self-service trainer dashboard (`/me/trainer-dashboard`) |
| `trainee` | Own profile (`/profiles/me`) + self-service trainee dashboard (`/me/trainee-progress`) |
| `payroll_admin` | Future: sensitive financial/HR data (separate from coordinator) |

---

## 6. Database schema

All tables live in Supabase PostgreSQL. Migrations are run in the Supabase SQL editor (not stored in repo — see `claude.md`).

### Core tables
| Table | Purpose | Key relationships |
|-------|---------|-------------------|
| `profiles` | User accounts (role, province) | FK → auth.users.id |
| `classes` | Training classes | Parent of all class_* tables |
| `class_drills` | Drills and tests per class | FK → classes.id |
| `class_trainers` | Trainer assignments (snapshot) | FK → classes.id |
| `class_enrollments` | Student enrollments | FK → classes.id |
| `class_schedule_slots` | Time blocks | FK → classes.id, FK → class_trainers.id |
| `class_daily_reports` | Daily session reports | FK → classes.id |
| `class_daily_report_trainers` | Report ↔ trainer junction | FK → reports.id, FK → class_trainers.id |
| `class_daily_report_timeline_items` | Ordered training blocks | FK → reports.id |
| `class_daily_report_trainee_progress` | Per-student daily assessment | FK → reports.id, FK → class_enrollments.id |
| `class_daily_report_drill_times` | Per-student drill/test time and score | FK → reports.id, FK → class_enrollments.id, FK → class_drills.id |
| `class_logged_hours` | Payroll hour tracking | FK → classes.id |
| `audit_logs` | Immutable audit trail | FK → auth.users.id |

### Important schema notes
- `class_trainers` is a **snapshot** — stores trainer_name and trainer_email at assignment time, does NOT auto-update if the profile changes.
- `class_daily_report_timeline_items` has a `position` column for drag-and-drop ordering.
- `class_daily_report_trainee_progress` rates students on three axes: GK (Game Knowledge), Dex (Dexterity), HOM (Habits of Mind), each using the `DailyRating` scale (EE/ME/AD/NI). It also has an `attendance boolean NOT NULL DEFAULT true` column (added in migration `001_add_attendance_to_progress.sql`).
- `class_logged_hours` uses `person_type` to distinguish trainer vs student hours; either `trainer_id` or `enrollment_id` is set, never both.
- All tables use UUIDs as primary keys.
- Delete cascades exist at the DB level for nested data.
- SQL migrations are stored in `server/src/migrations/`. Run them in the Supabase SQL Editor when deploying the corresponding phase.

---

## 7. Security architecture

- **Helmet** — comprehensive response headers (HSTS, CSP, X-Frame-Options, etc.)
- **Rate limiting** — 100 req/15min global, 30 req/15min for write operations
- **CORS** — restricted to `FRONTEND_URL` in production; open in development
- **Body size limit** — 50 KB max JSON body
- **IDOR protection** — all write queries match both the record ID and the parent classId
- **Field-level encryption** — AES-256-GCM for sensitive data (SSN, SIN, salary); not yet wired to specific columns
- **Audit logging** — all mutations logged to `audit_logs` (who, what, when, IP); `logAudit()` never throws (silent failure with stderr logging)
- **RLS** — Row-Level Security enabled on Supabase tables; the backend uses the service role key to bypass RLS (it enforces access via middleware instead)

---

## 8. Environment variables

### Backend (`server/.env`)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...      # Bypasses RLS — keep secret
FRONTEND_URL=https://your-app.vercel.app  # CORS origin in production
NODE_ENV=production|development
PORT=3001                                 # Local dev only
FIELD_ENCRYPTION_KEY=<64-char hex>        # For AES-256-GCM (optional until sensitive fields exist)
```

### Frontend (`web/.env`)
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...         # Public anon key (safe to expose)
VITE_API_URL=http://localhost:3001        # Local dev only; leave empty for production
VITE_AUTH_REDIRECT_URL=http://localhost:5173  # Optional: force OAuth/reset callbacks in local dev
```

---

## 9. Deployment

### Vercel (primary)
- `vercel.json` builds both server and web.
- Frontend: `web/dist` (Vite output).
- Backend: `api/index.ts` is a Vercel serverless function that re-exports the Express app.
- Rewrites: `/api/*` → serverless function; `/*` → SPA (React Router handles client-side routes).

### How it works on Vercel
1. Build command installs both `server/` and `web/` dependencies, then runs `vite build`.
2. `api/index.ts` imports `server/src/index.ts` which exports the Express app as default.
3. Vercel wraps the Express app in a serverless function handler automatically.
4. The `app.listen()` block in `server/src/index.ts` is skipped when `NODE_ENV === 'production'`.

### Local development
```bash
# Terminal 1 — Backend
cd server && npm run dev    # tsx watch on port 3001

# Terminal 2 — Frontend
cd web && npm run dev       # Vite on port 5173
```
Set `VITE_API_URL=http://localhost:3001` in `web/.env` for local dev.

---

## 10. Adding new features — checklist

When adding a new resource (e.g. "attendance"):

1. **Types** — Add interfaces/types to `web/src/types/index.ts`.
2. **Database** — Write the CREATE TABLE SQL. Paste it in the chat (don't create migration files — per `claude.md`).
3. **Backend route** — Create `server/src/routes/attendance.ts` following the existing CRUD pattern. Export a named Router.
4. **Mount the route** — Add it to `server/src/routes/index.ts` in the correct position (before or after `requireCoordinator`).
5. **API client** — Add methods to the `api` object in `web/src/lib/apiClient.ts`.
6. **Frontend pages/components** — Create page components, add routes to `App.tsx`.
7. **Audit logging** — Call `logAudit()` on all mutations if the data is sensitive.

---

## 11. Common pitfalls

- **`/classes/by-name/:name` must be registered before `/classes/:id`** in the Express router, or Express will try to parse "by-name" as a UUID.
- **The Supabase service role key bypasses RLS entirely** — all access control is done in Express middleware, not database policies.
- **`logAudit()` never throws** — it catches errors internally and logs to stderr. Don't wrap it in try/catch expecting to handle audit failures.
- **Class names cannot contain hyphens** — they're used as URL slug separators.
- **Reports use full-replace on PUT** — the entire nested data set is deleted and re-inserted. Don't try to do incremental updates.
- **`PGRST116`** is Supabase's error code for "no rows found" when using `.single()` — check for it to return proper 404s.
- **Two Supabase clients exist**: `server/src/lib/supabase.ts` (service role key, bypasses RLS) and `web/src/lib/supabase.ts` (anon key, respects RLS). Never mix them up.
- **Don't call Supabase directly from React components for data** — use `apiClient.ts`. The only exception is `supabase.auth.*` for authentication.

---

### 4.8 Server-side filtering, sorting, and pagination pattern

The Reports and Schedule pages use a shared pattern for server-side filtering:

**Backend:**
- Accept query params for filtering (province, site, class_id, archived, game_type, date_from, date_to, search), sorting (sort_by, sort_dir), and pagination (page, limit).
- Use `!inner` join syntax so filters on joined columns actually exclude rows: `classes!inner(id, name, site, province, game_type, archived)`.
- Use `{ count: 'exact' }` for total count to enable pagination.
- Whitelist sortable columns to prevent injection.
- Return envelope: `{ data, total, page, limit }`.
- When `archived !== 'true'`, filter to active classes only. When `archived === 'true'`, include ALL classes (not just archived).

**Frontend:**
- Custom hook (`useReportsQuery`, `useScheduleQuery`) manages filter/sort/page state.
- Changing any filter or sort resets page to 0.
- Search input is debounced (300ms).
- Reusable `Pagination` component with configurable `itemLabel`.

**Follow this pattern** when adding new paginated list pages.

### 4.9 Edit Class modal

The `EditClassModal` mirrors `CreateClassModal` but:
- Accepts `classData: Class` and pre-fills all fields.
- Uses `api.classes.update(id, body)` instead of `create`.
- Returns the updated `Class` via `onSuccess(updated)` so the parent can update state without re-fetching.

---

### 4.15 Mobile-responsive patterns

All class detail tabs use a consistent responsive approach:
- **Section headers**: `flex flex-col sm:flex-row sm:items-center` — title and action button stack vertically on mobile, sit side-by-side on desktop.
- **Reports/hours tables**: Dual layout — card view on mobile (`sm:hidden`) and table view on desktop (`hidden sm:block`). This ensures action buttons (Edit, View PDF, Remove) are always visible.
- **Tab navigation**: `overflow-x-auto` with `min-w-max` for horizontal scrolling, reduced padding on mobile (`px-2 sm:px-3`).
- **Data tables** (drills, schedule): `overflow-x-auto` wrapper with `min-w-full` on tables for horizontal scroll.
- **Form grids**: `grid grid-cols-1 md:grid-cols-3` for responsive form layouts.

### 4.16 Report PDF generation

`reportPdf.ts` generates a self-contained HTML document with inline CSS and `@media print` rules:
- Rendered inside an `<iframe>` via Blob URL in `ReportPreviewModal`
- Download uses `html2pdf.js` (html2canvas + jsPDF) for client-side PDF rendering
- Print uses `iframe.contentWindow.print()` for browser-native printing
- The drill times section uses `page-break-before: always` to appear as a separate page
- All user strings are HTML-escaped via `esc()` to prevent XSS
- The `ReportPdfArgs` interface includes: `report`, `className`, `trainers`, `enrollments`, `drills`

### 4.17 Calendar view (Schedule)

The Schedule page has two view modes toggled in the header:
- **Table view**: Standard sortable table with pagination
- **Calendar view** (`ScheduleCalendar.tsx`): Month calendar with colored dots on days with sessions, click-to-expand for day details

---

## 12. What's NOT implemented yet

Refer to `CURRENT_STATE.md` for the full status, but the main gaps:
- Self-service drill time recording for trainers/students (DB schema supports it, but only coordinator UI exists)
- Competency sign-offs and graduation checklists
- Notifications system
- Input validation library (Zod/Joi) — currently relies on DB constraints only
- No automated tests exist yet
- No CI/CD pipeline (Vercel auto-deploys from the Production branch)

### Feature ideas to consider
- **Drill timer UI**: A live stopwatch component for trainers to time drills in real-time
- **Bulk drill time entry**: Import drill times from CSV/spreadsheet
- **Report duplication**: Copy a previous day's report as a template for the next day
- **Export to CSV**: Download reports, hours, or roster data as CSV
- **Email notifications**: Notify trainers when assigned to a class, students when enrolled
- **Trainer availability**: Let trainers mark available dates before schedule assignment
- **Multi-class comparison**: Dashboard widget comparing progress across concurrent classes
- **Drill leaderboard**: Gamified view of drill times to motivate students
- **Print-friendly roster**: Printable class roster with student contact info for floor use

---

## 13. Payroll hour summaries

The payroll feature aggregates `class_logged_hours` into per-person summaries for trainers and students.

### Backend (`server/src/routes/payroll.ts`)
- Two endpoints: `GET /payroll/trainers` and `GET /payroll/students`.
- Each endpoint fetches all matching `class_logged_hours` rows (filtered by `person_type`), then performs in-memory grouping to produce per-person totals (total hours, paid hours, unpaid hours, live training hours, classroom hours).
- Supports query params for filtering (province, site, date range, search) and sorting.
- Returns an envelope with the aggregated summaries.

### Frontend hook (`web/src/hooks/usePayrollQuery.ts`)
- A single shared hook parameterized by `personType` (`'trainer'` | `'student'`).
- Manages filter state, sort state, and data fetching — same pattern as `useReportsQuery` and `useScheduleQuery`.
- Both `TrainerPayrollPage` and `StudentPayrollPage` call `usePayrollQuery` with their respective `personType`.

### Components
- **`PayrollFilterBar.tsx`** — Filter bar with province, site, date range, and search inputs. Includes a CSV export button that triggers a client-side blob download of the current filtered data.
- **`PayrollTable.tsx`** — Sortable table displaying per-person hour breakdowns. Includes a totals footer row that sums all visible rows.

### CSV export
- CSV generation happens entirely on the client. The filtered/sorted data from the hook is serialized to a CSV string, wrapped in a `Blob`, and downloaded via a temporary anchor element. No server-side CSV endpoint is needed.

---

## 14. Student progress dashboard (Phase 2)

Coordinators can view a per-student summary by clicking any trainee row in `RosterPage`. This navigates to `/students/progress/:email` (URL-encoded), which renders `StudentProgressPage.tsx`.

### Route registration
The `/students/progress/:email` route is registered in `App.tsx` **before** the `/students` route to prevent React Router from matching "progress" as a student name.

### Backend (`server/src/routes/studentProgress.ts`)
- `GET /students/progress?email=<email>` — coordinator-only (mounted after `requireCoordinator`).
- Fetches all `class_enrollments` for the given email, then in parallel fetches class metadata, progress rows (joined with report dates), and drill times (joined with report dates and drill metadata).
- Returns a `StudentProgressResponse` with: `student_name`, `student_email`, `classes[]`, `progress[]`, `drill_times[]`.

### Frontend (`web/src/pages/StudentProgressPage.tsx`)
- Reads `:email` from the URL params (decoded before the API call).
- Displays three sections: enrolled classes card, progress ratings table (GK / Dex / HOM badges + "Attended" column), and drill times table.
- Uses `SkeletonCard` and `SkeletonTable` while loading.

### Types (`web/src/types/index.ts`)
- `StudentProgressResponse` — the full shape returned by the backend, including the `attendance: boolean` field on each progress row.

### API client (`web/src/lib/apiClient.ts`)
- `api.studentProgress.get(email)` — `GET /students/progress?email=<email>`.

---

## 15. Attendance tracking (Phase 3)

Attendance is recorded per-student per-report inside `class_daily_report_trainee_progress`. It is a boolean: `true` = attended, `false` = absent.

### Database change
- Column: `attendance boolean NOT NULL DEFAULT true` on `class_daily_report_trainee_progress`.
- Migration file: `server/src/migrations/001_add_attendance_to_progress.sql`. Run in the Supabase SQL Editor.

### Backend
- `POST` and `PUT` endpoints for reports already persist `attendance` from the request body. It defaults to `true` if omitted.

### Frontend — report form (`ClassReportsSection.tsx`)
- A new "Attended?" checkbox column appears for each trainee in the progress section of the report form.
- Unchecking marks the student absent for that session.

### Frontend — student progress view (`StudentProgressPage.tsx`)
- A new "Attended" column in the Progress Ratings table shows a green checkmark (present) or an amber "Absent" badge.

### Types
- `ClassDailyReportTraineeProgress` in `web/src/types/index.ts` now includes `attendance: boolean`.

---

## 16. Trainer and trainee self-service views (Phase 4)

Non-coordinator users now have functional dashboards instead of a "work in progress" placeholder.

### Auth middleware change
`requireAuth` in `server/src/middleware/auth.ts` now sets `req.userEmail` (in addition to `req.userId` and `req.userRole`). Self-service routes use this to scope queries to the calling user.

### Backend router (`server/src/routes/selfService.ts`)
Mounted **before** `requireCoordinator` so trainers and trainees can reach it.

| Route | Description |
|-------|-------------|
| `GET /me/trainer-dashboard` | Classes the calling trainer is assigned to, with `enrolled_count` and up to 3 `upcoming_slots` per class |
| `GET /me/trainee-progress` | Same shape as `/students/progress` but identity comes from the JWT; also includes `upcoming_slots` per enrolled class |

Both routes identify the caller via `req.userEmail` — no user-supplied ID is needed or accepted.

### Frontend pages
- **`TrainerDashboard.tsx`** — class cards showing trainer role badge, student count, and the next upcoming schedule slots.
- **`TraineeDashboard.tsx`** — enrolled classes with upcoming schedule, progress ratings table (with attendance column), and drill results table.

### DashboardView dispatch
`DashboardView.tsx` now reads the authenticated user's role and renders:
- `coordinator` → `DashboardContent` (the existing coordinator overview)
- `trainer` → `TrainerDashboard`
- `trainee` (or any other role) → `TraineeDashboard`

`InProgressPage.tsx` is no longer used by `DashboardView` but is retained in the codebase as a fallback.

### Types (`web/src/types/index.ts`)
| Type | Purpose |
|------|---------|
| `UpcomingSlot` | A single schedule slot (`id`, `slot_date`, `start_time`, `end_time`, `group_label`, `notes`) |
| `TrainerDashboardResponse` | Response from `GET /me/trainer-dashboard` — includes `trainer_name`, `trainer_email`, and `classes[]` each with `upcoming_slots` |
| `TraineeDashboardResponse` | Response from `GET /me/trainee-progress` — extends `StudentProgressResponse`; each class entry includes `upcoming_slots` |

### API client (`web/src/lib/apiClient.ts`)
- `api.selfService.trainerDashboard()` — `GET /me/trainer-dashboard`
- `api.selfService.traineeDashboard()` — `GET /me/trainee-progress`
