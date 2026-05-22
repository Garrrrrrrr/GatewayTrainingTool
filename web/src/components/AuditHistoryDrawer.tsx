import { useEffect, useState } from 'react'
import { api, type AuditEntry } from '../lib/apiClient'
import { diffRows, formatAuditValue } from '../lib/auditDiff'
import { useToast } from '../contexts/ToastContext'

const actionClass: Record<string, string> = {
  CREATE: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  UPDATE: 'bg-blue-500/15 text-blue-500 border-blue-500/25',
  DELETE: 'bg-rose-500/15 text-rose-500 border-rose-500/25',
  READ: 'bg-slate-500/15 text-slate-500 border-slate-500/25',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function EntryDetails({ entry }: { entry: AuditEntry }) {
  const diffs = diffRows(entry.before, entry.after)
  if (diffs.length === 0) {
    return (
      <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-100 dark:bg-black/20 p-3 text-xs text-slate-700 dark:text-slate-300">
        {JSON.stringify(entry.metadata ?? {}, null, 2)}
      </pre>
    )
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 dark:border-white/[0.06]">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2 font-semibold">Field</th>
            <th className="px-3 py-2 font-semibold">Before</th>
            <th className="px-3 py-2 font-semibold">After</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map(diff => (
            <tr key={diff.field} className="border-t border-slate-100 dark:border-white/[0.04]">
              <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{diff.field}</td>
              <td className="px-3 py-2 whitespace-pre-wrap text-slate-500 dark:text-slate-400">{formatAuditValue(diff.before)}</td>
              <td className="px-3 py-2 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{formatAuditValue(diff.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AuditHistoryDrawer({
  tableName,
  recordId,
  onClose,
}: {
  tableName: string
  recordId: string
  onClose: () => void
}) {
  const { toast } = useToast()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  async function load(cursor?: string | null) {
    setLoading(true)
    try {
      const result = await api.audit.record(tableName, recordId, cursor)
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
  }, [tableName, recordId])

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 dark:bg-black/60" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto bg-white dark:bg-tt-surface shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 dark:border-white/[0.06] bg-white/95 dark:bg-tt-surface/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Audit History</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{tableName} / {recordId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 dark:border-white/10 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]"
          >
            Close
          </button>
        </header>

        <div className="space-y-3 p-5">
          {entries.map(entry => (
            <article key={entry.id} className="rounded-lg border border-slate-200 dark:border-white/[0.06] p-4">
              <button
                type="button"
                onClick={() => setExpanded(current => current === entry.id ? null : entry.id)}
                className="flex w-full items-start justify-between gap-4 text-left"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${actionClass[entry.action] ?? actionClass.READ}`}>
                      {entry.action}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{entry.userEmail ?? entry.userId}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(entry.createdAt)}</p>
                </div>
                <span className="text-xs text-slate-400">{expanded === entry.id ? 'Hide' : 'Details'}</span>
              </button>
              {expanded === entry.id && <EntryDetails entry={entry} />}
            </article>
          ))}

          {!loading && entries.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-white/[0.12] p-8 text-center text-sm text-slate-500">
              No audit events found for this record.
            </div>
          )}

          {nextCursor && (
            <button
              type="button"
              onClick={() => load(nextCursor)}
              disabled={loading}
              className="w-full rounded-md border border-slate-200 dark:border-white/10 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.04] disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}
