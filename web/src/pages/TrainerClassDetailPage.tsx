import { useEffect, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { TrainerClassDetailProvider, useTrainerClassDetail } from '../contexts/TrainerClassDetailContext'
import { TrainerOverviewSection } from './TrainerClassDetail/TrainerOverviewSection'
import { TrainerStudentsSection } from './TrainerClassDetail/TrainerStudentsSection'
import { TrainerScheduleSection } from './TrainerClassDetail/TrainerScheduleSection'
import { TrainerDrillsSection } from './TrainerClassDetail/TrainerDrillsSection'
import { TrainerReportsSection } from './TrainerClassDetail/TrainerReportsSection'
import { TrainerHoursSection } from './TrainerClassDetail/TrainerHoursSection'
import { ClassDocumentsSection } from '../components/ClassDocumentsSection'

type Tab = 'overview' | 'students' | 'schedule' | 'drills' | 'reports' | 'documents' | 'hours'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'students', label: 'Students' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'drills', label: 'Drills' },
  { key: 'reports', label: 'Reports' },
  { key: 'documents', label: 'Documents' },
  { key: 'hours', label: 'Hours' },
]

function isTab(value: string | null): value is Tab {
  return TABS.some(tab => tab.key === value)
}

function ClassDetailInner() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const requestedTab = searchParams.get('tab')
    return isTab(requestedTab) ? requestedTab : 'overview'
  })
  const { classInfo, loading } = useTrainerClassDetail()

  useEffect(() => {
    const requestedTab = searchParams.get('tab')
    if (isTab(requestedTab)) setTab(requestedTab)
  }, [searchParams])

  if (loading) {
    return <div className="text-slate-400 dark:text-slate-500 text-sm py-10 text-center">Loading class…</div>
  }

  if (!classInfo) {
    return <div className="text-slate-400 dark:text-slate-500 text-sm py-10 text-center">Class not found or access denied.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/my-classes" className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-700 dark:text-slate-300 transition-colors">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{classInfo.name}</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500">{classInfo.site} &middot; {classInfo.province} &middot; {classInfo.game_type ?? 'No game type'}</p>
        </div>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
          classInfo.trainer_role === 'primary'
            ? 'bg-gw-blue/20 text-gw-blue'
            : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400'
        }`}>
          {classInfo.trainer_role}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-white/[0.06] -mx-4 px-4 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === key
                ? 'border-gw-blue text-gw-blue'
                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-700 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <TrainerOverviewSection />}
      {tab === 'students' && <TrainerStudentsSection />}
      {tab === 'schedule' && <TrainerScheduleSection />}
      {tab === 'drills' && <TrainerDrillsSection />}
      {tab === 'reports' && <TrainerReportsSection />}
      {tab === 'documents' && <ClassDocumentsSection classId={classInfo.id} access="trainer" canUpload canDelete archived={classInfo.archived} />}
      {tab === 'hours' && <TrainerHoursSection />}
    </div>
  )
}

export function TrainerClassDetailPage() {
  const { classId } = useParams<{ classId: string }>()
  if (!classId) return <div className="text-slate-400 dark:text-slate-500">Invalid class ID</div>

  return (
    <TrainerClassDetailProvider classId={classId}>
      <ClassDetailInner />
    </TrainerClassDetailProvider>
  )
}
