import { useState, useEffect } from 'react'
import { api } from '../lib/apiClient'
import { useTrainer } from '../contexts/TrainerContext'
import { SkeletonTable } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'
import { Pagination } from '../components/Pagination'
import type { TrainerMyHoursResponse } from '../types'

type HoursRow = TrainerMyHoursResponse['data'][0]
type TrainerHoursSnapshot = {
  rows: HoursRow[]
  total: number
  summary: TrainerMyHoursResponse['summary']
}
const trainerHoursCache = new Map<string, TrainerHoursSnapshot>()

function trainerHoursCacheKey(classId: string, from: string, to: string, page: number): string {
  return `${classId}:${from}:${to}:${page}`
}

export function TrainerHoursPage() {
  const { classes } = useTrainer()
  const initialCached = trainerHoursCache.get(trainerHoursCacheKey('', '', '', 0))
  const [rows, setRows] = useState<HoursRow[]>(() => initialCached?.rows ?? [])
  const [total, setTotal] = useState(() => initialCached?.total ?? 0)
  const [summary, setSummary] = useState(() => initialCached?.summary ?? { total_hours: 0, paid_hours: 0, unpaid_hours: 0 })
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(() => !initialCached)

  const [filterClass, setFilterClass] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const limit = 50

  useEffect(() => {
    let cancelled = false
    const key = trainerHoursCacheKey(filterClass, filterFrom, filterTo, page)
    const cached = trainerHoursCache.get(key)
    if (cached) {
      setRows(cached.rows)
      setTotal(cached.total)
      setSummary(cached.summary)
      setLoading(false)
    } else {
      setLoading(true)
    }

    api.selfService.allHours({
      class_id: filterClass || undefined,
      date_from: filterFrom || undefined,
      date_to: filterTo || undefined,
      page,
      limit,
    })
      .then(res => {
        if (cancelled) return
        trainerHoursCache.set(key, {
          rows: res.data,
          total: res.total,
          summary: res.summary,
        })
        setRows(res.data)
        setTotal(res.total)
        setSummary(res.summary)
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
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">My Hours</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Your logged training hours across all classes</p>
      </header>

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total hours', value: `${summary.total_hours}h` },
          { label: 'Paid hours', value: `${summary.paid_hours}h`, accent: true },
          { label: 'Unpaid hours', value: `${summary.unpaid_hours}h` },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-white dark:bg-gw-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06] p-3 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{label}</p>
            <p className={`text-xl font-bold ${accent ? 'text-gw-blue' : 'text-slate-800 dark:text-slate-200'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <select value={filterClass} onChange={e => { setFilterClass(e.target.value); setPage(0) }} className={inputClass}>
          <option value="">All classes</option>
          {classes.map(c => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(0) }} className={inputClass} title="From date" />
        <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(0) }} className={inputClass} title="To date" />
        {(filterClass || filterFrom || filterTo) && (
          <button type="button" onClick={reset} className="h-8 px-3 rounded text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:text-slate-800 dark:hover:text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-white/20 transition-colors">Reset</button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-gw-surface rounded-[10px]">
          <EmptyState title="No hours found" description="No hours entries match your filters." variant="neutral" action={{ label: 'Reset filters', onClick: reset }} />
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gw-surface rounded-[10px] overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Class</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Hours</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden sm:table-cell">Paid</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden sm:table-cell">Live</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden md:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(h => (
                  <tr key={h.id} className="border-b border-slate-100 dark:border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-slate-100 dark:bg-gw-elevated transition-colors">
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200 font-medium">{h.log_date}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{h.classes.name}</td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200 font-semibold">{h.hours}h</td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${h.paid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500'}`}>
                        {h.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{h.live_training ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 text-slate-400 dark:text-slate-500 hidden md:table-cell">{h.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={limit} total={total} onPageChange={setPage} itemLabel="entry" />
        </>
      )}
    </div>
  )
}
