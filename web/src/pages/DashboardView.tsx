/**
 * pages/DashboardView.tsx — Role-aware dashboard dispatcher
 *
 * Renders different dashboard content depending on the user's role:
 *   - Coordinators see DashboardContent (the overview with class and alert panels)
 *   - Trainers and trainees see InProgressPage (a "work in progress" placeholder)
 *
 * This component intentionally keeps branching logic separate from the actual
 * content components so each content component has a single responsibility.
 */

import { useAuth } from '../contexts/AuthContext'
import { STUDENT_SELF_SERVICE_ENABLED } from '../lib/features'
import { DashboardContent } from './DashboardContent'
import { TrainerDashboard } from './TrainerDashboard'
import { TraineeDashboard } from './TraineeDashboard'

export function DashboardView() {
  const { role, email } = useAuth()

  if (role === 'coordinator') return <DashboardContent />
  if (role === 'trainer') return <TrainerDashboard email={email} />
  if (!STUDENT_SELF_SERVICE_ENABLED) return <DormantStudentDashboard email={email} />
  return <TraineeDashboard email={email} />
}

function DormantStudentDashboard({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Internal access required</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{email}</p>
      </header>

      <section className="bg-white dark:bg-tt-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Student self-service is not active</h3>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          This account is currently limited to profile settings. Training operations access is available to approved trainers and coordinators.
        </p>
      </section>
    </div>
  )
}
