# Developer Guide — Training Tool

A personal reference for understanding how this codebase works, why it's built this way, and how to navigate it effectively.

---

## Table of contents

1. [The big picture](#1-the-big-picture)
2. [How the pieces fit together](#2-how-the-pieces-fit-together)
3. [The frontend — how React runs the show](#3-the-frontend--how-react-runs-the-show)
4. [The backend — Express API layer](#4-the-backend--express-api-layer)
5. [The database — Supabase PostgreSQL](#5-the-database--supabase-postgresql)
6. [Authentication — the full flow](#6-authentication--the-full-flow)
7. [The API client — how frontend talks to backend](#7-the-api-client--how-frontend-talks-to-backend)
8. [Daily reports — the most complex feature](#8-daily-reports--the-most-complex-feature)
9. [Security — what's protecting the app](#9-security--whats-protecting-the-app)
10. [Deployment — how code reaches production](#10-deployment--how-code-reaches-production)
11. [Local development workflow](#11-local-development-workflow)
12. [Key design decisions and why](#12-key-design-decisions-and-why)
13. [How to add new features](#13-how-to-add-new-features)
14. [Glossary of domain terms](#14-glossary-of-domain-terms)
15. [ClassDetailContext caching](#15-classdetailcontext-caching)
16. [Payroll hour summaries](#16-payroll-hour-summaries)
17. [Student progress dashboard](#17-student-progress-dashboard)
18. [Attendance tracking](#18-attendance-tracking)
19. [Trainer and trainee self-service views](#19-trainer-and-trainee-self-service-views)

---

## 1. The big picture

This is a training management app for training teams. Think of it like a lightweight LMS (Learning Management System), but purpose-built for casino table game training.

**Who uses it:**
- **Coordinators** are the admins. They create classes, assign trainers, enroll students, manage schedules, review daily reports, and drill into per-student progress dashboards.
- **Trainers** run the classes on the training floor. They have a self-service dashboard showing their assigned classes, enrolled student counts, and upcoming schedule slots.
- **Trainees (students)** attend classes to learn games like Blackjack. They have a self-service dashboard showing their enrolled classes, upcoming schedule, daily progress ratings, and drill results.

**What it tracks:**
- **Classes** — A cohort like "Blackjack April 2025" at a specific casino site.
- **Schedules** — Time slots for when a class meets.
- **Drills & tests** — Timed drills (e.g. chip handling) and scored tests (e.g. game knowledge).
- **Daily reports** — A detailed log of what happened each training day, including a timeline of activities and per-student progress ratings.
- **Hours** — Payroll-related tracking of paid vs unpaid hours, classroom vs live floor time.

**Where it runs:**
- The web frontend is hosted on **Vercel**.
- The API runs as a **Vercel serverless function** (same deployment).
- The database and auth are **Supabase** (managed PostgreSQL).

---

## 2. How the pieces fit together

```
┌─────────────────────────────────────────────────────┐
│                     BROWSER                         │
│                                                     │
│  React App (Vite)                                   │
│  ├── AuthContext     ← manages login session        │
│  ├── ClassesContext  ← caches class list            │
│  ├── apiClient.ts    ← sends HTTP requests ────────────┐
│  └── supabase.ts     ← auth only (login/logout)    │   │
└─────────────────────────────────────────────────────┘   │
                                                          │
                    Authorization: Bearer <JWT>           │
                                                          ▼
┌─────────────────────────────────────────────────────┐
│                VERCEL SERVERLESS                    │
│                                                     │
│  api/index.ts                                       │
│  └── imports server/src/index.ts (Express app)      │
│       ├── helmet (security headers)                 │
│       ├── rate limiter (100/15min)                   │
│       ├── CORS (restricts origins in prod)          │
│       ├── requireAuth middleware                    │
│       │   └── validates JWT via Supabase            │
│       │   └── fetches role from profiles table      │
│       ├── profilesRouter (all users)                │
│       ├── requireCoordinator middleware             │
│       └── all other routers (coordinator only)      │
└─────────────────────────┬───────────────────────────┘
                          │
                          │ Supabase JS client
                          │ (service role key = bypass RLS)
                          ▼
┌─────────────────────────────────────────────────────┐
│                SUPABASE (PostgreSQL)                 │
│                                                     │
│  Tables: profiles, classes, class_drills,           │
│          class_trainers, class_enrollments,          │
│          class_schedule_slots, class_daily_reports,  │
│          class_daily_report_trainers,                │
│          class_daily_report_timeline_items,          │
│          class_daily_report_trainee_progress,        │
│          class_daily_report_drill_times,             │
│          class_logged_hours, audit_logs              │
│                                                     │
│  Auth: email/password + Google OAuth                │
└─────────────────────────────────────────────────────┘
```

**The key thing to understand:** The frontend never talks to the database directly for data. It always goes through the Express API (`/api/*`). The only direct Supabase communication from the frontend is for auth (login, logout, session management).

---

## 3. The frontend — how React runs the show

### 3.1 Entry points

The app starts at `web/src/main.tsx`, which renders `App.tsx`. App.tsx defines all the routes:

```
/login                          → LoginView (public)
/                               → ProtectedLayout (auth gate)
  /dashboard                    → DashboardView (dispatches by role)
  /classes                      → ClassesPage (coordinator only)
  /classes/:className           → ClassDetailView → ClassDetailPage (tabbed)
  /students/progress/:email     → StudentProgressPage (coordinator only — registered BEFORE /students)
  /students                     → RosterPage (coordinator only)
  /trainers                     → RosterPage (coordinator only)
  /reports                      → ReportsPage (coordinator only)
  /schedule                     → SchedulePage (coordinator only)
  /payroll/trainers             → TrainerPayrollPage (coordinator only)
  /payroll/students             → StudentPayrollPage (coordinator only)
  /settings                     → SettingsContent (coordinator only)
```

### 3.2 The auth system (AuthContext)

`AuthContext.tsx` is the heart of frontend auth. Here's what happens on page load:

1. `AuthProvider` wraps the entire app.
2. On mount, it calls `supabase.auth.getSession()` to check for an existing session (browser stores it).
3. If a session exists, it fetches the user's role from the `profiles` table.
4. Until both session AND role are resolved, `loading` stays `true` — this prevents the login page from flashing.
5. It also subscribes to `supabase.auth.onAuthStateChange()` to react to login/logout events (even from other tabs).

**Why the role is fetched separately from the JWT:** Supabase JWTs don't include custom claims by default. Rather than configuring custom JWT claims (which requires Supabase hooks), the app just queries the `profiles` table. This also means role changes take effect immediately without re-login.

### 3.3 Layout structure

The layout system has two layers:

**ProtectedLayout** (`layouts/ProtectedLayout.tsx`):
- Checks if the user is authenticated.
- If coordinator: renders the full dark sidebar layout (`CoordinatorLayout`) + content area.
- If trainer/trainee: renders a simple header + content area.
- The content area uses React Router's `<Outlet />` to render the matched child route.

**CoordinatorRoute** (`layouts/CoordinatorRoute.tsx`):
- A simple wrapper that checks `role === 'coordinator'`.
- If not, redirects to `/dashboard`.
- Used on individual routes like `/classes`, `/reports`, etc.

### 3.4 The classes cache (ClassesContext)

The classes list is fetched once and cached in React context. This means:
- Navigating from `/classes` to `/classes/BJ-APR-01` and back doesn't re-fetch.
- After creating, archiving, or deleting a class, call `refresh()` to invalidate the cache.
- The context stores both `active` (non-archived) and `archived` class lists.

### 3.5 Class detail — the tabbed page

When you click a class in the list:
1. React Router navigates to `/classes/BJ-APR-01` (hyphenated slug).
2. `ClassDetailView.tsx` reads the `:className` param, converts hyphens back to spaces.
3. `ClassDetailPage.tsx` calls `api.classes.getByName("BJ APR 01")` to fetch the class.
4. The page renders tabs: Overview, Schedule, Students, Trainers, Drills, Reports, Hours.
5. Each tab is a separate section component in `pages/ClassDetail/`.
6. The **Edit class** button opens `EditClassModal`, which pre-fills all fields from the current class data. On save, the class state updates in place (no re-fetch needed).

### 3.5.1 Overview tab — real data

The Overview tab (`ClassOverviewSection`) fetches all class-related data on mount via `Promise.all`:
- **Trainers card** — shows count and list with role badges (primary/assistant)
- **Students & Schedule card** — enrolled count, next upcoming session, total reports, total logged hours
- If no data, shows appropriate empty messages

### 3.6 Dashboard — role-dispatched views

`DashboardView.tsx` reads the authenticated user's role and renders the appropriate component:
- **Coordinator** → `DashboardContent` — live summary cards (active class count with province badges, today's sessions, recent reports), today's session table, and the active classes list.
- **Trainer** → `TrainerDashboard` — class cards showing the trainer's assigned classes, their role (primary/assistant), enrolled student count, and the next upcoming schedule slots.
- **Trainee** → `TraineeDashboard` — enrolled classes with upcoming schedule, a progress ratings table (GK/Dex/HOM with attendance status), and a drill results table.

`InProgressPage.tsx` is no longer used by `DashboardView` but remains in the codebase as a fallback placeholder.

### 3.7 Classes page — client-side filtering

The classes page filters both active and archived lists client-side using `useMemo`:
- Province, site (derived from classes, scoped by province), game type dropdowns
- Free-text search on class name
- Reset button clears all filters

### 3.8 Reports & Schedule pages — server-side filtering

Both pages use the same architecture:
1. A custom hook (`useReportsQuery` / `useScheduleQuery`) manages filter, sort, and page state
2. A filter bar component renders dropdowns, date pickers, search input, and archived toggle
3. A sortable table shows results with clickable column headers
4. A shared `Pagination` component handles page navigation

Search is debounced at 300ms. Any filter/sort change resets to page 0.

### 3.9 Settings page

Shows the coordinator's profile (fetched from `api.profiles.me()`) with inline editing:
- Full name and province are **editable** inline (Save/Cancel buttons appear on change)
- Email, role, and member-since date are read-only
- Uses `api.profiles.update()` → `PUT /profiles/me` to persist changes
- Province is validated server-side against allowed values (BC, AB, ON)
- Sign-out button in a separate "Account" section

### 3.10 UI polish patterns

The app uses several reusable UI patterns for consistency:

**Toast notifications** (`ToastContext`): A global notification system. Call `useToast().toast(message, type)` after any async action. Toasts stack in the bottom-right corner, auto-dismiss after 4 seconds. Types: success (green), error (red), info (blue).

**Confirmation dialogs** (`ConfirmDialog`): Replaces `window.confirm()` with styled in-app dialogs. Uses a `confirmState` pattern — set state to open the dialog, clear it on cancel/confirm. Danger variant (red button) for destructive actions like delete, primary variant (blue) for archive.

**Skeleton loading** (`Skeleton.tsx`): Animated placeholder components (`SkeletonText`, `SkeletonCard`, `SkeletonTable`) that use Tailwind's `animate-pulse`. Shown instead of "Loading..." text while data fetches.

**Modal animations** (`index.css`): CSS keyframe animations for modals — backdrop fades in, content slides up with a subtle scale. Applied via `animate-backdrop-in` and `animate-modal-in` classes.

### 3.11 How components fetch data

Components use the `api` object from `apiClient.ts`:

```typescript
// Example: fetching drills for a class
const [drills, setDrills] = useState<ClassDrill[]>([])
useEffect(() => {
  api.drills.list(classId).then(setDrills)
}, [classId])
```

The `api` object handles auth headers automatically — it grabs the JWT from the Supabase session and adds `Authorization: Bearer <token>` to every request.

---

## 4. The backend — Express API layer

### 4.1 The middleware stack

When a request hits the Express app, it passes through these layers in order:

```
Request → helmet → globalLimiter → cors → express.json(50kb) → /api router → errorHandler
```

Inside the `/api` router:
```
→ requireAuth (validates JWT, sets req.userId + req.userRole + req.userEmail)
→ profilesRouter (accessible to ALL authenticated users)
→ selfServiceRouter (accessible to ALL authenticated users — /me/trainer-dashboard, /me/trainee-progress)
→ requireCoordinator (blocks non-coordinators from everything below)
→ classesRouter, drillsRouter, trainersRouter, studentProgressRouter, etc.
```

**This order matters.** If you add a route that trainers or trainees need, mount it BEFORE `requireCoordinator` in `routes/index.ts`.

### 4.2 Route pattern

Every route follows the same pattern:

```typescript
router.verb('/path', async (req, res, next) => {
  try {
    // 1. Extract params/body
    // 2. Call Supabase
    // 3. Handle errors (check for PGRST116 = not found)
    // 4. Respond with JSON
  } catch (err) {
    next(err)  // Sends to the global error handler
  }
})
```

The `next(err)` pattern means errors bubble up to `middleware/error.ts`, which returns a generic 500 in production (no stack traces leaked).

### 4.3 IDOR protection

"IDOR" = Insecure Direct Object Reference. In write operations, the API always matches BOTH the record ID AND the parent class ID:

```typescript
// Safe — matches both IDs:
.eq('id', req.params.id)
.eq('class_id', req.params.classId)
```

This prevents a coordinator from modifying records in a class they didn't specify in the URL. (Currently all coordinators have equal access, but the pattern is in place for future per-coordinator scoping.)

### 4.4 Supabase client (service role)

The backend uses the **service role key**, which bypasses Row-Level Security (RLS). This is intentional — the Express middleware handles all access control. The service role key is stored in `SUPABASE_SERVICE_ROLE_KEY` and must never be exposed to the frontend.

---

## 5. The database — Supabase PostgreSQL

### 5.1 Table hierarchy

Everything branches off from `classes`:

```
classes
├── class_drills
├── class_trainers ────────────────────────────┐
├── class_enrollments ─────────────────────┐   │
├── class_schedule_slots (FK → trainers)   │   │
├── class_logged_hours (FK → trainers      │   │
│                       or enrollments)    │   │
└── class_daily_reports                    │   │
    ├── class_daily_report_trainers ───────┼───┘
    ├── class_daily_report_timeline_items   │
    ├── class_daily_report_trainee_progress─┘
    └── class_daily_report_drill_times (FK → enrollments, drills)
```

### 5.2 Why class_trainers is a "snapshot"

When you assign a trainer to a class, their name and email are **copied** into `class_trainers`. If the trainer later changes their profile name, the class record keeps the old name.

**Why:** Training records need to reflect what was true at the time. If someone's name changes (marriage, legal change), historical reports should still show the name that was used during training. This is a compliance requirement.

### 5.3 The daily report structure

This is the most complex data model. A daily report captures everything about one training session:

**Main record** (`class_daily_reports`):
- Date, time range, group label, game type
- Session label (e.g. "Day 4 PM")
- Meet-and-greet headcounts (confirmed vs attended)
- Override fields for manual hour corrections

**Trainers present** (`class_daily_report_trainers`):
- Junction table linking which trainers were there that day
- Many-to-many: one report can have multiple trainers, one trainer can appear in many reports

**Timeline** (`class_daily_report_timeline_items`):
- Ordered list of training activities (lecture, dexterity practice, game simulation)
- `position` column preserves the order coordinators set in the UI
- Each item has start/end time, activity name, category, and homework/handouts info

**Trainee progress** (`class_daily_report_trainee_progress`):
- One row per student per report
- Three rating axes: GK (Game Knowledge), Dex (Dexterity), HOM (Habits of Mind)
- Each rated on a 4-point scale: EE (Exceeds), ME (Meets), AD (Approaching), NI (Needs Improvement)
- Tracks whether the student is coming back the next day and if homework was completed
- `attendance boolean NOT NULL DEFAULT true` — whether the student was present for this session (added in migration `001_add_attendance_to_progress.sql`)

### 5.4 Logged hours

The hours table tracks payroll-relevant data:
- `person_type`: is this a trainer or student?
- `hours`: 0-24 (decimal)
- `paid`: was this paid time?
- `live_training`: was this on the training floor (vs. classroom)?
- Either `trainer_id` or `enrollment_id` is set, never both

### 5.5 Audit logs

Every mutation (create, update, delete) on reports and hours writes to `audit_logs`:
- Who did it (`user_id`)
- What they did (`action`: CREATE/READ/UPDATE/DELETE)
- Which table and record
- Extra metadata (e.g. the class_id, report_date)
- Their IP address
- Timestamp

The `logAudit()` function **never throws** — if it fails (network issue, DB down), it logs to stderr but doesn't break the primary operation. This is deliberate: you don't want a user's save to fail just because the audit log is having a bad day.

---

## 6. Authentication — the full flow

### Login flow (step by step)

1. User goes to `/login`.
2. They enter email/password (or click "Continue with Google").
3. `LoginForm.tsx` calls `supabase.auth.signInWithPassword()`.
4. Supabase validates credentials and returns a session (JWT + refresh token).
5. The browser stores the session in localStorage (handled by Supabase JS automatically).
6. `AuthContext` detects the auth state change via `onAuthStateChange()`.
7. It fetches the user's role from the `profiles` table.
8. `ProtectedLayout` sees the session and role, renders the appropriate layout.
9. User lands on `/dashboard`.

### How API calls are authenticated

1. When `apiClient.ts` makes a request, `authHeaders()` calls `supabase.auth.getSession()`.
2. This returns the JWT from localStorage (Supabase handles token refresh automatically).
3. The JWT is sent as `Authorization: Bearer <token>`.
4. The backend's `requireAuth` middleware calls `supabase.auth.getUser(token)` to validate it.
5. It then queries `profiles` to get the role and attaches `req.userId`, `req.userRole`, and `req.userEmail` to the request.
6. Self-service routes (`/me/trainer-dashboard`, `/me/trainee-progress`) use `req.userEmail` to scope queries to the calling user — no coordinator-supplied ID is needed or accepted.

### Session persistence

Supabase stores the session in localStorage. When the user refreshes the page:
1. `AuthContext` calls `supabase.auth.getSession()` which reads from localStorage.
2. If the token is expired, Supabase automatically refreshes it using the stored refresh token.
3. The user stays logged in without re-entering credentials.

---

## 7. The API client — how frontend talks to backend

`web/src/lib/apiClient.ts` is the single point of contact for all data operations. It exports an `api` object with methods grouped by resource:

```typescript
api.classes.list({ archived: false })     // GET /api/classes?archived=false
api.classes.getByName("BJ APR 01")        // GET /api/classes/by-name/BJ%20APR%2001
api.classes.create({ name, site, ... })   // POST /api/classes
api.drills.list(classId)                  // GET /api/classes/:classId/drills
api.reports.get(reportId)                 // GET /api/reports/:id (with nested data)
api.profiles.me()                         // GET /api/profiles/me
```

### How `req<T>()` works

The generic `req` function is the core of the API client:

1. Calls `authHeaders()` to get the JWT Bearer token.
2. Prepends `API_BASE + "/api"` to the path.
3. Sets `Content-Type: application/json`.
4. If the response is 204 (No Content), returns `undefined` (used by DELETE endpoints).
5. Parses the JSON response body.
6. If `res.ok` is false, throws an `Error` with the server's error message.

### Environment-based URL

- **Local dev:** Set `VITE_API_URL=http://localhost:3001` in `web/.env`. The API client prepends this to all paths → `http://localhost:3001/api/classes`.
- **Production (Vercel):** Leave `VITE_API_URL` empty. The API client uses relative URLs → `/api/classes`. Since the frontend and API are on the same Vercel domain, this works via the rewrite rules in `vercel.json`.

---

## 8. Daily reports — the most complex feature

Daily reports deserve their own section because they're the most data-rich feature.

### What a daily report captures

A coordinator fills out a report for each training day. It includes:
- **Header:** date, group, game, session label, start/end time
- **Meet-and-greet:** how many were confirmed vs actually showed up
- **Trainers present:** which trainers were there (checkboxes)
- **Timeline:** an ordered list of activities — "9:00-10:00 Lecture: Card Values" → "10:00-11:00 Dexterity: Chip Cutting"
- **Trainee progress:** for each student, a rating on Game Knowledge, Dexterity, and Habits of Mind
- **Drill & test times:** per-student recordings of drill completion times and test scores, compared against par times/target scores
- **Override fields:** manual corrections to computed hour totals (for when logged hours don't match reality)

### How the data is stored

The report is split across 5 tables:
1. `class_daily_reports` — the main record
2. `class_daily_report_trainers` — which trainers were present (junction table)
3. `class_daily_report_timeline_items` — the activity timeline (ordered by `position`)
4. `class_daily_report_trainee_progress` — per-student assessments
5. `class_daily_report_drill_times` — per-student drill/test time and score recordings

### How it's fetched (GET /reports/:id)

The backend fetches all 5 tables in parallel using `Promise.all`:

```typescript
const [report, trainerLinks, timeline, progress, drillTimes] = await Promise.all([
  supabase.from('class_daily_reports').select('*').eq('id', id).single(),
  supabase.from('class_daily_report_trainers').select('trainer_id').eq('report_id', id),
  supabase.from('class_daily_report_timeline_items').select('*').eq('report_id', id)
    .order('position').order('start_time'),
  supabase.from('class_daily_report_trainee_progress').select('*').eq('report_id', id),
  supabase.from('class_daily_report_drill_times').select('*').eq('report_id', id),
])
```

Then merges them into one response:
```json
{
  "id": "...", "report_date": "2025-03-15", ...
  "trainer_ids": ["uuid1", "uuid2"],
  "timeline": [{ "start_time": "09:00", "activity": "Lecture", ... }],
  "progress": [{ "enrollment_id": "...", "gk_rating": "ME", ... }],
  "drill_times": [{ "enrollment_id": "...", "drill_id": "...", "time_seconds": 45, "score": null }]
}
```

### How it's saved (PUT — full replace)

When updating a report, the backend doesn't try to diff what changed. Instead:
1. Update the main report row.
2. Delete ALL existing trainer links → re-insert the ones from the request.
3. Delete ALL existing timeline items → re-insert from the request (with `position = array index`).
4. Delete ALL existing progress rows → re-insert from the request.
5. Delete ALL existing drill time rows → re-insert from the request.

**Why full replace instead of diff:** It's simpler and more reliable. The frontend sends the complete state; the backend saves exactly that. No risk of orphaned rows, no complex merge logic, no race conditions. The trade-off is slightly more DB operations, but these are small tables (typically 10-30 rows) so the performance impact is negligible.

### Drill times — how they work

The drill times feature lets coordinators record per-student drill/test results within a daily report:

**UI (ClassReportsSection):**
- A "Drill & test times" section in the report form shows a grid: rows = enrolled students, columns = active drills/tests
- Click "Load drills for trainees" to populate the grid (preserves existing values)
- Drill columns show `time_seconds` inputs; test columns show `score` inputs
- Color feedback: green border = met par/target, amber = missed

**PDF (reportPdf.ts):**
- Drill times appear as a separate page in the PDF (uses `page-break-before: always`)
- Color-coded cells (green = met, yellow = missed) with a legend
- Only shown when drill times exist in the report

**Caching:**
- After saving a report, `reportCacheRef.current[editingReport.id]` is deleted to invalidate the cache
- The next "View PDF" click re-fetches fresh data from the server (including drill_times)

**Future plans:**
- Trainers and students will record drill times themselves (the `class_daily_report_drill_times` table schema supports this — `enrollment_id` + `drill_id` + `report_id` allow entries from any source)

---

## 9. Security — what's protecting the app

### Layer 1: Network security
- **Helmet** adds security headers to every response: Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, etc.
- **CORS** restricts which origins can make API requests. In production, only the `FRONTEND_URL` is allowed.
- **Body size limit** (50 KB) prevents oversized request attacks.

### Layer 2: Rate limiting
- **Global limit:** 100 requests per 15 minutes per IP.
- **Write limit:** 30 requests per 15 minutes per IP (applied to POST/PUT/DELETE on sensitive endpoints).
- Uses `express-rate-limit` with `draft-8` standard headers.

### Layer 3: Authentication
- JWT tokens validated via `supabase.auth.getUser()` on every request.
- No anonymous access — `requireAuth` is the first middleware on every route.

### Layer 4: Authorization
- `requireCoordinator` middleware blocks non-coordinators from class management.
- `requirePayrollAdmin` (reserved for future use) gates financial data separately.
- IDOR protection: write operations verify the parent class ID matches.

### Layer 5: Data protection
- **AES-256-GCM encryption** (`server/src/lib/encryption.ts`) is ready for field-level encryption of sensitive data (SSN, SIN, salary). It's built but not yet wired to specific columns.
- The encryption format is `iv:ciphertext:authTag` (all hex-encoded), stored as a single string in the DB column.
- **Audit logging** tracks all mutations for compliance.

### What's NOT in place yet
- No automated tests.
- No input validation beyond what Supabase enforces (column types, NOT NULL constraints).
- No request body validation library (like Zod or Joi).
- RLS policies exist but are bypassed by the service role key.

---

## 10. Deployment — how code reaches production

### The Vercel setup

Everything deploys to Vercel via Git push. Here's how `vercel.json` configures it:

**Build command:**
```bash
npm install && cd server && npm install && cd ../web && npm install && npm run build
```
This installs dependencies for both packages and builds the frontend.

**Output directory:** `web/dist` — Vercel serves these static files.

**Serverless function:** `api/index.ts` is treated as a Vercel serverless function. It imports the Express app and Vercel wraps it automatically.

**URL rewrites:**
- `/api/*` → routes to the serverless function (Express handles the request)
- `/*` → routes to `index.html` (React Router handles client-side routing)

### Environment variables in Vercel

Set these in the Vercel project settings (Settings → Environment Variables):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL` (your Vercel app URL)
- `NODE_ENV=production`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Note: `VITE_*` variables are embedded at build time (Vite replaces them). Non-`VITE_` variables are available at runtime in the serverless function.

### Deployment branches

The `Production` branch is the main deployment branch. Pushing to it triggers a production build. Other branches get preview deployments with unique URLs.

---

## 11. Local development workflow

### First-time setup

```bash
# 1. Clone the repo
git clone <repo-url> && cd TrainingTool

# 2. Install dependencies
cd server && npm install
cd ../web && npm install

# 3. Set up environment variables
# Create server/.env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.
# Create web/.env with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL=http://localhost:3001
# Optional for local OAuth/reset callbacks: VITE_AUTH_REDIRECT_URL=http://localhost:5173
```

### Daily development

```bash
# Terminal 1 — Start the backend
cd server && npm run dev
# Runs: tsx watch src/index.ts (auto-restarts on file changes)
# Listens on: http://localhost:3001

# Terminal 2 — Start the frontend
cd web && npm run dev
# Runs: vite (hot module replacement)
# Listens on: http://localhost:5173
```

### Building for production locally

```bash
cd web && npm run build  # Outputs to web/dist/
cd ../server && npm run build  # Compiles TypeScript to server/dist/
```

### Database changes

SQL migrations are NOT stored in the repo. When you need to create or modify tables:
1. Write the SQL (CREATE TABLE, ALTER TABLE, etc.).
2. Run it in the **Supabase SQL Editor** (dashboard.supabase.com → SQL Editor).
3. If working with Claude, just paste the SQL in the chat — the AI will give you the SQL to run.

---

## 12. Key design decisions and why

### Why Express + Supabase instead of just Supabase?

The original version talked directly to Supabase from the frontend. The Express layer was added for:
1. **Centralized security** — rate limiting, CORS, body size limits, audit logging. These can't be done with Supabase alone.
2. **Complex queries** — reports with nested data need multiple table fetches that are cleaner in backend code.
3. **Field-level encryption** — AES-256-GCM requires server-side crypto (can't expose keys to the browser).
4. **Future flexibility** — if the project ever moves off Supabase, only the backend needs to change.

### Why the service role key bypasses RLS

Supabase RLS policies run on every query. When the backend uses the anon key, it hits the same RLS policies as the frontend, which causes issues:
- The backend needs to read/write data for any authenticated user (not just the requesting user).
- Complex RLS policies are hard to debug and maintain alongside Express middleware.

By using the service role key (which bypasses RLS) and handling all access control in Express middleware, the authorization logic lives in one place (the middleware) rather than being split between Express and Supabase policies.

### Why class names are used as URL slugs

Class URLs look like `/classes/BJ-APR-01` instead of `/classes/550e8400-...`. This is:
- **Human-readable** — coordinators can share URLs and know what class they point to.
- **Bookmarkable** — makes more sense than a UUID.
- **Searchable** — easier to find in browser history.

The trade-off: class names must be unique and can't contain hyphens (used as the slug separator). The `by-name` API route does the lookup.

### Why reports use full-replace instead of merge

When a coordinator saves a daily report, the frontend sends the entire report (main record + all timeline items + all progress rows). The backend deletes all existing nested rows and re-inserts.

This was chosen over incremental updates because:
- **Simplicity** — no diff algorithm, no tracking of which rows were added/modified/deleted.
- **Correctness** — the database always exactly matches what the user submitted. No orphaned rows.
- **Performance is fine** — a typical report has ~20 timeline items and ~15-20 progress rows. Deleting and re-inserting 40 rows is fast.

### Why trainer assignments are snapshots

`class_trainers` stores `trainer_name` and `trainer_email` at the time of assignment, not a foreign key to `profiles`. If the trainer changes their name later, the class record keeps the original name.

This is a **compliance requirement**: training records need to reflect what was true when the training happened, not what's true today.

### Why there are two Supabase clients

- `web/src/lib/supabase.ts` uses the **anon key** — this is the public key that's safe to embed in frontend code. It respects RLS policies and is used only for auth (login, logout, session).
- `server/src/lib/supabase.ts` uses the **service role key** — this bypasses RLS and has full database access. It's used for all data operations on the backend.

Never use the service role key on the frontend. Never use the anon key on the backend for data operations.

---

## 13. How to add new features

### Example: Adding an "attendance" feature

**Step 1: Define the types** (`web/src/types/index.ts`)
```typescript
export type AttendanceStatus = 'present' | 'late' | 'absent'

export interface ClassAttendance {
  id: string
  class_id: string
  enrollment_id: string
  slot_id: string
  status: AttendanceStatus
  notes: string | null
  created_at: string
}
```

**Step 2: Create the database table** (run in Supabase SQL Editor)
```sql
CREATE TABLE class_attendance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  enrollment_id uuid REFERENCES class_enrollments(id) ON DELETE CASCADE NOT NULL,
  slot_id uuid REFERENCES class_schedule_slots(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'late', 'absent')),
  notes text,
  created_at timestamptz DEFAULT now()
);
```

**Step 3: Create the backend route** (`server/src/routes/attendance.ts`)
Follow the pattern from `classes.ts` or `drills.ts`. Export `attendanceRouter`.

**Step 4: Mount it** (`server/src/routes/index.ts`)
Add `router.use(attendanceRouter)` after `requireCoordinator` (or before, if trainers need access).

**Step 5: Add API client methods** (`web/src/lib/apiClient.ts`)
```typescript
attendance: {
  list: (classId: string) => req<ClassAttendance[]>(`/classes/${classId}/attendance`),
  create: (classId: string, body: {...}) => req<ClassAttendance>(`/classes/${classId}/attendance`, { method: 'POST', body: JSON.stringify(body) }),
  // etc.
}
```

**Step 6: Build the UI** — Create page/section components, add routes to `App.tsx`.

---

## 14. Glossary of domain terms

| Term | Meaning |
|------|---------|
| **Class** | A training cohort — e.g. "Blackjack April 2025 at Training Site West" |
| **Site** | A training site property code (e.g. "Site A" for Training Site West) |
| **Province** | BC (British Columbia), AB (Alberta), or ON (Ontario) |
| **Game type** | The casino game being trained (Blackjack, Baccarat, Roulette, etc.) |
| **Drill** | A timed practice exercise (e.g. chip cutting) with a par time |
| **Test** | A scored knowledge or skill assessment with a target score |
| **Par time** | The target completion time for a drill (in seconds) |
| **GK rating** | Game Knowledge — how well the student knows rules and procedures |
| **Dex rating** | Dexterity — physical skills like chip handling and card dealing |
| **HOM rating** | Habits of Mind |
| **EE/ME/AD/NI** | Rating scale: Exceeds Expectations / Meets Expectations / Approaching Development / Needs Improvement |
| **Group label** | Sub-groups within a class (e.g. "A", "B") for splitting students into concurrent training sessions |
| **Meet-and-greet (MG)** | An initial orientation session; tracked by confirmed vs attended headcount |
| **Live training** | Training on the actual training floor (vs. classroom simulation) |
| **Override hours** | Manual corrections to computed hour totals when logged data doesn't match reality |
| **Archived** | A class that's complete/inactive — hidden from the active list but preserved for records |
| **Slug** | The URL-safe version of a class name ("BJ APR 01" → "BJ-APR-01") |
| **RLS** | Row-Level Security — PostgreSQL policies that restrict which rows users can access |
| **Service role key** | A Supabase key that bypasses RLS — used only on the backend |
| **Anon key** | A Supabase key that respects RLS — used on the frontend (safe to expose) |
| **PGRST116** | Supabase error code meaning "no rows found" when using `.single()` |
| **IDOR** | Insecure Direct Object Reference — an attack where a user manipulates IDs to access unauthorized data |

---

## 15. ClassDetailContext caching

### The problem

Previously, each tab section inside `ClassDetailPage` fetched its own data independently on mount. This led to significant redundancy — trainers were fetched 4 times, enrollments 3 times, and schedule slots 3 times per page load. Navigating between tabs or opening modals compounded the issue further.

### How it works now

All class detail data (trainers, enrollments, schedule, reports, hours, drills) is fetched once when `ClassDetailPage` mounts. This happens inside `ClassDetailProvider`, which wraps the entire tabbed page and stores everything in React context.

Tab sections consume the shared data via the `useClassDetail()` hook instead of making their own API calls:

```typescript
const { trainers, enrollments, schedule, reports, hours, drills, loading } = useClassDetail()
```

### Refreshing after mutations

When a section modifies data (e.g. adding a trainer, creating a report), it calls the corresponding refresh function to update just that slice of the shared cache:

- `refreshTrainers()` — after assigning or removing a trainer
- `refreshEnrollments()` — after enrolling or removing a student
- `refreshSchedule()` — after adding or editing schedule slots
- `refreshReports()` — after creating or updating a daily report
- `refreshHours()` — after logging or editing hours
- `refreshDrills()` — after adding or modifying drills

These functions re-fetch only the specific resource, not the entire cache.

### Loading states

All class detail sections now use skeleton components (`SkeletonTable`, `SkeletonCard`, etc.) instead of plain "Loading..." text while data is being fetched. This applies to both the initial load and individual refreshes.

---

## 16. Payroll hour summaries

### What it does

The payroll feature provides aggregated hour breakdowns per trainer and per student, derived from `class_logged_hours`. Coordinators use it to review total paid/unpaid hours, classroom vs live floor time, and export the data as CSV for payroll processing.

### Backend aggregation (`server/src/routes/payroll.ts`)

Two endpoints serve trainer and student summaries: `GET /payroll/trainers` and `GET /payroll/students`. Rather than using SQL aggregation, each endpoint fetches filtered `class_logged_hours` rows and groups them in memory by person (trainer or enrollment). This approach was chosen because the grouping logic includes joins across `class_trainers`/`class_enrollments` and `classes` for filtering by province, site, and date range, which would be complex as a single Supabase query.

Each summary includes: person name, total hours, paid hours, unpaid hours, live training hours, and classroom hours.

### The `usePayrollQuery` hook (`web/src/hooks/usePayrollQuery.ts`)

A single hook parameterized by `personType` (`'trainer'` or `'student'`). It manages filter state (province, site, date range, search), sort state, and calls the appropriate payroll endpoint. Both `TrainerPayrollPage` and `StudentPayrollPage` use this hook — the only difference is the `personType` argument. This follows the same pattern as `useReportsQuery` and `useScheduleQuery`.

### The two payroll pages

- **`TrainerPayrollPage.tsx`** — mounted at `/payroll/trainers`, calls `usePayrollQuery('trainer')`.
- **`StudentPayrollPage.tsx`** — mounted at `/payroll/students`, calls `usePayrollQuery('student')`.

Both render `PayrollFilterBar` and `PayrollTable`. The pages are coordinator-only (mounted after `requireCoordinator` in the route middleware).

### CSV export

The CSV export is entirely client-side. When the user clicks the export button in `PayrollFilterBar`, the current filtered and sorted data is serialized into a CSV string, wrapped in a `Blob`, and downloaded via a dynamically created anchor element (`URL.createObjectURL`). No server-side CSV endpoint exists — this keeps the implementation simple and avoids duplicating filter logic on the backend.

---

## 17. Student progress dashboard

Coordinators can drill into a per-student view by clicking any trainee row on the Roster page. This is a coordinator-only feature that aggregates data across all classes a student is enrolled in.

### How it works end-to-end

1. **RosterPage** renders trainee rows as clickable. Clicking navigates to `/students/progress/<url-encoded-email>`.
2. **App.tsx** registers `/students/progress/:email` **before** `/students` so React Router doesn't try to match "progress" as a username slug.
3. **StudentProgressPage** reads the `:email` param, decodes it, and calls `api.studentProgress.get(email)`.
4. The backend route (`GET /students/progress?email=`) finds all enrollments for that email, then in parallel fetches:
   - Class metadata for each enrollment
   - All `class_daily_report_trainee_progress` rows joined with report dates
   - All `class_daily_report_drill_times` rows joined with report dates and drill metadata
5. The page renders three sections: enrolled classes, a progress ratings table (with an "Attended" column), and a drill times table grouped by drill name.

### Response shape (`StudentProgressResponse`)

```typescript
{
  student_name: string
  student_email: string
  classes: Array<{ class_id, class_name, enrollment_id, status, group_label }>
  progress: Array<{ report_date, session_label, class_name, gk_rating, dex_rating, hom_rating, attendance, ... }>
  drill_times: Array<{ report_date, class_name, drill_name, drill_type, time_seconds, score, par_time_seconds, target_score }>
}
```

---

## 18. Attendance tracking

Attendance is a simple boolean stored directly on each per-student-per-report row in `class_daily_report_trainee_progress`. It answers: "Did this student show up for this session?"

### Why a boolean instead of a separate table

A full attendance table (linked to schedule slots) would allow tracking absences even when a report isn't written. The current model is simpler: attendance is only meaningful in the context of a written report. The boolean approach was chosen to keep the schema minimal while satisfying the immediate need to distinguish "attended and assessed" from "absent."

### Database migration

```sql
ALTER TABLE class_daily_report_trainee_progress
  ADD COLUMN IF NOT EXISTS attendance boolean NOT NULL DEFAULT true;
```

The migration file lives at `server/src/migrations/001_add_attendance_to_progress.sql`. Run it in the Supabase SQL Editor before deploying. Future migrations should follow the same naming pattern (`NNN_description.sql`).

### Where attendance appears in the UI

- **Report form** (`ClassReportsSection.tsx`): an "Attended?" checkbox column for each trainee in the progress section. Unchecking marks the student absent.
- **Student progress page** (`StudentProgressPage.tsx`): an "Attended" column in the Progress Ratings table showing a green checkmark for present or an amber "Absent" badge.
- **Trainee self-service dashboard** (`TraineeDashboard.tsx`): the same progress table is shown to the trainee, including the attendance status.

---

## 19. Trainer and trainee self-service views

Before Phase 4, non-coordinator users saw a "work in progress" placeholder after login. Now they land on a functional dashboard scoped to their own data.

### The key architectural change: `req.userEmail`

The `requireAuth` middleware now sets `req.userEmail` from the validated JWT in addition to `req.userId` and `req.userRole`. Self-service routes use this email to scope database queries — a trainer or trainee cannot query data for another user by changing a URL parameter.

### The self-service router (`server/src/routes/selfService.ts`)

This router is mounted **before** `requireCoordinator` in `routes/index.ts`. That means any authenticated user (coordinator, trainer, or trainee) can reach it, but in practice coordinators won't — they have richer coordinator-specific endpoints.

**`GET /me/trainer-dashboard`**

Finds all `class_trainers` rows where `trainer_email` matches `req.userEmail`, then fetches in parallel:
- Class metadata for each assigned class
- Enrolled student counts per class (status = 'enrolled')
- Upcoming schedule slots on or after today (capped at the first 3 per class)

Returns `TrainerDashboardResponse`: `{ trainer_name, trainer_email, classes[] }` where each class entry includes `trainer_role`, `enrolled_count`, and `upcoming_slots`.

**`GET /me/trainee-progress`**

Functionally equivalent to `GET /students/progress?email=...` (the coordinator endpoint) but uses `req.userEmail` instead of a query parameter. Additionally, each class entry includes `upcoming_slots` (next 3 schedule slots) so the trainee can see their upcoming sessions.

Returns `TraineeDashboardResponse`: same shape as `StudentProgressResponse` but with `upcoming_slots` on each class.

### Frontend pages

**`TrainerDashboard.tsx`**
- Calls `api.selfService.trainerDashboard()` on mount.
- Renders a card per assigned class showing: class name, site, province, game type, trainer role badge (Primary / Assistant), enrolled student count, and a mini schedule list of upcoming slots.
- Uses `SkeletonCard` during loading.

**`TraineeDashboard.tsx`**
- Calls `api.selfService.traineeDashboard()` on mount.
- Renders enrolled classes with upcoming schedule, a progress ratings table (same GK/Dex/HOM/Attended columns as `StudentProgressPage`), and a drill results table.
- Uses `SkeletonCard` and `SkeletonTable` during loading.

### Why the two endpoints have different shapes

`GET /students/progress` (coordinator) returns a flat list of classes with no schedule data — coordinators look at a specific student and don't need the student's upcoming schedule. `GET /me/trainee-progress` adds `upcoming_slots` because a trainee's primary concern is "when is my next session?" The two endpoints share the same underlying Supabase queries; the difference is the source of the email and the addition of the schedule fetch.
