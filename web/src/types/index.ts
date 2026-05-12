/**
 * types/index.ts — Shared TypeScript types for the frontend
 *
 * This file is the single source of truth for all data shapes used
 * across the frontend. Every type here mirrors a Supabase database table or
 * a domain concept used in the UI.
 *
 * Types are exported and consumed by:
 *   - apiClient.ts  — for request/response typing
 *   - React components — for prop and state typing
 *   - reportPdf.ts  — for report generation
 *
 * Keep this file in sync with the backend database schema. When a new
 * column is added to Supabase, add it here first so TypeScript surfaces
 * any stale references across the codebase.
 */

/** The three roles a user can hold. Enforced by both the API and the UI. */
export type UserRole = 'trainee' | 'trainer' | 'coordinator'

/** Provinces where Gateway Casinos operates training programs. */
export type Province = 'BC' | 'AB' | 'ON'

/** A user account in the system, stored in the `profiles` table. */
export interface Profile {
  id: string           // UUID matching auth.users.id in Supabase
  email: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  role: UserRole
  province: Province | null  // Home province, used for multi-site filtering
  role_selected: boolean     // Whether the user has completed post-signup role selection
  created_at: string
  updated_at: string
}

/** A training class — the central entity that groups trainers, students, schedule, and reports. */
export interface Class {
  id: string
  name: string          // Short identifier (e.g. "BJ-APR-01"), used as URL slug
  site: string          // Casino site code (e.g. "GVE", "SLE")
  province: Province
  game_type: string | null  // The casino game being trained (e.g. "Blackjack")
  start_date: string    // ISO date string (YYYY-MM-DD)
  end_date: string
  description: string | null
  archived: boolean     // Archived classes are hidden from the active list but not deleted
  created_at: string
  updated_at: string
}

/** Whether a class activity is a timed drill or a scored test. */
export type DrillType = 'drill' | 'test'

/**
 * A drill or test associated with a class.
 * `par_time_seconds` is the target completion time for drills.
 * `target_score` is the passing score for tests.
 */
export interface ClassDrill {
  id: string
  class_id: string
  name: string
  type: DrillType
  par_time_seconds: number | null
  target_score: number | null
  active: boolean       // Inactive drills are hidden from assessment forms
  created_at: string
}

/** Whether a trainer is the lead or a support trainer for a class. */
export type TrainerRole = 'primary' | 'assistant'

/**
 * A trainer assigned to a specific class.
 * Note: this is a denormalized snapshot of the trainer's name/email at the
 * time of assignment; it does not update if the profile changes.
 */
export interface ClassTrainer {
  id: string
  class_id: string
  trainer_name: string
  trainer_email: string
  role: TrainerRole
  created_at: string
}

/** Whether a student is active, has left, or did not complete the class. */
export type EnrollmentStatus = 'enrolled' | 'dropped' | 'failed'

/**
 * A single time block in a class's schedule.
 * `trainer_id` references `class_trainers.id` (not a user profile).
 * `group_label` (e.g. "A", "B") divides students into concurrent training groups.
 */
export interface ClassScheduleSlot {
  id: string
  class_id: string
  slot_date: string     // ISO date string
  start_time: string    // 24-hour time string (HH:MM)
  end_time: string
  notes: string | null
  trainer_id: string | null
  group_label: string | null
  created_at: string
}

/**
 * A student's enrollment in a class.
 * `group_label` assigns the student to a competency sub-group (e.g. "A", "B").
 */
export interface ClassEnrollment {
  id: string
  class_id: string
  student_name: string
  student_email: string
  status: EnrollmentStatus
  group_label: string | null
  created_at: string
}

/**
 * Daily performance rating scale used for trainee assessments.
 *   EE = Exceeds Expectations
 *   ME = Meets Expectations
 *   AD = Approaching Development
 *   NI = Needs Improvement
 */
export type DailyRating = 'EE' | 'ME' | 'AD' | 'NI'

/**
 * A daily report summarising one training session for a class group.
 * Nested data (timeline items and trainee progress rows) are stored in
 * separate tables and fetched separately via the `ReportWithNested` type in apiClient.ts.
 * The `override_*` fields allow coordinators to manually correct computed hour totals.
 */
export interface ClassDailyReport {
  id: string
  class_id: string
  report_date: string        // ISO date string
  group_label: string | null // Which student group this report covers
  game: string | null        // Game type trained that day
  session_label: string | null // Human-readable label (e.g. "Day 4 PM")
  class_start_time: string | null
  class_end_time: string | null
  mg_confirmed: number | null  // Meet-and-greet headcount confirmed
  mg_attended: number | null   // Meet-and-greet headcount actually present
  current_trainees: number | null
  licenses_received: number | null
  override_hours_to_date: number | null     // Manual override for cumulative training hours
  override_paid_hours_total: number | null  // Manual override for paid hours total
  override_live_hours_total: number | null  // Manual override for live floor hours total
  coordinator_notes: string | null           // Feedback left by coordinator (trainer sees read-only)
  created_at: string
}

/** Junction record linking a trainer to a daily report (many-to-many). */
export interface ClassDailyReportTrainer {
  report_id: string
  trainer_id: string  // References class_trainers.id
}

/**
 * A single row in the daily training timeline table.
 * `position` is used to preserve the drag-and-drop ordering set by the coordinator.
 */
export interface ClassDailyReportTimelineItem {
  id: string
  report_id: string
  start_time: string | null
  end_time: string | null
  activity: string | null
  homework_handouts_tests: string | null  // Any homework, handouts, or tests in this block
  category: string | null  // E.g. "Lecture", "Dexterity", "Game simulation"
  position: number | null  // Display order (0-based)
  created_at: string
}

/**
 * A trainer's assessment of one student for a given daily report.
 * `gk_rating` = Game Knowledge, `dex_rating` = Dexterity, `hom_rating` = Hands on Mechanics.
 */
export interface ClassDailyReportTraineeProgress {
  id: string
  report_id: string
  enrollment_id: string     // References class_enrollments.id
  progress_text: string | null
  gk_rating: DailyRating | null
  dex_rating: DailyRating | null
  hom_rating: DailyRating | null
  coming_back_next_day: boolean | null
  homework_completed: boolean
  attendance: boolean       // Whether the student was present for this session
  late: boolean              // Whether the student arrived late (only meaningful when attendance = true)
  created_at: string
}

/**
 * A recorded drill or test time/score for a single student in a daily report.
 * `time_seconds` is used for drills (timed activities).
 * `score` is used for tests (scored activities).
 * This table is designed to also accept entries from trainers and students
 * in a future self-service recording flow — the report_id links it to a
 * specific training day for context.
 */
export interface ClassDailyReportDrillTime {
  id: string
  report_id: string
  enrollment_id: string     // References class_enrollments.id
  drill_id: string          // References class_drills.id
  time_seconds: number | null   // Completion time in seconds (for drills)
  score: number | null          // Score achieved (for tests)
  created_at: string
}

/** Whether the hours entry is for a trainer or a student (trainee). */
export type LoggedHoursPersonType = 'trainer' | 'student'

/**
 * A single hours-logged record for payroll tracking.
 * Either `trainer_id` or `enrollment_id` is set depending on `person_type`,
 * but never both.
 * `paid` distinguishes paid time from unpaid/volunteer hours.
 * `live_training` flags hours spent on the live casino floor (vs. classroom).
 */
export interface ClassLoggedHours {
  id: string
  class_id: string
  log_date: string       // ISO date string
  person_type: LoggedHoursPersonType
  trainer_id: string | null     // Set when person_type === 'trainer'
  enrollment_id: string | null  // Set when person_type === 'student'
  hours: number
  paid: boolean
  live_training: boolean
  notes: string | null
  created_at: string
}

/** Student progress response from GET /students/progress?email=... */
export interface StudentProgressResponse {
  student_name: string
  student_email: string
  classes: Array<{
    class_id: string
    class_name: string
    enrollment_id: string
    status: string
    group_label: string | null
  }>
  progress: Array<{
    report_date: string
    session_label: string | null
    group_label: string | null
    class_name: string
    progress_text: string | null
    gk_rating: DailyRating | null
    dex_rating: DailyRating | null
    hom_rating: DailyRating | null
    coming_back_next_day: boolean | null
    homework_completed: boolean
    attendance: boolean
    late: boolean
  }>
  drill_times: Array<{
    report_date: string
    class_name: string
    drill_name: string
    drill_type: string
    time_seconds: number | null
    score: number | null
    par_time_seconds: number | null
    target_score: number | null
  }>
}

/** Upcoming schedule slot shape used in self-service dashboards. */
export interface UpcomingSlot {
  id: string
  slot_date: string
  start_time: string
  end_time: string
  group_label: string | null
  notes: string | null
}

/** Response from GET /me/trainer-dashboard. */
export interface TrainerDashboardResponse {
  trainer_name: string | null
  trainer_email: string
  classes: Array<{
    class_id: string
    trainer_id: string
    class_name: string
    site: string
    province: string
    game_type: string | null
    start_date: string | null
    end_date: string | null
    archived: boolean
    trainer_role: string
    enrolled_count: number
    total_hours: number
    upcoming_slots: UpcomingSlot[]
  }>
}

/** Response from GET /me/today — trainer work queue for one date. */
export interface TrainerTodayResponse {
  date: string
  generated_at: string
  slots: Array<{
    id: string
    class_id: string
    class_name: string
    site: string
    province: string
    game_type: string | null
    archived: boolean
    slot_date: string
    start_time: string
    end_time: string
    group_label: string | null
    notes: string | null
    trainer_id: string | null
    assigned_to_me: boolean
    report: {
      id: string
      report_date: string
      group_label: string | null
      session_label: string | null
      game: string | null
      created_at: string
    } | null
    copy_source_report: {
      id: string
      report_date: string
      group_label: string | null
      session_label: string | null
      game: string | null
      created_at: string
    } | null
  }>
}

/** Response from GET /me/trainee-progress — extends StudentProgressResponse with schedule slots. */
export interface TraineeDashboardResponse {
  student_name: string | null
  student_email: string
  classes: Array<{
    class_id: string
    class_name: string
    site: string
    province: string
    game_type: string | null
    start_date: string | null
    end_date: string | null
    enrollment_id: string
    status: string
    group_label: string | null
    upcoming_slots: UpcomingSlot[]
  }>
  progress: Array<{
    report_date: string
    session_label: string | null
    group_label: string | null
    class_name: string
    progress_text: string | null
    gk_rating: DailyRating | null
    dex_rating: DailyRating | null
    hom_rating: DailyRating | null
    coming_back_next_day: boolean | null
    homework_completed: boolean
    attendance: boolean
    late: boolean
  }>
  drill_times: Array<{
    report_date: string
    class_name: string
    drill_name: string
    drill_type: string
    time_seconds: number | null
    score: number | null
    par_time_seconds: number | null
    target_score: number | null
  }>
}

/** A role change request submitted during post-signup role selection. */
export interface RoleRequest {
  id: string
  user_id: string
  requested_role: 'trainer' | 'coordinator'
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  created_at: string
  updated_at: string
  user_name?: string | null
  user_email?: string
}

/** A single daily report as seen by a student, with their own progress and drill data. */
export interface StudentReportView {
  report_id: string
  report_date: string
  session_label: string | null
  group_label: string | null
  game: string | null
  class_start_time: string | null
  class_end_time: string | null
  is_today: boolean
  my_progress: {
    gk_rating: DailyRating | null
    dex_rating: DailyRating | null
    hom_rating: DailyRating | null
    attendance: boolean
    late: boolean
    homework_completed: boolean
    progress_text: string | null
    coming_back_next_day: boolean | null
  } | null
  my_drill_times: Array<{
    drill_id: string
    drill_name: string
    drill_type: string
    time_seconds: number | null
    score: number | null
    par_time_seconds: number | null
    target_score: number | null
  }>
  drills: Array<{
    id: string
    name: string
    type: DrillType
    par_time_seconds: number | null
    target_score: number | null
  }>
}

/** Response from GET /me/my-class/:classId — student class detail. */
export interface StudentClassDetailResponse {
  class_info: {
    id: string
    name: string
    site: string
    province: string
    game_type: string | null
    start_date: string
    end_date: string
  }
  enrollment: {
    id: string
    status: string
    group_label: string | null
    student_name: string
  }
  drills: Array<{
    id: string
    name: string
    type: DrillType
    par_time_seconds: number | null
    target_score: number | null
  }>
  upcoming_slots: UpcomingSlot[]
}

/** Aggregated payroll row returned by GET /payroll/trainers and /payroll/students. */
export interface PayrollRow {
  person_id: string
  person_name: string
  person_email: string
  total_hours: number
  paid_hours: number
  live_hours: number
  class_count: number
}

/** Response from GET /me/my-classes — enhanced trainer dashboard. */
export interface TrainerMyClassesResponse {
  trainer_name: string | null
  trainer_email: string
  classes: Array<{
    class_id: string
    trainer_id: string
    class_name: string
    site: string
    province: string
    game_type: string | null
    start_date: string | null
    end_date: string | null
    archived: boolean
    trainer_role: string
    enrolled_count: number
    total_hours: number
    upcoming_slots: UpcomingSlot[]
  }>
}

/** Response from GET /me/my-classes/:classId. */
export interface TrainerClassDetailResponse extends Class {
  trainer_role: string
  trainer_id: string
  enrollments: ClassEnrollment[]
  drills: ClassDrill[]
  trainers: ClassTrainer[]
}

/** Response from GET /me/my-classes/:classId/hours — split by person type. */
export interface TrainerClassHoursResponse {
  trainer_hours: ClassLoggedHours[]
  student_hours: ClassLoggedHours[]
}

/** Response from GET /me/my-classes/:classId/students/:enrollmentId/progress. */
export interface TrainerStudentProgressResponse {
  enrollment: ClassEnrollment
  progress: ClassDailyReportTraineeProgress[]
  drill_times: ClassDailyReportDrillTime[]
}

/** Response from GET /me/hours — personal hours with summary. */
export interface TrainerMyHoursResponse {
  data: (ClassLoggedHours & { classes: { id: string; name: string; site: string; province: string } })[]
  total: number
  page: number
  limit: number
  summary: { total_hours: number; paid_hours: number; unpaid_hours: number }
}

/** Static list of supported provinces used for dropdowns and display labels. */
export const PROVINCES: { value: Province; label: string }[] = [
  { value: 'BC', label: 'British Columbia' },
  { value: 'AB', label: 'Alberta' },
  { value: 'ON', label: 'Ontario' },
]
