import type { ReportRow } from '../lib/apiClient'
import type { ReportsSort } from '../hooks/useReportsQuery'
import type { Province } from '../types'

interface ReportsTableProps {
  reports: ReportRow[]
  sort: ReportsSort
  onSort: (column: string) => void
  onReportClick: (report: ReportRow) => void
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
  { key: 'class',            label: 'Class',    sortable: false },
  { key: 'site',             label: 'Site',     sortable: false },
  { key: 'report_date',      label: 'Date',     sortable: true },
  { key: 'group',            label: 'Group',    sortable: false, hideBelow: 'sm' },
  { key: 'game',             label: 'Game',     sortable: true,  hideBelow: 'sm' },
  { key: 'session',          label: 'Session',  sortable: false, hideBelow: 'md' },
  { key: 'current_trainees', label: 'Trainees', sortable: true,  hideBelow: 'md' },
]

function SortArrow({ column, sort }: { column: string; sort: ReportsSort }) {
  if (sort.column !== column) {
    return (
      <svg className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-30 inline" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 2l3 4H3z" /><path d="M6 10l-3-4h6z" />
      </svg>
    )
  }
  return (
    <svg className="w-3 h-3 ml-1 inline text-tt-blue" viewBox="0 0 12 12" fill="currentColor">
      {sort.direction === 'asc' ? <path d="M6 2l3 4H3z" /> : <path d="M6 10l-3-4h6z" />}
    </svg>
  )
}

export function ReportsTable({ reports, sort, onSort, onReportClick }: ReportsTableProps) {
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
            <col className="w-[16%]" />
            <col className="w-[12%]" />
            <col className="w-[11%]" />
            <col className="hidden sm:table-column w-[8%]" />
            <col className="hidden sm:table-column w-[13%]" />
            <col className="hidden md:table-column w-[14%]" />
            <col className="hidden md:table-column w-[8%]" />
          </colgroup>
          <thead>
            <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${hiddenClass(col)} ${col.sortable ? 'cursor-pointer select-none group hover:text-slate-700 dark:hover:text-slate-300 transition-colors' : ''}`}
                  onClick={col.sortable ? () => onSort(col.key) : undefined}
                >
                  {col.label}
                  {col.sortable && <SortArrow column={col.key} sort={sort} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map(r => {
              const province = r.classes.province as Province
              return (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-tt-elevated cursor-pointer transition-colors duration-100"
                  onClick={() => onReportClick(r)}
                >
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 truncate">{r.classes.name}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 truncate">
                    {r.classes.site}
                    {province && (
                      <span className={`ml-1.5 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PROVINCE_BADGE[province] ?? ''}`}>
                        {province}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.report_date}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-slate-500 dark:text-slate-400">{r.group_label ?? '—'}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-slate-500 dark:text-slate-400 truncate">{r.game ?? '—'}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-slate-500 dark:text-slate-400 truncate">{r.session_label ?? '—'}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-slate-500 dark:text-slate-400">{r.current_trainees ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
