# TrainingTool
A web-based internal training management platform for training teams, supporting coordinators, trainers, and students across BC, AB, and ON properties. Built for the floor — fast drill logging, digital assessments, and real-time scheduling in one place.

---

## Tech Stack

### Frontend
- **React + TypeScript** — Component-based UI with strong typing. Chosen for its ecosystem maturity and direct upgrade path to React Native in Phase 4.
- **Tailwind CSS** — Utility-first styling with mobile-responsive defaults. Consistent design tokens across all screen sizes without custom CSS overhead.
- **React Router** — Client-side routing with role-aware protected routes.

### Backend
- **Node.js + Express** — REST API layer in the same language as the frontend, keeping the codebase unified and reducing context-switching for developers.
- **tRPC** *(optional upgrade path)* — End-to-end type-safe API calls between frontend and backend without a separate schema layer.

### Database & Auth
- **PostgreSQL** — Relational model that maps cleanly to the Coordinator → Trainer → Student hierarchy with row-level security.
- **Supabase** — Wraps PostgreSQL with built-in auth (RBAC), file storage for daily reports and scanned PDFs, and real-time subscriptions. Includes a generous free tier for prototyping.

### File Storage
- **Supabase Storage** — Daily reports, scanned PDFs, and uploaded documents. Co-located with the database; no separate S3 bucket to configure.

### Hosting
- **Vercel** — Frontend hosting with Git-based deployments and automatic preview URLs per branch.
- **Railway** — Backend API and database hosting. Persistent PostgreSQL instances with straightforward environment variable management.

### Mobile (Phase 4)
- **React Native (Expo)** — Reuses React component logic and all API/data layer code. Single codebase deploys to both iOS and Android. Expo Go enables on-device testing without app store submissions during development.

---


## Roadmap
 
### Phase 1 — MVP: Core Foundation *(Months 1–3)*
 
The goal of Phase 1 is a working tool that trainers will actually use on the floor. Every feature here is chosen because it supports the highest-frequency daily actions: logging drills, tracking attendance, and giving students visibility into their schedule.
 
- [ ] Role hierarchy and authentication (Coordinator / Trainer / Student)
- [ ] Province selector (BC / AB / ON) — scopes content, locations, and game types
- [ ] Class creation — named cohorts with dates, property, game type, and assigned trainer
- [ ] Class scheduling — time slots published and visible to students
- [ ] Built-in drill timer — one tap to start/stop; result auto-populates the drill log
- [ ] Drill entry and test score tracking — per-student with configurable pass/fail thresholds
- [ ] Daily report upload — photo capture or PDF scan, stored per class day
- [ ] Attendance tracking — trainer marks present / late / absent each session
 
---
 
### Phase 2 — Operations: Records & Oversight *(Months 4–6)*
 
Phase 2 turns the data collected in Phase 1 into actionable records. Coordinators gain visibility; sign-offs and checklists create a defensible paper trail.
 
- [ ] Competency sign-offs — trainer digitally signs off per skill; immutable audit trail
- [ ] Graduation checklist — all criteria (attendance, drills, test scores) must pass before graduation
- [ ] Progress dashboards — per-student view; cohort heat map for coordinators
- [ ] Retraining flags — auto-raised on repeat failure; routed to coordinator with skill gap detail
- [ ] Digital site forms — replaces paper; auto-generates PDF copy for records
- [ ] Audit log — immutable record of all score entries, sign-offs, and report uploads with user + timestamp
- [ ] Notification centre — shift reminders, missed drill alerts, sign-off requests
- [ ] Drill template builder — coordinators create templates with par times and scoring bands, shared across properties
 
---
 
### Phase 3 — Intelligence: Insights & Integrations *(Months 7–10)*
 
Phase 3 connects the tool to the wider ecosystem and surfaces the patterns in training data that coordinators need to make program-level decisions.
 
- [ ] Slack integration — daily report summaries, drill results, and shift reminders to DMs/channels
- [ ] Percipio lesson links — required pre-reading attached to drill templates and test prep modules
- [ ] Province-specific regulatory modules — BCLC / AGCO rule content with comprehension checks; logged for compliance audits
- [ ] Anonymous cohort benchmarks — students see percentile rank without peer names exposed
- [ ] Floor probation tracker — on-floor observations logged post-graduation; probation expiry surfaced to supervisors
- [ ] Student self-assessment — post-session confidence rating; gap between self-rating and trainer observation shown
- [ ] Shift swap board — student posts swap request; coordinator approves in-tool
- [ ] Alumni tracker — post-graduation placement logged by property, table, and game type; feeds program quality metrics
 
---
 
### Phase 4 — Mobile: Native App Expansion *(Months 11–14)*
 
Phase 4 converts the web app into a native mobile experience, adding capabilities that only make sense on a device in hand on the training floor.
 
- [ ] Offline mode — drill logs work without Wi-Fi in pits and back-of-house; syncs on reconnect
- [ ] Push notifications — native OS alerts for shifts, sign-off requests, and report uploads
- [ ] Camera-assisted chip counting — student photographs chip stack; computer vision estimates count for trainer to confirm
- [ ] Mobile-first UX pass — thumb-zone optimised layouts, haptic feedback on drill timer, gesture navigation
 
---
 
## Ideas for Future Consideration
 
- **single sign-on integration** — single sign-on using existing identity provider credentials
- **Manager read-only view** — pit managers and floor supervisors can view active class schedules and student progress without trainer-level access
- **API for third-party LMS** — export training records to external systems for HR or compliance use
 
---
 
## Project Structure *(planned)*
 
```
training-tool/
├── apps/
│   ├── web/          # React + TypeScript frontend
│   └── api/          # Node.js + Express backend
├── packages/
│   └── shared/       # Shared types, utilities, constants
├── supabase/
│   ├── migrations/   # Database schema migrations
│   └── seed/         # Seed data for development
└── docs/             # Architecture decisions, onboarding guides
```
 
---
 
## Getting Started
 
> Setup instructions will be added once the initial scaffolding is complete.
 
---
 
## Contributing
 
This is an internal training teams project. Contact the Training Technology team for access and contribution guidelines.
