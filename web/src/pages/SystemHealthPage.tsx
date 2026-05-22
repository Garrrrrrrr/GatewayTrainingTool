import { useEffect, useState } from 'react'
import { api, type SystemHealthResponse } from '../lib/apiClient'
import { SkeletonCard } from '../components/Skeleton'
import { useToast } from '../contexts/ToastContext'

function badgeClass(status: SystemHealthResponse['overall']) {
  if (status === 'ok') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
  if (status === 'warning') return 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300'
  return 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-300'
}

function label(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function SystemHealthPage() {
  const { toast } = useToast()
  const [health, setHealth] = useState<SystemHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadHealth() {
    setLoading(true)
    try {
      setHealth(await api.systemHealth.get())
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHealth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">System Health</h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">Deployment configuration and required table checks</p>
        </div>
        <button
          type="button"
          onClick={loadHealth}
          className="rounded-md bg-white dark:bg-tt-surface text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-tt-elevated transition-colors duration-150"
        >
          Refresh
        </button>
      </header>

      {loading ? (
        <div className="mt-6"><SkeletonCard lines={5} /></div>
      ) : health ? (
        <section className="mt-6 rounded-[10px] border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-tt-surface p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Current Status</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Generated {new Date(health.generated_at).toLocaleString('en-CA')}</p>
            </div>
            <span className={`self-start rounded-md border px-3 py-1.5 text-xs font-semibold ${badgeClass(health.overall)}`}>
              {label(health.overall)}
            </span>
          </div>

          <div className="mt-4 overflow-auto rounded-md border border-slate-200 dark:border-white/10">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Check</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Message</th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-500">Latency</th>
                </tr>
              </thead>
              <tbody>
                {health.checks.map(check => (
                  <tr key={check.name} className="border-b border-slate-100 dark:border-white/[0.03]">
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{check.name}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badgeClass(check.status)}`}>
                        {label(check.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{check.message}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{check.latency_ms != null ? `${check.latency_ms} ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">System health could not be loaded.</p>
      )}
    </>
  )
}
