import { useEffect, useState } from 'react'
import { api, type AuditAction, type AuditEntry } from '../lib/apiClient'
import { AuditHistoryDrawer } from '../components/AuditHistoryDrawer'
import { useToast } from '../contexts/ToastContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const inputClass = 'bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-tt-blue/60 focus:ring-2 focus:ring-tt-blue/20'

const TABLES = [
  'classes',
  'class_trainers',
  'class_enrollments',
  'class_drills',
  'class_schedule_slots',
  'class_daily_reports',
  'class_daily_report_trainee_progress',
  'class_logged_hours',
  'profiles',
  'role_requests',
  'app_feedback',
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function summary(entry: AuditEntry): string {
  if (entry.metadata?.['batch_action']) return `Batch ${String(entry.metadata['batch_action'])}`
  if (entry.metadata?.['updated_fields']) return `Updated ${String((entry.metadata['updated_fields'] as unknown[]).join(', '))}`
  if (entry.metadata?.['action']) return String(entry.metadata['action'])
  return entry.recordId
}

export function AuditLogPage() {
  useDocumentTitle('Audit Log')
  const { toast } = useToast()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tableName, setTableName] = useState('')
  const [action, setAction] = useState<AuditAction | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [drawer, setDrawer] = useState<{ tableName: string; recordId: string } | null>(null)

  async function load(cursor?: string | null) {
    setLoading(true)
    try {
      const result = await api.audit.search({
        tableName,
        action,
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
        cursor,
        limit: 50,
      })
      setEntries(prev => cursor ? [...prev, ...result.entries] : result.entries)
      setNextCursor(result.nextCursor)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyFilters() {
    setNextCursor(null)
    load(null)
  }

  return (
    <>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Audit Log</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Immutable mutation history across production records</p>
        </div>
      </header>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-white/[0.06] dark:bg-tt-surface">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <select value={tableName} onChange={event => setTableName(event.target.value)} className={inputClass}>
            <option value="">All tables</option>
            {TABLES.map(table => <option key={table} value={table}>{table}</option>)}
          </select>
          <select value={action} onChange={event => setAction(event.target.value as AuditAction | '')} className={inputClass}>
            <option value="">All actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input type="date" value={from} onChange={event => setFrom(event.target.value)} className={inputClass} />
          <input type="date" value={to} onChange={event => setTo(event.target.value)} className={inputClass} />
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Apply
          </button>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/[0.06] dark:bg-tt-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-white/[0.06] dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Actor</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Table</th>
                <th className="px-4 py-3 font-semibold">Record</th>
                <th className="px-4 py-3 font-semibold">Summary</th>
                <th className="px-4 py-3 text-right font-semibold">View</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-b border-slate-100 dark:border-white/[0.04]">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(entry.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{entry.userEmail ?? entry.userId}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{entry.action}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{entry.tableName}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-slate-500">{entry.recordId}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{summary(entry)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setDrawer({ tableName: entry.tableName, recordId: entry.recordId })}
                      className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.04]"
                    >
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && entries.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">No audit events found.</div>
        )}

        {nextCursor && (
          <div className="border-t border-slate-200 p-4 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => load(nextCursor)}
              disabled={loading}
              className="w-full rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.04]"
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </section>

      {drawer && (
        <AuditHistoryDrawer
          tableName={drawer.tableName}
          recordId={drawer.recordId}
          onClose={() => setDrawer(null)}
        />
      )}
    </>
  )
}
