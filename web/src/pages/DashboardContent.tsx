import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useClasses } from '../contexts/ClassesContext'
import { api } from '../lib/apiClient'
import type { ScheduleRow } from '../lib/apiClient'
import { formatTime, classSlug } from '../lib/utils'
import { SkeletonText, SkeletonTable } from '../components/Skeleton'
import { CreateClassModal } from '../components/CreateClassModal'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { Province } from '../types'

const provinceBadge: Record<Province, string> = {
  BC: 'bg-blue-500/15 text-blue-300',
  AB: 'bg-orange-400/15 text-orange-300',
  ON: 'bg-purple-500/15 text-purple-300',
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function dayLabel(dateStr: string, today: string, tomorrow: string): string {
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}

const ACTIVITY_ICONS: Record<string, string> = {
  report: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
  enrollment: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8z',
  schedule: 'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
  class: 'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 17V5a2 2 0 012-2h14a2 2 0 012 2v12a2.5 2.5 0 01-2.5 2.5H4z',
}

const MAX_CLASSES_SHOWN = 5
type HoursSummary = { total_hours: number; trainer_count: number }
type EnrollmentSummary = { enrolled: number; failed: number; dropped: number }
type AttendanceRate = { rate: number | null }
type UnreportedSession = { class_id: string; class_name: string }
type ActivityItem = { type: string; description: string; timestamp: string; link_to: string }
type DashboardSnapshot = {
  upcomingSessions: ScheduleRow[]
  recentReportsTotal: number
  hoursSummary: HoursSummary | null
  enrollmentSummary: EnrollmentSummary | null
  attendanceRate: AttendanceRate | null
  unreportedSessions: UnreportedSession[]
  activityItems: ActivityItem[]
}
const dashboardCache = new Map<string, DashboardSnapshot>()

export function DashboardContent() {
  const { active, loading: classesLoading, refresh: refreshClasses } = useClasses()
  const navigate = useNavigate()
  useDocumentTitle('Dashboard')

  const today = toISODate(new Date())
  const fiveDaysOut = toISODate(new Date(Date.now() + 5 * 86400000))
  const tomorrow = toISODate(new Date(Date.now() + 86400000))
  const initialDashboard = dashboardCache.get(today)

  const [upcomingSessions, setUpcomingSessions] = useState<ScheduleRow[]>(() => initialDashboard?.upcomingSessions ?? [])
  const [sessionsLoading, setSessionsLoading] = useState(() => !initialDashboard)
  const [recentReportsTotal, setRecentReportsTotal] = useState(() => initialDashboard?.recentReportsTotal ?? 0)
  const [reportsLoading, setReportsLoading] = useState(() => !initialDashboard)
  const [createOpen, setCreateOpen] = useState(false)

  // New dashboard data
  const [hoursSummary, setHoursSummary] = useState<HoursSummary | null>(() => initialDashboard?.hoursSummary ?? null)
  const [enrollmentSummary, setEnrollmentSummary] = useState<EnrollmentSummary | null>(() => initialDashboard?.enrollmentSummary ?? null)
  const [attendanceRate, setAttendanceRate] = useState<AttendanceRate | null>(() => initialDashboard?.attendanceRate ?? null)
  const [unreportedSessions, setUnreportedSessions] = useState<UnreportedSession[]>(() => initialDashboard?.unreportedSessions ?? [])
  const [activityItems, setActivityItems] = useState<ActivityItem[]>(() => initialDashboard?.activityItems ?? [])
  const [activityLoading, setActivityLoading] = useState(() => !initialDashboard)

  useEffect(() => {
    let cancelled = false
    const cached = dashboardCache.get(today)
    if (cached) {
      setUpcomingSessions(cached.upcomingSessions)
      setRecentReportsTotal(cached.recentReportsTotal)
      setHoursSummary(cached.hoursSummary)
      setEnrollmentSummary(cached.enrollmentSummary)
      setAttendanceRate(cached.attendanceRate)
      setUnreportedSessions(cached.unreportedSessions)
      setActivityItems(cached.activityItems)
      setSessionsLoading(false)
      setReportsLoading(false)
      setActivityLoading(false)
    } else {
      setSessionsLoading(true)
      setReportsLoading(true)
      setActivityLoading(true)
    }

    const sevenDaysAgo = toISODate(new Date(Date.now() - 7 * 86400000))

    Promise.all([
      api.schedule.listAll({ date_from: today, date_to: fiveDaysOut, limit: 200 }).then(res => res.data).catch(() => []),
      api.reports.listAll({ date_from: sevenDaysAgo, limit: 1 }).then(res => res.total).catch(() => 0),
      api.dashboard.hoursSummary().catch(() => null),
      api.dashboard.enrollmentSummary().catch(() => null),
      api.dashboard.attendanceRate().catch(() => null),
      api.dashboard.unreportedSessions().then(res => res.classes).catch(() => []),
      api.dashboard.activity(10).then(res => res.items).catch(() => []),
    ]).then(([
      nextUpcomingSessions,
      nextRecentReportsTotal,
      nextHoursSummary,
      nextEnrollmentSummary,
      nextAttendanceRate,
      nextUnreportedSessions,
      nextActivityItems,
    ]) => {
      if (cancelled) return
      const snapshot: DashboardSnapshot = {
        upcomingSessions: nextUpcomingSessions,
        recentReportsTotal: nextRecentReportsTotal,
        hoursSummary: nextHoursSummary,
        enrollmentSummary: nextEnrollmentSummary,
        attendanceRate: nextAttendanceRate,
        unreportedSessions: nextUnreportedSessions,
        activityItems: nextActivityItems,
      }
      dashboardCache.set(today, snapshot)
      setUpcomingSessions(snapshot.upcomingSessions)
      setRecentReportsTotal(snapshot.recentReportsTotal)
      setHoursSummary(snapshot.hoursSummary)
      setEnrollmentSummary(snapshot.enrollmentSummary)
      setAttendanceRate(snapshot.attendanceRate)
      setUnreportedSessions(snapshot.unreportedSessions)
      setActivityItems(snapshot.activityItems)
    }).finally(() => {
      if (cancelled) return
      setSessionsLoading(false)
      setReportsLoading(false)
      setActivityLoading(false)
    })

    return () => { cancelled = true }
  }, [today, fiveDaysOut])

  const provinceCounts = active.reduce<Record<string, number>>((acc, c) => {
    acc[c.province] = (acc[c.province] || 0) + 1
    return acc
  }, {})

  const todaySessionCount = useMemo(() =>
    upcomingSessions.filter(s => s.slot_date === today).length,
    [upcomingSessions, today],
  )

  const nextSession = useMemo(() => {
    const todaySessions = upcomingSessions.filter(s => s.slot_date === today)
    return todaySessions.length > 0 ? todaySessions[0] : null
  }, [upcomingSessions, today])

  // Group upcoming sessions by day
  const sessionsByDay = useMemo(() => {
    const groups: Record<string, ScheduleRow[]> = {}
    for (const s of upcomingSessions) {
      ;(groups[s.slot_date] ??= []).push(s)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [upcomingSessions])

  // Classes ending within 7 days (for alerts)
  const classesEndingSoon7d = useMemo(() => {
    const cutoff = toISODate(new Date(Date.now() + 7 * 86400000))
    return active.filter(c => c.end_date >= today && c.end_date <= cutoff)
  }, [active, today])

  // Classes ending within 14 days (for dedicated section)
  const classesEndingSoon14d = useMemo(() => {
    const cutoff = toISODate(new Date(Date.now() + 14 * 86400000))
    return active
      .filter(c => c.end_date >= today && c.end_date <= cutoff)
      .sort((a, b) => a.end_date.localeCompare(b.end_date))
  }, [active, today])

  const displayedClasses = useMemo(() =>
    [...active].sort((a, b) => b.start_date.localeCompare(a.start_date)).slice(0, MAX_CLASSES_SHOWN),
    [active],
  )
  const hiddenCount = Math.max(0, active.length - MAX_CLASSES_SHOWN)

  const hasAlerts = classesEndingSoon7d.length > 0 || unreportedSessions.length > 0

  return (
    <>
      {/* Header with quick actions */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/reports')} className="hidden sm:flex items-center gap-1.5 rounded-md bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-white/[0.08] transition-colors">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6" /></svg>
            Reports
          </button>
          <button type="button" onClick={() => navigate('/schedule')} className="hidden sm:flex items-center gap-1.5 rounded-md bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-white/[0.08] transition-colors">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18" /></svg>
            Schedule
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-gw-blue to-gw-teal text-white font-semibold px-4 py-2 text-sm hover:brightness-110 transition-all duration-150">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            New Class
          </button>
        </div>
      </header>

      {/* Stat cards — 2x3 grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Active classes */}
        <button type="button" onClick={() => navigate('/classes')} className="text-left bg-gradient-to-br from-gw-blue/20 to-gw-teal/20 border border-gw-blue/25 rounded-[10px] p-4 hover:brightness-110 transition-all">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Active classes</p>
          {classesLoading ? <SkeletonText className="h-7 w-16 mt-1" /> : (
            <>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{active.length}</p>
              {Object.keys(provinceCounts).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(provinceCounts).map(([prov, count]) => (
                    <span key={prov} className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${provinceBadge[prov as Province] ?? 'bg-white/10 text-slate-400'}`}>
                      {prov}: {count}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </button>

        {/* Today's sessions */}
        <button type="button" onClick={() => navigate('/schedule')} className="text-left bg-white dark:bg-gw-surface rounded-[10px] p-4 hover:bg-slate-50 dark:hover:bg-gw-elevated transition-colors">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Today's sessions</p>
          {sessionsLoading ? <SkeletonText className="h-7 w-16 mt-1" /> : (
            <>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{todaySessionCount}</p>
              {nextSession && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">Next: {nextSession.classes.name} at {formatTime(nextSession.start_time)}</p>
              )}
            </>
          )}
        </button>

        {/* Reports 7d */}
        <button type="button" onClick={() => navigate('/reports')} className="text-left bg-white dark:bg-gw-surface rounded-[10px] p-4 hover:bg-slate-50 dark:hover:bg-gw-elevated transition-colors">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Reports (7d)</p>
          {reportsLoading ? <SkeletonText className="h-7 w-16 mt-1" /> : (
            <>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{recentReportsTotal}</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">in the last 7 days</p>
            </>
          )}
        </button>

        {/* Hours this month */}
        <div className="text-left bg-white dark:bg-gw-surface rounded-[10px] p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Hours this month</p>
          {!hoursSummary ? <SkeletonText className="h-7 w-16 mt-1" /> : (
            <>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{hoursSummary.total_hours.toFixed(1)}</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{hoursSummary.trainer_count} active trainer{hoursSummary.trainer_count !== 1 ? 's' : ''}</p>
            </>
          )}
        </div>

        {/* Students enrolled */}
        <button type="button" onClick={() => navigate('/students')} className="text-left bg-white dark:bg-gw-surface rounded-[10px] p-4 hover:bg-slate-50 dark:hover:bg-gw-elevated transition-colors">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Students enrolled</p>
          {!enrollmentSummary ? <SkeletonText className="h-7 w-16 mt-1" /> : (
            <>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{enrollmentSummary.enrolled}</p>
              {(enrollmentSummary.failed + enrollmentSummary.dropped) > 0 && (
                <p className="mt-1 text-[11px] text-amber-400">
                  {enrollmentSummary.failed} failed, {enrollmentSummary.dropped} dropped
                </p>
              )}
            </>
          )}
        </button>

        {/* Attendance rate */}
        <div className="bg-white dark:bg-gw-surface rounded-[10px] p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Attendance rate</p>
          {!attendanceRate ? <SkeletonText className="h-7 w-16 mt-1" /> : (
            <>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{attendanceRate.rate !== null ? `${attendanceRate.rate}%` : '—'}</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">this month</p>
            </>
          )}
        </div>
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <section className="rounded-[10px] border border-amber-500/25 bg-amber-500/10 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
            </svg>
            <p className="text-xs font-semibold text-amber-300">Needs attention</p>
          </div>
          {classesEndingSoon7d.length > 0 && (
            <p className="text-xs text-amber-400/80">
              {classesEndingSoon7d.length} class{classesEndingSoon7d.length !== 1 ? 'es' : ''} ending soon:{' '}
              {classesEndingSoon7d.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ', '}
                  <Link to={`/classes/${classSlug(c.name)}`} className="font-medium underline hover:text-amber-200">{c.name}</Link>
                  <span className="text-amber-400/60"> ({c.end_date})</span>
                </span>
              ))}
            </p>
          )}
          {unreportedSessions.length > 0 && (
            <p className="text-xs text-amber-400/80">
              {unreportedSessions.length} session{unreportedSessions.length !== 1 ? 's' : ''} today {unreportedSessions.length !== 1 ? 'have' : 'has'} no report:{' '}
              {unreportedSessions.map((s, i) => (
                <span key={s.class_id}>
                  {i > 0 && ', '}
                  <Link to={`/classes/${classSlug(s.class_name)}`} className="font-medium underline hover:text-amber-200">{s.class_name}</Link>
                </span>
              ))}
            </p>
          )}
        </section>
      )}

      {/* Classes ending soon — progress bars */}
      {!classesLoading && classesEndingSoon14d.length > 0 && (
        <section className="bg-white dark:bg-gw-surface rounded-[10px] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Classes ending soon</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">
            {classesEndingSoon14d.map(cls => {
              const start = new Date(cls.start_date + 'T00:00:00')
              const end = new Date(cls.end_date + 'T00:00:00')
              const now = new Date()
              const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
              const elapsed = Math.max(0, Math.ceil((now.getTime() - start.getTime()) / 86400000))
              const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)))
              return (
                <div key={cls.id} className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-gw-elevated transition-colors" onClick={() => navigate(`/classes/${classSlug(cls.name)}`)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{cls.name}</span>
                      <span className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${provinceBadge[cls.province] ?? 'bg-white/10 text-slate-400'}`}>{cls.province}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-white/[0.06] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-gw-blue to-gw-teal rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">Day {Math.min(elapsed, totalDays)} of {totalDays} ({pct}%)</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">Ends {cls.end_date}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Coming Up + Activity + Active Classes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coming up — 5-day schedule */}
        <section className="lg:col-span-2 bg-white dark:bg-gw-surface rounded-[10px] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Coming up</h3>
          </div>
          {sessionsLoading ? (
            <div className="p-4"><SkeletonTable rows={4} cols={4} /></div>
          ) : sessionsByDay.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">No upcoming sessions in the next 5 days.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
              {sessionsByDay.map(([date, slots]) => (
                <div key={date}>
                  <div className="px-4 py-2 bg-slate-50 dark:bg-white/[0.02]">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{dayLabel(date, today, tomorrow)}</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-2">— {date}</span>
                  </div>
                  {slots.map(slot => (
                    <div key={slot.id} className="px-4 py-2 flex items-center gap-4 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-gw-elevated transition-colors" onClick={() => navigate(`/classes/${classSlug(slot.classes.name)}`)}>
                      <span className="font-medium text-slate-800 dark:text-slate-200 w-1/3 truncate">{slot.classes.name}</span>
                      <span className="text-slate-500 dark:text-slate-400 w-1/4">{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</span>
                      <span className="text-slate-400 dark:text-slate-500 flex-1 truncate">{slot.class_trainers?.trainer_name ?? '—'}</span>
                      <span className="text-slate-400 dark:text-slate-500 shrink-0">{slot.group_label || '—'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right column: Activity feed + Active classes */}
        <div className="flex flex-col gap-4">
          {/* Recent activity */}
          <section className="bg-white dark:bg-gw-surface rounded-[10px] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Recent activity</h3>
            </div>
            {activityLoading ? (
              <div className="p-4 space-y-2">
                {[0,1,2].map(i => <SkeletonText key={i} className="h-4 w-full" />)}
              </div>
            ) : activityItems.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400 dark:text-slate-500">No recent activity.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                {activityItems.map((item, i) => (
                  <li key={i}>
                    <Link to={item.link_to} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-gw-elevated transition-colors">
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" className="text-slate-400 dark:text-slate-500 mt-0.5 shrink-0">
                        <path d={ACTIVITY_ICONS[item.type] ?? ACTIVITY_ICONS.class} />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">{item.description}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{relativeTime(item.timestamp)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Active classes list */}
          <section className="bg-white dark:bg-gw-surface rounded-[10px] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active classes</h3>
              <Link to="/classes" className="text-xs font-medium text-gw-blue hover:text-blue-300 transition-colors">View all</Link>
            </div>
            {classesLoading ? (
              <div className="p-4 space-y-2">
                <SkeletonText className="h-4 w-2/3" />
                <SkeletonText className="h-4 w-1/2" />
                <SkeletonText className="h-4 w-3/4" />
              </div>
            ) : active.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">No active classes.</p>
            ) : (
              <>
                <ul>
                  {displayedClasses.map(cls => (
                    <li key={cls.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.03] cursor-pointer hover:bg-slate-50 dark:hover:bg-gw-elevated transition-colors duration-100" onClick={() => navigate(`/classes/${classSlug(cls.name)}`)}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{cls.name}</span>
                        <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${provinceBadge[cls.province] ?? 'bg-white/10 text-slate-400'}`}>{cls.province}</span>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{cls.start_date}</span>
                    </li>
                  ))}
                </ul>
                {hiddenCount > 0 && (
                  <Link to="/classes" className="block px-4 py-2.5 text-center text-xs font-medium text-gw-blue hover:text-blue-300 transition-colors">
                    and {hiddenCount} more →
                  </Link>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {createOpen && (
        <CreateClassModal
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { setCreateOpen(false); refreshClasses() }}
        />
      )}
    </>
  )
}
