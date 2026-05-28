import { Router, Request, Response, NextFunction } from 'express'
import { supabase } from '../lib/supabase'

export const dashboardRouter = Router()

type TodaySlotRow = {
  id: string
  class_id: string
  slot_date: string
  start_time: string
  end_time: string
  group_label: string | null
  trainer_id: string | null
  trainer_ids: string[] | null
  classes: {
    id: string
    name: string
    site: string
    province: string
    game_type: string | null
    archived: boolean
  }
}

type TodayReportRow = {
  id: string
  class_id: string
  report_date: string
  group_label: string | null
}

type TrainerRow = {
  id: string
  trainer_name: string
}

function normalizedGroup(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function reportMatchesSlot(report: TodayReportRow, slot: TodaySlotRow): boolean {
  if (report.class_id !== slot.class_id || report.report_date !== slot.slot_date) return false
  if (!slot.group_label) return true
  return normalizedGroup(report.group_label) === normalizedGroup(slot.group_label)
}

// GET /api/dashboard/operations-today
dashboardRouter.get('/dashboard/operations-today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date().toISOString().split('T')[0]

    const [
      { data: slots, error: slotsError },
      { data: reports, error: reportsError },
      { count: pendingRoleRequests, error: roleRequestsError },
    ] = await Promise.all([
      supabase
        .from('class_schedule_slots')
        .select('id, class_id, slot_date, start_time, end_time, group_label, trainer_id, trainer_ids, classes!inner(id, name, site, province, game_type, archived)')
        .eq('slot_date', today)
        .eq('classes.archived', false)
        .order('start_time', { ascending: true }),
      supabase
        .from('class_daily_reports')
        .select('id, class_id, report_date, group_label')
        .eq('report_date', today),
      supabase
        .from('role_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ])

    if (slotsError) throw slotsError
    if (reportsError) throw reportsError
    if (roleRequestsError) throw roleRequestsError

    const slotRows = (slots ?? []) as unknown as TodaySlotRow[]
    const reportRows = (reports ?? []) as TodayReportRow[]
    const trainerIds = [
      ...new Set(
        slotRows.flatMap(slot => {
          const ids = slot.trainer_ids && slot.trainer_ids.length > 0
            ? slot.trainer_ids
            : slot.trainer_id
              ? [slot.trainer_id]
              : []
          return ids.filter(Boolean)
        }),
      ),
    ]

    const trainerNames = new Map<string, string>()
    if (trainerIds.length > 0) {
      const { data: trainers, error: trainersError } = await supabase
        .from('class_trainers')
        .select('id, trainer_name')
        .in('id', trainerIds)
      if (trainersError) throw trainersError
      for (const trainer of (trainers ?? []) as TrainerRow[]) {
        trainerNames.set(trainer.id, trainer.trainer_name)
      }
    }

    const sessions = slotRows.map(slot => {
      const assignedTrainerIds = slot.trainer_ids && slot.trainer_ids.length > 0
        ? slot.trainer_ids
        : slot.trainer_id
          ? [slot.trainer_id]
          : []
      const matchingReport = reportRows.find(report => reportMatchesSlot(report, slot)) ?? null

      return {
        id: slot.id,
        class_id: slot.class_id,
        class_name: slot.classes.name,
        site: slot.classes.site,
        province: slot.classes.province,
        game_type: slot.classes.game_type,
        slot_date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        group_label: slot.group_label,
        trainer_count: assignedTrainerIds.length,
        trainer_names: assignedTrainerIds.map(id => trainerNames.get(id)).filter(Boolean),
        coverage_status: assignedTrainerIds.length > 0 ? 'covered' : 'unassigned',
        report_status: matchingReport ? 'ready' : 'missing',
        report_id: matchingReport?.id ?? null,
      }
    })

    res.json({
      date: today,
      generated_at: new Date().toISOString(),
      summary: {
        total_sessions: sessions.length,
        missing_reports: sessions.filter(session => session.report_status === 'missing').length,
        coverage_gaps: sessions.filter(session => session.coverage_status === 'unassigned').length,
        pending_role_requests: pendingRoleRequests ?? 0,
      },
      sessions,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/dashboard/hours-summary
dashboardRouter.get('/dashboard/hours-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const { data, error } = await supabase
      .from('class_logged_hours')
      .select('hours, trainer_id')
      .eq('person_type', 'trainer')
      .gte('log_date', monthStart)

    if (error) throw error
    const rows = data ?? []
    const totalHours = rows.reduce((sum, r) => sum + (r.hours ?? 0), 0)
    const trainerIds = new Set(rows.map(r => r.trainer_id).filter(Boolean))
    res.json({
      total_hours: Math.round(totalHours * 100) / 100,
      trainer_count: trainerIds.size,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/dashboard/enrollment-summary
dashboardRouter.get('/dashboard/enrollment-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: classes, error: classesError } = await supabase
      .from('classes')
      .select('id')
      .eq('archived', false)
    if (classesError) throw classesError
    const classIds = (classes ?? []).map(c => c.id)
    if (classIds.length === 0) {
      res.json({ enrolled: 0, failed: 0, dropped: 0 })
      return
    }

    const { data, error } = await supabase
      .from('class_enrollments')
      .select('status')
      .in('class_id', classIds)
      .in('status', ['enrolled', 'failed', 'dropped'])

    if (error) throw error
    const rows = data ?? []
    const enrolled = rows.filter(r => r.status === 'enrolled').length
    const failed = rows.filter(r => r.status === 'failed').length
    const dropped = rows.filter(r => r.status === 'dropped').length
    res.json({ enrolled, failed, dropped })
  } catch (err) {
    next(err)
  }
})

// GET /api/dashboard/attendance-rate
dashboardRouter.get('/dashboard/attendance-rate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const { data: reports, error: reportsError } = await supabase
      .from('class_daily_reports')
      .select('id')
      .gte('report_date', monthStart)
    if (reportsError) throw reportsError
    const reportIds = (reports ?? []).map(r => r.id)
    if (reportIds.length === 0) {
      res.json({ rate: null })
      return
    }

    const { data: progress, error } = await supabase
      .from('class_daily_report_trainee_progress')
      .select('attendance')
      .in('report_id', reportIds)

    if (error) throw error
    const rows = progress ?? []
    if (rows.length === 0) {
      res.json({ rate: null })
      return
    }
    const attended = rows.filter(r => r.attendance === true).length
    const rate = Math.round((attended / rows.length) * 100)
    res.json({ rate })
  } catch (err) {
    next(err)
  }
})

// GET /api/dashboard/class-attendance-rates — per-class attendance rates for active classes
dashboardRouter.get('/dashboard/class-attendance-rates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: classes } = await supabase.from('classes').select('id').eq('archived', false)
    const classIds = (classes ?? []).map(c => c.id)
    if (classIds.length === 0) {
      res.json({ rates: {} })
      return
    }

    const { data: reports } = await supabase
      .from('class_daily_reports')
      .select('id, class_id')
      .in('class_id', classIds)

    const reportIds = (reports ?? []).map(r => r.id)
    if (reportIds.length === 0) {
      res.json({ rates: {} })
      return
    }

    const reportToClass = new Map<string, string>()
    for (const r of reports ?? []) {
      reportToClass.set(r.id, r.class_id)
    }

    const { data: progress } = await supabase
      .from('class_daily_report_trainee_progress')
      .select('report_id, attendance')
      .in('report_id', reportIds)

    const classTotals = new Map<string, { total: number; attended: number }>()
    for (const p of progress ?? []) {
      const cid = reportToClass.get(p.report_id)
      if (!cid) continue
      const entry = classTotals.get(cid) ?? { total: 0, attended: 0 }
      entry.total++
      if (p.attendance) entry.attended++
      classTotals.set(cid, entry)
    }

    const rates: Record<string, number> = {}
    for (const [cid, { total, attended }] of classTotals) {
      rates[cid] = total > 0 ? Math.round((attended / total) * 100) : 0
    }
    res.json({ rates })
  } catch (err) {
    next(err)
  }
})

// GET /api/dashboard/unreported-sessions
dashboardRouter.get('/dashboard/unreported-sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data: slots, error: slotsError } = await supabase
      .from('class_schedule_slots')
      .select('class_id, classes!inner(name)')
      .eq('slot_date', today)

    if (slotsError) throw slotsError

    const { data: reports, error: reportsError } = await supabase
      .from('class_daily_reports')
      .select('class_id')
      .eq('report_date', today)

    if (reportsError) throw reportsError

    const reportedClassIds = new Set((reports ?? []).map(r => r.class_id))
    const slotRows = slots ?? []

    const unreported = new Map<string, string>()
    for (const slot of slotRows) {
      if (!reportedClassIds.has(slot.class_id)) {
        const cls = slot.classes as unknown as { name: string }
        unreported.set(slot.class_id, cls.name)
      }
    }

    res.json({
      classes: [...unreported.entries()].map(([class_id, class_name]) => ({
        class_id,
        class_name,
        session_date: today,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/dashboard/activity?limit=N
dashboardRouter.get('/dashboard/activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)

    const [
      { data: recentReports, error: reportsErr },
      { data: recentEnrollments, error: enrollmentsErr },
      { data: recentSlots, error: slotsErr },
      { data: recentClasses, error: classesErr },
    ] = await Promise.all([
      supabase
        .from('class_daily_reports')
        .select('id, report_date, created_at, class_id, classes!inner(name)')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('class_enrollments')
        .select('id, student_name, status, created_at, class_id, classes!inner(name)')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('class_schedule_slots')
        .select('id, slot_date, created_at, class_id, classes!inner(name)')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('classes')
        .select('id, name, archived, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(limit),
    ])

    if (reportsErr) throw reportsErr
    if (enrollmentsErr) throw enrollmentsErr
    if (slotsErr) throw slotsErr
    if (classesErr) throw classesErr

    type ActivityItem = { type: string; description: string; timestamp: string; link_to: string }
    const items: ActivityItem[] = []

    for (const r of recentReports ?? []) {
      const cls = r.classes as unknown as { name: string }
      items.push({
        type: 'report',
        description: `Report filed for ${cls.name} (${r.report_date})`,
        timestamp: r.created_at,
        link_to: `/classes/${encodeURIComponent(cls.name.trim().replace(/\s+/g, '-'))}`,
      })
    }
    for (const e of recentEnrollments ?? []) {
      const cls = e.classes as unknown as { name: string }
      items.push({
        type: 'enrollment',
        description: `${e.student_name} ${e.status} in ${cls.name}`,
        timestamp: e.created_at,
        link_to: `/classes/${encodeURIComponent(cls.name.trim().replace(/\s+/g, '-'))}`,
      })
    }
    for (const s of recentSlots ?? []) {
      const cls = s.classes as unknown as { name: string }
      items.push({
        type: 'schedule',
        description: `Schedule slot added for ${cls.name} on ${s.slot_date}`,
        timestamp: s.created_at,
        link_to: `/classes/${encodeURIComponent(cls.name.trim().replace(/\s+/g, '-'))}`,
      })
    }
    for (const c of recentClasses ?? []) {
      items.push({
        type: 'class',
        description: c.archived ? `${c.name} archived` : `${c.name} created`,
        timestamp: c.updated_at ?? c.created_at,
        link_to: `/classes/${encodeURIComponent(c.name.trim().replace(/\s+/g, '-'))}`,
      })
    }

    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    res.json({ items: items.slice(0, limit) })
  } catch (err) {
    next(err)
  }
})
