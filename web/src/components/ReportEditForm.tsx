/**
 * components/ReportEditForm.tsx — Shared daily report edit form
 *
 * Used by both ClassReportsSection (admin) and TrainerReportsSection (trainer).
 * Manages all form state internally. Initializes from the `report` prop on mount
 * and whenever `report` changes. Calls `onSave(body)` on submit.
 *
 * `canDelete` controls whether the Delete button is shown — admins pass true,
 * trainers pass false.
 *
 * Timeline drag-and-drop:
 *   Uses HTML5 drag events with `dragIndexRef` to track which row is being dragged.
 *
 * Hours totals computation:
 *   `computedTotalsForDate(date)` sums all hours in the `hours` prop up to and
 *   including the report date. Override fields take precedence when non-empty.
 */

import { useEffect, useRef, useState } from 'react'
import { CollapsibleSection } from './CollapsibleSection'
import type { ReportBody, ReportWithNested } from '../lib/apiClient'
import type {
  ClassTrainer,
  ClassEnrollment,
  ClassDrill,
  ClassLoggedHours,
  ClassDailyReportTimelineItem,
  ClassDailyReportTraineeProgress,
  ClassDailyReportDrillTime,
  DailyRating,
} from '../types'

interface ReportEditFormProps {
  report: ReportWithNested | null         // null = creating new
  trainers: ClassTrainer[]
  enrollments: ClassEnrollment[]          // enrolled students only
  drills: ClassDrill[]
  hours: ClassLoggedHours[]               // for computing auto-totals
  defaultGame?: string                    // pre-fill game field when creating new
  initialValues?: Partial<ReportBody>     // pre-fill create mode from schedule/import-derived drafts
  autosaveKey?: string                    // localStorage key for unsaved report edits
  onSave: (body: ReportBody) => Promise<void>
  onCancel: () => void
  canDelete: boolean
  onDelete?: () => void
  canEditCoordinatorNotes: boolean
  showDrillTimer?: boolean
}

const fieldClass = 'mt-1 w-full bg-slate-100 dark:bg-gw-elevated border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-gw-blue/40 focus:ring-2 focus:ring-gw-blue/15'
const inlineFieldClass = 'bg-slate-100 dark:bg-gw-elevated border border-slate-200 dark:border-white/10 rounded-md px-1 py-0.5 text-[11px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-gw-blue/40'
const RATINGS: DailyRating[] = ['EE', 'ME', 'AD', 'NI']

interface ReportAutosaveSnapshot {
  savedAt: string
  body: ReportBody
}

function buildProgressRows(
  enrollments: ClassEnrollment[],
  existingRows: ClassDailyReportTraineeProgress[],
  reportId: string,
): ClassDailyReportTraineeProgress[] {
  const existingByEnrollment = new Map(existingRows.map(row => [row.enrollment_id, row]))
  return enrollments.map(enrollment => {
    const existing = existingByEnrollment.get(enrollment.id)
    if (existing) return existing
    return {
      id: crypto.randomUUID(),
      report_id: reportId,
      enrollment_id: enrollment.id,
      progress_text: '',
      gk_rating: null,
      dex_rating: null,
      hom_rating: null,
      coming_back_next_day: true,
      homework_completed: false,
      attendance: true,
      late: false,
      created_at: new Date().toISOString(),
    }
  })
}

function buildTimelineRows(
  rows: ReportBody['timeline'] | undefined,
  reportId: string,
): ClassDailyReportTimelineItem[] {
  return (rows ?? []).map((row, index) => ({
    id: crypto.randomUUID(),
    report_id: reportId,
    start_time: row.start_time ?? '',
    end_time: row.end_time ?? '',
    activity: row.activity ?? '',
    homework_handouts_tests: row.homework_handouts_tests ?? '',
    category: row.category ?? '',
    position: index,
    created_at: new Date().toISOString(),
  }))
}

function buildProgressRowsFromBody(
  rows: ReportBody['progress'] | undefined,
  reportId: string,
): ClassDailyReportTraineeProgress[] {
  return (rows ?? []).map(row => ({
    id: crypto.randomUUID(),
    report_id: reportId,
    enrollment_id: row.enrollment_id,
    progress_text: row.progress_text ?? '',
    gk_rating: row.gk_rating ?? null,
    dex_rating: row.dex_rating ?? null,
    hom_rating: row.hom_rating ?? null,
    coming_back_next_day: row.coming_back_next_day ?? true,
    homework_completed: row.homework_completed ?? false,
    attendance: row.attendance ?? true,
    late: row.late ?? false,
    created_at: new Date().toISOString(),
  }))
}

function buildDrillRowsFromBody(
  rows: ReportBody['drill_times'] | undefined,
  reportId: string,
): ClassDailyReportDrillTime[] {
  return (rows ?? []).map(row => ({
    id: crypto.randomUUID(),
    report_id: reportId,
    enrollment_id: row.enrollment_id,
    drill_id: row.drill_id,
    time_seconds: row.time_seconds ?? null,
    score: row.score ?? null,
    created_at: new Date().toISOString(),
  }))
}

function formatAutosaveTime(savedAt: string): string {
  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return 'unknown time'
  return date.toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatElapsedTime(ms: number): string {
  const totalTenths = Math.max(0, Math.floor(ms / 100))
  const totalSeconds = Math.floor(totalTenths / 10)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const tenths = totalTenths % 10
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
  return `${seconds}.${tenths}s`
}

export function ReportEditForm({
  report, trainers, enrollments, drills, hours, defaultGame = '', initialValues, autosaveKey,
  onSave, onCancel, canDelete, onDelete, canEditCoordinatorNotes, showDrillTimer = false,
}: ReportEditFormProps) {
  // Header fields — stored as strings; converted to numbers on save
  const [reportDate, setReportDate] = useState('')
  const [reportGroup, setReportGroup] = useState('')
  const [reportGame, setReportGame] = useState('')
  const [reportSessionLabel, setReportSessionLabel] = useState('')
  const [reportStartTime, setReportStartTime] = useState('')
  const [reportEndTime, setReportEndTime] = useState('')
  const [mgConfirmed, setMgConfirmed] = useState('')
  const [mgAttended, setMgAttended] = useState('')
  const [currentTrainees, setCurrentTrainees] = useState('')
  const [licensesReceived, setLicensesReceived] = useState('')
  // Override fields — empty string means "use calculated value"
  const [overrideHoursToDate, setOverrideHoursToDate] = useState('')
  const [overridePaidHours, setOverridePaidHours] = useState('')
  const [overrideLiveHours, setOverrideLiveHours] = useState('')
  // Nested data
  const [selectedTrainerIds, setSelectedTrainerIds] = useState<string[]>([])
  const [timelineItems, setTimelineItems] = useState<ClassDailyReportTimelineItem[]>([])
  const [progressRows, setProgressRows] = useState<ClassDailyReportTraineeProgress[]>([])
  const [drillTimeRows, setDrillTimeRows] = useState<ClassDailyReportDrillTime[]>([])
  const [coordinatorNotes, setCoordinatorNotes] = useState(report?.coordinator_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [autosaveDraft, setAutosaveDraft] = useState<ReportAutosaveSnapshot | null>(null)
  const [autosaveReady, setAutosaveReady] = useState(false)
  const [timerEnrollmentId, setTimerEnrollmentId] = useState('')
  const [timerDrillId, setTimerDrillId] = useState('')
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null)
  const [timerElapsedMs, setTimerElapsedMs] = useState(0)
  const [timerScore, setTimerScore] = useState('')
  const dragIndexRef = useRef<number | null>(null)

  function applyBodyToForm(body: Partial<ReportBody>) {
    const reportId = report?.id ?? 'new'
    setReportDate(body.report_date ?? new Date().toISOString().slice(0, 10))
    setReportGroup(body.group_label ?? '')
    setReportGame(body.game ?? defaultGame)
    setReportSessionLabel(body.session_label ?? '')
    setReportStartTime(body.class_start_time ?? '')
    setReportEndTime(body.class_end_time ?? '')
    setMgConfirmed(body.mg_confirmed != null ? String(body.mg_confirmed) : '')
    setMgAttended(body.mg_attended != null ? String(body.mg_attended) : '')
    setCurrentTrainees(body.current_trainees != null ? String(body.current_trainees) : String(enrollments.length))
    setLicensesReceived(body.licenses_received != null ? String(body.licenses_received) : '')
    setOverrideHoursToDate(body.override_hours_to_date != null ? String(body.override_hours_to_date) : '')
    setOverridePaidHours(body.override_paid_hours_total != null ? String(body.override_paid_hours_total) : '')
    setOverrideLiveHours(body.override_live_hours_total != null ? String(body.override_live_hours_total) : '')
    setSelectedTrainerIds(body.trainer_ids ?? [])
    setTimelineItems(buildTimelineRows(body.timeline, reportId))
    setProgressRows(buildProgressRows(enrollments, buildProgressRowsFromBody(body.progress, reportId), reportId))
    setDrillTimeRows(buildDrillRowsFromBody(body.drill_times, reportId))
    setCoordinatorNotes(body.coordinator_notes ?? '')
  }

  // Initialize form from `report` prop (or blank defaults when creating new)
  useEffect(() => {
    setAutosaveReady(false)
    if (report) {
      setReportDate(report.report_date)
      setReportGroup(report.group_label ?? '')
      setReportGame(report.game ?? '')
      setReportSessionLabel(report.session_label ?? '')
      setReportStartTime(report.class_start_time ?? '')
      setReportEndTime(report.class_end_time ?? '')
      setMgConfirmed(report.mg_confirmed != null ? String(report.mg_confirmed) : '')
      setMgAttended(report.mg_attended != null ? String(report.mg_attended) : '')
      setCurrentTrainees(report.current_trainees != null ? String(report.current_trainees) : '')
      setLicensesReceived(report.licenses_received != null ? String(report.licenses_received) : '')
      setOverrideHoursToDate(report.override_hours_to_date != null ? String(report.override_hours_to_date) : '')
      setOverridePaidHours(report.override_paid_hours_total != null ? String(report.override_paid_hours_total) : '')
      setOverrideLiveHours(report.override_live_hours_total != null ? String(report.override_live_hours_total) : '')
      setSelectedTrainerIds(report.trainer_ids)
      setTimelineItems(report.timeline)
      setProgressRows(buildProgressRows(enrollments, report.progress, report.id))
      setDrillTimeRows(report.drill_times)
      setCoordinatorNotes(report?.coordinator_notes ?? '')
    } else {
      const draft = initialValues ?? {}
      setReportDate(draft.report_date ?? new Date().toISOString().slice(0, 10))
      setReportGroup(draft.group_label ?? '')
      setReportGame(draft.game ?? defaultGame)
      setReportSessionLabel(draft.session_label ?? '')
      setReportStartTime(draft.class_start_time ?? '')
      setReportEndTime(draft.class_end_time ?? '')
      setMgConfirmed(draft.mg_confirmed != null ? String(draft.mg_confirmed) : '')
      setMgAttended(draft.mg_attended != null ? String(draft.mg_attended) : '')
      setCurrentTrainees(draft.current_trainees != null ? String(draft.current_trainees) : String(enrollments.length))
      setLicensesReceived(draft.licenses_received != null ? String(draft.licenses_received) : '')
      setOverrideHoursToDate(draft.override_hours_to_date != null ? String(draft.override_hours_to_date) : '')
      setOverridePaidHours(draft.override_paid_hours_total != null ? String(draft.override_paid_hours_total) : '')
      setOverrideLiveHours(draft.override_live_hours_total != null ? String(draft.override_live_hours_total) : '')
      setSelectedTrainerIds(draft.trainer_ids ?? [])
      setTimelineItems(buildTimelineRows(draft.timeline, 'new'))
      setProgressRows(buildProgressRows(enrollments, [], 'new'))
      setDrillTimeRows([])
      setCoordinatorNotes(draft.coordinator_notes ?? '')
    }

    let storedDraft: ReportAutosaveSnapshot | null = null
    if (autosaveKey) {
      try {
        const stored = window.localStorage.getItem(autosaveKey)
        if (stored) storedDraft = JSON.parse(stored) as ReportAutosaveSnapshot
      } catch {
        storedDraft = null
      }
    }
    setAutosaveDraft(storedDraft)
    setAutosaveReady(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, initialValues, autosaveKey])

  useEffect(() => {
    setProgressRows(prev => buildProgressRows(enrollments, prev, report?.id ?? 'new'))
  }, [enrollments, report?.id])

  useEffect(() => {
    const timerEnrollmentExists = enrollments.some(enrollment => enrollment.id === timerEnrollmentId)
    if ((!timerEnrollmentId || !timerEnrollmentExists) && enrollments[0]) setTimerEnrollmentId(enrollments[0].id)
    const timerDrillExists = drills.some(drill => drill.active && drill.id === timerDrillId)
    if (!timerDrillId || !timerDrillExists) {
      const firstActiveDrill = drills.find(drill => drill.active)
      if (firstActiveDrill) setTimerDrillId(firstActiveDrill.id)
    }
  }, [drills, enrollments, timerDrillId, timerEnrollmentId])

  useEffect(() => {
    if (timerStartedAt === null) return undefined
    const interval = window.setInterval(() => {
      setTimerElapsedMs(Date.now() - timerStartedAt)
    }, 100)
    return () => window.clearInterval(interval)
  }, [timerStartedAt])

  /** Sums hours in the `hours` prop up to and including `date`. */
  function computedTotalsForDate(date: string) {
    if (!date) return { hoursToDate: 0, paid: 0, live: 0 }
    const relevant = hours.filter(h => h.log_date <= date)
    const hoursToDate = relevant.reduce((sum, h) => sum + h.hours, 0)
    const paid = relevant.filter(h => h.paid).reduce((sum, h) => sum + h.hours, 0)
    const live = relevant.filter(h => h.live_training).reduce((sum, h) => sum + h.hours, 0)
    return { hoursToDate, paid, live }
  }

  const parseIntOrNull = (v: string) => {
    if (!v.trim()) return null
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }

  function buildBody(): ReportBody {
    return {
      report_date: reportDate,
      group_label: reportGroup.trim() || null,
      game: reportGame.trim() || null,
      session_label: reportSessionLabel.trim() || null,
      class_start_time: reportStartTime.trim() || null,
      class_end_time: reportEndTime.trim() || null,
      mg_confirmed: parseIntOrNull(mgConfirmed),
      mg_attended: parseIntOrNull(mgAttended),
      current_trainees: parseIntOrNull(currentTrainees),
      licenses_received: parseIntOrNull(licensesReceived),
      override_hours_to_date: parseIntOrNull(overrideHoursToDate),
      override_paid_hours_total: parseIntOrNull(overridePaidHours),
      override_live_hours_total: parseIntOrNull(overrideLiveHours),
      trainer_ids: selectedTrainerIds,
      timeline: timelineItems.map(item => ({
        start_time: item.start_time,
        end_time: item.end_time,
        activity: item.activity,
        homework_handouts_tests: item.homework_handouts_tests,
        category: item.category,
      })),
      progress: progressRows.map(row => ({
        enrollment_id: row.enrollment_id,
        progress_text: row.progress_text,
        gk_rating: row.gk_rating,
        dex_rating: row.dex_rating,
        hom_rating: row.hom_rating,
        coming_back_next_day: row.coming_back_next_day ?? false,
        homework_completed: row.homework_completed ?? false,
        attendance: row.attendance ?? true,
        late: row.late ?? false,
      })),
      drill_times: drillTimeRows.map(row => ({
        enrollment_id: row.enrollment_id,
        drill_id: row.drill_id,
        time_seconds: row.time_seconds,
        score: row.score,
      })),
      coordinator_notes: canEditCoordinatorNotes ? (coordinatorNotes.trim() || null) : undefined,
    }
  }

  function upsertDrillTime(enrollmentId: string, drill: ClassDrill, value: number) {
    setDrillTimeRows(prev => {
      const existing = prev.find(row => row.enrollment_id === enrollmentId && row.drill_id === drill.id)
      const patch = {
        time_seconds: drill.type === 'drill' ? value : existing?.time_seconds ?? null,
        score: drill.type === 'test' ? value : existing?.score ?? null,
      }
      if (existing) {
        return prev.map(row => row.enrollment_id === enrollmentId && row.drill_id === drill.id ? { ...row, ...patch } : row)
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          report_id: report?.id ?? 'new',
          enrollment_id: enrollmentId,
          drill_id: drill.id,
          ...patch,
          created_at: new Date().toISOString(),
        },
      ]
    })
  }

  function startTimer() {
    setTimerStartedAt(Date.now() - timerElapsedMs)
  }

  function stopTimer() {
    if (timerStartedAt !== null) setTimerElapsedMs(Date.now() - timerStartedAt)
    setTimerStartedAt(null)
  }

  function resetTimer() {
    setTimerStartedAt(null)
    setTimerElapsedMs(0)
  }

  function applyTimerResult() {
    const selectedDrill = drills.find(drill => drill.id === timerDrillId)
    if (!timerEnrollmentId || !selectedDrill || selectedDrill.type !== 'drill') return
    const seconds = Math.round((timerElapsedMs / 1000) * 10) / 10
    upsertDrillTime(timerEnrollmentId, selectedDrill, seconds)
  }

  function applyScoreResult() {
    const selectedDrill = drills.find(drill => drill.id === timerDrillId)
    const score = Number(timerScore)
    if (!timerEnrollmentId || !selectedDrill || selectedDrill.type !== 'test' || timerScore.trim() === '' || Number.isNaN(score)) return
    upsertDrillTime(timerEnrollmentId, selectedDrill, score)
  }

  function restoreAutosaveDraft() {
    if (!autosaveDraft) return
    applyBodyToForm(autosaveDraft.body)
    setAutosaveDraft(null)
  }

  function discardAutosaveDraft() {
    if (autosaveKey) window.localStorage.removeItem(autosaveKey)
    setAutosaveDraft(null)
  }

  useEffect(() => {
    if (!autosaveKey || !autosaveReady || autosaveDraft) return
    const timer = window.setTimeout(() => {
      const snapshot: ReportAutosaveSnapshot = {
        savedAt: new Date().toISOString(),
        body: buildBody(),
      }
      window.localStorage.setItem(autosaveKey, JSON.stringify(snapshot))
    }, 700)
    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autosaveKey,
    autosaveReady,
    autosaveDraft,
    reportDate,
    reportGroup,
    reportGame,
    reportSessionLabel,
    reportStartTime,
    reportEndTime,
    mgConfirmed,
    mgAttended,
    currentTrainees,
    licensesReceived,
    overrideHoursToDate,
    overridePaidHours,
    overrideLiveHours,
    selectedTrainerIds,
    timelineItems,
    progressRows,
    drillTimeRows,
    coordinatorNotes,
  ])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reportDate) return
    setSaving(true)
    try {
      await onSave(buildBody())
      if (autosaveKey) window.localStorage.removeItem(autosaveKey)
    } finally {
      setSaving(false)
    }
  }

  const activeDrills = drills.filter(drill => drill.active)
  const selectedTimerDrill = activeDrills.find(drill => drill.id === timerDrillId) ?? null
  const timerRunning = timerStartedAt !== null

  return (
    <div className="mb-4 bg-slate-100 dark:bg-gw-elevated rounded-[10px] border border-slate-200 dark:border-white/[0.06] p-3 space-y-4 text-xs">
      {autosaveDraft && (
        <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p>
              Unsaved draft from {formatAutosaveTime(autosaveDraft.savedAt)}
              {autosaveDraft.body.report_date ? ` · ${autosaveDraft.body.report_date}` : ''}
              {autosaveDraft.body.group_label ? ` · Group ${autosaveDraft.body.group_label}` : ''}
              {autosaveDraft.body.session_label ? ` · ${autosaveDraft.body.session_label}` : ''}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={restoreAutosaveDraft} className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[11px] font-semibold hover:bg-amber-500/20 transition-colors">
                Restore draft
              </button>
              <button type="button" onClick={discardAutosaveDraft} className="rounded-md bg-white dark:bg-gw-surface border border-slate-200 dark:border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Date
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className={fieldClass} required />
          </label>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Group
            <input type="text" value={reportGroup} onChange={e => setReportGroup(e.target.value)} className={fieldClass} placeholder="e.g. A" />
          </label>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Game
            <input type="text" value={reportGame} onChange={e => setReportGame(e.target.value)} className={fieldClass} placeholder="e.g. Blackjack" />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Session
            <input type="text" value={reportSessionLabel} onChange={e => setReportSessionLabel(e.target.value)} className={fieldClass} placeholder="e.g. Day 4 PM" />
          </label>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Class start time
            <input type="time" value={reportStartTime} onChange={e => setReportStartTime(e.target.value)} className={fieldClass} />
          </label>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Class end time
            <input type="time" value={reportEndTime} onChange={e => setReportEndTime(e.target.value)} className={fieldClass} />
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">M&amp;G confirmed
            <input type="number" min="0" value={mgConfirmed} onChange={e => setMgConfirmed(e.target.value)} className={fieldClass} />
          </label>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">M&amp;G attended
            <input type="number" min="0" value={mgAttended} onChange={e => setMgAttended(e.target.value)} className={fieldClass} />
          </label>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Current trainees
            <input type="number" min="0" value={currentTrainees} onChange={e => setCurrentTrainees(e.target.value)} className={fieldClass} />
          </label>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Licenses received
            <input type="number" min="0" value={licensesReceived} onChange={e => setLicensesReceived(e.target.value)} className={fieldClass} />
          </label>
        </div>

        {/* Trainers for the day */}
        <CollapsibleSection label="Trainers for the day" defaultOpen>
        <div>
          <p className="mb-1 text-[11px] font-semibold text-slate-400 hidden md:block">Trainers for the day</p>
          <div className="flex flex-wrap gap-2">
            {trainers.length === 0 ? (
              <span className="text-[11px] text-slate-500">No trainers assigned yet. Use the Trainers tab first.</span>
            ) : (
              trainers.map(t => {
                const checked = selectedTrainerIds.includes(t.id)
                return (
                  <label key={t.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] cursor-pointer ${checked ? 'border-gw-blue/40 bg-gw-blue/15 text-gw-blue' : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-700 dark:text-slate-300'}`}>
                    <input type="checkbox" checked={checked} onChange={e => { setSelectedTrainerIds(prev => e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id)) }} className="accent-gw-blue" />
                    {t.trainer_name}
                  </label>
                )
              })
            )}
          </div>
        </div>

        </CollapsibleSection>

        {/* Hours totals */}
        <CollapsibleSection label="Hours totals">
        <div className="bg-white dark:bg-gw-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06] p-3">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Hours totals</p>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Calculated from logged hours up to this report date; override fields take precedence.</p>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
            {(() => {
              const totals = computedTotalsForDate(reportDate)
              const hoursToDateDisplay = overrideHoursToDate.trim() !== '' ? Number(overrideHoursToDate) : totals.hoursToDate
              const paidDisplay = overridePaidHours.trim() !== '' ? Number(overridePaidHours) : totals.paid
              const liveDisplay = overrideLiveHours.trim() !== '' ? Number(overrideLiveHours) : totals.live
              return (
                <>
                  <div className="bg-slate-100 dark:bg-gw-elevated rounded-md border border-slate-200 dark:border-white/[0.06] p-2">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">Training hours to date</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{Number.isNaN(hoursToDateDisplay) ? '—' : hoursToDateDisplay.toFixed(2)}</div>
                    <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Calculated: {totals.hoursToDate.toFixed(2)}</div>
                    <label className="mt-2 block text-[10px] text-slate-500 dark:text-slate-400">Override
                      <input type="number" step="0.25" min="0" value={overrideHoursToDate} onChange={e => setOverrideHoursToDate(e.target.value)} className={`${fieldClass} mt-1`} />
                    </label>
                  </div>
                  <div className="bg-slate-100 dark:bg-gw-elevated rounded-md border border-slate-200 dark:border-white/[0.06] p-2">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">Total paid hours</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{Number.isNaN(paidDisplay) ? '—' : paidDisplay.toFixed(2)}</div>
                    <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Calculated: {totals.paid.toFixed(2)}</div>
                    <label className="mt-2 block text-[10px] text-slate-500 dark:text-slate-400">Override
                      <input type="number" step="0.25" min="0" value={overridePaidHours} onChange={e => setOverridePaidHours(e.target.value)} className={`${fieldClass} mt-1`} />
                    </label>
                  </div>
                  <div className="bg-slate-100 dark:bg-gw-elevated rounded-md border border-slate-200 dark:border-white/[0.06] p-2">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">Total live training hours</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{Number.isNaN(liveDisplay) ? '—' : liveDisplay.toFixed(2)}</div>
                    <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Calculated: {totals.live.toFixed(2)}</div>
                    <label className="mt-2 block text-[10px] text-slate-500 dark:text-slate-400">Override
                      <input type="number" step="0.25" min="0" value={overrideLiveHours} onChange={e => setOverrideLiveHours(e.target.value)} className={`${fieldClass} mt-1`} />
                    </label>
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        </CollapsibleSection>

        {/* Timeline items */}
        <CollapsibleSection label="Timeline & Progress" defaultOpen>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-400 hidden md:block">Daily training timeline / trainee progress</p>
            <button type="button" onClick={() => setTimelineItems(prev => [...prev, { id: crypto.randomUUID(), report_id: report?.id ?? 'new', start_time: '', end_time: '', activity: '', homework_handouts_tests: '', category: '', position: prev.length, created_at: new Date().toISOString() }])} className="rounded-md bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
              + Add time block
            </button>
          </div>

          {timelineItems.length === 0 ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">No timeline rows yet. Add blocks like in the spreadsheet.</p>
          ) : (
            <div className="overflow-auto bg-white dark:bg-gw-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06]">
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="px-2 py-1 w-6" />
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Start–end</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Activity</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Homework / handouts / tests</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Category</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {timelineItems.map((item, index) => (
                    <tr key={item.id} draggable onDragStart={() => { dragIndexRef.current = index }} onDragOver={e => e.preventDefault()} onDrop={() => { const from = dragIndexRef.current; if (from === null || from === index) return; setTimelineItems(prev => { const next = [...prev]; const [moved] = next.splice(from, 1); next.splice(index, 0, moved); return next }); dragIndexRef.current = null }} className="border-b border-slate-100 dark:border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-slate-100 dark:bg-gw-elevated transition-colors">
                      <td className="px-2 py-1 cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 select-none">⠿</td>
                      <td className="px-2 py-1">
                        <div className="flex gap-1">
                          <input type="time" value={item.start_time ?? ''} onChange={e => setTimelineItems(prev => prev.map((row, i) => i === index ? { ...row, start_time: e.target.value } : row))} className={`w-20 ${inlineFieldClass}`} />
                          <span className="self-center text-slate-400 dark:text-slate-500">–</span>
                          <input type="time" value={item.end_time ?? ''} onChange={e => setTimelineItems(prev => prev.map((row, i) => i === index ? { ...row, end_time: e.target.value } : row))} className={`w-20 ${inlineFieldClass}`} />
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" value={item.activity ?? ''} onChange={e => setTimelineItems(prev => prev.map((row, i) => i === index ? { ...row, activity: e.target.value } : row))} className={`w-full ${inlineFieldClass}`} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" value={item.homework_handouts_tests ?? ''} onChange={e => setTimelineItems(prev => prev.map((row, i) => i === index ? { ...row, homework_handouts_tests: e.target.value } : row))} className={`w-full ${inlineFieldClass}`} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" value={item.category ?? ''} onChange={e => setTimelineItems(prev => prev.map((row, i) => i === index ? { ...row, category: e.target.value } : row))} className={`w-full ${inlineFieldClass}`} placeholder="Lecture / Dexterity / Game simulation…" />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button type="button" onClick={() => setTimelineItems(prev => prev.filter((_, i) => i !== index))} className="rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 text-[10px] hover:bg-rose-500/15 transition-colors">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        </CollapsibleSection>

        {/* Per-trainee progress */}
        <CollapsibleSection label="Per-trainee progress" defaultOpen>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-400 hidden md:block">Per-trainee progress</p>
            <button type="button" onClick={() => setProgressRows(prev => buildProgressRows(enrollments, prev, report?.id ?? 'new'))} className="rounded-md bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
              Refresh trainee list
            </button>
          </div>

          {progressRows.length === 0 ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">No enrolled trainees in this class yet.</p>
          ) : (
            <div className="overflow-auto bg-white dark:bg-gw-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06]">
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Trainee</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Progress notes</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Ratings (GK / Dex / HoM)</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Attended?</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Late?</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Coming back?</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">HW done?</th>
                  </tr>
                </thead>
                <tbody>
                  {progressRows.map((row, index) => {
                    const enrollment = enrollments.find(e => e.id === row.enrollment_id)
                    const updateRow = (patch: Partial<ClassDailyReportTraineeProgress>) => { setProgressRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r))) }
                    return (
                      <tr key={row.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-gw-elevated transition-colors">
                        <td className="px-2 py-1 align-top">
                          <div className="text-slate-800 dark:text-slate-200">{enrollment?.student_name ?? 'Unknown'}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">{enrollment?.student_email}</div>
                        </td>
                        <td className="px-2 py-1 align-top">
                          <textarea value={row.progress_text ?? ''} onChange={e => updateRow({ progress_text: e.target.value })} rows={3} className={`w-full ${inlineFieldClass}`} />
                        </td>
                        <td className="px-2 py-1 align-top">
                          <div className="flex flex-col gap-1">
                            {(['gk_rating', 'dex_rating', 'hom_rating'] as const).map(field => (
                              <label key={field} className="flex items-center gap-1">
                                <span className="w-8 text-slate-400 dark:text-slate-500">{field === 'gk_rating' ? 'GK' : field === 'dex_rating' ? 'Dex' : 'HoM'}</span>
                                <select value={row[field] ?? ''} onChange={e => updateRow({ [field]: (e.target.value || null) as DailyRating | null })} className={`flex-1 ${inlineFieldClass}`}>
                                  <option value="">—</option>
                                  {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                              </label>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-1 align-top">
                          <label className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 cursor-pointer">
                            <input type="checkbox" checked={row.attendance ?? true} onChange={e => updateRow({ attendance: e.target.checked, ...(e.target.checked ? {} : { late: false }) })} className="accent-gw-blue" />
                            <span>Yes</span>
                          </label>
                        </td>
                        <td className="px-2 py-1 align-top">
                          <label className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 cursor-pointer">
                            <input type="checkbox" checked={row.late ?? false} disabled={!(row.attendance ?? true)} onChange={e => updateRow({ late: e.target.checked })} className="accent-amber-400 disabled:opacity-30" />
                            <span>Yes</span>
                          </label>
                        </td>
                        <td className="px-2 py-1 align-top">
                          <label className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 cursor-pointer">
                            <input type="checkbox" checked={row.coming_back_next_day ?? true} onChange={e => updateRow({ coming_back_next_day: e.target.checked })} className="accent-gw-blue" />
                            <span>Yes</span>
                          </label>
                        </td>
                        <td className="px-2 py-1 align-top">
                          <label className="inline-flex items-center gap-1.5 text-slate-400 cursor-pointer">
                            <input type="checkbox" checked={row.homework_completed ?? false} onChange={e => updateRow({ homework_completed: e.target.checked })} className="accent-gw-blue" />
                            <span>Yes</span>
                          </label>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        </CollapsibleSection>

        {/* Drill / test times */}
        <CollapsibleSection label="Drill & test times">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-400 hidden md:block">Drill &amp; test times</p>
            {activeDrills.length > 0 && enrollments.length > 0 && (
              <button type="button" onClick={() => { setDrillTimeRows(prev => { const rows: ClassDailyReportDrillTime[] = []; for (const enr of enrollments) { for (const drill of activeDrills) { const existing = prev.find(r => r.enrollment_id === enr.id && r.drill_id === drill.id); rows.push(existing ?? { id: crypto.randomUUID(), report_id: report?.id ?? 'new', enrollment_id: enr.id, drill_id: drill.id, time_seconds: null, score: null, created_at: new Date().toISOString() }) } } return rows }) }} className="rounded-md bg-white/[0.06] border border-slate-200 dark:border-white/10 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-white/10 transition-colors">
                Load drills for trainees
              </button>
            )}
          </div>

          {showDrillTimer && activeDrills.length > 0 && enrollments.length > 0 && (
            <div className="rounded-[10px] border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-gw-surface p-3">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">Trainee
                  <select value={timerEnrollmentId} onChange={e => setTimerEnrollmentId(e.target.value)} className={fieldClass}>
                    {enrollments.map(enrollment => (
                      <option key={enrollment.id} value={enrollment.id}>{enrollment.student_name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">Drill or test
                  <select value={timerDrillId} onChange={e => { setTimerDrillId(e.target.value); setTimerScore(''); resetTimer() }} className={fieldClass}>
                    {activeDrills.map(drill => (
                      <option key={drill.id} value={drill.id}>
                        {drill.name} ({drill.type})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="min-w-[220px]">
                  {selectedTimerDrill?.type === 'test' ? (
                    <div className="flex items-end gap-2">
                      <label className="block flex-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">Score
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={timerScore}
                          onChange={e => setTimerScore(e.target.value)}
                          className={fieldClass}
                          placeholder={selectedTimerDrill.target_score != null ? `Target ${selectedTimerDrill.target_score}` : 'Score'}
                        />
                      </label>
                      <button type="button" onClick={applyScoreResult} className="h-8 rounded-md bg-gw-blue px-3 text-[11px] font-semibold text-white hover:bg-gw-blue/90 transition-colors">
                        Apply
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <div className="min-w-[78px] rounded-md border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-gw-elevated px-2 py-1 text-center text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatElapsedTime(timerElapsedMs)}
                      </div>
                      <button type="button" onClick={timerRunning ? stopTimer : startTimer} className="h-8 rounded-md bg-gw-blue px-3 text-[11px] font-semibold text-white hover:bg-gw-blue/90 transition-colors">
                        {timerRunning ? 'Stop' : 'Start'}
                      </button>
                      <button type="button" onClick={resetTimer} className="h-8 rounded-md border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.06] px-3 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                        Reset
                      </button>
                      <button type="button" onClick={applyTimerResult} disabled={timerElapsedMs === 0} className="h-8 rounded-md border border-gw-blue/30 bg-gw-blue/10 px-3 text-[11px] font-semibold text-gw-blue hover:bg-gw-blue/15 disabled:opacity-40 transition-colors">
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeDrills.length === 0 ? (
            <p className="text-[11px] text-slate-500">No active drills or tests defined. Add them in the Drills &amp; tests tab.</p>
          ) : drillTimeRows.length === 0 ? (
            <p className="text-[11px] text-slate-500">Click &quot;Load drills for trainees&quot; to populate the grid.</p>
          ) : (
            <div className="overflow-auto bg-white dark:bg-gw-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06]">
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-500 sticky left-0 bg-white dark:bg-gw-surface">Trainee</th>
                    {activeDrills.map(drill => (
                      <th key={drill.id} className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-500">
                        <div>{drill.name}</div>
                        <div className="font-normal text-[10px] text-slate-500">{drill.type === 'drill' ? `Time (s)${drill.par_time_seconds ? ` · par ${drill.par_time_seconds}` : ''}` : `Score${drill.target_score ? ` · target ${drill.target_score}` : ''}`}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(enr => (
                    <tr key={enr.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-gw-elevated transition-colors">
                      <td className="px-2 py-1 text-slate-800 dark:text-slate-200 whitespace-nowrap sticky left-0 bg-white dark:bg-gw-surface">{enr.student_name}</td>
                      {activeDrills.map(drill => {
                        const row = drillTimeRows.find(r => r.enrollment_id === enr.id && r.drill_id === drill.id)
                        if (!row) return <td key={drill.id} className="px-2 py-1 text-slate-500">—</td>
                        const value = drill.type === 'drill' ? row.time_seconds : row.score
                        return (
                          <td key={drill.id} className="px-2 py-1">
                            <input
                              type="number"
                              step={drill.type === 'drill' ? '0.1' : '1'}
                              min="0"
                              value={value ?? ''}
                              onChange={e => {
                                const v = e.target.value.trim()
                                const num = v === '' ? null : Number(v)
                                setDrillTimeRows(prev => prev.map(r => r.enrollment_id === enr.id && r.drill_id === drill.id ? { ...r, time_seconds: drill.type === 'drill' ? num : r.time_seconds, score: drill.type === 'test' ? num : r.score } : r))
                              }}
                              className={`w-20 rounded-md border px-1 py-0.5 text-[11px] outline-none ${
                                drill.type === 'drill' && row.time_seconds != null && drill.par_time_seconds != null
                                  ? row.time_seconds <= drill.par_time_seconds
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                  : drill.type === 'test' && row.score != null && drill.target_score != null
                                    ? row.score >= drill.target_score
                                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                      : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                    : 'border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-gw-elevated text-slate-800 dark:text-slate-200'
                              }`}
                              placeholder={drill.type === 'drill' ? 'sec' : 'score'}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        </CollapsibleSection>

        {/* Coordinator feedback — editable by coordinator, read-only for trainer */}
        {(canEditCoordinatorNotes || report?.coordinator_notes) && (
          <CollapsibleSection label="Coordinator feedback" defaultOpen={!!(report?.coordinator_notes)}>
            {canEditCoordinatorNotes ? (
              <textarea
                value={coordinatorNotes}
                onChange={e => setCoordinatorNotes(e.target.value)}
                rows={3}
                placeholder="Leave feedback for the trainer…"
                className={fieldClass}
              />
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic border-l-2 border-slate-300 dark:border-white/20 pl-3">
                {report?.coordinator_notes}
              </p>
            )}
          </CollapsibleSection>
        )}

        <div className="flex gap-2">
          {canDelete && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 text-xs font-semibold hover:bg-rose-500/15 transition-colors mr-auto"
            >
              Delete report
            </button>
          )}
          <button type="button" onClick={onCancel} className="rounded-md bg-white dark:bg-gw-surface text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:bg-gw-elevated transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-gw-blue to-gw-teal text-white px-3 py-1.5 text-xs font-semibold hover:brightness-110 transition-all disabled:opacity-60">
            {saving ? 'Saving…' : report ? 'Save changes' : 'Add report'}
          </button>
        </div>
      </form>
    </div>
  )
}
