/**
 * server/src/routes/selfService.ts — Self-service endpoints for trainers and trainees
 *
 * These routes are mounted BEFORE requireCoordinator so trainers and trainees
 * can access their own data. They identify the caller by req.userEmail (set by
 * requireAuth from the JWT), not by a coordinator-supplied ID.
 *
 * Routes:
 *   GET /me/my-classes         — Classes this trainer is assigned to, with richer metadata
 *   GET /me/trainer-dashboard  — Backwards-compat alias for /me/my-classes
 *   GET /me/today              — Today's trainer schedule/report work queue
 *   GET /me/trainee-progress   — Progress and drill times for this trainee across all classes
 *   GET /me/role-request       — Current user's most recent role request (if any)
 *   POST /me/feedback          — Submit product feedback from Settings
 *   GET /me/my-class/:classId  — Student class detail (metadata, drills, schedule)
 *   GET /me/my-class/:classId/reports — Daily reports with student's own progress/drill data
 *   POST /me/my-class/:classId/reports/:reportId/sign-in — Student attendance sign-in
 *   PATCH /me/my-class/:classId/reports/:reportId/my-progress — Student self-input (grades + drill times)
 */

import express, { Router, type Request, type Response, type NextFunction } from 'express'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { manualStudentEmail, normalizeStudentEmail, normalizeStudentName } from '../lib/manualStudents'
import { autoFailNotComingBack } from '../lib/autoFail'
import { writeLimiter } from '../middleware/rateLimiter'
import {
  CLASS_DOCUMENT_MAX_BYTES,
  createClassDocument,
  deleteClassDocument,
  findClassDocument,
  listClassDocuments,
  normalizeContentType,
  safeDescription,
  safeUploadFileName,
  signedDocumentUrl,
  validateUploadRequest,
} from '../lib/classDocuments'
import {
  drillBodySchema,
  drillUpdateBodySchema,
  enrollmentBodySchema,
  enrollmentUpdateBodySchema,
  feedbackBodySchema,
  hoursBodySchema,
  hoursBulkBodySchema,
  dateSchema,
  reportBodySchema,
  scheduleBodySchema,
  studentMyProgressBodySchema,
  validateBody,
} from '../lib/validation'

export const selfServiceRouter = Router()

const rawDocumentUpload = express.raw({
  type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  limit: CLASS_DOCUMENT_MAX_BYTES,
})

/**
 * Validates that the given email belongs to a trainer assigned to the given class.
 * Returns the class_trainers row on success.
 * Throws a 403-style error if the trainer is not assigned.
 */
async function validateTrainerAccess(email: string, classId: string) {
  const { data, error } = await supabase
    .from('class_trainers')
    .select('id, class_id, trainer_name, trainer_email, role')
    .eq('trainer_email', email)
    .eq('class_id', classId)
    .single()
  if (error || !data) {
    const err = new Error('You are not assigned to this class') as Error & { status: number }
    err.status = 403
    throw err
  }
  return data as { id: string; class_id: string; trainer_name: string; trainer_email: string; role: string }
}

/**
 * GET /me/my-classes
 * Auth: any authenticated user (trainers use this)
 *
 * Returns all classes the trainer is assigned to with metadata, enrollment counts,
 * upcoming schedule slots, draft report count, and recent hours.
 */
const myClassesHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const email = req.userEmail
    if (!email) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }

    const { data: trainerRows, error: trainerError } = await supabase
      .from('class_trainers')
      .select('id, class_id, trainer_name, role')
      .eq('trainer_email', email)
    if (trainerError) throw trainerError
    if (!trainerRows || trainerRows.length === 0) {
      res.json({ trainer_name: null, trainer_email: email, classes: [] })
      return
    }

    const classIds = [...new Set(trainerRows.map((t: { class_id: string }) => t.class_id))]
    const trainerIds = trainerRows.map((t: { id: string }) => t.id)
    const today = new Date().toISOString().slice(0, 10)

    const [classesResult, enrollCountResult, scheduleResult, hoursResult] = await Promise.all([
      supabase
        .from('classes')
        .select('id, name, site, province, game_type, start_date, end_date, archived')
        .in('id', classIds),
      supabase
        .from('class_enrollments')
        .select('class_id')
        .in('class_id', classIds)
        .eq('status', 'enrolled'),
      supabase
        .from('class_schedule_slots')
        .select('id, class_id, slot_date, start_time, end_time, group_label, notes')
        .in('class_id', classIds)
        .gte('slot_date', today)
        .order('slot_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(50),
      supabase
        .from('class_logged_hours')
        .select('class_id, hours')
        .in('class_id', classIds)
        .eq('person_type', 'trainer')
        .in('trainer_id', trainerIds),
    ])

    if (classesResult.error) throw classesResult.error
    if (enrollCountResult.error) throw enrollCountResult.error
    if (scheduleResult.error) throw scheduleResult.error
    if (hoursResult.error) throw hoursResult.error

    const enrollCountMap = new Map<string, number>()
    for (const row of enrollCountResult.data ?? []) {
      const r = row as { class_id: string }
      enrollCountMap.set(r.class_id, (enrollCountMap.get(r.class_id) ?? 0) + 1)
    }

    const slotsMap = new Map<string, typeof scheduleResult.data>()
    for (const slot of scheduleResult.data ?? []) {
      const s = slot as { class_id: string }
      const existing = slotsMap.get(s.class_id) ?? []
      if (existing.length < 3) slotsMap.set(s.class_id, [...existing, slot])
    }

    const hoursMap = new Map<string, number>()
    for (const row of hoursResult.data ?? []) {
      const r = row as { class_id: string; hours: number }
      hoursMap.set(r.class_id, (hoursMap.get(r.class_id) ?? 0) + (r.hours ?? 0))
    }

    const classMap = new Map<string, (typeof classesResult.data)[0]>()
    for (const c of classesResult.data ?? []) classMap.set(c.id, c)

    const classes = trainerRows.map((t: { id: string; class_id: string; trainer_name: string; role: string }) => {
      const cls = classMap.get(t.class_id)
      return {
        class_id: t.class_id,
        trainer_id: t.id,
        class_name: cls?.name ?? 'Unknown',
        site: cls?.site ?? '',
        province: cls?.province ?? '',
        game_type: cls?.game_type ?? null,
        start_date: cls?.start_date ?? null,
        end_date: cls?.end_date ?? null,
        archived: cls?.archived ?? false,
        trainer_role: t.role,
        enrolled_count: enrollCountMap.get(t.class_id) ?? 0,
        total_hours: hoursMap.get(t.class_id) ?? 0,
        upcoming_slots: slotsMap.get(t.class_id) ?? [],
      }
    })

    res.json({
      trainer_name: trainerRows[0].trainer_name,
      trainer_email: email,
      classes,
    })
  } catch (err) {
    next(err)
  }
}

selfServiceRouter.get('/me/my-classes', myClassesHandler)

// Backwards compatibility alias
selfServiceRouter.get('/me/trainer-dashboard', myClassesHandler)

type TrainerTodayReport = {
  id: string
  class_id: string
  report_date: string
  group_label: string | null
  session_label: string | null
  game: string | null
  created_at: string
}

function groupKey(value: string | null | undefined): string {
  return value?.trim() || ''
}

function reportSummary(report: TrainerTodayReport) {
  return {
    id: report.id,
    report_date: report.report_date,
    group_label: report.group_label,
    session_label: report.session_label,
    game: report.game,
    created_at: report.created_at,
  }
}

/**
 * GET /me/today
 * Auth: any authenticated trainer
 *
 * Returns today's schedule slots in classes assigned to the trainer, plus
 * report state and the most recent prior report for quick copy-as-draft.
 */
selfServiceRouter.get('/me/today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = req.userEmail
    if (!email) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }

    const requestedDate = typeof req.query.date === 'string'
      ? req.query.date
      : new Date().toISOString().slice(0, 10)
    const parsedDate = dateSchema.safeParse(requestedDate)
    if (!parsedDate.success) {
      res.status(400).json({ error: 'Invalid date. Expected YYYY-MM-DD.' })
      return
    }
    const targetDate = parsedDate.data

    const { data: trainerRows, error: trainerError } = await supabase
      .from('class_trainers')
      .select('id, class_id')
      .eq('trainer_email', email)
    if (trainerError) throw trainerError
    if (!trainerRows || trainerRows.length === 0) {
      res.json({ date: targetDate, generated_at: new Date().toISOString(), slots: [] })
      return
    }

    const trainerIds = trainerRows.map((row: { id: string }) => row.id)
    const classIds = [...new Set(trainerRows.map((row: { class_id: string }) => row.class_id))]

    const [classesResult, scheduleResult, reportsResult] = await Promise.all([
      supabase
        .from('classes')
        .select('id, name, site, province, game_type, archived')
        .in('id', classIds),
      supabase
        .from('class_schedule_slots')
        .select('id, class_id, slot_date, start_time, end_time, group_label, notes, trainer_id, trainer_ids')
        .in('class_id', classIds)
        .eq('slot_date', targetDate)
        .order('start_time', { ascending: true }),
      supabase
        .from('class_daily_reports')
        .select('id, class_id, report_date, group_label, session_label, game, created_at')
        .in('class_id', classIds)
        .lte('report_date', targetDate)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    if (classesResult.error) throw classesResult.error
    if (scheduleResult.error) throw scheduleResult.error
    if (reportsResult.error) throw reportsResult.error

    const classMap = new Map<string, {
      id: string
      name: string
      site: string
      province: string
      game_type: string | null
      archived: boolean
    }>()
    for (const cls of classesResult.data ?? []) classMap.set(cls.id, cls)

    const reports = (reportsResult.data ?? []) as TrainerTodayReport[]
    const slots = (scheduleResult.data ?? [])
      .filter((slot: { trainer_id: string | null; trainer_ids?: string[] | null }) => {
        const slotTrainerIds = slot.trainer_ids?.length ? slot.trainer_ids : slot.trainer_id ? [slot.trainer_id] : []
        return slotTrainerIds.length === 0 || slotTrainerIds.some(id => trainerIds.includes(id))
      })
      .map((slot: {
        id: string
        class_id: string
        slot_date: string
        start_time: string
        end_time: string
        group_label: string | null
        notes: string | null
        trainer_id: string | null
        trainer_ids?: string[] | null
      }) => {
        const cls = classMap.get(slot.class_id)
        const slotGroup = groupKey(slot.group_label)
        const exactReport = reports.find(report =>
          report.class_id === slot.class_id &&
          report.report_date === targetDate &&
          groupKey(report.group_label) === slotGroup,
        ) ?? null
        const copySource = reports.find(report =>
          report.class_id === slot.class_id &&
          report.report_date < targetDate &&
          groupKey(report.group_label) === slotGroup,
        ) ?? null

        return {
          id: slot.id,
          class_id: slot.class_id,
          class_name: cls?.name ?? 'Unknown',
          site: cls?.site ?? '',
          province: cls?.province ?? '',
          game_type: cls?.game_type ?? null,
          archived: cls?.archived ?? false,
          slot_date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          group_label: slot.group_label,
          notes: slot.notes,
          trainer_id: slot.trainer_id,
          trainer_ids: slot.trainer_ids ?? [],
          assigned_to_me: (slot.trainer_ids?.length ? slot.trainer_ids : slot.trainer_id ? [slot.trainer_id] : []).some(id => trainerIds.includes(id)) || (!slot.trainer_id && !slot.trainer_ids?.length),
          report: exactReport ? reportSummary(exactReport) : null,
          copy_source_report: copySource ? reportSummary(copySource) : null,
        }
      })

    res.json({
      date: targetDate,
      generated_at: new Date().toISOString(),
      slots,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /me/trainee-progress
 * Auth: any authenticated user (trainees use this)
 *
 * Returns the same shape as GET /students/progress?email=... but
 * automatically scoped to the calling user's email. Trainees do not
 * need to know their own email to make this call — it comes from the JWT.
 */
selfServiceRouter.get('/me/trainee-progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = req.userEmail
    if (!email) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }

    // Find all enrollments for this student
    const { data: enrollments, error: enrollError } = await supabase
      .from('class_enrollments')
      .select('id, class_id, student_name, student_email, status, group_label')
      .eq('student_email', email)
    if (enrollError) throw enrollError
    if (!enrollments || enrollments.length === 0) {
      res.json({ student_name: null, student_email: email, classes: [], progress: [], drill_times: [] })
      return
    }

    const enrollmentIds = enrollments.map((e: { id: string }) => e.id)
    const classIds = [...new Set(enrollments.map((e: { class_id: string }) => e.class_id))]
    const today = new Date().toISOString().slice(0, 10)

    const [classesResult, progressResult, drillTimesResult, scheduleResult] = await Promise.all([
      supabase
        .from('classes')
        .select('id, name, site, province, game_type, start_date, end_date')
        .in('id', classIds),
      supabase
        .from('class_daily_report_trainee_progress')
        .select('*, class_daily_reports!inner(report_date, session_label, group_label, class_id)')
        .in('enrollment_id', enrollmentIds)
        .order('created_at', { ascending: true }),
      supabase
        .from('class_daily_report_drill_times')
        .select('*, class_daily_reports!inner(report_date, class_id), class_drills!inner(name, type, par_time_seconds, target_score)')
        .in('enrollment_id', enrollmentIds)
        .order('created_at', { ascending: true }),
      supabase
        .from('class_schedule_slots')
        .select('id, class_id, slot_date, start_time, end_time, group_label, notes')
        .in('class_id', classIds)
        .gte('slot_date', today)
        .order('slot_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(20),
    ])

    if (classesResult.error) throw classesResult.error
    if (progressResult.error) throw progressResult.error
    if (drillTimesResult.error) throw drillTimesResult.error
    if (scheduleResult.error) throw scheduleResult.error

    const classMap = new Map<string, { id: string; name: string; site: string; province: string; game_type: string | null; start_date: string; end_date: string }>()
    for (const c of classesResult.data ?? []) {
      classMap.set(c.id, c)
    }

    // Build upcoming slots map
    const slotsMap = new Map<string, typeof scheduleResult.data>()
    for (const slot of scheduleResult.data ?? []) {
      const s = slot as { class_id: string }
      const existing = slotsMap.get(s.class_id) ?? []
      if (existing.length < 3) slotsMap.set(s.class_id, [...existing, slot])
    }

    const classes = enrollments.map((e: { id: string; class_id: string; status: string; group_label: string | null; student_name: string; student_email: string }) => {
      const cls = classMap.get(e.class_id)
      return {
        class_id: e.class_id,
        class_name: cls?.name ?? 'Unknown',
        site: cls?.site ?? '',
        province: cls?.province ?? '',
        game_type: cls?.game_type ?? null,
        start_date: cls?.start_date ?? null,
        end_date: cls?.end_date ?? null,
        enrollment_id: e.id,
        status: e.status,
        group_label: e.group_label,
        upcoming_slots: slotsMap.get(e.class_id) ?? [],
      }
    })

    const progress = (progressResult.data ?? []).map((p: Record<string, unknown>) => {
      const report = p.class_daily_reports as { report_date: string; session_label: string | null; group_label: string | null; class_id: string }
      return {
        report_date: report.report_date,
        session_label: report.session_label,
        group_label: report.group_label,
        class_name: classMap.get(report.class_id)?.name ?? 'Unknown',
        progress_text: p.progress_text as string | null,
        gk_rating: p.gk_rating as string | null,
        dex_rating: p.dex_rating as string | null,
        hom_rating: p.hom_rating as string | null,
        coming_back_next_day: p.coming_back_next_day as boolean | null,
        homework_completed: p.homework_completed as boolean,
        attendance: (p.attendance as boolean) ?? true,
        late: (p.late as boolean) ?? false,
      }
    })
    progress.sort((a: { report_date: string }, b: { report_date: string }) => a.report_date.localeCompare(b.report_date))

    const drillTimes = (drillTimesResult.data ?? []).map((d: Record<string, unknown>) => {
      const report = d.class_daily_reports as { report_date: string; class_id: string }
      const drill = d.class_drills as { name: string; type: string; par_time_seconds: number | null; target_score: number | null }
      return {
        report_date: report.report_date,
        class_name: classMap.get(report.class_id)?.name ?? 'Unknown',
        drill_name: drill.name,
        drill_type: drill.type,
        time_seconds: d.time_seconds as number | null,
        score: d.score as number | null,
        par_time_seconds: drill.par_time_seconds,
        target_score: drill.target_score,
      }
    })
    drillTimes.sort((a: { report_date: string }, b: { report_date: string }) => a.report_date.localeCompare(b.report_date))

    res.json({
      student_name: enrollments[0].student_name,
      student_email: email,
      classes,
      progress,
      drill_times: drillTimes,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /me/my-classes/:classId
 * Auth: trainer assigned to class
 *
 * Returns class metadata, trainer's role, enrolled students, drills, and trainers.
 */
selfServiceRouter.get('/me/my-classes/:classId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    const trainerRow = await validateTrainerAccess(req.userEmail, classId)

    const [classResult, enrollResult, drillsResult, trainersResult] = await Promise.all([
      supabase.from('classes').select('*').eq('id', classId).single(),
      supabase.from('class_enrollments').select('id, class_id, student_name, student_email, status, group_label, created_at').eq('class_id', classId).order('student_name', { ascending: true }),
      supabase.from('class_drills').select('*').eq('class_id', classId).order('created_at', { ascending: false }),
      supabase.from('class_trainers').select('id, class_id, trainer_name, trainer_email, role, created_at').eq('class_id', classId).order('created_at', { ascending: true }),
    ])

    if (classResult.error) throw classResult.error
    if (enrollResult.error) throw enrollResult.error
    if (drillsResult.error) throw drillsResult.error
    if (trainersResult.error) throw trainersResult.error

    res.json({
      ...classResult.data,
      trainer_role: trainerRow.role,
      trainer_id: trainerRow.id,
      enrollments: enrollResult.data ?? [],
      drills: drillsResult.data ?? [],
      trainers: trainersResult.data ?? [],
    })
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

/**
 * GET /me/my-classes/:classId/available-trainees?search=<term>
 * Auth: trainer assigned to class
 * Returns trainee profiles that are not already enrolled in this class.
 */
selfServiceRouter.get('/me/my-classes/:classId/available-trainees', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const search = typeof req.query.search === 'string' ? req.query.search : ''
    const safeSearch = search.replace(/[(),"'\\]/g, '').slice(0, 100)

    const { data: enrollments, error: enrollError } = await supabase
      .from('class_enrollments')
      .select('student_email')
      .eq('class_id', classId)
    if (enrollError) throw enrollError

    let query = supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'trainee')
      .order('full_name', { ascending: true })
      .limit(25)

    if (safeSearch) {
      query = query.or(`full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`)
    }

    const { data, error } = await query
    if (error) throw error

    const existingEmails = new Set((enrollments ?? []).map((row: { student_email: string }) => row.student_email.toLowerCase()))

    let enrollmentDirectoryQuery = supabase
      .from('class_enrollments')
      .select('id, student_name, student_email')
      .order('student_name', { ascending: true })
      .limit(500)

    if (safeSearch) {
      enrollmentDirectoryQuery = enrollmentDirectoryQuery.or(`student_name.ilike.%${safeSearch}%,student_email.ilike.%${safeSearch}%`)
    }

    const { data: enrollmentDirectory, error: enrollmentDirectoryError } = await enrollmentDirectoryQuery
    if (enrollmentDirectoryError) throw enrollmentDirectoryError

    const byEmail = new Map<string, { id: string; full_name: string | null; email: string }>()
    for (const profile of data ?? []) {
      const typed = profile as { id: string; full_name: string | null; email: string }
      byEmail.set(typed.email.toLowerCase(), typed)
    }
    for (const enrollment of enrollmentDirectory ?? []) {
      const typed = enrollment as { id: string; student_name: string; student_email: string }
      const email = typed.student_email.toLowerCase()
      if (!byEmail.has(email)) {
        byEmail.set(email, {
          id: `enrollment:${typed.id}`,
          full_name: typed.student_name,
          email: typed.student_email,
        })
      }
    }

    res.json([...byEmail.values()].filter(profile => !existingEmails.has(profile.email.toLowerCase())).slice(0, 25))
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

/**
 * GET /me/my-classes/:classId/reports
 * Auth: trainer assigned to class
 * Returns all daily reports for this class, sorted by date desc.
 */
selfServiceRouter.get('/me/my-classes/:classId/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data, error } = await supabase
      .from('class_daily_reports')
      .select('*')
      .eq('class_id', classId)
      .order('report_date', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

/**
 * GET /me/my-classes/:classId/reports/:reportId
 * Auth: trainer assigned to class
 * Returns full report with nested trainer_ids, timeline, progress, drill_times.
 */
selfServiceRouter.get('/me/my-classes/:classId/reports/:reportId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const reportId = req.params.reportId as string
    const [
      { data: report, error: reportError },
      { data: trainerLinks, error: trainerLinksError },
      { data: timeline, error: timelineError },
      { data: progress, error: progressError },
      { data: drillTimes, error: drillTimesError },
    ] = await Promise.all([
      supabase.from('class_daily_reports').select('*').eq('id', reportId).eq('class_id', classId).single(),
      supabase.from('class_daily_report_trainers').select('trainer_id').eq('report_id', reportId),
      supabase
        .from('class_daily_report_timeline_items')
        .select('*')
        .eq('report_id', reportId)
        .order('position', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase.from('class_daily_report_trainee_progress').select('*').eq('report_id', reportId),
      supabase.from('class_daily_report_drill_times').select('*').eq('report_id', reportId),
    ])

    if (reportError) {
      if (reportError.code === 'PGRST116') {
        res.status(404).json({ error: 'Report not found' })
        return
      }
      throw reportError
    }
    if (trainerLinksError) throw trainerLinksError
    if (timelineError) throw timelineError
    if (progressError) throw progressError
    if (drillTimesError) throw drillTimesError

    res.json({
      ...report,
      trainer_ids: (trainerLinks ?? []).map((t: { trainer_id: string }) => t.trainer_id),
      timeline: timeline ?? [],
      progress: progress ?? [],
      drill_times: drillTimes ?? [],
    })
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

selfServiceRouter.get('/me/my-classes/:classId/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data, error } = await supabase
      .from('class_schedule_slots')
      .select('*')
      .eq('class_id', classId)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true })
    if (error) throw error
    res.json(data)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

/**
 * GET /me/my-classes/:classId/hours
 * Auth: trainer assigned to class
 * Returns: trainer's own hours + all student hours. Does NOT include other trainers' hours.
 */
selfServiceRouter.get('/me/my-classes/:classId/hours', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    const trainerRow = await validateTrainerAccess(req.userEmail, classId)

    // Fetch trainer's own hours and all student hours in parallel
    const [trainerHoursResult, studentHoursResult] = await Promise.all([
      supabase
        .from('class_logged_hours')
        .select('*')
        .eq('class_id', classId)
        .eq('person_type', 'trainer')
        .eq('trainer_id', trainerRow.id)
        .order('log_date', { ascending: false }),
      supabase
        .from('class_logged_hours')
        .select('*')
        .eq('class_id', classId)
        .eq('person_type', 'student')
        .order('log_date', { ascending: false }),
    ])

    if (trainerHoursResult.error) throw trainerHoursResult.error
    if (studentHoursResult.error) throw studentHoursResult.error

    res.json({
      trainer_hours: trainerHoursResult.data ?? [],
      student_hours: studentHoursResult.data ?? [],
    })
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

selfServiceRouter.get('/me/my-classes/:classId/students/:enrollmentId/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const enrollmentId = req.params.enrollmentId as string

    // Verify enrollment belongs to this class
    const { data: enrollment, error: enrollError } = await supabase
      .from('class_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .eq('class_id', classId)
      .single()
    if (enrollError || !enrollment) {
      res.status(404).json({ error: 'Student not found in this class' })
      return
    }

    const [progressResult, drillTimesResult] = await Promise.all([
      supabase
        .from('class_daily_report_trainee_progress')
        .select('*, class_daily_reports!inner(report_date, session_label, group_label)')
        .eq('enrollment_id', enrollmentId)
        .order('created_at', { ascending: true }),
      supabase
        .from('class_daily_report_drill_times')
        .select('*, class_daily_reports!inner(report_date), class_drills!inner(name, type, par_time_seconds, target_score)')
        .eq('enrollment_id', enrollmentId)
        .order('created_at', { ascending: true }),
    ])

    if (progressResult.error) throw progressResult.error
    if (drillTimesResult.error) throw drillTimesResult.error

    res.json({
      enrollment,
      progress: progressResult.data ?? [],
      drill_times: drillTimesResult.data ?? [],
    })
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

// ─── Trainer Class Documents ────────────────────────────────────────────────

selfServiceRouter.get('/me/my-classes/:classId/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)
    res.json(await listClassDocuments(classId))
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

selfServiceRouter.post('/me/my-classes/:classId/documents', writeLimiter, rawDocumentUpload, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) {
      res.status(400).json({ error: 'Cannot add documents to archived classes' })
      return
    }

    const file = validateUploadRequest(req, res)
    if (!file) return
    const fileName = safeUploadFileName(req.get('x-file-name'))
    const contentType = normalizeContentType(req.get('content-type'))
    const description = safeDescription(req.get('x-description'))

    const document = await createClassDocument({
      classId,
      userId: req.userId!,
      fileName,
      contentType,
      description,
      file,
    })

    await logAudit({
      userId: req.userId!,
      action: 'CREATE',
      tableName: 'class_documents',
      recordId: document.id,
      after: document as Record<string, unknown>,
      metadata: { class_id: classId, file_name: fileName, uploaded_by: 'trainer' },
      ipAddress: req.ip,
    })

    res.status(201).json(document)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

selfServiceRouter.get('/me/my-classes/:classId/documents/:documentId/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)
    const document = await findClassDocument(classId, req.params.documentId as string)
    if (!document) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json({ url: await signedDocumentUrl(document) })
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

selfServiceRouter.delete('/me/my-classes/:classId/documents/:documentId', writeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) {
      res.status(401).json({ error: 'No email associated with this account' })
      return
    }
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) {
      res.status(400).json({ error: 'Cannot modify archived classes' })
      return
    }

    const document = await findClassDocument(classId, req.params.documentId as string)
    if (!document) {
      res.status(404).json({ error: 'Document not found' })
      return
    }

    await logAudit({
      userId: req.userId!,
      action: 'DELETE',
      tableName: 'class_documents',
      recordId: document.id,
      before: document as Record<string, unknown>,
      metadata: { class_id: classId, file_name: document.original_filename, deleted_by: 'trainer' },
      ipAddress: req.ip,
    })
    await deleteClassDocument(document)
    res.status(204).send()
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) {
      res.status(403).json({ error: (err as Error).message })
      return
    }
    next(err)
  }
})

// ─── Report Write Endpoints ───────────────────────────────────────────────────

selfServiceRouter.post('/me/my-classes/:classId/reports', writeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(reportBodySchema, req, res)
    if (!body) return
    const classId = req.params.classId as string
    const trainerRow = await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot create reports for archived classes' }); return }

    const {
      report_date, group_label, game, session_label,
      class_start_time, class_end_time,
      mg_confirmed, mg_attended, current_trainees, licenses_received,
      override_hours_to_date, override_paid_hours_total, override_live_hours_total, coordinator_notes,
      trainer_ids = [], timeline = [], progress = [], drill_times = [],
    } = body

    // Auto-include this trainer if not already in trainer_ids
    const allTrainerIds: string[] = trainer_ids.includes(trainerRow.id)
      ? trainer_ids
      : [trainerRow.id, ...trainer_ids]

    const { data: report, error: reportError } = await supabase
      .from('class_daily_reports')
      .insert({
        class_id: classId,
        report_date,
        group_label: group_label ?? null,
        game: game ?? null,
        session_label: session_label ?? null,
        class_start_time: class_start_time ?? null,
        class_end_time: class_end_time ?? null,
        mg_confirmed: mg_confirmed ?? null,
        mg_attended: mg_attended ?? null,
        current_trainees: current_trainees ?? null,
        licenses_received: licenses_received ?? null,
        override_hours_to_date: override_hours_to_date ?? null,
        override_paid_hours_total: override_paid_hours_total ?? null,
        override_live_hours_total: override_live_hours_total ?? null,
        coordinator_notes: coordinator_notes ?? null,
      })
      .select()
      .single()
    if (reportError) throw reportError

    const reportId = (report as { id: string }).id

    if (allTrainerIds.length > 0) {
      await supabase
        .from('class_daily_report_trainers')
        .insert(allTrainerIds.map((tid: string) => ({ report_id: reportId, trainer_id: tid })))
    }
    if (timeline.length > 0) {
      await supabase.from('class_daily_report_timeline_items').insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        timeline.map((item: any, index: number) => ({
          report_id: reportId,
          start_time: item.start_time ?? null,
          end_time: item.end_time ?? null,
          activity: item.activity ?? null,
          homework_handouts_tests: item.homework_handouts_tests ?? null,
          category: item.category ?? null,
          position: index,
        })),
      )
    }
    if (progress.length > 0) {
      const { data: progressRows, error: progressError } = await supabase.from('class_daily_report_trainee_progress').insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress.map((row: any) => ({
          report_id: reportId,
          enrollment_id: row.enrollment_id,
          progress_text: row.progress_text ?? null,
          gk_rating: row.gk_rating ?? null,
          dex_rating: row.dex_rating ?? null,
          hom_rating: row.hom_rating ?? null,
          coming_back_next_day: row.coming_back_next_day ?? false,
          homework_completed: row.homework_completed ?? false,
          attendance: row.attendance ?? true,
          late: row.late ?? false,
        })),
      )
        .select()
      if (progressError) throw progressError
      await logAudit({
        userId: req.userId!,
        action: 'CREATE',
        tableName: 'class_daily_report_trainee_progress',
        recordId: `report:${reportId}`,
        after: { rows: progressRows ?? [] },
        metadata: { class_id: classId, report_id: reportId, count: progressRows?.length ?? 0, created_by: 'trainer' },
        ipAddress: req.ip,
      })
    }
    if (drill_times.length > 0) {
      const { error: dtError } = await supabase.from('class_daily_report_drill_times').insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        drill_times.map((row: any) => ({
          report_id: reportId,
          enrollment_id: row.enrollment_id,
          drill_id: row.drill_id,
          time_seconds: row.time_seconds ?? null,
          score: row.score ?? null,
        })),
      )
      if (dtError) throw dtError
    }

    // Auto-fail students who are not coming back
    await autoFailNotComingBack(classId, reportId, req.userId!, req.ip)

    await logAudit({
      userId: req.userId!,
      action: 'CREATE',
      tableName: 'class_daily_reports',
      recordId: reportId,
      after: report as Record<string, unknown>,
      metadata: { class_id: classId, report_date, created_by: 'trainer' },
      ipAddress: req.ip,
    })

    res.status(201).json(report)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

selfServiceRouter.put('/me/my-classes/:classId/reports/:reportId', writeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(reportBodySchema, req, res)
    if (!body) return
    const classId = req.params.classId as string
    const reportId = req.params.reportId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot update reports for archived classes' }); return }

    const {
      report_date, group_label, game, session_label,
      class_start_time, class_end_time,
      mg_confirmed, mg_attended, current_trainees, licenses_received,
      override_hours_to_date, override_paid_hours_total, override_live_hours_total, coordinator_notes,
      trainer_ids = [], timeline = [], progress = [], drill_times = [],
    } = body

    const { data: before, error: beforeError } = await supabase
      .from('class_daily_reports')
      .select('*')
      .eq('id', reportId)
      .eq('class_id', classId)
      .single()
    if (beforeError || !before) { res.status(404).json({ error: 'Report not found' }); return }

    const { data: report, error: reportError } = await supabase
      .from('class_daily_reports')
      .update({
        report_date,
        group_label: group_label ?? null,
        game: game ?? null,
        session_label: session_label ?? null,
        class_start_time: class_start_time ?? null,
        class_end_time: class_end_time ?? null,
        mg_confirmed: mg_confirmed ?? null,
        mg_attended: mg_attended ?? null,
        current_trainees: current_trainees ?? null,
        licenses_received: licenses_received ?? null,
        override_hours_to_date: override_hours_to_date ?? null,
        override_paid_hours_total: override_paid_hours_total ?? null,
        override_live_hours_total: override_live_hours_total ?? null,
        coordinator_notes: coordinator_notes ?? null,
      })
      .eq('id', reportId)
      .eq('class_id', classId)
      .select()
      .single()
    if (reportError) {
      if (reportError.code === 'PGRST116') { res.status(404).json({ error: 'Report not found' }); return }
      throw reportError
    }

    // Full replace nested data
    await supabase.from('class_daily_report_trainers').delete().eq('report_id', reportId)
    if (trainer_ids.length > 0) {
      await supabase.from('class_daily_report_trainers')
        .insert(trainer_ids.map((tid: string) => ({ report_id: reportId, trainer_id: tid })))
    }

    await supabase.from('class_daily_report_timeline_items').delete().eq('report_id', reportId)
    if (timeline.length > 0) {
      await supabase.from('class_daily_report_timeline_items').insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        timeline.map((item: any, index: number) => ({
          report_id: reportId,
          start_time: item.start_time ?? null,
          end_time: item.end_time ?? null,
          activity: item.activity ?? null,
          homework_handouts_tests: item.homework_handouts_tests ?? null,
          category: item.category ?? null,
          position: index,
        })),
      )
    }

    const { data: beforeProgress, error: beforeProgressError } = await supabase
      .from('class_daily_report_trainee_progress')
      .select('*')
      .eq('report_id', reportId)
    if (beforeProgressError) throw beforeProgressError

    await supabase.from('class_daily_report_trainee_progress').delete().eq('report_id', reportId)
    let afterProgress: unknown[] = []
    if (progress.length > 0) {
      const { data: insertedProgress, error: progressError } = await supabase.from('class_daily_report_trainee_progress').insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress.map((row: any) => ({
          report_id: reportId,
          enrollment_id: row.enrollment_id,
          progress_text: row.progress_text ?? null,
          gk_rating: row.gk_rating ?? null,
          dex_rating: row.dex_rating ?? null,
          hom_rating: row.hom_rating ?? null,
          coming_back_next_day: row.coming_back_next_day ?? false,
          homework_completed: row.homework_completed ?? false,
          attendance: row.attendance ?? true,
          late: row.late ?? false,
        })),
      )
        .select()
      if (progressError) throw progressError
      afterProgress = insertedProgress ?? []
    }
    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      tableName: 'class_daily_report_trainee_progress',
      recordId: `report:${reportId}`,
      before: { rows: beforeProgress ?? [] },
      after: { rows: afterProgress },
      metadata: { class_id: classId, report_id: reportId, updated_by: 'trainer' },
      ipAddress: req.ip,
    })

    const { error: dtDelError } = await supabase.from('class_daily_report_drill_times').delete().eq('report_id', reportId)
    if (dtDelError) throw dtDelError
    if (drill_times.length > 0) {
      const { error: dtError } = await supabase.from('class_daily_report_drill_times').insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        drill_times.map((row: any) => ({
          report_id: reportId,
          enrollment_id: row.enrollment_id,
          drill_id: row.drill_id,
          time_seconds: row.time_seconds ?? null,
          score: row.score ?? null,
        })),
      )
      if (dtError) throw dtError
    }

    // Auto-fail students who are not coming back
    await autoFailNotComingBack(classId, reportId, req.userId!, req.ip)

    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      tableName: 'class_daily_reports',
      recordId: reportId,
      before: before as Record<string, unknown>,
      after: report as Record<string, unknown>,
      metadata: { class_id: classId, report_date, updated_by: 'trainer' },
      ipAddress: req.ip,
    })

    res.json(report)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

// ─── Hours Write Endpoints ────────────────────────────────────────────────────

selfServiceRouter.post('/me/my-classes/:classId/hours', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(hoursBodySchema, req, res)
    if (!body) return
    const classId = req.params.classId as string
    const trainerRow = await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot log hours for archived classes' }); return }

    const { log_date, person_type, enrollment_id, hours, paid, live_training, notes } = body

    // Trainers can only log their own hours (trainer_id forced to their own)
    const trainer_id = person_type === 'trainer' ? trainerRow.id : null

    const { data, error } = await supabase
      .from('class_logged_hours')
      .insert({
        class_id: classId,
        log_date,
        person_type,
        trainer_id,
        enrollment_id: person_type === 'student' ? (enrollment_id ?? null) : null,
        hours,
        paid: paid ?? false,
        live_training: live_training ?? false,
        notes: notes ?? null,
      })
      .select()
      .single()
    if (error) throw error

    await logAudit({
      userId: req.userId!,
      action: 'CREATE',
      tableName: 'class_logged_hours',
      recordId: (data as { id: string }).id,
      after: data as Record<string, unknown>,
      metadata: { class_id: classId, hours, person_type, created_by: 'trainer' },
      ipAddress: req.ip,
    })

    res.status(201).json(data)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

selfServiceRouter.post('/me/my-classes/:classId/hours/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(hoursBulkBodySchema, req, res)
    if (!body) return
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot log hours for archived classes' }); return }

    const { log_date, entries, paid, live_training } = body

    const rows = entries.map(entry => ({
      class_id: classId,
      log_date,
      person_type: 'student' as const,
      trainer_id: null,
      enrollment_id: entry.enrollment_id,
      hours: entry.hours,
      paid: paid ?? false,
      live_training: live_training ?? false,
      notes: entry.notes ?? null,
    }))

    const { data, error } = await supabase
      .from('class_logged_hours')
      .insert(rows)
      .select()
    if (error) throw error

    for (const row of data ?? []) {
      await logAudit({
        userId: req.userId!,
        action: 'CREATE',
        tableName: 'class_logged_hours',
        recordId: row.id,
        after: row as Record<string, unknown>,
        metadata: { class_id: classId, hours: row.hours, person_type: 'student', created_by: 'trainer_bulk' },
        ipAddress: req.ip,
      })
    }

    res.status(201).json({ inserted: (data ?? []).length })
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

selfServiceRouter.put('/me/my-classes/:classId/hours/:hourId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(hoursBodySchema, req, res)
    if (!body) return
    const classId = req.params.classId as string
    const hourId = req.params.hourId as string
    const trainerRow = await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot modify data for archived classes' }); return }

    const { log_date, person_type, enrollment_id, hours, paid, live_training, notes } = body

    const { data: before, error: beforeError } = await supabase
      .from('class_logged_hours')
      .select('*')
      .eq('id', hourId)
      .eq('class_id', classId)
      .single()
    if (beforeError || !before) { res.status(404).json({ error: 'Hours record not found' }); return }

    const trainer_id = person_type === 'trainer' ? trainerRow.id : null

    const { data, error } = await supabase
      .from('class_logged_hours')
      .update({
        log_date,
        person_type,
        trainer_id,
        enrollment_id: person_type === 'student' ? (enrollment_id ?? null) : null,
        hours,
        paid: paid ?? false,
        live_training: live_training ?? false,
        notes: notes ?? null,
      })
      .eq('id', hourId)
      .eq('class_id', classId)
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') { res.status(404).json({ error: 'Hours record not found' }); return }
      throw error
    }

    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      tableName: 'class_logged_hours',
      recordId: hourId,
      before: before as Record<string, unknown>,
      after: data as Record<string, unknown>,
      metadata: { class_id: classId, hours, person_type, updated_by: 'trainer' },
      ipAddress: req.ip,
    })

    res.json(data)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

selfServiceRouter.delete('/me/my-classes/:classId/hours/:hourId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const classId = req.params.classId as string
    const hourId = req.params.hourId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot modify data for archived classes' }); return }

    const { data: existing, error: fetchError } = await supabase
      .from('class_logged_hours')
      .select('*')
      .eq('id', hourId)
      .eq('class_id', classId)
      .single()
    if (fetchError || !existing) { res.status(404).json({ error: 'Hours record not found' }); return }

    await logAudit({
      userId: req.userId!,
      action: 'DELETE',
      tableName: 'class_logged_hours',
      recordId: hourId,
      before: existing as Record<string, unknown>,
      metadata: { class_id: classId, deleted_by: 'trainer' },
      ipAddress: req.ip,
    })

    const { error } = await supabase.from('class_logged_hours').delete().eq('id', hourId)
    if (error) throw error
    res.status(204).send()
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

// ─── Enrollment Write Endpoints ──────────────────────────────────────────────

selfServiceRouter.post('/me/my-classes/:classId/enrollments', writeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(enrollmentBodySchema, req, res)
    if (!body) return
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot modify data for archived classes' }); return }

    const studentName = normalizeStudentName(body.student_name)
    const studentEmail = normalizeStudentEmail(body.student_email) ?? manualStudentEmail(classId, studentName)
    const { data: existing, error: existingError } = await supabase
      .from('class_enrollments')
      .select('id')
      .eq('class_id', classId)
      .eq('student_email', studentEmail)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      res.status(409).json({ error: 'Student is already enrolled in this class' })
      return
    }

    const { data, error } = await supabase
      .from('class_enrollments')
      .insert({
        class_id: classId,
        student_name: studentName,
        student_email: studentEmail,
        status: body.status,
        group_label: body.group_label ?? null,
      })
      .select()
      .single()
    if (error) throw error

    await logAudit({
      userId: req.userId!,
      action: 'CREATE',
      tableName: 'class_enrollments',
      recordId: (data as { id: string }).id,
      after: data as Record<string, unknown>,
      metadata: { class_id: classId, student_email: studentEmail, status: body.status, created_by: 'trainer' },
      ipAddress: req.ip,
    })

    res.status(201).json(data)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

selfServiceRouter.patch('/me/my-classes/:classId/enrollments/:enrollmentId', writeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(enrollmentUpdateBodySchema.pick({ status: true }), req, res)
    if (!body) return
    const classId = req.params.classId as string
    const enrollmentId = req.params.enrollmentId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot modify data for archived classes' }); return }

    const { status } = body
    if (!status || !['enrolled', 'failed'].includes(status)) {
      res.status(400).json({ error: 'status must be "enrolled" or "failed"' })
      return
    }

    const { data: before, error: beforeError } = await supabase
      .from('class_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .eq('class_id', classId)
      .single()
    if (beforeError || !before) { res.status(404).json({ error: 'Enrollment not found' }); return }

    const { data, error } = await supabase
      .from('class_enrollments')
      .update({ status })
      .eq('id', enrollmentId)
      .eq('class_id', classId)
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') { res.status(404).json({ error: 'Enrollment not found' }); return }
      throw error
    }

    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      tableName: 'class_enrollments',
      recordId: enrollmentId,
      before: before as Record<string, unknown>,
      after: data as Record<string, unknown>,
      metadata: { class_id: classId, status, updated_by: 'trainer' },
      ipAddress: req.ip,
    })

    res.json(data)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

// ─── Cross-class Read Endpoints ──────────────────────────────────────────────

/**
 * GET /me/reports
 * Auth: any authenticated trainer
 * Paginated reports across all assigned classes.
 * Query params: class_id, date_from, date_to, status, page, limit
 */
selfServiceRouter.get('/me/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = req.userEmail
    if (!email) { res.status(401).json({ error: 'No email' }); return }

    const { data: trainerRows, error: trainerError } = await supabase
      .from('class_trainers')
      .select('class_id')
      .eq('trainer_email', email)
    if (trainerError) throw trainerError
    if (!trainerRows || trainerRows.length === 0) {
      res.json({ data: [], total: 0, page: 0, limit: 50 })
      return
    }

    const classIds = [...new Set(trainerRows.map((t: { class_id: string }) => t.class_id))]
    const { class_id, date_from, date_to, page: pageStr, limit: limitStr } = req.query as Record<string, string | undefined>

    const limit = Math.min(Math.max(Number(limitStr) || 50, 1), 200)
    const page = Math.max(Number(pageStr) || 0, 0)
    const offset = page * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('class_daily_reports')
      .select('*, classes!inner(id, name, site, province, game_type, archived)', { count: 'exact' })
      .in('class_id', classIds)
      .order('report_date', { ascending: false })

    if (class_id) query = query.eq('class_id', class_id)
    if (date_from) query = query.gte('report_date', date_from)
    if (date_to) query = query.lte('report_date', date_to)

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw error

    res.json({ data: data ?? [], total: count ?? 0, page, limit })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /me/schedule
 * Auth: any authenticated trainer
 * Schedule across all assigned classes.
 * Query params: class_id, date_from, date_to, group_label, page, limit
 */
selfServiceRouter.get('/me/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = req.userEmail
    if (!email) { res.status(401).json({ error: 'No email' }); return }

    const { data: trainerRows, error: trainerError } = await supabase
      .from('class_trainers')
      .select('class_id')
      .eq('trainer_email', email)
    if (trainerError) throw trainerError
    if (!trainerRows || trainerRows.length === 0) {
      res.json({ data: [], total: 0, page: 0, limit: 50 })
      return
    }

    const classIds = [...new Set(trainerRows.map((t: { class_id: string }) => t.class_id))]
    const { class_id, date_from, date_to, group_label, page: pageStr, limit: limitStr } = req.query as Record<string, string | undefined>

    const limit = Math.min(Math.max(Number(limitStr) || 50, 1), 200)
    const page = Math.max(Number(pageStr) || 0, 0)
    const offset = page * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('class_schedule_slots')
      .select('*, classes!inner(id, name, site, province, game_type, archived)', { count: 'exact' })
      .in('class_id', classIds)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (class_id) query = query.eq('class_id', class_id)
    if (date_from) query = query.gte('slot_date', date_from)
    if (date_to) query = query.lte('slot_date', date_to)
    if (group_label) query = query.eq('group_label', group_label)

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw error

    res.json({ data: data ?? [], total: count ?? 0, page, limit })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /me/hours
 * Auth: any authenticated trainer
 * Personal hours across all assigned classes.
 * Query params: class_id, date_from, date_to, page, limit
 */
selfServiceRouter.get('/me/hours', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = req.userEmail
    if (!email) { res.status(401).json({ error: 'No email' }); return }

    const { data: trainerRows, error: trainerError } = await supabase
      .from('class_trainers')
      .select('id, class_id')
      .eq('trainer_email', email)
    if (trainerError) throw trainerError
    if (!trainerRows || trainerRows.length === 0) {
      res.json({ data: [], total: 0, page: 0, limit: 50, summary: { total_hours: 0, paid_hours: 0, unpaid_hours: 0 } })
      return
    }

    const trainerIds = trainerRows.map((t: { id: string }) => t.id)
    const { class_id, date_from, date_to, page: pageStr, limit: limitStr } = req.query as Record<string, string | undefined>

    const limit = Math.min(Math.max(Number(limitStr) || 50, 1), 200)
    const page = Math.max(Number(pageStr) || 0, 0)
    const offset = page * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('class_logged_hours')
      .select('*, classes!inner(id, name, site, province)', { count: 'exact' })
      .eq('person_type', 'trainer')
      .in('trainer_id', trainerIds)
      .order('log_date', { ascending: false })

    if (class_id) query = query.eq('class_id', class_id)
    if (date_from) query = query.gte('log_date', date_from)
    if (date_to) query = query.lte('log_date', date_to)

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw error

    const allHours = data ?? []
    const total_hours = allHours.reduce((sum: number, h: { hours: number }) => sum + h.hours, 0)
    const paid_hours = allHours.filter((h: { paid: boolean }) => h.paid).reduce((sum: number, h: { hours: number }) => sum + h.hours, 0)

    res.json({
      data: allHours,
      total: count ?? 0,
      page,
      limit,
      summary: { total_hours, paid_hours, unpaid_hours: total_hours - paid_hours },
    })
  } catch (err) {
    next(err)
  }
})

// ─── Drills Write Endpoints ───────────────────────────────────────────────────

selfServiceRouter.post('/me/my-classes/:classId/drills', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(drillBodySchema, req, res)
    if (!body) return
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot create drills for archived classes' }); return }

    const { name, type, par_time_seconds, target_score } = body
    const { data, error } = await supabase
      .from('class_drills')
      .insert({
        class_id: classId,
        name,
        type,
        par_time_seconds: par_time_seconds ?? null,
        target_score: target_score ?? null,
        active: true,
      })
      .select()
      .single()
    if (error) throw error
    await logAudit({
      userId: req.userId!,
      action: 'CREATE',
      tableName: 'class_drills',
      recordId: (data as { id: string }).id,
      after: data as Record<string, unknown>,
      metadata: { class_id: classId, name, created_by: 'trainer' },
      ipAddress: req.ip,
    })
    res.status(201).json(data)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

selfServiceRouter.put('/me/my-classes/:classId/drills/:drillId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(drillUpdateBodySchema, req, res)
    if (!body) return
    const classId = req.params.classId as string
    const drillId = req.params.drillId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot modify data for archived classes' }); return }

    const { data: before, error: beforeError } = await supabase
      .from('class_drills')
      .select('*')
      .eq('id', drillId)
      .eq('class_id', classId)
      .single()
    if (beforeError || !before) { res.status(404).json({ error: 'Drill not found' }); return }
    const update = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined))
    const { data, error } = await supabase
      .from('class_drills')
      .update(update)
      .eq('id', drillId)
      .eq('class_id', classId)
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') { res.status(404).json({ error: 'Drill not found' }); return }
      throw error
    }
    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      tableName: 'class_drills',
      recordId: drillId,
      before: before as Record<string, unknown>,
      after: data as Record<string, unknown>,
      metadata: { class_id: classId, updated_by: 'trainer' },
      ipAddress: req.ip,
    })
    res.json(data)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

selfServiceRouter.delete('/me/my-classes/:classId/drills/:drillId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const classId = req.params.classId as string
    const drillId = req.params.drillId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot modify data for archived classes' }); return }

    const { data: existing, error: fetchError } = await supabase
      .from('class_drills')
      .select('*')
      .eq('id', drillId)
      .eq('class_id', classId)
      .single()
    if (fetchError || !existing) { res.status(404).json({ error: 'Drill not found' }); return }

    // Check if drill has recorded times — if so, deactivate instead of deleting
    const { count } = await supabase
      .from('class_daily_report_drill_times')
      .select('id', { count: 'exact', head: true })
      .eq('drill_id', drillId)

    await logAudit({
      userId: req.userId!,
      action: 'DELETE',
      tableName: 'class_drills',
      recordId: drillId,
      before: existing as Record<string, unknown>,
      metadata: { class_id: classId, deleted_by: 'trainer' },
      ipAddress: req.ip,
    })

    if (count && count > 0) {
      // Deactivate instead of hard delete to preserve historical data
      const { data: deactivated, error: deactivateError } = await supabase
        .from('class_drills')
        .update({ active: false })
        .eq('id', drillId)
        .select()
        .single()
      if (deactivateError) throw deactivateError
      res.json({ deactivated: true, drill: deactivated })
    } else {
      const { error } = await supabase.from('class_drills').delete().eq('id', drillId)
      if (error) throw error
      res.status(204).send()
    }
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

// ─── Schedule Write Endpoints ─────────────────────────────────────────────────

selfServiceRouter.post('/me/my-classes/:classId/schedule', writeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(scheduleBodySchema.omit({ trainer_id: true }), req, res)
    if (!body) return
    const classId = req.params.classId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot add schedule slots for archived classes' }); return }

    const { slot_date, start_time, end_time, notes, group_label } = body

    const { data, error } = await supabase
      .from('class_schedule_slots')
      .insert({
        class_id: classId,
        slot_date,
        start_time,
        end_time,
        notes: notes ?? null,
        group_label: group_label ?? null,
      })
      .select()
      .single()
    if (error) throw error
    await logAudit({
      userId: req.userId!,
      action: 'CREATE',
      tableName: 'class_schedule_slots',
      recordId: (data as { id: string }).id,
      after: data as Record<string, unknown>,
      metadata: { class_id: classId, slot_date, created_by: 'trainer' },
      ipAddress: req.ip,
    })
    res.status(201).json(data)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

selfServiceRouter.put('/me/my-classes/:classId/schedule/:slotId', writeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const body = validateBody(scheduleBodySchema.omit({ trainer_id: true }), req, res)
    if (!body) return
    const classId = req.params.classId as string
    const slotId = req.params.slotId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot modify schedule slots for archived classes' }); return }

    const { slot_date, start_time, end_time, notes, group_label } = body
    const { data: before, error: beforeError } = await supabase
      .from('class_schedule_slots')
      .select('*')
      .eq('id', slotId)
      .eq('class_id', classId)
      .single()
    if (beforeError || !before) { res.status(404).json({ error: 'Schedule slot not found' }); return }
    const { data, error } = await supabase
      .from('class_schedule_slots')
      .update({
        slot_date,
        start_time,
        end_time,
        notes: notes ?? null,
        group_label: group_label ?? null,
      })
      .eq('id', slotId)
      .eq('class_id', classId)
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') { res.status(404).json({ error: 'Schedule slot not found' }); return }
      throw error
    }
    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      tableName: 'class_schedule_slots',
      recordId: slotId,
      before: before as Record<string, unknown>,
      after: data as Record<string, unknown>,
      metadata: { class_id: classId, slot_date, updated_by: 'trainer' },
      ipAddress: req.ip,
    })
    res.json(data)
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

selfServiceRouter.delete('/me/my-classes/:classId/schedule/:slotId', writeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userEmail) { res.status(401).json({ error: 'No email associated with this account' }); return }
    const classId = req.params.classId as string
    const slotId = req.params.slotId as string
    await validateTrainerAccess(req.userEmail, classId)

    const { data: cls } = await supabase.from('classes').select('archived').eq('id', classId).single()
    if (cls?.archived) { res.status(400).json({ error: 'Cannot modify schedule slots for archived classes' }); return }

    const { data: existing, error: fetchError } = await supabase
      .from('class_schedule_slots')
      .select('*')
      .eq('id', slotId)
      .eq('class_id', classId)
      .single()
    if (fetchError || !existing) { res.status(404).json({ error: 'Schedule slot not found' }); return }

    await logAudit({
      userId: req.userId!,
      action: 'DELETE',
      tableName: 'class_schedule_slots',
      recordId: slotId,
      before: existing as Record<string, unknown>,
      metadata: { class_id: classId, deleted_by: 'trainer' },
      ipAddress: req.ip,
    })

    const { error } = await supabase.from('class_schedule_slots').delete().eq('id', slotId)
    if (error) throw error
    res.status(204).send()
  } catch (err) {
    if ((err as Error & { status?: number }).status === 403) { res.status(403).json({ error: (err as Error).message }); return }
    next(err)
  }
})

// ─── Role request status ────────────────────────────────────────────────────

/**
 * GET /me/role-request
 * Auth: any authenticated user
 * Returns the calling user's most recent role request, or null if none exists.
 */
selfServiceRouter.get('/me/role-request', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from('role_requests')
      .select('id, requested_role, status, created_at')
      .eq('user_id', req.userId!)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /me/feedback
 * Auth: any authenticated user
 * Stores a feedback record for internal product triage.
 */
selfServiceRouter.post('/me/feedback', writeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userId || !req.userEmail) {
      res.status(401).json({ error: 'No user associated with this account' })
      return
    }

    const body = validateBody(feedbackBodySchema, req, res)
    if (!body) return
    const { category, message } = body
    const page = body.page || null

    const { data, error } = await supabase
      .from('app_feedback')
      .insert({
        user_id: req.userId,
        user_email: req.userEmail,
        user_role: req.userRole ?? null,
        category,
        message,
        page,
        user_agent: req.get('user-agent')?.slice(0, 512) ?? null,
      })
      .select('id, created_at')
      .single()
    if (error) throw error

    await logAudit({
      userId: req.userId,
      action: 'CREATE',
      tableName: 'app_feedback',
      recordId: data.id as string,
      metadata: { category, page },
      ipAddress: req.ip,
    })

    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// ─── Student self-service endpoints ─────────────────────────────────────────

/**
 * Validates that the calling user is enrolled in the given class.
 * Returns the enrollment row or null if not enrolled.
 */
async function validateStudentAccess(email: string, classId: string) {
  const { data, error } = await supabase
    .from('class_enrollments')
    .select('id, class_id, student_name, student_email, status, group_label')
    .eq('student_email', email)
    .eq('class_id', classId)
    .eq('status', 'enrolled')
    .single()
  if (error || !data) return null
  return data
}

selfServiceRouter.get('/me/my-class/:classId/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enrollment = await validateStudentAccess(req.userEmail!, req.params.classId as string)
    if (!enrollment) {
      res.status(403).json({ error: 'You are not enrolled in this class.' })
      return
    }
    res.json(await listClassDocuments(req.params.classId as string))
  } catch (err) {
    next(err)
  }
})

selfServiceRouter.get('/me/my-class/:classId/documents/:documentId/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const classId = req.params.classId as string
    const enrollment = await validateStudentAccess(req.userEmail!, classId)
    if (!enrollment) {
      res.status(403).json({ error: 'You are not enrolled in this class.' })
      return
    }
    const document = await findClassDocument(classId, req.params.documentId as string)
    if (!document) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json({ url: await signedDocumentUrl(document) })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /me/my-class/:classId
 * Auth: enrolled student
 * Returns class metadata, student's enrollment details, active drills, and upcoming schedule.
 */
selfServiceRouter.get('/me/my-class/:classId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enrollment = await validateStudentAccess(req.userEmail!, req.params.classId as string)
    if (!enrollment) {
      res.status(403).json({ error: 'You are not enrolled in this class.' })
      return
    }

    const today = new Date().toISOString().slice(0, 10)

    const [classResult, drillsResult, scheduleResult] = await Promise.all([
      supabase
        .from('classes')
        .select('id, name, site, province, game_type, start_date, end_date')
        .eq('id', req.params.classId)
        .single(),
      supabase
        .from('class_drills')
        .select('id, name, type, par_time_seconds, target_score')
        .eq('class_id', req.params.classId)
        .eq('active', true)
        .order('name', { ascending: true }),
      supabase
        .from('class_schedule_slots')
        .select('id, slot_date, start_time, end_time, group_label, notes')
        .eq('class_id', req.params.classId)
        .gte('slot_date', today)
        .order('slot_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(10),
    ])

    if (classResult.error) throw classResult.error
    if (drillsResult.error) throw drillsResult.error
    if (scheduleResult.error) throw scheduleResult.error

    res.json({
      class_info: classResult.data,
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        group_label: enrollment.group_label,
        student_name: enrollment.student_name,
      },
      drills: drillsResult.data ?? [],
      upcoming_slots: scheduleResult.data ?? [],
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /me/my-class/:classId/reports
 * Auth: enrolled student
 * Returns daily reports for the class, each including the student's own progress
 * row, drill times, and an `is_today` flag so the frontend can gate write access.
 */
selfServiceRouter.get('/me/my-class/:classId/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enrollment = await validateStudentAccess(req.userEmail!, req.params.classId as string)
    if (!enrollment) {
      res.status(403).json({ error: 'You are not enrolled in this class.' })
      return
    }

    const today = new Date().toISOString().slice(0, 10)

    // Fetch reports for this class
    const { data: reports, error: reportsError } = await supabase
      .from('class_daily_reports')
      .select('id, report_date, session_label, group_label, game, class_start_time, class_end_time')
      .eq('class_id', req.params.classId)
      .order('report_date', { ascending: false })

    if (reportsError) throw reportsError
    if (!reports || reports.length === 0) {
      res.json([])
      return
    }

    const reportIds = reports.map((r: { id: string }) => r.id)

    // Fetch student's own progress rows and drill times in parallel
    const [progressResult, drillTimesResult, drillsResult] = await Promise.all([
      supabase
        .from('class_daily_report_trainee_progress')
        .select('report_id, gk_rating, dex_rating, hom_rating, attendance, late, homework_completed, progress_text, coming_back_next_day')
        .eq('enrollment_id', enrollment.id)
        .in('report_id', reportIds),
      supabase
        .from('class_daily_report_drill_times')
        .select('report_id, drill_id, time_seconds, score')
        .eq('enrollment_id', enrollment.id)
        .in('report_id', reportIds),
      supabase
        .from('class_drills')
        .select('id, name, type, par_time_seconds, target_score')
        .eq('class_id', req.params.classId)
        .eq('active', true),
    ])

    if (progressResult.error) throw progressResult.error
    if (drillTimesResult.error) throw drillTimesResult.error
    if (drillsResult.error) throw drillsResult.error

    // Build lookup maps
    const progressMap = new Map<string, Record<string, unknown>>()
    for (const p of progressResult.data ?? []) {
      progressMap.set((p as { report_id: string }).report_id, p as Record<string, unknown>)
    }

    const drillTimesMap = new Map<string, Array<Record<string, unknown>>>()
    for (const dt of drillTimesResult.data ?? []) {
      const rid = (dt as { report_id: string }).report_id
      if (!drillTimesMap.has(rid)) drillTimesMap.set(rid, [])
      drillTimesMap.get(rid)!.push(dt as Record<string, unknown>)
    }

    const drillLookup = new Map<string, Record<string, unknown>>()
    for (const d of drillsResult.data ?? []) {
      drillLookup.set((d as { id: string }).id, d as Record<string, unknown>)
    }

    const result = reports.map((r: Record<string, unknown>) => {
      const rid = r.id as string
      const reportDate = r.report_date as string
      const progress = progressMap.get(rid) ?? null
      const rawDrillTimes = drillTimesMap.get(rid) ?? []
      const myDrillTimes = rawDrillTimes.map(dt => {
        const drill = drillLookup.get(dt.drill_id as string)
        return {
          drill_id: dt.drill_id,
          drill_name: drill ? (drill.name as string) : 'Unknown',
          drill_type: drill ? (drill.type as string) : 'drill',
          time_seconds: dt.time_seconds,
          score: dt.score,
          par_time_seconds: drill ? (drill.par_time_seconds as number | null) : null,
          target_score: drill ? (drill.target_score as number | null) : null,
        }
      })

      return {
        report_id: rid,
        report_date: reportDate,
        session_label: r.session_label,
        group_label: r.group_label,
        game: r.game,
        class_start_time: r.class_start_time,
        class_end_time: r.class_end_time,
        is_today: reportDate === today,
        my_progress: progress ? {
          gk_rating: progress.gk_rating,
          dex_rating: progress.dex_rating,
          hom_rating: progress.hom_rating,
          attendance: progress.attendance ?? false,
          late: progress.late ?? false,
          homework_completed: progress.homework_completed ?? false,
          progress_text: progress.progress_text ?? null,
          coming_back_next_day: progress.coming_back_next_day ?? null,
        } : null,
        my_drill_times: myDrillTimes,
        drills: (drillsResult.data ?? []).map((d: Record<string, unknown>) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          par_time_seconds: d.par_time_seconds,
          target_score: d.target_score,
        })),
      }
    })

    res.json(result)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /me/my-class/:classId/reports/:reportId/sign-in
 * Auth: enrolled student
 * Marks the student as present for the given report. Creates the progress row
 * if it doesn't exist yet (with other fields defaulted to null/false).
 * Automatically determines if the student is late by comparing current time
 * to the report's class_start_time.
 */
selfServiceRouter.post('/me/my-class/:classId/reports/:reportId/sign-in', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enrollment = await validateStudentAccess(req.userEmail!, req.params.classId as string)
    if (!enrollment) {
      res.status(403).json({ error: 'You are not enrolled in this class.' })
      return
    }

    const reportId = req.params.reportId

    // Verify the report belongs to this class — also fetch class_start_time, report_date, and province for late check
    const { data: report, error: reportError } = await supabase
      .from('class_daily_reports')
      .select('id, class_start_time, report_date, classes!class_daily_reports_class_id_fkey(province)')
      .eq('id', reportId)
      .eq('class_id', req.params.classId as string)
      .single()
    if (reportError || !report) {
      res.status(404).json({ error: 'Report not found in this class.' })
      return
    }

    // Determine if the student is late: compare current time in the class's
    // province timezone to the scheduled class_start_time.
    // Province → IANA timezone mapping:
    //   BC → America/Vancouver (Pacific)
    //   AB → America/Edmonton (Mountain)
    //   ON → America/Toronto (Eastern)
    const PROVINCE_TZ: Record<string, string> = {
      BC: 'America/Vancouver',
      AB: 'America/Edmonton',
      ON: 'America/Toronto',
    }

    let isLate = false
    const reportRow = report as Record<string, unknown>
    const classStartTime = reportRow.class_start_time as string | null
    const reportDate = reportRow.report_date as string | null
    const classInfo = reportRow.classes as { province: string } | null
    const province = classInfo?.province ?? null

    if (classStartTime && reportDate) {
      try {
        const tz = (province && PROVINCE_TZ[province]) || 'America/Vancouver'
        // Get current time in the class's timezone as HH:MM
        const nowInTz = new Date().toLocaleTimeString('en-CA', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' })
        // Also check the date in that timezone to handle midnight edge cases
        const todayInTz = new Date().toLocaleDateString('en-CA', { timeZone: tz })
        // Only mark late if the report is for today in the class's timezone
        if (todayInTz === reportDate) {
          isLate = nowInTz > classStartTime
        }
        // If the report date is in the past, the student is definitely late
        if (todayInTz > reportDate) {
          isLate = true
        }
      } catch {
        // If timezone calculation fails, don't mark as late
      }
    }

    // Check if a progress row already exists
    const { data: existing } = await supabase
      .from('class_daily_report_trainee_progress')
      .select('*')
      .eq('report_id', reportId)
      .eq('enrollment_id', enrollment.id)
      .maybeSingle()

    if (existing) {
      // Update existing row
      const { data: updatedProgress, error: updateError } = await supabase
        .from('class_daily_report_trainee_progress')
        .update({ attendance: true, late: isLate })
        .eq('id', existing.id)
        .select()
        .single()
      if (updateError) throw updateError
      await logAudit({
        userId: req.userId!,
        action: 'UPDATE',
        tableName: 'class_daily_report_trainee_progress',
        recordId: existing.id as string,
        before: existing as Record<string, unknown>,
        after: updatedProgress as Record<string, unknown>,
        metadata: { class_id: req.params.classId, report_id: reportId, action: 'student_sign_in' },
        ipAddress: req.ip,
      })
    } else {
      // Insert new row with attendance = true, other fields null/default
      const { data: newProgress, error: insertError } = await supabase
        .from('class_daily_report_trainee_progress')
        .insert({
          report_id: reportId,
          enrollment_id: enrollment.id,
          attendance: true,
          late: isLate,
          homework_completed: false,
        })
        .select()
        .single()
      if (insertError) throw insertError
      await logAudit({
        userId: req.userId!,
        action: 'CREATE',
        tableName: 'class_daily_report_trainee_progress',
        recordId: newProgress.id as string,
        after: newProgress as Record<string, unknown>,
        metadata: { class_id: req.params.classId, report_id: reportId, action: 'student_sign_in' },
        ipAddress: req.ip,
      })
    }

    res.json({ signed_in: true, late: isLate })
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /me/my-class/:classId/reports/:reportId/my-progress
 * Auth: enrolled student
 * Partial upsert of the student's own progress row and drill times.
 * Only updates fields that are provided in the request body.
 */
selfServiceRouter.patch('/me/my-class/:classId/reports/:reportId/my-progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enrollment = await validateStudentAccess(req.userEmail!, req.params.classId as string)
    if (!enrollment) {
      res.status(403).json({ error: 'You are not enrolled in this class.' })
      return
    }
    const body = validateBody(studentMyProgressBodySchema, req, res)
    if (!body) return

    const reportId = req.params.reportId

    // Verify the report belongs to this class
    const { data: report, error: reportError } = await supabase
      .from('class_daily_reports')
      .select('id')
      .eq('id', reportId)
      .eq('class_id', req.params.classId)
      .single()
    if (reportError || !report) {
      res.status(404).json({ error: 'Report not found in this class.' })
      return
    }

    const { gk_rating, dex_rating, hom_rating, drill_times } = body

    // Build partial update for progress row
    const progressUpdates: Record<string, unknown> = {}
    if (gk_rating !== undefined) progressUpdates.gk_rating = gk_rating
    if (dex_rating !== undefined) progressUpdates.dex_rating = dex_rating
    if (hom_rating !== undefined) progressUpdates.hom_rating = hom_rating

    // Check if a progress row already exists
    const { data: existing } = await supabase
      .from('class_daily_report_trainee_progress')
      .select('*')
      .eq('report_id', reportId)
      .eq('enrollment_id', enrollment.id)
      .maybeSingle()

    if (existing) {
      if (Object.keys(progressUpdates).length > 0) {
        const { error: updateError } = await supabase
          .from('class_daily_report_trainee_progress')
          .update(progressUpdates)
          .eq('id', existing.id)
        if (updateError) throw updateError
        const { data: afterProgress } = await supabase
          .from('class_daily_report_trainee_progress')
          .select('*')
          .eq('id', existing.id)
          .single()
        await logAudit({
          userId: req.userId!,
          action: 'UPDATE',
          tableName: 'class_daily_report_trainee_progress',
          recordId: existing.id as string,
          before: existing as Record<string, unknown>,
          after: afterProgress as Record<string, unknown>,
          metadata: { class_id: req.params.classId, report_id: reportId, updated_by: 'student' },
          ipAddress: req.ip,
        })
      }
    } else {
      // Insert new row with provided fields
      const { data: newProgress, error: insertError } = await supabase
        .from('class_daily_report_trainee_progress')
        .insert({
          report_id: reportId,
          enrollment_id: enrollment.id,
          attendance: true,
          homework_completed: false,
          ...progressUpdates,
        })
        .select()
        .single()
      if (insertError) throw insertError
      await logAudit({
        userId: req.userId!,
        action: 'CREATE',
        tableName: 'class_daily_report_trainee_progress',
        recordId: newProgress.id as string,
        after: newProgress as Record<string, unknown>,
        metadata: { class_id: req.params.classId, report_id: reportId, created_by: 'student' },
        ipAddress: req.ip,
      })
    }

    // Handle drill times — per-drill upsert
    if (drill_times && drill_times.length > 0) {
      for (const dt of drill_times) {
        const { data: existingDt } = await supabase
          .from('class_daily_report_drill_times')
          .select('id')
          .eq('report_id', reportId)
          .eq('enrollment_id', enrollment.id)
          .eq('drill_id', dt.drill_id)
          .maybeSingle()

        if (existingDt) {
          const dtUpdates: Record<string, unknown> = {}
          if (dt.time_seconds !== undefined) dtUpdates.time_seconds = dt.time_seconds
          if (dt.score !== undefined) dtUpdates.score = dt.score
          if (Object.keys(dtUpdates).length > 0) {
            const { error } = await supabase
              .from('class_daily_report_drill_times')
              .update(dtUpdates)
              .eq('id', existingDt.id)
            if (error) throw error
          }
        } else {
          const { error } = await supabase
            .from('class_daily_report_drill_times')
            .insert({
              report_id: reportId,
              enrollment_id: enrollment.id,
              drill_id: dt.drill_id,
              time_seconds: dt.time_seconds ?? null,
              score: dt.score ?? null,
            })
          if (error) throw error
        }
      }
    }

    // Return the updated progress + drill times
    const [progressResult, drillTimesResult] = await Promise.all([
      supabase
        .from('class_daily_report_trainee_progress')
        .select('gk_rating, dex_rating, hom_rating, attendance, late, homework_completed, progress_text')
        .eq('report_id', reportId)
        .eq('enrollment_id', enrollment.id)
        .maybeSingle(),
      supabase
        .from('class_daily_report_drill_times')
        .select('drill_id, time_seconds, score')
        .eq('report_id', reportId)
        .eq('enrollment_id', enrollment.id),
    ])

    res.json({
      progress: progressResult.data ?? null,
      drill_times: drillTimesResult.data ?? [],
    })
  } catch (err) {
    next(err)
  }
})
