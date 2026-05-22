import type { PayrollRow } from '../types'

interface PayrollTableProps {
  rows: PayrollRow[]
  personLabel: string
  hideClassCount?: boolean
}

export function PayrollTable({ rows, personLabel, hideClassCount }: PayrollTableProps) {
  const namePct = hideClassCount ? 'w-[25%]' : 'w-[22%]'
  const emailPct = hideClassCount ? 'w-[25%]' : 'w-[22%]'
  const numPct = hideClassCount ? 'w-[16.6%]' : 'w-[14%]'

  return (
    <div className="bg-white dark:bg-tt-surface rounded-[10px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm table-fixed">
          <colgroup>
            <col className={namePct} />
            <col className={emailPct} />
            <col className={numPct} />
            <col className={numPct} />
            <col className={numPct} />
            {!hideClassCount && <col className={numPct} />}
          </colgroup>
          <thead>
            <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{personLabel} Name</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">Email</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Total Hours</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Paid Hours</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right hidden md:table-cell">Live Hours</th>
              {!hideClassCount && <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right hidden md:table-cell">Classes</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.person_id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-100 dark:bg-tt-elevated transition-colors duration-100">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 truncate">{r.person_name}</td>
                <td className="px-4 py-3 text-slate-400 truncate hidden sm:table-cell">{r.person_email}</td>
                <td className="px-4 py-3 text-slate-800 dark:text-slate-200 text-right font-medium">{r.total_hours}</td>
                <td className="px-4 py-3 text-slate-400 text-right">{r.paid_hours}</td>
                <td className="px-4 py-3 text-slate-400 text-right hidden md:table-cell">{r.live_hours}</td>
                {!hideClassCount && <td className="px-4 py-3 text-slate-400 text-right hidden md:table-cell">{r.class_count}</td>}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 dark:bg-white/[0.02] border-t border-slate-200 dark:border-white/[0.06] font-semibold text-slate-800 dark:text-slate-200">
                <td className="px-4 py-3">Totals</td>
                <td className="hidden sm:table-cell" />
                <td className="px-4 py-3 text-right">{rows.reduce((s, r) => s + r.total_hours, 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">{rows.reduce((s, r) => s + r.paid_hours, 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right hidden md:table-cell">{rows.reduce((s, r) => s + r.live_hours, 0).toFixed(2)}</td>
                {!hideClassCount && <td className="hidden md:table-cell" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
