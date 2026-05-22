import { useState } from 'react'
import { useReportsQuery } from '../hooks/useReportsQuery'
import { useClasses } from '../contexts/ClassesContext'
import { ReportsFilterBar } from '../components/ReportsFilterBar'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { ReportsTable } from '../components/ReportsTable'
import { Pagination } from '../components/Pagination'
import { ReportPreviewModal } from '../components/ReportPreviewModal'
import { SkeletonTable } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'
import { api, type ReportRow } from '../lib/apiClient'
import type { ReportPdfArgs } from '../lib/reportPdf'

export function ReportsPage() {
  const { active, archived } = useClasses()
  const {
    reports,
    total,
    page,
    limit,
    loading,
    filters,
    sort,
    setFilter,
    setSort,
    setPage,
    resetFilters,
  } = useReportsQuery()

  const [previewArgs, setPreviewArgs] = useState<ReportPdfArgs | null>(null)
  const [loadingReport, setLoadingReport] = useState<string | null>(null)

  async function handleReportClick(row: ReportRow) {
    if (loadingReport) return
    setLoadingReport(row.id)
    try {
      const [fullReport, trainers, enrollments, drills] = await Promise.all([
        api.reports.get(row.id),
        api.trainers.list(row.class_id),
        api.enrollments.list(row.class_id),
        api.drills.list(row.class_id),
      ])
      setPreviewArgs({
        report: fullReport,
        className: row.classes.name,
        trainers,
        enrollments,
        drills,
      })
    } catch {
      // silently ignore — loading indicator will clear
    } finally {
      setLoadingReport(null)
    }
  }

  const allClasses = filters.archived ? [...active, ...archived] : active

  const hasActiveFilters =
    filters.province !== '' ||
    filters.site !== '' ||
    filters.class_id !== '' ||
    filters.game_type !== '' ||
    filters.date_from !== '' ||
    filters.date_to !== '' ||
    filters.search !== '' ||
    filters.archived !== false

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex-shrink-0 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Reports</h2>
          <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
            Daily reports across all {filters.archived ? '' : 'active '}classes
          </p>
        </div>
      </header>

      <div className="mt-4 flex-1 min-h-0 overflow-auto flex flex-col gap-4">
        <CollapsibleSection label="Filters">
          <ReportsFilterBar
            filters={filters}
            setFilter={setFilter}
            resetFilters={resetFilters}
            classes={allClasses}
          />
        </CollapsibleSection>

        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : reports.length === 0 ? (
          <div className="bg-white dark:bg-tt-surface rounded-[10px]">
            {hasActiveFilters ? (
              <EmptyState
                title="No reports match your filters"
                description="Try adjusting your filters or reset them."
                action={{ label: 'Reset filters', onClick: resetFilters }}
                variant="neutral"
              />
            ) : (
              <EmptyState
                icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>}
                title="No reports found"
                description="Reports appear here once created inside a class."
              />
            )}
          </div>
        ) : (
          <>
            <ReportsTable
              reports={reports}
              sort={sort}
              onSort={setSort}
              onReportClick={handleReportClick}
            />
            {loadingReport && (
              <div className="text-center text-xs text-slate-400 dark:text-slate-500">Loading report…</div>
            )}
            <Pagination page={page} limit={limit} total={total} onPageChange={setPage} itemLabel="report" />
          </>
        )}
      </div>

      {previewArgs && (
        <ReportPreviewModal
          args={previewArgs}
          onClose={() => setPreviewArgs(null)}
        />
      )}
    </div>
  )
}
