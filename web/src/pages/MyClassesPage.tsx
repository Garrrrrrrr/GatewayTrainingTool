import { Link } from 'react-router-dom'
import { useTrainer } from '../contexts/TrainerContext'
import { SkeletonCard } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'

export function MyClassesPage() {
  const { classes, loading } = useTrainer()

  const activeClasses = classes.filter(c => !c.archived)
  const archivedClasses = classes.filter(c => c.archived)

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">My Classes</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Your assigned classes</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={4} />)}
        </div>
      </div>
    )
  }

  function ClassCard({ cls }: { cls: typeof classes[0] }) {
    const nextSlot = cls.upcoming_slots[0]
    return (
      <Link
        to={`/my-classes/${cls.class_id}`}
        className={`rounded-[10px] border bg-white dark:bg-tt-surface p-4 flex flex-col gap-3 hover:border-tt-blue/30 transition-colors duration-150 ${
          cls.archived ? 'opacity-60 border-slate-100 dark:border-white/[0.04]' : 'border-slate-200 dark:border-white/[0.08]'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-200">{cls.class_name}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{cls.site} · {cls.province}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              cls.trainer_role === 'primary'
                ? 'bg-tt-blue/20 text-tt-blue'
                : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400'
            }`}>
              {cls.trainer_role}
            </span>
            {cls.archived && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500">archived</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
          {cls.game_type && (
            <span><span className="font-medium text-slate-700 dark:text-slate-300">Game:</span> {cls.game_type}</span>
          )}
          <span><span className="font-medium text-slate-700 dark:text-slate-300">Students:</span> {cls.enrolled_count}</span>
          <span><span className="font-medium text-slate-700 dark:text-slate-300">Hours:</span> {cls.total_hours}</span>
        </div>

        {cls.start_date && (
          <p className="text-xs text-slate-400 dark:text-slate-500">{cls.start_date} → {cls.end_date ?? 'TBD'}</p>
        )}

        {nextSlot && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-tt-elevated rounded px-2 py-1">
            <span className="font-medium whitespace-nowrap text-slate-700 dark:text-slate-300">{nextSlot.slot_date}</span>
            <span>{nextSlot.start_time}–{nextSlot.end_time}</span>
            {nextSlot.group_label && (
              <span className="ml-auto text-[10px] bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded px-1 text-slate-400 dark:text-slate-500">
                Grp {nextSlot.group_label}
              </span>
            )}
          </div>
        )}
      </Link>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">My Classes</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {classes.length} class{classes.length !== 1 ? 'es' : ''} assigned
        </p>
      </header>

      {classes.length === 0 ? (
        <div className="bg-white dark:bg-tt-surface rounded-[10px]">
          <EmptyState
            title="No classes assigned"
            description="You are not currently assigned to any classes."
            variant="neutral"
          />
        </div>
      ) : (
        <>
          {activeClasses.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Active <span className="text-slate-400 dark:text-slate-500 font-normal">({activeClasses.length})</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeClasses.map(cls => <ClassCard key={cls.class_id} cls={cls} />)}
              </div>
            </section>
          )}
          {archivedClasses.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Archived <span className="text-slate-400 dark:text-slate-500 font-normal">({archivedClasses.length})</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedClasses.map(cls => <ClassCard key={cls.class_id} cls={cls} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
