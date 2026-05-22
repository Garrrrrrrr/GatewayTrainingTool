import { useEffect, useMemo, useState } from 'react'
import { api, type FeedbackCategory, type FeedbackInboxItem, type FeedbackStatus } from '../lib/apiClient'
import { useToast } from '../contexts/ToastContext'

const inputClass = 'w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-tt-blue/60 focus:ring-2 focus:ring-tt-blue/20 dark:focus:border-tt-blue/40 dark:focus:ring-tt-blue/15'

const STATUS_OPTIONS: Array<{ value: FeedbackStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'archived', label: 'Dismissed' },
]

const CATEGORY_OPTIONS: Array<{ value: FeedbackCategory | ''; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'general', label: 'General' },
]

function statusLabel(status: FeedbackStatus) {
  if (status === 'archived') return 'Dismissed'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function FeedbackInboxSection() {
  const { toast } = useToast()
  const [items, setItems] = useState<FeedbackInboxItem[]>([])
  const [status, setStatus] = useState<FeedbackStatus | ''>('new')
  const [category, setCategory] = useState<FeedbackCategory | ''>('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const result = { new: 0, reviewing: 0, resolved: 0, archived: 0 }
    for (const item of items) result[item.status] += 1
    return result
  }, [items])

  async function loadFeedback() {
    setLoading(true)
    try {
      const result = await api.feedback.list({
        status,
        category,
        search: search.trim() || undefined,
        limit: 50,
      })
      setItems(result.data)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(loadFeedback, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category, search])

  async function updateStatus(item: FeedbackInboxItem, nextStatus: FeedbackStatus) {
    setUpdatingId(item.id)
    try {
      const updated = await api.feedback.updateStatus(item.id, nextStatus)
      setItems(prev => prev.map(row => row.id === item.id ? updated : row))
      toast(`Feedback marked ${statusLabel(nextStatus).toLowerCase()}.`, 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(['new', 'reviewing', 'resolved', 'archived'] as FeedbackStatus[]).map(value => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`rounded-md border px-3 py-2 text-left transition-colors ${
              status === value
                ? 'border-tt-blue/35 bg-tt-blue/10 text-tt-blue'
                : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-tt-elevated text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <p className="text-[10px] uppercase tracking-wide">{statusLabel(value)}</p>
            <p className="text-sm font-semibold">{counts[value]}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <select value={status} onChange={e => setStatus(e.target.value as FeedbackStatus | '')} className={inputClass}>
          {STATUS_OPTIONS.map(option => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value as FeedbackCategory | '')} className={inputClass}>
          {CATEGORY_OPTIONS.map(option => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
        </select>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search message, email, or page"
          className={inputClass}
        />
      </div>

      {loading ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading feedback…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No feedback matches these filters.</p>
      ) : (
        <div className="overflow-auto rounded-md border border-slate-200 dark:border-white/10">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Feedback</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">From</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                  <td className="px-2 py-2 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300">{item.category}</span>
                      <span className="text-[11px] text-slate-500">{formatDate(item.created_at)}</span>
                      {item.page && <span className="text-[11px] text-slate-500">{item.page}</span>}
                    </div>
                    <p className="mt-1 max-w-[42rem] whitespace-pre-wrap text-slate-800 dark:text-slate-200">{item.message}</p>
                  </td>
                  <td className="px-2 py-2 align-top text-slate-600 dark:text-slate-300">
                    <p>{item.user_email}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{item.user_role ?? 'unknown role'}</p>
                  </td>
                  <td className="px-2 py-2 align-top text-slate-600 dark:text-slate-300">
                    {statusLabel(item.status)}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {(['reviewing', 'resolved', 'archived'] as FeedbackStatus[]).filter(next => next !== item.status).map(next => (
                        <button
                          key={next}
                          type="button"
                          disabled={updatingId === item.id}
                          onClick={() => updateStatus(item, next)}
                          className="rounded-md bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                          {statusLabel(next)}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
