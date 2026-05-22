import { useNavigate } from 'react-router-dom'
import type { ScheduleRow } from '../lib/apiClient'
import type { ScheduleSort } from '../hooks/useScheduleQuery'
import { classSlug, formatTime } from '../lib/utils'
import type { Province } from '../types'

interface ScheduleTableProps {
  slots: ScheduleRow[]
  sort: ScheduleSort
  onSort: (column: string) => void
}

const PROVINCE_BADGE: Record<Province, string> = {
  BC: 'bg-blue-500/15 text-blue-300',
  AB: 'bg-orange-400/15 text-orange-300',
  ON: 'bg-purple-500/15 text-purple-300',
}

type Column = {
  key: string
  label: string
  sortable: boolean
  hideBelow?: 'sm' | 'md'
}

const COLUMNS: Column[] = [
  { key: 'class', label: 'Class', sortable: false },
  { key: 'slot_date', label: 'Date', sortable: true },
  { key: 'start_time', label: 'Time', sortable: true },
  { key: 'trainer', label: 'Trainer', sortable: false, hideBelow: 'sm' },
  { key: 'group', label: 'Group', sortable: false, hideBelow: 'sm' },
  { key: 'notes', label: 'Notes', sortable: false, hideBelow: 'md' },
]

function SortArrow({ column, sort }: { column: string; sort: ScheduleSort }) {
  if (sort.column !== column) {
    return (
      <svg className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-40 inline" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 2l3 4H3z" />
        <path d="M6 10l-3-4h6z" />
      </svg>
    )
  }
  return (
    <svg className="w-3 h-3 ml-1 inline" viewBox="0 0 12 12" fill="currentColor">
      {sort.direction === 'asc'
        ? <path d="M6 2l3 4H3z" />
        : <path d="M6 10l-3-4h6z" />
      }
    </svg>
  )
}

export function ScheduleTable({ slots, sort, onSort }: ScheduleTableProps) {
  const navigate = useNavigate()

  const hiddenClass = (col: Column) => {
    if (col.hideBelow === 'sm') return 'hidden sm:table-cell'
    if (col.hideBelow === 'md') return 'hidden md:table-cell'
    return ''
  }

  return (
    <div className="bg-white dark:bg-tt-surface rounded-[10px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm table-fixed">
          <colgroup>
            <col className="w-[20%]" />   {/* Class */}
            <col className="w-[13%]" />   {/* Date */}
            <col className="w-[17%]" />   {/* Time */}
            <col className="hidden sm:table-column w-[18%]" />  {/* Trainer */}
            <col className="hidden sm:table-column w-[10%]" />  {/* Group */}
            <col className="hidden md:table-column w-[22%]" />  {/* Notes */}
          </colgroup>
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${hiddenClass(col)} ${col.sortable ? 'cursor-pointer select-none group hover:text-slate-700 dark:hover:text-slate-700 dark:text-slate-300 transition-colors' : ''}`}
                  onClick={col.sortable ? () => onSort(col.key) : undefined}
                >
                  {col.label}
                  {col.sortable && <SortArrow column={col.key} sort={sort} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map(s => {
              const province = s.classes.province as Province
              return (
                <tr
                  key={s.id}
                  className="border-b border-slate-100 dark:border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-slate-100 dark:bg-tt-elevated cursor-pointer transition-colors duration-100"
                  onClick={() => navigate(`/classes/${classSlug(s.classes.name)}`)}
                >
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 truncate">
                    {s.classes.name}
                    {province && (
                      <span className={`ml-1.5 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${PROVINCE_BADGE[province] ?? ''}`}>
                        {province}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {new Date(s.slot_date + 'T00:00:00').toLocaleDateString('en-CA', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatTime(s.start_time)} – {formatTime(s.end_time)}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-slate-500 dark:text-slate-400 truncate">
                    {s.class_trainers?.trainer_name ?? '—'}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-slate-500 dark:text-slate-400">{s.group_label ?? '—'}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-slate-400 dark:text-slate-500 truncate">{s.notes ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
