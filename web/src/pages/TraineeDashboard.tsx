/**
 * pages/TraineeDashboard.tsx — Self-service dashboard for trainees
 *
 * Shown when a trainee logs in (dispatched from DashboardView based on role).
 * Fetches GET /me/trainee-progress using the current user's JWT.
 *
 * Displays:
 *   - Welcome header with trainee name
 *   - Enrolled classes with status badges and upcoming schedule
 *   - Progress ratings table (one row per report session)
 *   - Drill & test results grouped by drill name
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { SkeletonCard, SkeletonTable } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'
import type { TraineeDashboardResponse, DailyRating } from '../types'

const RATING_COLOR: Record<DailyRating, string> = {
  EE: 'bg-emerald-500/15 text-emerald-400',
  ME: 'bg-blue-500/15 text-blue-400',
  AD: 'bg-amber-500/15 text-amber-400',
  NI: 'bg-rose-500/15 text-rose-400',
}

function RatingBadge({ rating }: { rating: DailyRating | null }) {
  if (!rating) return <span className="text-slate-400 dark:text-slate-500">—</span>
  return (
    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${RATING_COLOR[rating]}`}>
      {rating}
    </span>
  )
}

export function TraineeDashboard({ email }: { email: string }) {
  const [data, setData] = useState<TraineeDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.selfService
      .traineeDashboard()
      .then(setData)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonCard lines={2} />
        <SkeletonTable rows={5} cols={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-tt-surface rounded-[10px]">
        <EmptyState title="Something went wrong" description={error} variant="neutral" />
      </div>
    )
  }

  const name = data?.student_name ?? email
  const classes = data?.classes ?? []
  const progress = data?.progress ?? []
  const drillTimes = data?.drill_times ?? []

  // Group drill times by drill name
  const drillGroups = new Map<string, typeof drillTimes>()
  for (const dt of drillTimes) {
    if (!drillGroups.has(dt.drill_name)) drillGroups.set(dt.drill_name, [])
    drillGroups.get(dt.drill_name)!.push(dt)
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Welcome back, {name}</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{email}</p>
      </header>

      <section>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Your Classes</h3>
        {classes.length === 0 ? (
          <div className="bg-white dark:bg-tt-surface rounded-[10px]">
            <EmptyState title="No classes" description="You are not enrolled in any classes." variant="neutral" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map(c => (
              <Link key={c.enrollment_id} to={`/my-class/${c.class_id}`} className="rounded-[10px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-tt-surface p-4 flex flex-col gap-3 hover:border-white/[0.15] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{c.class_name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{c.site} · {c.province}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
                    c.status === 'enrolled' ? 'bg-emerald-500/15 text-emerald-400' :
                    c.status === 'failed' ? 'bg-rose-500/15 text-rose-400' :
                    'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400'
                  }`}>
                    {c.status}
                  </span>
                </div>

                {c.game_type && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Game:</span> {c.game_type}
                    {c.group_label && <span className="ml-2 font-medium text-slate-700 dark:text-slate-300">Group:</span>}
                    {c.group_label && <span> {c.group_label}</span>}
                  </p>
                )}

                {c.start_date && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">{c.start_date} → {c.end_date ?? 'TBD'}</p>
                )}

                {c.upcoming_slots.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Upcoming</p>
                    <div className="flex flex-col gap-1">
                      {c.upcoming_slots.map(slot => (
                        <div key={slot.id} className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-tt-elevated rounded px-2 py-1">
                          <span className="font-medium whitespace-nowrap text-slate-700 dark:text-slate-300">{slot.slot_date}</span>
                          <span>{slot.start_time}–{slot.end_time}</span>
                          {slot.group_label && (
                            <span className="ml-auto text-[10px] bg-slate-200 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded px-1 text-slate-400 dark:text-slate-500">
                              Grp {slot.group_label}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
          Progress Ratings
          {progress.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">({progress.length} sessions)</span>
          )}
        </h3>
        {progress.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No progress data recorded yet.</p>
        ) : (
          <div className="bg-white dark:bg-tt-surface rounded-[10px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Date</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden sm:table-cell">Class</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden md:table-cell">Session</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 text-center">GK</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 text-center">DEX</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 text-center">HOM</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 text-center hidden md:table-cell">Attended</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 text-center hidden md:table-cell">HW</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.map((p, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-tt-elevated transition-colors duration-100">
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{p.report_date}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 truncate hidden sm:table-cell">{p.class_name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 truncate hidden md:table-cell">{p.session_label ?? '—'}</td>
                      <td className="px-4 py-3 text-center"><RatingBadge rating={p.gk_rating as DailyRating | null} /></td>
                      <td className="px-4 py-3 text-center"><RatingBadge rating={p.dex_rating as DailyRating | null} /></td>
                      <td className="px-4 py-3 text-center"><RatingBadge rating={p.hom_rating as DailyRating | null} /></td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {p.attendance ? (
                          p.late ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">Late</span>
                          ) : (
                            <svg className="w-4 h-4 text-emerald-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )
                        ) : (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">Absent</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {p.homework_completed ? (
                          <svg className="w-4 h-4 text-emerald-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {drillGroups.size > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Drill & Test Results</h3>
          <div className="flex flex-col gap-3">
            {[...drillGroups.entries()].map(([drillName, times]) => {
              const first = times[0]
              const isDrill = first.drill_type === 'drill'
              return (
                <div key={drillName} className="rounded-[10px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-tt-surface p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{drillName}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isDrill ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400'}`}>
                      {first.drill_type}
                    </span>
                    {isDrill && first.par_time_seconds && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Par: {first.par_time_seconds}s</span>
                    )}
                    {!isDrill && first.target_score && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Target: {first.target_score}</span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-sm">
                      <thead>
                        <tr className="text-xs text-slate-400 dark:text-slate-500">
                          <th className="pr-4 py-1 text-left font-medium">Date</th>
                          <th className="pr-4 py-1 text-left font-medium">Class</th>
                          <th className="pr-4 py-1 text-right font-medium">{isDrill ? 'Time (s)' : 'Score'}</th>
                          <th className="pr-4 py-1 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {times.map((t, i) => {
                          const value = isDrill ? t.time_seconds : t.score
                          const target = isDrill ? t.par_time_seconds : t.target_score
                          const met = value != null && target != null
                            ? (isDrill ? value <= target : value >= target)
                            : null
                          return (
                            <tr key={i} className="border-t border-slate-100 dark:border-white/[0.04]">
                              <td className="pr-4 py-1.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{t.report_date}</td>
                              <td className="pr-4 py-1.5 text-slate-500 dark:text-slate-400">{t.class_name}</td>
                              <td className="pr-4 py-1.5 text-right text-slate-700 dark:text-slate-300 font-medium">{value ?? '—'}</td>
                              <td className="pr-4 py-1.5 text-center">
                                {met === null ? (
                                  <span className="text-slate-400 dark:text-slate-500">—</span>
                                ) : met ? (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">Pass</span>
                                ) : (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">Miss</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
