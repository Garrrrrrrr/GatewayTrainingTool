import { useTrainerClassDetail } from '../../contexts/TrainerClassDetailContext'
import { SkeletonText } from '../../components/Skeleton'

export function TrainerOverviewSection() {
  const { classInfo, enrollments, schedule, reports, trainerHours, studentHours, loading } = useTrainerClassDetail()

  if (!classInfo) return null

  const enrolledCount = enrollments.filter(e => e.status === 'enrolled').length
  const today = new Date().toISOString().slice(0, 10)
  const nextSession = schedule.filter(s => s.slot_date >= today)[0] ?? null
  const totalTrainerHours = trainerHours.reduce((sum, h) => sum + h.hours, 0)
  const totalStudentHours = studentHours.reduce((sum, h) => sum + h.hours, 0)

  const startD = new Date(classInfo.start_date + 'T00:00:00')
  const endD = new Date(classInfo.end_date + 'T00:00:00')
  const nowD = new Date()
  const totalDays = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / 86400000))
  const elapsedDays = Math.max(0, Math.ceil((nowD.getTime() - startD.getTime()) / 86400000))
  const completionPct = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)))

  return (
    <section className="space-y-4">
      {/* Progress bar */}
      <div className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Class progress</span>
          <span className="text-xs text-slate-500">Day {Math.min(elapsedDays, totalDays)} of {totalDays} ({completionPct}%)</span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-tt-blue to-tt-teal rounded-full transition-all duration-300" style={{ width: `${completionPct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Class details */}
        <div className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Class details</h3>
          {loading ? (
            <div className="space-y-2"><SkeletonText className="w-1/2" /><SkeletonText className="w-3/4" /></div>
          ) : (
            <dl className="space-y-2">
              {[
                { label: 'Name', value: classInfo.name },
                { label: 'Site', value: classInfo.site },
                { label: 'Province', value: classInfo.province },
                { label: 'Game type', value: classInfo.game_type ?? 'Not set' },
                { label: 'Dates', value: `${classInfo.start_date} – ${classInfo.end_date}` },
                { label: 'Status', value: classInfo.archived ? 'Archived' : 'Active' },
                { label: 'Your role', value: classInfo.trainer_role },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-xs text-slate-700 dark:text-slate-200 font-medium text-right">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Stats */}
        <div className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Class stats</h3>
          {loading ? (
            <div className="space-y-2"><SkeletonText className="w-1/2" /><SkeletonText className="w-3/4" /></div>
          ) : (
            <dl className="space-y-2">
              {[
                { label: 'Enrolled students', value: String(enrolledCount) },
                { label: 'Next session', value: nextSession ? `${nextSession.slot_date} ${nextSession.start_time}–${nextSession.end_time}` : 'None scheduled' },
                { label: 'Total reports', value: String(reports.length) },
                { label: 'Your logged hours', value: `${totalTrainerHours}h` },
                { label: 'Student hours logged', value: `${totalStudentHours}h` },
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
