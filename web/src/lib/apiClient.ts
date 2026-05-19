/**
 * lib/apiClient.ts — Typed HTTP client for the Express backend API
 *
 * All data fetching (except auth) goes through this file. It provides a
 * structured `api` object whose methods correspond to backend REST endpoints.
 *
 * How it works:
 *   1. `authHeaders()` retrieves the current Supabase session JWT and formats
 *      it as a Bearer token for the Authorization header.
 *   2. `req<T>()` is a thin generic wrapper around `fetch` that automatically
 *      attaches auth headers, sets the base URL, and converts errors to
 *      thrown Error objects that callers can catch.
 *   3. The exported `api` object groups methods by resource (classes, drills,
 *      trainers, enrollments, schedule, reports, hours, profiles).
 *
 * Environment variable:
 *   VITE_API_URL — Set to http://localhost:3001 for local dev. Leave empty
 *                  for production (same-origin relative URLs are used).
 *
 * Example usage:
 *   const classes = await api.classes.list({ archived: false })
 *   const report  = await api.reports.get(reportId)
 */

import { supabase } from './supabase'
import type {
  Class,
  ClassDrill,
  ClassTrainer,
  ClassEnrollment,
  ClassScheduleSlot,
  ClassDailyReport,
  ClassDailyReportTimelineItem,
  ClassDailyReportTraineeProgress,
  ClassDailyReportDrillTime,
  ClassLoggedHours,
  ClassDocument,
  Profile,
  DrillType,
  TrainerRole,
  EnrollmentStatus,
  LoggedHoursPersonType,
  Province,
  DailyRating,
  PayrollRow,
  StudentProgressResponse,
  TrainerDashboardResponse,
  TrainerTodayResponse,
  TraineeDashboardResponse,
  TrainerMyClassesResponse,
  TrainerClassDetailResponse,
  TrainerClassHoursResponse,
  TrainerStudentProgressResponse,
  TrainerMyHoursResponse,
  RoleRequest,
  StudentReportView,
  StudentClassDetailResponse,
} from '../types'

// In production (same Vercel project) this is empty → relative URLs /api/...
// In local dev set VITE_API_URL=http://localhost:3001 in web/.env
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

/**
 * Retrieves the current user's JWT from Supabase and formats it as a
 * Bearer token Authorization header. Throws if the user is not signed in,
 * which will propagate as an error in any `req()` call.
 */
async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  return { Authorization: `Bearer ${session.access_token}` }
}

// Deduplicates concurrent GET requests to the same path — if a fetch is already
// in-flight, subsequent callers share the same Promise instead of firing again.
const inFlight = new Map<string, Promise<unknown>>()

const GET_CACHE_FRESH_MS = 5 * 60 * 1000
const GET_CACHE_STALE_MS = 30 * 60 * 1000

type CachedResponse = {
  data: unknown
  fetchedAt: number
}

const responseCache = new Map<string, CachedResponse>()
let cacheEpoch = 0

function isCacheableGet(path: string): boolean {
  return !path.startsWith('/search') &&
    !path.startsWith('/audit') &&
    !path.startsWith('/system-health') &&
    !path.includes('/download')
}

function readCachedResponse<T>(path: string): { data: T; stale: boolean } | null {
  const entry = responseCache.get(path)
  if (!entry) return null

  const age = Date.now() - entry.fetchedAt
  if (age > GET_CACHE_STALE_MS) {
    responseCache.delete(path)
    return null
  }

  return { data: entry.data as T, stale: age > GET_CACHE_FRESH_MS }
}

function writeCachedResponse<T>(path: string, data: T) {
  responseCache.set(path, { data, fetchedAt: Date.now() })
}

function refreshCachedResponse<T>(path: string, init: RequestInit) {
  if (inFlight.has(path)) return

  const requestEpoch = cacheEpoch
  const promise = doReq<T>(path, init)
    .then(result => {
      if (requestEpoch === cacheEpoch) writeCachedResponse(path, result)
      return result
    })

  inFlight.set(path, promise)
  promise
    .catch(err => console.error('Background refresh failed:', (err as Error).message))
    .finally(() => inFlight.delete(path))
}

export function clearApiCache(prefix?: string) {
  cacheEpoch += 1
  if (!prefix) {
    responseCache.clear()
    inFlight.clear()
    return
  }

  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key)
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) inFlight.delete(key)
  }
}

export function peekApiCache<T>(path: string): T | null {
  return readCachedResponse<T>(path)?.data ?? null
}

/**
 * Generic fetch wrapper used by all API methods.
 * - Prepends API_BASE + "/api" to the path.
 * - Attaches Content-Type and Authorization headers automatically.
 * - Returns `undefined` (typed as T) for 204 No Content responses (e.g. DELETE).
 * - Throws an Error with the server's `error` field message if the response is not ok.
 * - Deduplicates concurrent GET requests to the same path.
 * - Reuses recent GET responses across route visits and refreshes stale entries
 *   in the background.
 */
async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  if (method === 'GET') {
    if (!isCacheableGet(path)) {
      const uncached = inFlight.get(path)
      if (uncached) return uncached as Promise<T>
      const promise = doReq<T>(path, init)
      inFlight.set(path, promise)
      promise.finally(() => inFlight.delete(path))
      return promise
    }

    const cached = readCachedResponse<T>(path)
    if (cached) {
      if (cached.stale) refreshCachedResponse<T>(path, init)
      return cached.data
    }

    const pending = inFlight.get(path)
    if (pending) return pending as Promise<T>

    const requestEpoch = cacheEpoch
    const promise = doReq<T>(path, init).then(result => {
      if (requestEpoch === cacheEpoch) writeCachedResponse(path, result)
      return result
    })
    inFlight.set(path, promise)
    promise.finally(() => inFlight.delete(path))
    return promise
  }

  const result = await doReq<T>(path, init)
  clearApiCache()
  return result
}

async function doReq<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(init.headers ?? {}),
    },
  })
  // 204 has no body; return undefined so callers can type the result as void
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  let body: unknown = null

  if (text) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = isJson ? { error: text } : text
    }
  }

  if (!res.ok) {
    const jsonMessage = typeof body === 'object' && body !== null
      ? (body as { error?: string }).error
      : null
    const textMessage = typeof body === 'string' ? body : null
    throw new Error(jsonMessage ?? textMessage ?? `Request failed: ${res.status}`)
  }
  return body as T
}

async function uploadReq<T>(path: string, file: File, description?: string): Promise<T> {
  const auth = await authHeaders()
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: {
      ...auth,
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
      ...(description ? { 'X-Description': encodeURIComponent(description) } : {}),
    },
    body: file,
  })
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = text
    }
  }
  if (!res.ok) {
    const jsonMessage = typeof body === 'object' && body !== null
      ? (body as { error?: string }).error
      : null
    const textMessage = typeof body === 'string' ? body : null
    throw new Error(jsonMessage ?? textMessage ?? `Request failed: ${res.status}`)
  }
  clearApiCache()
  return body as T
}

// ─── Nested report types ────────────────────────────────────────────────────

/**
 * The full report shape returned by GET /reports/:id.
 * Extends the base ClassDailyReport with the three nested arrays that are
 * stored in separate DB tables and fetched together by the backend.
 */
export interface ReportWithNested extends ClassDailyReport {
  trainer_ids: string[]                          // IDs of trainers present that day
  timeline: ClassDailyReportTimelineItem[]       // Ordered list of training blocks
  progress: ClassDailyReportTraineeProgress[]    // Per-student assessment rows
  drill_times: ClassDailyReportDrillTime[]       // Per-student drill/test results
}

/** Input shape for a single timeline row when creating or updating a report. */
interface TimelineItemInput {
  start_time: string | null
  end_time: string | null
  activity: string | null
  homework_handouts_tests: string | null
  category: string | null
}

/** Input shape for a single trainee progress row when creating or updating a report. */
interface ProgressRowInput {
  enrollment_id: string
  progress_text: string | null
  gk_rating: DailyRating | null
  dex_rating: DailyRating | null
  hom_rating: DailyRating | null
  coming_back_next_day: boolean | null
  homework_completed: boolean
  attendance: boolean
  late: boolean
}

/** Input shape for a single drill/test time recording when creating or updating a report. */
interface DrillTimeInput {
  enrollment_id: string
  drill_id: string
  time_seconds: number | null
  score: number | null
}

/** The full request body sent to POST /classes/:id/reports and PUT /classes/:id/reports/:id. */
export interface ReportBody {
  report_date: string
  group_label?: string | null
  game?: string | null
  session_label?: string | null
  class_start_time?: string | null
  class_end_time?: string | null
  mg_confirmed?: number | null
  mg_attended?: number | null
  current_trainees?: number | null
  licenses_received?: number | null
  override_hours_to_date?: number | null
  override_paid_hours_total?: number | null
  override_live_hours_total?: number | null
  coordinator_notes?: string | null
  trainer_ids: string[]
  timeline: TimelineItemInput[]
  progress: ProgressRowInput[]
  drill_times: DrillTimeInput[]
}

// ─── Report list (paginated) types ──────────────────────────────────────────

/** The expanded class fields returned by the paginated GET /reports endpoint. */
export type ReportRowClass = {
  id: string
  name: string
  site: string
  province: Province
  game_type: string | null
  archived: boolean
}

/** A single row from the paginated reports list. */
export type ReportRow = ClassDailyReport & { classes: ReportRowClass }

/** Query params accepted by api.reports.listAll(). */
export interface ReportListParams {
  province?: Province | ''
  site?: string
  class_id?: string
  archived?: boolean
  game_type?: string
  date_from?: string
  date_to?: string
  search?: string
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
  page?: number
  limit?: number
}

/** Paginated response envelope from GET /reports. */
export interface PaginatedReports {
  data: ReportRow[]
  total: number
  page: number
  limit: number
}

// ─── Schedule list (paginated) types ────────────────────────────────────────

/** The expanded class fields returned by the paginated GET /schedule endpoint. */
export type ScheduleRowClass = {
  id: string
  name: string
  site: string
  province: Province
  game_type: string | null
  archived: boolean
}

/** Trainer info joined on a schedule slot's trainer_id FK. */
export type ScheduleRowTrainer = {
  id: string
  trainer_name: string
  role: string
} | null

/** A single row from the paginated schedule list. */
export type ScheduleRow = ClassScheduleSlot & { classes: ScheduleRowClass; class_trainers: ScheduleRowTrainer }

/** Query params accepted by api.schedule.listAll(). */
export interface ScheduleListParams {
  province?: Province | ''
  site?: string
  class_id?: string
  archived?: boolean
  game_type?: string
  date_from?: string
  date_to?: string
  group_label?: string
  search?: string
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
  page?: number
  limit?: number
}

/** Paginated response envelope from GET /schedule. */
export interface PaginatedSchedule {
  data: ScheduleRow[]
  total: number
  page: number
  limit: number
}

export interface FeedbackSubmissionBody {
  category: 'bug' | 'feature' | 'general'
  message: string
  page?: string
}

// ─── Payroll types ─────────────────────────────────────────────────────────

/** Query params accepted by api.payroll.trainers() and api.payroll.students(). */
export interface PayrollListParams {
  date_from?: string
  date_to?: string
  province?: Province | ''
  site?: string
  class_id?: string
  page?: number
  limit?: number
}

/** Paginated response envelope from GET /payroll/trainers and /payroll/students. */
export interface PaginatedPayroll {
  data: PayrollRow[]
  total: number
  page: number
  limit: number
}

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE'

export interface AuditEntry {
  id: number
  userId: string
  userEmail: string | null
  action: AuditAction
  tableName: string
  recordId: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
}

export interface AuditResponse {
  entries: AuditEntry[]
  nextCursor: string | null
}

function payrollQs(params?: PayrollListParams): string {
  if (!params) return ''
  const entries: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') entries[k] = String(v)
  }
  return new URLSearchParams(entries).toString()
}

export interface SearchResults {
  classes: Array<{
    type: 'class'
    id: string
    name: string
    site: string
    province: Province
    gameType: string | null
    startDate: string
    endDate: string
    archived: boolean
    score: number
  }>
  students: Array<{
    type: 'student'
    id: string
    name: string
    email: string
    classId: string
    className: string
    groupLabel: string | null
    score: number
  }>
  trainers: Array<{
    type: 'trainer'
    id: string
    name: string
    email: string
    classId: string
    className: string
    score: number
  }>
  reports: Array<{
    type: 'report'
    id: string
    classId: string
    className: string
    reportDate: string
    groupLabel: string | null
    game: string | null
    sessionLabel: string | null
    classStartTime: string | null
    classEndTime: string | null
    score: number
  }>
}

export interface LegacyStudentClaimRow {
  id: string
  class_id: string
  class_name: string
  student_name: string
  student_email: string
  status: EnrollmentStatus
  group_label: string | null
  created_at: string
  claimed: boolean
  duplicate_count: number
  matched_profiles: Array<{ id: string; email: string; full_name: string }>
}

export interface LegacyStudentMergeResponse {
  updated: number
  removed_duplicates: number
  skipped: string[]
}

export type FeedbackStatus = 'new' | 'reviewing' | 'resolved' | 'archived'
export type FeedbackCategory = 'bug' | 'feature' | 'general'

export interface FeedbackInboxItem {
  id: string
  user_id: string
  user_email: string
  user_role: string | null
  category: FeedbackCategory
  message: string
  page: string | null
  user_agent: string | null
  status: FeedbackStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at?: string | null
}

export interface FeedbackListParams {
  status?: FeedbackStatus | ''
  category?: FeedbackCategory | ''
  search?: string
  page?: number
  limit?: number
}

export interface LegacyImportBatch {
  id: string
  import_id: string
  class_id: string
  file_name: string | null
  status: 'active' | 'rolled_back' | 'partial_rollback'
  report_count: number
  payroll_count: number
  enrollment_count: number
  progress_unmatched: number
  created_report_ids: string[]
  created_hour_ids: string[]
  created_enrollment_ids: string[]
  skipped_reports: number
  skipped_payroll: number
  excluded_sheets: Array<{ sheetName: string; reason: string }>
  warnings: string[]
  summary: Record<string, unknown>
  created_by: string
  rolled_back_by: string | null
  rolled_back_at: string | null
  created_at: string
  updated_at: string
}

export interface LegacyImportBatchBody {
  import_id: string
  file_name?: string | null
  report_count: number
  payroll_count: number
  enrollment_count: number
  progress_unmatched: number
  created_report_ids: string[]
  created_hour_ids: string[]
  created_enrollment_ids: string[]
  skipped_reports: number
  skipped_payroll: number
  excluded_sheets: Array<{ sheetName: string; reason: string }>
  warnings: string[]
  summary?: Record<string, unknown>
}

export interface LegacyImportReviewBody {
  reports: Array<{
    sheet_name: string
    report_date: string
    group_label?: string | null
    session_label?: string | null
    student_names: string[]
    progress_student_names: string[]
  }>
  payroll_rows: Array<{
    client_key: string
    log_date: string
    trainer_id: string
    hours: number
    paid: boolean
    live_training: boolean
    notes?: string | null
  }>
}

export interface LegacyImportReviewResult {
  reports: Array<{ sheet_name: string; key: string; duplicate_report_id: string | null; status: 'new' | 'duplicate' }>
  payroll_rows: Array<{ client_key: string; duplicate_hour_id: string | null; status: 'new' | 'duplicate' }>
  students: {
    total: number
    existing: Array<{ name: string; enrollment_id: string; existing_name: string; status: 'existing' }>
    missing: Array<{ name: string; enrollment_id: null; existing_name: null; status: 'missing' }>
  }
  summary: {
    duplicate_reports: number
    duplicate_payroll_rows: number
    missing_students: number
  }
}

export interface SystemHealthResponse {
  generated_at: string
  overall: 'ok' | 'warning' | 'error'
  checks: Array<{
    name: string
    status: 'ok' | 'warning' | 'error'
    message: string
    latency_ms?: number
  }>
}

function paramsQs(params?: object): string {
  if (!params) return ''
  const entries: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') entries[k] = String(v)
  }
  return new URLSearchParams(entries).toString()
}

// ─── API client ─────────────────────────────────────────────────────────────

/**
 * The `api` object is the public interface for all backend communication.
 * Each top-level key groups CRUD methods for one resource type.
 *
 * All methods return Promises and throw on HTTP errors so callers can use
 * try/catch or .catch() for error handling.
 */
export const api = {
  cache: {
    clear: clearApiCache,
    peek: peekApiCache,
  },

  classes: {
    /** Fetch all classes. Pass `{ archived: false }` (default) or `{ archived: true }`. */
    list: (params?: { archived?: boolean }) => {
      const qs = params?.archived !== undefined ? `?archived=${params.archived}` : ''
      return req<Class[]>(`/classes${qs}`)
    },
    /** Look up a class by its display name (used for URL-slug-based navigation). */
    getByName: (name: string) =>
      req<Class>(`/classes/by-name/${encodeURIComponent(name)}`),
    get: (id: string) => req<Class>(`/classes/${id}`),
    create: (body: {
      name: string
      site: string
      province: Province
      game_type?: string | null
      start_date: string
      end_date: string
      description?: string | null
    }) => req<Class>('/classes', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Class>) =>
      req<Class>(`/classes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    archive: (id: string) =>
      req<Class>(`/classes/${id}`, { method: 'PUT', body: JSON.stringify({ archived: true }) }),
    unarchive: (id: string) =>
      req<Class>(`/classes/${id}`, { method: 'PUT', body: JSON.stringify({ archived: false }) }),
    delete: (id: string) => req<void>(`/classes/${id}`, { method: 'DELETE' }),
    batch: (ids: string[], action: 'archive' | 'delete') =>
      req<{ affected: number }>('/classes/batch', { method: 'PATCH', body: JSON.stringify({ ids, action }) }),
  },

  classDocuments: {
    list: (classId: string) => req<ClassDocument[]>(`/classes/${classId}/documents`),
    upload: (classId: string, file: File, description?: string) =>
      uploadReq<ClassDocument>(`/classes/${classId}/documents`, file, description),
    downloadUrl: (classId: string, documentId: string) =>
      req<{ url: string }>(`/classes/${classId}/documents/${documentId}/download`),
    delete: (classId: string, documentId: string) =>
      req<void>(`/classes/${classId}/documents/${documentId}`, { method: 'DELETE' }),
  },

  drills: {
    list: (classId: string) => req<ClassDrill[]>(`/classes/${classId}/drills`),
    create: (
      classId: string,
      body: {
        name: string
        type: DrillType
        par_time_seconds?: number | null
        target_score?: number | null
      },
    ) =>
      req<ClassDrill>(`/classes/${classId}/drills`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (classId: string, id: string, body: Partial<ClassDrill>) =>
      req<ClassDrill>(`/classes/${classId}/drills/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (classId: string, id: string) => req<void>(`/classes/${classId}/drills/${id}`, { method: 'DELETE' }),
  },

  trainers: {
    list: (classId: string) => req<ClassTrainer[]>(`/classes/${classId}/trainers`),
    create: (
      classId: string,
      body: { trainer_name: string; trainer_email: string; role: TrainerRole },
    ) =>
      req<ClassTrainer>(`/classes/${classId}/trainers`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (classId: string, id: string, body: Partial<ClassTrainer>) =>
      req<ClassTrainer>(`/classes/${classId}/trainers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (classId: string, id: string) => req<void>(`/classes/${classId}/trainers/${id}`, { method: 'DELETE' }),
  },

  enrollments: {
    list: (classId: string, status?: EnrollmentStatus) =>
      req<ClassEnrollment[]>(
        `/classes/${classId}/enrollments${status ? `?status=${status}` : ''}`,
      ),
    create: (
      classId: string,
      body: {
        student_name: string
        student_email: string
        status: EnrollmentStatus
        group_label?: string | null
      },
    ) =>
      req<ClassEnrollment>(`/classes/${classId}/enrollments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (classId: string, id: string, body: { status: EnrollmentStatus; group_label?: string | null }) =>
      req<ClassEnrollment>(`/classes/${classId}/enrollments/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (classId: string, id: string) => req<void>(`/classes/${classId}/enrollments/${id}`, { method: 'DELETE' }),
    createBatch: (classId: string, body: { students: { email: string; group_label?: string }[] }) =>
      req<{ inserted: number; skipped: number; not_found: string[] }>(`/classes/${classId}/enrollments/batch`, { method: 'POST', body: JSON.stringify(body) }),
  },

  schedule: {
    listAll: (params?: ScheduleListParams) => {
      const entries: Record<string, string> = {}
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== '') entries[k] = String(v)
        }
      }
      const qs = new URLSearchParams(entries).toString()
      return req<PaginatedSchedule>(`/schedule${qs ? `?${qs}` : ''}`)
    },
    list: (classId: string) => req<ClassScheduleSlot[]>(`/classes/${classId}/schedule`),
    create: (
      classId: string,
      body: {
        slot_date: string
        start_time: string
        end_time: string
        notes?: string | null
        trainer_id?: string | null
        group_label?: string | null
      },
    ) =>
      req<ClassScheduleSlot>(`/classes/${classId}/schedule`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (classId: string, id: string, body: Partial<ClassScheduleSlot>) =>
      req<ClassScheduleSlot>(`/classes/${classId}/schedule/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (classId: string, id: string) => req<void>(`/classes/${classId}/schedule/${id}`, { method: 'DELETE' }),
    createBatch: (classId: string, body: { days_of_week: number[]; start_time: string; end_time: string; trainer_id?: string; group_label?: string; date_from: string; date_to: string }) =>
      req<{ inserted: number }>(`/classes/${classId}/schedule/batch`, { method: 'POST', body: JSON.stringify(body) }),
  },

  reports: {
    listAll: (params?: ReportListParams) => {
      const entries: Record<string, string> = {}
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== '') entries[k] = String(v)
        }
      }
      const qs = new URLSearchParams(entries).toString()
      return req<PaginatedReports>(`/reports${qs ? `?${qs}` : ''}`)
    },
    list: (classId: string) => req<ClassDailyReport[]>(`/classes/${classId}/reports`),
    get: (id: string) => req<ReportWithNested>(`/reports/${id}`),
    create: (classId: string, body: ReportBody) =>
      req<ClassDailyReport>(`/classes/${classId}/reports`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (classId: string, id: string, body: ReportBody) =>
      req<ClassDailyReport>(`/classes/${classId}/reports/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (classId: string, id: string) => req<void>(`/classes/${classId}/reports/${id}`, { method: 'DELETE' }),
  },

  hours: {
    list: (classId: string) => req<ClassLoggedHours[]>(`/classes/${classId}/hours`),
    create: (
      classId: string,
      body: {
        log_date: string
        person_type: LoggedHoursPersonType
        trainer_id?: string | null
        enrollment_id?: string | null
        hours: number
        paid?: boolean
        live_training?: boolean
        notes?: string | null
      },
    ) =>
      req<ClassLoggedHours>(`/classes/${classId}/hours`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (classId: string, id: string, body: Partial<ClassLoggedHours>) =>
      req<ClassLoggedHours>(`/classes/${classId}/hours/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (classId: string, id: string) => req<void>(`/classes/${classId}/hours/${id}`, { method: 'DELETE' }),
  },

  feedback: {
    list: (params?: FeedbackListParams) => {
      const qs = paramsQs(params)
      return req<{ data: FeedbackInboxItem[]; total: number; page: number; limit: number }>(`/feedback${qs ? `?${qs}` : ''}`)
    },
    updateStatus: (id: string, status: FeedbackStatus) =>
      req<FeedbackInboxItem>(`/feedback/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  },

  legacyImports: {
    review: (classId: string, body: LegacyImportReviewBody) =>
      req<LegacyImportReviewResult>(`/classes/${classId}/import-review`, { method: 'POST', body: JSON.stringify(body) }),
    list: (classId: string, params?: { page?: number; limit?: number }) => {
      const qs = paramsQs(params)
      return req<{ data: LegacyImportBatch[]; total: number; page: number; limit: number }>(`/classes/${classId}/import-batches${qs ? `?${qs}` : ''}`)
    },
    record: (classId: string, body: LegacyImportBatchBody) =>
      req<LegacyImportBatch>(`/classes/${classId}/import-batches`, { method: 'POST', body: JSON.stringify(body) }),
    rollback: (classId: string, batchId: string) =>
      req<{ batch: LegacyImportBatch; deleted_reports: number; deleted_hours: number; deleted_enrollments: number }>(`/classes/${classId}/import-batches/${batchId}/rollback`, { method: 'POST' }),
  },

  systemHealth: {
    get: () => req<SystemHealthResponse>('/system-health'),
  },

  studentProgress: {
    get: (email: string) =>
      req<StudentProgressResponse>(`/students/progress?email=${encodeURIComponent(email)}`),
  },

  payroll: {
    trainers: (params?: PayrollListParams) => {
      const qs = payrollQs(params)
      return req<PaginatedPayroll>(`/payroll/trainers${qs ? `?${qs}` : ''}`)
    },
    students: (params?: PayrollListParams) => {
      const qs = payrollQs(params)
      return req<PaginatedPayroll>(`/payroll/students${qs ? `?${qs}` : ''}`)
    },
    trainersCsv: async (params?: PayrollListParams) => {
      const qs = payrollQs(params)
      const headers = await authHeaders()
      const res = await fetch(`${API_BASE}/api/payroll/trainers/csv${qs ? `?${qs}` : ''}`, { headers })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]) ?? 'trainer-payroll.csv'
      a.click()
      URL.revokeObjectURL(url)
    },
    studentsCsv: async (params?: PayrollListParams) => {
      const qs = payrollQs(params)
      const headers = await authHeaders()
      const res = await fetch(`${API_BASE}/api/payroll/students/csv${qs ? `?${qs}` : ''}`, { headers })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]) ?? 'student-payroll.csv'
      a.click()
      URL.revokeObjectURL(url)
    },
  },

  profiles: {
    /**
     * Search user profiles by role and/or name/email substring.
     * Used by the trainer and student assignment modals to find existing users.
     * Filters out undefined/empty values before building the query string.
     */
    search: (params: { role?: string; search?: string }) => {
      const qs = new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
        ) as Record<string, string>,
      ).toString()
      return req<Pick<Profile, 'id' | 'full_name' | 'email'>[]>(`/profiles${qs ? `?${qs}` : ''}`)
    },
    /** Paginated profile search. Returns { data, total, page, limit }. */
    searchPaginated: (params: { role?: string; search?: string; page?: number; limit?: number }) => {
      const entries: Record<string, string> = { page: String(params.page ?? 0), limit: String(params.limit ?? 25) }
      if (params.role) entries.role = params.role
      if (params.search) entries.search = params.search
      const qs = new URLSearchParams(entries).toString()
      return req<{ data: Pick<Profile, 'id' | 'full_name' | 'email'>[]; total: number; page: number; limit: number }>(`/profiles?${qs}`)
    },
    /** Fetch the currently authenticated user's full profile record. */
    me: () => req<Profile>('/profiles/me'),
    /** Update the currently authenticated user's profile. */
    update: (body: { full_name?: string; first_name?: string; last_name?: string; phone?: string; province?: string }) =>
      req<Profile>('/profiles/me', { method: 'PUT', body: JSON.stringify(body) }),
    /** Select a role during post-signup flow (also collects profile data). */
    selectRole: (body: { selected_role: 'trainee' | 'trainer' | 'coordinator'; first_name: string; last_name: string; phone?: string }) =>
      req<{ status: 'active' | 'pending' }>('/profiles/me/role-selection', { method: 'PUT', body: JSON.stringify(body) }),
    /** Create placeholder trainee profiles for legacy-imported student names. Coordinator only. */
    createLegacyStudents: (body: { students: string[] }) =>
      req<{ data: Array<{ full_name: string; email: string; created: boolean }> }>('/profiles/legacy-students', { method: 'POST', body: JSON.stringify(body) }),
    /** Review unclaimed legacy student enrollment rows. Coordinator only. */
    legacyUnclaimedStudents: () =>
      req<{ data: LegacyStudentClaimRow[] }>('/profiles/legacy-students/unclaimed'),
    /** Merge selected legacy enrollments into a real trainee profile. Coordinator only. */
    mergeLegacyStudents: (body: { enrollment_ids: string[]; target_email: string; target_name?: string }) =>
      req<LegacyStudentMergeResponse>('/profiles/legacy-students/merge', { method: 'POST', body: JSON.stringify(body) }),
  },

  selfService: {
    trainerDashboard: () => req<TrainerDashboardResponse>('/me/trainer-dashboard'),
    trainerToday: (date?: string) =>
      req<TrainerTodayResponse>(`/me/today${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    traineeDashboard: () => req<TraineeDashboardResponse>('/me/trainee-progress'),
    submitFeedback: (body: FeedbackSubmissionBody) =>
      req<{ id: string; created_at: string }>('/me/feedback', { method: 'POST', body: JSON.stringify(body) }),

    // Trainer class management
    myClasses: () => req<TrainerMyClassesResponse>('/me/my-classes'),
    classDetail: (classId: string) => req<TrainerClassDetailResponse>(`/me/my-classes/${classId}`),

    // Class-scoped reads
    classReports: (classId: string) => req<ClassDailyReport[]>(`/me/my-classes/${classId}/reports`),
    classReportDetail: (classId: string, reportId: string) =>
      req<ReportWithNested>(`/me/my-classes/${classId}/reports/${reportId}`),
    classSchedule: (classId: string) => req<ClassScheduleSlot[]>(`/me/my-classes/${classId}/schedule`),
    classHours: (classId: string) => req<TrainerClassHoursResponse>(`/me/my-classes/${classId}/hours`),
    classDocuments: (classId: string) => req<ClassDocument[]>(`/me/my-classes/${classId}/documents`),
    uploadClassDocument: (classId: string, file: File, description?: string) =>
      uploadReq<ClassDocument>(`/me/my-classes/${classId}/documents`, file, description),
    classDocumentDownloadUrl: (classId: string, documentId: string) =>
      req<{ url: string }>(`/me/my-classes/${classId}/documents/${documentId}/download`),
    deleteClassDocument: (classId: string, documentId: string) =>
      req<void>(`/me/my-classes/${classId}/documents/${documentId}`, { method: 'DELETE' }),
    studentProgress: (classId: string, enrollmentId: string) =>
      req<TrainerStudentProgressResponse>(`/me/my-classes/${classId}/students/${enrollmentId}/progress`),

    // Class-scoped writes — reports
    createReport: (classId: string, body: ReportBody) =>
      req<ClassDailyReport>(`/me/my-classes/${classId}/reports`, { method: 'POST', body: JSON.stringify(body) }),
    updateReport: (classId: string, reportId: string, body: ReportBody) =>
      req<ClassDailyReport>(`/me/my-classes/${classId}/reports/${reportId}`, { method: 'PUT', body: JSON.stringify(body) }),

    // Class-scoped writes — hours
    createHours: (classId: string, body: {
      log_date: string; person_type: LoggedHoursPersonType;
      enrollment_id?: string | null; hours: number;
      paid?: boolean; live_training?: boolean; notes?: string | null;
    }) => req<ClassLoggedHours>(`/me/my-classes/${classId}/hours`, { method: 'POST', body: JSON.stringify(body) }),
    createHoursBulk: (classId: string, body: {
      log_date: string;
      entries: Array<{ enrollment_id: string; hours: number; notes?: string }>;
      paid?: boolean; live_training?: boolean;
    }) => req<{ inserted: number }>(`/me/my-classes/${classId}/hours/bulk`, { method: 'POST', body: JSON.stringify(body) }),
    updateHours: (classId: string, hourId: string, body: Partial<ClassLoggedHours>) =>
      req<ClassLoggedHours>(`/me/my-classes/${classId}/hours/${hourId}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteHours: (classId: string, hourId: string) =>
      req<void>(`/me/my-classes/${classId}/hours/${hourId}`, { method: 'DELETE' }),

    // Class-scoped writes — drills
    createDrill: (classId: string, body: { name: string; type: DrillType; par_time_seconds?: number | null; target_score?: number | null }) =>
      req<ClassDrill>(`/me/my-classes/${classId}/drills`, { method: 'POST', body: JSON.stringify(body) }),
    updateDrill: (classId: string, drillId: string, body: Partial<ClassDrill>) =>
      req<ClassDrill>(`/me/my-classes/${classId}/drills/${drillId}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteDrill: (classId: string, drillId: string) =>
      req<{ deactivated: true; drill: ClassDrill } | void>(`/me/my-classes/${classId}/drills/${drillId}`, { method: 'DELETE' }),

    // Class-scoped writes — schedule slots
    createScheduleSlot: (classId: string, body: { slot_date: string; start_time: string; end_time: string; notes?: string | null; group_label?: string | null }) =>
      req<ClassScheduleSlot>(`/me/my-classes/${classId}/schedule`, { method: 'POST', body: JSON.stringify(body) }),
    updateScheduleSlot: (classId: string, slotId: string, body: { slot_date: string; start_time: string; end_time: string; notes?: string | null; group_label?: string | null }) =>
      req<ClassScheduleSlot>(`/me/my-classes/${classId}/schedule/${slotId}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteScheduleSlot: (classId: string, slotId: string) =>
      req<void>(`/me/my-classes/${classId}/schedule/${slotId}`, { method: 'DELETE' }),

    // Class-scoped writes — enrollments (trainer manual fail/unfail)
    updateEnrollmentStatus: (classId: string, enrollmentId: string, body: { status: 'enrolled' | 'failed' }) =>
      req<ClassEnrollment>(`/me/my-classes/${classId}/enrollments/${enrollmentId}`, { method: 'PATCH', body: JSON.stringify(body) }),

    // Cross-class reads
    allReports: (params?: { class_id?: string; date_from?: string; date_to?: string; status?: string; page?: number; limit?: number }) => {
      const entries: Record<string, string> = {}
      if (params) { for (const [k, v] of Object.entries(params)) { if (v !== undefined && v !== '') entries[k] = String(v) } }
      const qs = new URLSearchParams(entries).toString()
      return req<PaginatedReports>(`/me/reports${qs ? `?${qs}` : ''}`)
    },
    allSchedule: (params?: { class_id?: string; date_from?: string; date_to?: string; group_label?: string; page?: number; limit?: number }) => {
      const entries: Record<string, string> = {}
      if (params) { for (const [k, v] of Object.entries(params)) { if (v !== undefined && v !== '') entries[k] = String(v) } }
      const qs = new URLSearchParams(entries).toString()
      return req<PaginatedSchedule>(`/me/schedule${qs ? `?${qs}` : ''}`)
    },
    allHours: (params?: { class_id?: string; date_from?: string; date_to?: string; page?: number; limit?: number }) => {
      const entries: Record<string, string> = {}
      if (params) { for (const [k, v] of Object.entries(params)) { if (v !== undefined && v !== '') entries[k] = String(v) } }
      const qs = new URLSearchParams(entries).toString()
      return req<TrainerMyHoursResponse>(`/me/hours${qs ? `?${qs}` : ''}`)
    },

    // Role request status (any authenticated user)
    myRoleRequest: () => req<RoleRequest | null>('/me/role-request'),

    // Student self-service
    studentClassDetail: (classId: string) => req<StudentClassDetailResponse>(`/me/my-class/${classId}`),
    studentClassReports: (classId: string) => req<StudentReportView[]>(`/me/my-class/${classId}/reports`),
    studentClassDocuments: (classId: string) => req<ClassDocument[]>(`/me/my-class/${classId}/documents`),
    studentClassDocumentDownloadUrl: (classId: string, documentId: string) =>
      req<{ url: string }>(`/me/my-class/${classId}/documents/${documentId}/download`),
    signInAttendance: (classId: string, reportId: string) =>
      req<{ signed_in: true; late: boolean }>(`/me/my-class/${classId}/reports/${reportId}/sign-in`, { method: 'POST' }),
    updateMyProgress: (classId: string, reportId: string, body: {
      gk_rating?: DailyRating | null; dex_rating?: DailyRating | null; hom_rating?: DailyRating | null;
      drill_times?: Array<{ drill_id: string; time_seconds?: number | null; score?: number | null }>;
    }) => req<{ progress: unknown; drill_times: unknown }>(`/me/my-class/${classId}/reports/${reportId}/my-progress`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
  },

  search: {
    query: (q: string) => req<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
  },

  roleRequests: {
    list: (params?: { status?: string; page?: number; limit?: number }) => {
      const entries: Record<string, string> = {}
      if (params) { for (const [k, v] of Object.entries(params)) { if (v !== undefined && v !== '') entries[k] = String(v) } }
      const qs = new URLSearchParams(entries).toString()
      return req<{ data: RoleRequest[]; total: number; page: number; limit: number }>(`/role-requests${qs ? `?${qs}` : ''}`)
    },
    approve: (id: string) => req<{ id: string; status: string; requested_role: string }>(`/role-requests/${id}/approve`, { method: 'PUT' }),
    reject: (id: string) => req<{ id: string; status: string; requested_role: string }>(`/role-requests/${id}/reject`, { method: 'PUT' }),
  },

  audit: {
    search: (params?: {
      userId?: string
      tableName?: string
      action?: AuditAction | ''
      from?: string
      to?: string
      cursor?: string | null
      limit?: number
    }) => {
      const entries: Record<string, string> = {}
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null && value !== '') entries[key] = String(value)
        }
      }
      const qs = new URLSearchParams(entries).toString()
      return req<AuditResponse>(`/audit${qs ? `?${qs}` : ''}`)
    },
    record: (tableName: string, recordId: string, cursor?: string | null, limit = 50) => {
      const qs = new URLSearchParams({ limit: String(limit) })
      if (cursor) qs.set('cursor', cursor)
      return req<AuditResponse>(`/audit/record/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}?${qs}`)
    },
  },

  dashboard: {
    hoursSummary: () => req<{ total_hours: number; trainer_count: number }>('/dashboard/hours-summary'),
    enrollmentSummary: () => req<{ enrolled: number; failed: number; dropped: number }>('/dashboard/enrollment-summary'),
    attendanceRate: () => req<{ rate: number | null }>('/dashboard/attendance-rate'),
    unreportedSessions: () => req<{ classes: { class_id: string; class_name: string; session_date: string }[] }>('/dashboard/unreported-sessions'),
    activity: (limit = 10) => req<{ items: { type: string; description: string; timestamp: string; link_to: string }[] }>(`/dashboard/activity?limit=${limit}`),
    classAttendanceRates: () => req<{ rates: Record<string, number> }>('/dashboard/class-attendance-rates'),
  },
}
