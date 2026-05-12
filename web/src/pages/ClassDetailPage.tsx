import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/apiClient'
import type { Class } from '../types'
import { EditClassModal } from '../components/EditClassModal'
import { ClassDetailProvider } from '../contexts/ClassDetailContext'
import { SkeletonTable } from '../components/Skeleton'
import { ClassOverviewSection } from './ClassDetail/ClassOverviewSection'
import { ClassDrillsSection } from './ClassDetail/ClassDrillsSection'
import { ClassScheduleSection } from './ClassDetail/ClassScheduleSection'
import { ClassTrainersSection } from './ClassDetail/ClassTrainersSection'
import { ClassStudentsSection } from './ClassDetail/ClassStudentsSection'
import { ClassReportsSection } from './ClassDetail/ClassReportsSection'
import { ClassPayrollSection } from './ClassDetail/ClassPayrollSection'
import { ClassDocumentsSection } from '../components/ClassDocumentsSection'

interface ClassDetailPageProps {
  className: string
  deepLinkedReportId?: string
}

type ClassDetailTab =
  | 'overview'
  | 'drills'
  | 'schedule'
  | 'trainers'
  | 'students'
  | 'dailyReports'
  | 'documents'
  | 'payroll'

export function ClassDetailPage({ className, deepLinkedReportId }: ClassDetailPageProps) {
  const [classData, setClassData] = useState<Class | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ClassDetailTab>(deepLinkedReportId ? 'dailyReports' : 'overview')
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    async function loadClass() {
      setLoading(true)
      setError(null)
      try {
        const data = await api.classes.getByName(className)
        setClassData(data)
      } catch (err) {
        console.error('loadClass error:', (err as Error).message)
        setError('Unable to load class.')
        setClassData(null)
      } finally {
        setLoading(false)
      }
    }
    loadClass()
  }, [className])

  useEffect(() => {
    if (deepLinkedReportId) setActiveTab('dailyReports')
  }, [deepLinkedReportId])

  if (loading) {
    return <SkeletonTable rows={5} cols={6} />
  }

  if (error || !classData) {
    return (
      <div className="rounded-[10px] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
        {error ?? 'Class not found.'}
      </div>
    )
  }

  const tabs: { id: ClassDetailTab; label: string }[] = [
    { id: 'overview',      label: 'Overview' },
    { id: 'drills',        label: 'Drills & tests' },
    { id: 'schedule',      label: 'Schedule' },
    { id: 'trainers',      label: 'Trainers' },
    { id: 'students',      label: 'Students' },
    { id: 'dailyReports',  label: 'Daily reports' },
    { id: 'documents',     label: 'Documents' },
    { id: 'payroll',       label: 'Payroll' },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Breadcrumb */}
      <nav className="mb-2 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link to="/classes" className="hover:text-gw-blue transition-colors">Classes</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700 dark:text-slate-300 font-medium">{classData.name}</span>
      </nav>

      {/* Class header */}
      <header className="mb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{classData.name}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {classData.site} · {classData.province} · {classData.game_type ?? 'No game type'} ·{' '}
            {classData.start_date} – {classData.end_date}
          </p>
          {classData.description && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 max-w-xl">{classData.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-md bg-white dark:bg-gw-surface text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-gw-elevated transition-colors duration-150"
          >
            Edit class
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex-shrink-0 border-b border-slate-200 dark:border-white/[0.06] mb-3 overflow-x-auto">
        <nav className="flex gap-0 whitespace-nowrap min-w-max" aria-label="Class detail sections">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative text-sm px-4 py-2.5 transition-colors duration-150 ${
                activeTab === tab.id
                  ? 'font-semibold text-slate-900 dark:text-slate-100'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-gradient-to-r from-gw-blue to-gw-teal rounded-t" />
              )}
            </button>
          ))}
        </nav>
      </div>

      <ClassDetailProvider classId={classData.id}>
        <div className="flex-1 min-h-0 overflow-auto">
          <div className={activeTab === 'overview'      ? '' : 'hidden'}><ClassOverviewSection classData={classData} /></div>
          <div className={activeTab === 'drills'        ? '' : 'hidden'}><ClassDrillsSection classId={classData.id} className={classData.name} /></div>
          <div className={activeTab === 'schedule'      ? '' : 'hidden'}><ClassScheduleSection classId={classData.id} className={classData.name} startDate={classData.start_date} endDate={classData.end_date} /></div>
          <div className={activeTab === 'trainers'      ? '' : 'hidden'}><ClassTrainersSection classId={classData.id} className={classData.name} /></div>
          <div className={activeTab === 'students'      ? '' : 'hidden'}><ClassStudentsSection classId={classData.id} className={classData.name} archived={classData.archived} /></div>
          <div className={activeTab === 'dailyReports'  ? '' : 'hidden'}><ClassReportsSection classId={classData.id} className={classData.name} mode="reports" defaultGameType={classData.game_type} classStartDate={classData.start_date} deepLinkedReportId={deepLinkedReportId} /></div>
          <div className={activeTab === 'documents'     ? '' : 'hidden'}><ClassDocumentsSection classId={classData.id} access="coordinator" canUpload canDelete archived={classData.archived} /></div>
          <div className={activeTab === 'payroll'       ? '' : 'hidden'}><ClassPayrollSection classId={classData.id} className={classData.name} /></div>
        </div>
      </ClassDetailProvider>

      {editOpen && (
        <EditClassModal
          classData={classData}
          onClose={() => setEditOpen(false)}
          onSuccess={(updated) => {
            setClassData(updated)
            setEditOpen(false)
          }}
        />
      )}
    </div>
  )
}
