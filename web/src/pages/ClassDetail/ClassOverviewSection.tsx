import { useMemo } from 'react'
import type { Class } from '../../types'
import { useClassDetail } from '../../contexts/ClassDetailContext'
import { formatTime } from '../../lib/utils'
import { SkeletonText } from '../../components/Skeleton'

interface ClassOverviewSectionProps {
  classData: Class
}

export function ClassOverviewSection({ classData }: ClassOverviewSectionProps) {
  const { trainers, enrollments, schedule, reports, hours, loading } = useClassDetail()

  const enrolledCount = enrollments.filter((e) => e.status === 'enrolled').length

  const today = new Date().toISOString().slice(0, 10)
  const nextSession = useMemo(() =>
    schedule
      .filter((s) => s.slot_date >= today)
      .sort((a, b) =>
        a.slot_date === b.slot_date
          ? a.start_time.localeCompare(b.start_time)
          : a.slot_date.localeCompare(b.slot_date),
      )[0] ?? null,
    [schedule, today],
  )

  const totalHours = hours.reduce((sum, h) => sum + h.hours, 0)

  const startD = new Date(classData.start_date + 'T00:00:00')
  const endD = new Date(classData.end_date + 'T00:00:00')
  const nowD = new Date()
  const totalDays = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / 86400000))
  const elapsedDays = Math.max(0, Math.ceil((nowD.getTime() - startD.getTime()) / 86400000))
  const completionPct = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)))

  return (
    <section className="space-y-4">
      {/* Completion progress */}
      <div className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Class progress</span>
          <span className="text-xs text-slate-500">Day {Math.min(elapsedDays, totalDays)} of {totalDays} ({completionPct}%)</span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-tt-blue to-tt-teal rounded-full transition-all duration-300" style={{ width: `${completionPct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Class details card */}
      <div className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Class details</h3>
        <dl className="space-y-2 text-sm">
          {[
            { label: 'Name',      value: classData.name },
            { label: 'Site',      value: classData.site },
            { label: 'Province',  value: classData.province },
            { label: 'Game type', value: classData.game_type ?? 'Not set' },
            { label: 'Dates',     value: `${classData.start_date} – ${classData.end_date}` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-2">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-xs text-slate-700 dark:text-slate-200 font-medium text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Trainers card */}
      <div className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Trainers</h3>
        {loading ? (
          <div className="space-y-2">
            <SkeletonText className="w-1/2" />
            <SkeletonText className="w-3/4" />
            <SkeletonText className="w-2/3" />
          </div>
        ) : trainers.length === 0 ? (
          <p className="text-xs text-slate-500">No trainers assigned.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-2">
              {trainers.length} trainer{trainers.length !== 1 ? 's' : ''}
            </p>
            <ul className="space-y-1.5">
              {trainers.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-700 dark:text-slate-200">{t.trainer_name}</span>
                  <span
                    className={
                      'inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ' +
                      (t.role === 'primary'
                        ? 'bg-tt-blue/20 text-blue-300'
                        : 'bg-white/[0.06] text-slate-500 dark:text-slate-400')
                    }
                  >
                    {t.role}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Students & schedule card */}
      <div className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Students & schedule</h3>
        {loading ? (
          <div className="space-y-2">
            <SkeletonText className="w-1/2" />
            <SkeletonText className="w-3/4" />
            <SkeletonText className="w-2/3" />
          </div>
        ) : (
          <dl className="space-y-2">
            {[
              { label: 'Enrolled students', value: String(enrolledCount) },
              {
                label: 'Next session',
                value: nextSession
                  ? `${nextSession.slot_date} ${formatTime(nextSession.start_time)} – ${formatTime(nextSession.end_time)}`
                  : 'No upcoming sessions'
              },
              { label: 'Total reports',      value: String(reports.length) },
              { label: 'Total logged hours', value: String(totalHours) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="text-xs text-slate-700 dark:text-slate-200 font-medium text-right">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      </div>
    </section>
  )
}
