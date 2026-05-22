/**
 * pages/SchedulePage.tsx — Cross-class schedule listing
 *
 * Shows all upcoming schedule slots across all classes with filtering,
 * sorting, and pagination. Supports both a table view and a calendar view.
 */

import { useState } from 'react'
import { useScheduleQuery } from '../hooks/useScheduleQuery'
import { useClasses } from '../contexts/ClassesContext'
import { ScheduleFilterBar } from '../components/ScheduleFilterBar'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { ScheduleTable } from '../components/ScheduleTable'
import { ScheduleCalendar } from '../components/ScheduleCalendar'
import { Pagination } from '../components/Pagination'
import { SkeletonTable } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'

type ScheduleView = 'table' | 'calendar'

export function SchedulePage() {
  const { active, archived } = useClasses()
  const {
    slots,
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
  } = useScheduleQuery()

  const [view, setView] = useState<ScheduleView>('table')

  const allClasses = filters.archived ? [...active, ...archived] : active

  const hasActiveFilters =
    filters.province !== '' ||
    filters.site !== '' ||
    filters.class_id !== '' ||
    filters.game_type !== '' ||
    filters.date_from !== '' ||
    filters.date_to !== '' ||
    filters.group_label !== '' ||
    filters.search !== '' ||
    filters.archived !== false

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Schedule</h2>
          <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
            Upcoming sessions across all {filters.archived ? '' : 'active '}classes
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-md bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/10 p-0.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setView('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${view === 'table' ? 'bg-slate-100 dark:bg-tt-elevated text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-700 dark:text-slate-300'}`}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
            Table
          </button>
          <button
            type="button"
            onClick={() => setView('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${view === 'calendar' ? 'bg-slate-100 dark:bg-tt-elevated text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-700 dark:text-slate-300'}`}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18" />
            </svg>
            Calendar
          </button>
        </div>
      </header>

      <div className="mt-4 flex-1 min-h-0 overflow-auto flex flex-col gap-4">
        <CollapsibleSection label="Filters">
          <ScheduleFilterBar
            filters={filters}
            setFilter={setFilter}
            resetFilters={resetFilters}
            classes={allClasses}
          />
        </CollapsibleSection>

        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : slots.length === 0 ? (
          <div className="bg-white dark:bg-tt-surface rounded-[10px]">
            {hasActiveFilters ? (
              <EmptyState
                title="No sessions match your filters"
                description="Try adjusting your filters or reset them."
                action={{ label: 'Reset filters', onClick: resetFilters }}
                variant="neutral"
              />
            ) : (
              <EmptyState
                icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>}
                title="No upcoming sessions"
                description="Schedule slots appear here once added inside a class."
              />
            )}
          </div>
        ) : view === 'table' ? (
          <>
            <ScheduleTable slots={slots} sort={sort} onSort={setSort} />
            <Pagination page={page} limit={limit} total={total} onPageChange={setPage} itemLabel="session" />
          </>
        ) : (
          <ScheduleCalendar slots={slots} />
        )}
      </div>
    </div>
  )
}
