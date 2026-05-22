import { useState, useEffect } from 'react'
import { api } from '../lib/apiClient'
import { useTrainer } from '../contexts/TrainerContext'
import { SkeletonTable } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'
import { Pagination } from '../components/Pagination'
import type { ClassScheduleSlot } from '../types'

type ScheduleRow = ClassScheduleSlot & { classes: { id: string; name: string; site: string; province: string; game_type: string | null; archived: boolean } }
type TrainerScheduleSnapshot = { slots: ScheduleRow[]; total: number }
const trainerScheduleCache = new Map<string, TrainerScheduleSnapshot>()

function trainerScheduleCacheKey(classId: string, from: string, to: string, group: string, page: number): string {
  return `${classId}:${from}:${to}:${group}:${page}`
}

export function TrainerSchedulePage() {
  const { classes } = useTrainer()
  const today = new Date().toISOString().slice(0, 10)
  const initialCached = trainerScheduleCache.get(trainerScheduleCacheKey('', today, '', '', 0))
  const [slots, setSlots] = useState<ScheduleRow[]>(() => initialCached?.slots ?? [])
  const [total, setTotal] = useState(() => initialCached?.total ?? 0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(() => !initialCached)

  const [filterClass, setFilterClass] = useState('')
  const [filterFrom, setFilterFrom] = useState(today)
  const [filterTo, setFilterTo] = useState('')
  const [filterGroup, setFilterGroup] = useState('')

  const limit = 50

  useEffect(() => {
    let cancelled = false
    const key = trainerScheduleCacheKey(filterClass, filterFrom, filterTo, filterGroup, page)
    const cached = trainerScheduleCache.get(key)
    if (cached) {
      setSlots(cached.slots)
      setTotal(cached.total)
      setLoading(false)
    } else {
      setLoading(true)
    }

    api.selfService.allSchedule({
      class_id: filterClass || undefined,
      date_from: filterFrom || undefined,
      date_to: filterTo || undefined,
      group_label: filterGroup || undefined,
      page,
      limit,
    })
      .then(res => {
        if (cancelled) return
        const nextSlots = res.data as ScheduleRow[]
        trainerScheduleCache.set(key, { slots: nextSlots, total: res.total })
        setSlots(nextSlots)
        setTotal(res.total)
      })
      .catch(err => console.error(err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filterClass, filterFrom, filterTo, filterGroup, page])

  function reset() {
    setFilterClass('')
    setFilterFrom(today)
    setFilterTo('')
    setFilterGroup('')
    setPage(0)
  }

  const inputClass = 'h-8 bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/10 rounded px-2.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-tt-blue/40'

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Schedule</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Sessions across all assigned classes</p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <select value={filterClass} onChange={e => { setFilterClass(e.target.value); setPage(0) }} className={inputClass}>
          <option value="">All classes</option>
          {classes.map(c => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(0) }} className={inputClass} title="From date" />
        <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(0) }} className={inputClass} title="To date" />
        <input type="text" value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setPage(0) }} className={inputClass} placeholder="Group label…" />
        {(filterClass || filterTo || filterGroup || filterFrom !== today) && (
          <button type="button" onClick={reset} className="h-8 px-3 rounded text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:text-slate-800 dark:hover:text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-white/20 transition-colors">Reset</button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : slots.length === 0 ? (
        <div className="bg-white dark:bg-tt-surface rounded-[10px]">
          <EmptyState title="No sessions found" description="No schedule slots match your filters." variant="neutral" action={{ label: 'Reset filters', onClick: reset }} />
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-tt-surface rounded-[10px] overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Time</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Class</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden sm:table-cell">Group</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden md:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {slots.map(s => (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-slate-100 dark:bg-tt-elevated transition-colors">
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200 font-medium">{s.slot_date}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{s.start_time}–{s.end_time}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{s.classes.name}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{s.group_label ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-400 dark:text-slate-500 hidden md:table-cell">{s.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={limit} total={total} onPageChange={setPage} itemLabel="session" />
        </>
      )}
    </div>
  )
}
