import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type ReportBody, type ReportWithNested } from '../../lib/apiClient'
import { buildCopiedReportDraft } from '../../lib/reportDrafts'
import { useTrainerClassDetail } from '../../contexts/TrainerClassDetailContext'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { ReportPreviewModal } from '../../components/ReportPreviewModal'
import { ReportEditForm, type TimelineCopySource } from '../../components/ReportEditForm'
import { useToast } from '../../contexts/ToastContext'
import type { ClassDailyReport } from '../../types'
import type { ReportPdfArgs } from '../../lib/reportPdf'

function reportTimelineSourceLabel(report: ClassDailyReport) {
  return [
    report.report_date,
    report.group_label ? `Group ${report.group_label}` : null,
    report.session_label,
    report.class_start_time && report.class_end_time ? `${report.class_start_time.slice(0, 5)}-${report.class_end_time.slice(0, 5)}` : null,
  ].filter(Boolean).join(' · ')
}

export function TrainerReportsSection() {
  const {
    classId, classInfo, trainers, reports, enrollments, drills,
    trainerHours, studentHours, loading, refreshReports, setReports,
  } = useTrainerClassDetail()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [editingReport, setEditingReport] = useState<ReportWithNested | null>(null)
  const [initialReportValues, setInitialReportValues] = useState<ReportBody | null>(null)
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null)

  // PDF preview state
  const [previewArgs, setPreviewArgs] = useState<ReportPdfArgs | null>(null)
  const reportCacheRef = useRef<Record<string, ReportWithNested>>({})

  const archived = classInfo?.archived ?? false
  const activeEnr = enrollments.filter(e => e.status === 'enrolled')
  const className = classInfo?.name ?? ''
  const reportAutosaveKey = useMemo(() => {
    const draft = mode === 'create' ? initialReportValues : null
    const date = editingReport?.report_date ?? draft?.report_date ?? 'new'
    const group = editingReport?.group_label ?? draft?.group_label ?? 'all'
    const session = editingReport?.session_label ?? editingReport?.id ?? draft?.session_label ?? mode
    return `daily-report-draft:${classId}:${date}:${group}:${session}`
  }, [classId, editingReport, initialReportValues, mode])
  const timelineCopySources = useMemo<TimelineCopySource[]>(
    () => reports
      .filter(report => report.id !== editingReport?.id)
      .map(report => ({ id: report.id, label: reportTimelineSourceLabel(report) })),
    [editingReport?.id, reports],
  )
  const handledReportActionRef = useRef('')

  const openCreate = useCallback((initialValues: ReportBody | null = null) => {
    setInitialReportValues(initialValues)
    setEditingReport(null)
    setMode('create')
  }, [])

  const openEditById = useCallback(async (reportId: string) => {
    setLoadingReportId(reportId)
    try {
      const full = reportCacheRef.current[reportId] ?? await api.selfService.classReportDetail(classId, reportId)
      reportCacheRef.current[reportId] = full
      setEditingReport(full)
      setInitialReportValues(null)
      setMode('edit')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoadingReportId(null)
    }
  }, [classId, toast])

  const openEdit = useCallback((report: ClassDailyReport) => {
    void openEditById(report.id)
  }, [openEditById])

  const openCopyById = useCallback(async (
    reportId: string,
    options: { reportDate?: string; groupLabel?: string | null; classStartTime?: string | null; classEndTime?: string | null } = {},
  ) => {
    setLoadingReportId(reportId)
    try {
      const full = reportCacheRef.current[reportId] ?? await api.selfService.classReportDetail(classId, reportId)
      reportCacheRef.current[reportId] = full
      openCreate(buildCopiedReportDraft(full, options))
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoadingReportId(null)
    }
  }, [classId, openCreate, toast])

  const clearReportActionParams = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    for (const key of ['editReportId', 'copyReportId', 'newReportDate', 'groupLabel', 'startTime', 'endTime']) {
      next.delete(key)
    }
    next.set('tab', 'reports')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (searchParams.get('tab') !== 'reports') return
    const actionKey = searchParams.toString()
    if (handledReportActionRef.current === actionKey) return

    const editReportId = searchParams.get('editReportId')
    const copyReportId = searchParams.get('copyReportId')
    const newReportDate = searchParams.get('newReportDate')
    if (!editReportId && !copyReportId && !newReportDate) return

    handledReportActionRef.current = actionKey
    const groupLabel = searchParams.has('groupLabel') ? (searchParams.get('groupLabel') || null) : undefined
    const classStartTime = searchParams.has('startTime') ? (searchParams.get('startTime') || null) : undefined
    const classEndTime = searchParams.has('endTime') ? (searchParams.get('endTime') || null) : undefined
    clearReportActionParams()

    if (editReportId) {
      void openEditById(editReportId)
      return
    }

    if (copyReportId) {
      void openCopyById(copyReportId, {
        reportDate: newReportDate ?? undefined,
        groupLabel,
        classStartTime,
        classEndTime,
      })
      return
    }

    if (newReportDate) {
      openCreate({
        report_date: newReportDate,
        group_label: groupLabel ?? null,
        game: classInfo?.game_type ?? null,
        session_label: null,
        class_start_time: classStartTime ?? null,
        class_end_time: classEndTime ?? null,
        trainer_ids: classInfo?.trainer_id ? [classInfo.trainer_id] : [],
        timeline: [],
        progress: [],
        drill_times: [],
      })
    }
  }, [classInfo?.game_type, classInfo?.trainer_id, clearReportActionParams, openCopyById, openCreate, openEditById, searchParams])

  async function handleSaveFromForm(body: ReportBody) {
    try {
      if (mode === 'create') {
        const tempReport: ClassDailyReport = {
          id: `temp-${Date.now()}`,
          class_id: classId,
          report_date: body.report_date,
          group_label: body.group_label ?? null,
          game: body.game ?? null,
          session_label: body.session_label ?? null,
          class_start_time: body.class_start_time ?? null,
          class_end_time: body.class_end_time ?? null,
          mg_confirmed: body.mg_confirmed ?? null,
          mg_attended: body.mg_attended ?? null,
          current_trainees: body.current_trainees ?? null,
          licenses_received: body.licenses_received ?? null,
          override_hours_to_date: body.override_hours_to_date ?? null,
          override_paid_hours_total: body.override_paid_hours_total ?? null,
          override_live_hours_total: body.override_live_hours_total ?? null,
          coordinator_notes: body.coordinator_notes ?? null,
          created_at: new Date().toISOString(),
        }
        setReports(prev => [tempReport, ...prev])
        await api.selfService.createReport(classId, body)
        toast('Report saved', 'success')
        refreshReports()
      } else if (editingReport) {
        await api.selfService.updateReport(classId, editingReport.id, body)
        delete reportCacheRef.current[editingReport.id]
        toast('Report updated', 'success')
        refreshReports()
      }
      setMode('list')
      setEditingReport(null)
      setInitialReportValues(null)
    } catch (err) {
      toast((err as Error).message, 'error')
      refreshReports()
      throw err
    }
  }

  async function handleViewPdf(r: ClassDailyReport) {
    try {
      const full = reportCacheRef.current[r.id] ?? await api.selfService.classReportDetail(classId, r.id)
      reportCacheRef.current[r.id] = full
      setPreviewArgs({
        report: full,
        className,
        trainers,
        enrollments: activeEnr,
        drills,
      })
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  async function handleCopyTimelineFromReport(reportId: string): Promise<ReportBody['timeline']> {
    const full = reportCacheRef.current[reportId] ?? await api.selfService.classReportDetail(classId, reportId)
    reportCacheRef.current[reportId] = full
    return full.timeline.map(item => ({
      start_time: item.start_time,
      end_time: item.end_time,
      activity: item.activity,
      homework_handouts_tests: item.homework_handouts_tests,
      category: item.category,
    }))
  }

  if (mode === 'list') {
    return (
      <>
      <section className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
        <header className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Daily Reports
              {!loading && reports.length > 0 && <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-500">({reports.length})</span>}
            </h3>
          </div>
          {!archived && (
            <button type="button" onClick={() => openCreate()} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white font-semibold px-3 py-1.5 text-xs hover:brightness-110 transition-all duration-150">
              + New report
            </button>
          )}
        </header>

        {loading ? (
          <SkeletonTable rows={4} cols={4} />
        ) : reports.length === 0 ? (
          <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px]">
            <EmptyState title="No reports yet" description="Create the first daily report for this class." variant="neutral" />
          </div>
        ) : (
          <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px] overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">Session</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">Group</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">Game</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white dark:bg-tt-surface transition-colors duration-100">
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">{r.report_date}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{r.session_label ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{r.group_label ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{r.game ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {loadingReportId === r.id ? (
                          <span className="text-slate-500 text-[10px]">Loading…</span>
                        ) : (
                          <>
                            {!archived && (
                              <>
                                <button type="button" onClick={() => openEdit(r)} className="rounded px-2 py-1 text-[11px] font-medium text-tt-blue hover:bg-tt-blue/10 transition-colors">Edit</button>
                                <button type="button" onClick={() => void openCopyById(r.id)} className="rounded px-2 py-1 text-[11px] font-medium text-tt-teal hover:bg-tt-teal/10 transition-colors">Copy</button>
                              </>
                            )}
                            <button type="button" onClick={() => handleViewPdf(r)} className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-white/5 transition-colors">View PDF</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {previewArgs && (
        <ReportPreviewModal
          args={previewArgs}
          onClose={() => setPreviewArgs(null)}
        />
      )}
      </>
    )
  }

  // Form mode (create or edit)
  return (
    <section className="bg-white dark:bg-tt-surface rounded-[10px] p-4 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => { setMode('list'); setEditingReport(null); setInitialReportValues(null) }} className="text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {mode === 'create' ? 'New Report' : 'Edit Report'}
        </h3>
      </div>

      <ReportEditForm
        report={editingReport}
        trainers={trainers}
        enrollments={activeEnr}
        drills={drills}
        hours={[...trainerHours, ...studentHours]}
        defaultGame={classInfo?.game_type ?? ''}
        initialValues={initialReportValues ?? undefined}
        timelineCopySources={timelineCopySources}
        onCopyTimeline={handleCopyTimelineFromReport}
        autosaveKey={reportAutosaveKey}
        onSave={handleSaveFromForm}
        onCancel={() => { setMode('list'); setEditingReport(null); setInitialReportValues(null) }}
        canDelete={false}
        canEditCoordinatorNotes={false}
        showDrillTimer
      />
    </section>
  )
}
