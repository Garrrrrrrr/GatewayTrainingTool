import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/apiClient'
import { useToast } from '../contexts/ToastContext'
import type { RoleRequest } from '../types'

export function RoleRequestsSection() {
  const { toast } = useToast()
  const [requests, setRequests] = useState<RoleRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)

  const fetch = useCallback(() => {
    setLoading(true)
    api.roleRequests
      .list({ status: 'pending' })
      .then(res => setRequests(res.data))
      .catch(err => toast((err as Error).message, 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => { fetch() }, [fetch])

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActioning(id)
    try {
      if (action === 'approve') {
        await api.roleRequests.approve(id)
        toast('Role request approved', 'success')
      } else {
        await api.roleRequests.reject(id)
        toast('Role request rejected', 'success')
      }
      setRequests(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setActioning(null)
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500 py-4">Loading role requests...</p>
  }

  if (requests.length === 0) {
    return <p className="text-sm text-slate-500 py-4">No pending role requests.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-white/[0.06]">
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Name</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Email</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Requested Role</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Date</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map(r => (
            <tr key={r.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-tt-elevated transition-colors">
              <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{r.user_name ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{r.user_email ?? '—'}</td>
              <td className="px-4 py-2.5">
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 capitalize">
                  {r.requested_role}
                </span>
              </td>
              <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleAction(r.id, 'approve')}
                    disabled={actioning === r.id}
                    className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(r.id, 'reject')}
                    disabled={actioning === r.id}
                    className="rounded-md bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/25 disabled:opacity-40 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
