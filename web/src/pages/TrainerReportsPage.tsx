import { useState, useEffect } from 'react'
import { api } from '../lib/apiClient'
import { useTrainer } from '../contexts/TrainerContext'
import { SkeletonTable } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'
import { Pagination } from '../components/Pagination'
import type { ClassDailyReport } from '../types'
import type { ReportRowClass } from '../lib/apiClient'

type ReportRow = ClassDailyReport & { classes: ReportRowClass }
type TrainerReportsSnapshot = { reports: ReportRow[]; total: number }
const trainerReportsCache = new Map<string, TrainerReportsSnapshot>()

function trainerReportsCacheKey(classId: string, from: string, to: string, page: number): string {
  return `${classId}:${from}:${to}:${page}`
}

export function TrainerReportsPage() {
  const { classes } = useTrainer()
  const initialCached = trainerReportsCache.get(trainerReportsCacheKey('', '', '', 0))
  const [reports, setReports] = useState<ReportRow[]>(() => initialCached?.reports ?? [])
  const [total, setTotal] = useState(() => initialCached?.total ?? 0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(() => !initialCached)

  const [filterClass, setFilterClass] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const limit = 50

  useEffect(() => {
    let cancelled = false
    const key = trainerReportsCacheKey(filterClass, filterFrom, filterTo, page)
    const cached = trainerReportsCache.get(key)
    if (cached) {
      setReports(cached.reports)
      setTotal(cached.total)
      setLoading(false)
    } else {
      setLoading(true)
    }

    api.selfService.allReports({
      class_id: filterClass || undefined,
      date_from: filterFrom || undefined,
      date_to: filterTo || undefined,
      page,
      limit,
    })
      .then(res => {
        if (cancelled) return
        const nextReports = res.data as ReportRow[]
        trainerReportsCache.set(key, { reports: nextReports, total: res.total })
        setReports(nextReports)
        setTotal(res.total)
      })
      .catch(err => console.error(err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filterClass, filterFrom, filterTo, page])

  function reset() {
    setFilterClass('')
    setFilterFrom('')
    setFilterTo('')
    setPage(0)
  }

  const inputClass = 'h-8 bg-white dark:bg-gw-surface border border-slate-200 dark:border-white/10 rounded px-2.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-gw-blue/40'

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Reports</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Daily reports across all assigned classes</p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <select value={filterClass} onChange={e => { setFilterClass(e.target.value); setPage(0) }} className={inputClass}>
          <option value="">All classes</option>
          {classes.map(c => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(0) }} className={inputClass} title="From date" />
        <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(0) }} className={inputClass} title="To date" />
        {(filterClass || filterFrom || filterTo) && (
          <button type="button" onClick={reset} className="h-8 px-3 rounded text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-white/20 transition-colors">Reset</button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : reports.length === 0 ? (
        <div className="bg-white dark:bg-gw-surface rounded-[10px]">
          <EmptyState title="No reports found" description="No daily reports match your filters." variant="neutral" action={{ label: 'Reset filters', onClick: reset }} />
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gw-surface rounded-[10px] overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Class</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden sm:table-cell">Session</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden sm:table-cell">Group</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden sm:table-cell">Game</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-gw-elevated transition-colors">
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200 font-medium">{r.report_date}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 text-xs">{(r.classes as ReportRowClass).name}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{r.session_label ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{r.group_label ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{r.game ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={limit} total={total} onPageChange={setPage} itemLabel="report" />
        </>
      )}
    </div>
  )
}
