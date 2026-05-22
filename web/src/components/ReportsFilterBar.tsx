import type { ReportsFilters } from '../hooks/useReportsQuery'
import type { Class, Province } from '../types'
import { PROVINCES } from '../types'

interface ReportsFilterBarProps {
  filters: ReportsFilters
  setFilter: <K extends keyof ReportsFilters>(key: K, value: ReportsFilters[K]) => void
  resetFilters: () => void
  classes: Class[]
}

const selectClass = 'bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md text-sm pl-3 pr-8 py-1.5 text-slate-800 dark:text-slate-200 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15 appearance-none cursor-pointer [color-scheme:dark]'
const inputClass  = 'bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md text-sm px-3 py-1.5 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15 [color-scheme:dark]'

export function ReportsFilterBar({ filters, setFilter, resetFilters, classes }: ReportsFilterBarProps) {
  const sites = [...new Set(
    classes
      .filter(c => !filters.province || c.province === filters.province)
      .map(c => c.site)
      .filter(Boolean),
  )].sort()

  const gameTypes = [...new Set(
    classes
      .map(c => c.game_type)
      .filter((g): g is string => g !== null && g !== ''),
  )].sort()

  const filteredClasses = classes.filter(c => {
    if (filters.province && c.province !== filters.province) return false
    if (filters.site && c.site !== filters.site) return false
    if (!filters.archived && c.archived) return false
    return true
  })

  const hasActiveFilters =
    filters.province !== '' ||
    filters.site !== '' ||
    filters.class_id !== '' ||
    filters.game_type !== '' ||
    filters.date_from !== '' ||
    filters.date_to !== '' ||
    filters.search !== '' ||
    filters.archived !== false

  return (
    <div className="bg-white dark:bg-tt-surface rounded-[10px] p-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectClass}
          value={filters.province}
          onChange={e => {
            setFilter('province', e.target.value as Province | '')
            if (e.target.value !== filters.province) {
              setFilter('site', '')
              setFilter('class_id', '')
            }
          }}
        >
          <option value="">All provinces</option>
          {PROVINCES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        <select
          className={selectClass}
          value={filters.site}
          onChange={e => {
            setFilter('site', e.target.value)
            if (e.target.value !== filters.site) setFilter('class_id', '')
          }}
        >
          <option value="">All sites</option>
          {sites.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          className={selectClass}
          value={filters.class_id}
          onChange={e => setFilter('class_id', e.target.value)}
        >
          <option value="">All classes</option>
          {filteredClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          className={selectClass}
          value={filters.game_type}
          onChange={e => setFilter('game_type', e.target.value)}
        >
          <option value="">All games</option>
          {gameTypes.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <input
          type="date"
          className={inputClass}
          value={filters.date_from}
          onChange={e => setFilter('date_from', e.target.value)}
        />

        <input
          type="date"
          className={inputClass}
          value={filters.date_to}
          onChange={e => setFilter('date_to', e.target.value)}
        />

        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            className={`${inputClass} pl-8 w-44`}
            placeholder="Search..."
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-tt-blue underline underline-offset-2 hover:text-blue-300 transition-colors px-1"
          >
            Reset
          </button>
        )}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={filters.archived}
          onChange={e => {
            setFilter('archived', e.target.checked)
            setFilter('class_id', '')
          }}
          className="rounded border-white/20 bg-slate-100 dark:bg-tt-elevated text-tt-blue focus:ring-tt-blue/30"
        />
        Include archived classes
      </label>
    </div>
  )
}
