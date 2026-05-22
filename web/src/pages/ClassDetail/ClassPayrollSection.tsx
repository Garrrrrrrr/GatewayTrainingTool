import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/apiClient'
import type { PayrollRow } from '../../types'
import { PayrollTable } from '../../components/PayrollTable'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonTable } from '../../components/Skeleton'
import { useToast } from '../../contexts/ToastContext'
import { ClassReportsSection } from './ClassReportsSection'

type SubView = 'summary' | 'log'

interface ClassPayrollSectionProps {
  classId: string
  className: string
}

export function ClassPayrollSection({ classId, className }: ClassPayrollSectionProps) {
  const { toast } = useToast()
  const [view, setView] = useState<SubView>('summary')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [trainerRows, setTrainerRows] = useState<PayrollRow[]>([])
  const [studentRows, setStudentRows] = useState<PayrollRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPayroll = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        class_id: classId,
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        limit: 200,
      }
      const [trainers, students] = await Promise.all([
        api.payroll.trainers(params),
        api.payroll.students(params),
      ])
      setTrainerRows(trainers.data)
      setStudentRows(students.data)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [classId, dateFrom, dateTo, toast])

  useEffect(() => { fetchPayroll() }, [fetchPayroll])

  async function handleExportCsv(personType: 'trainer' | 'student') {
    try {
      const params = {
        class_id: classId,
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      }
      if (personType === 'trainer') {
        await api.payroll.trainersCsv(params)
      } else {
        await api.payroll.studentsCsv(params)
      }
      toast('CSV downloaded', 'success')
    } catch {
      toast('Export failed', 'error')
    }
  }

  const inputClass = 'bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15 [color-scheme:dark]'

  return (
    <section className="flex flex-col gap-4">
      {/* Sub-view toggle */}
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-md bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/[0.08] p-0.5">
          <button
            type="button"
            onClick={() => setView('summary')}
            className={`px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
              view === 'summary'
                ? 'bg-tt-blue/20 text-tt-blue border border-tt-blue/30'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 border border-transparent'
            }`}
          >
            Summary
          </button>
          <button
            type="button"
            onClick={() => setView('log')}
            className={`px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
              view === 'log'
                ? 'bg-tt-blue/20 text-tt-blue border border-tt-blue/30'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 border border-transparent'
            }`}
          >
            Log hours
          </button>
        </div>
      </div>

      {view === 'summary' ? (
        <div className="flex flex-col gap-5">
          {/* Date range filter */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">From</span>
              <input type="date" className={inputClass} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">To</span>
              <input type="date" className={inputClass} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </label>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo('') }}
                className="text-xs text-tt-blue hover:text-blue-300 transition-colors underline underline-offset-2 pb-1.5"
              >
                Clear dates
              </button>
            )}
          </div>

          {loading ? (
            <SkeletonTable rows={4} cols={5} />
          ) : (
            <>
              {/* Trainer Hours */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Trainer Hours
                    {trainerRows.length > 0 && <span className="ml-1.5 text-[11px] font-normal text-slate-500">({trainerRows.length})</span>}
                  </h3>
                  {trainerRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleExportCsv('trainer')}
                      className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 px-2.5 py-1 text-[11px] font-medium hover:bg-white/[0.08] transition-colors"
                    >
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                      Export CSV
                    </button>
                  )}
                </div>
                {trainerRows.length === 0 ? (
                  <div className="bg-white dark:bg-tt-surface rounded-[10px]">
                    <EmptyState title="No trainer hours" description="Hours appear here once logged for trainers in this class." variant="neutral" />
                  </div>
                ) : (
                  <PayrollTable rows={trainerRows} personLabel="Trainer" hideClassCount />
                )}
              </div>

              {/* Student Hours */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Student Hours
                    {studentRows.length > 0 && <span className="ml-1.5 text-[11px] font-normal text-slate-500">({studentRows.length})</span>}
                  </h3>
                  {studentRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleExportCsv('student')}
                      className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 px-2.5 py-1 text-[11px] font-medium hover:bg-white/[0.08] transition-colors"
                    >
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                      Export CSV
                    </button>
                  )}
                </div>
                {studentRows.length === 0 ? (
                  <div className="bg-white dark:bg-tt-surface rounded-[10px]">
                    <EmptyState title="No student hours" description="Hours appear here once logged for students in this class." variant="neutral" />
                  </div>
                ) : (
                  <PayrollTable rows={studentRows} personLabel="Student" hideClassCount />
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <ClassReportsSection classId={classId} className={className} mode="hours" />
      )}
    </section>
  )
}
