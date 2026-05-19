import { useState, useEffect, useCallback, useRef } from 'react'
import { api, type ReportRow, type ReportListParams } from '../lib/apiClient'
import type { Province } from '../types'

export interface ReportsFilters {
  province: Province | ''
  site: string
  class_id: string
  archived: boolean
  game_type: string
  date_from: string
  date_to: string
  search: string
}

export interface ReportsSort {
  column: string
  direction: 'asc' | 'desc'
}

const DEFAULT_FILTERS: ReportsFilters = {
  province: '',
  site: '',
  class_id: '',
  archived: false,
  game_type: '',
  date_from: '',
  date_to: '',
  search: '',
}

const DEFAULT_SORT: ReportsSort = { column: 'report_date', direction: 'desc' }
const PAGE_SIZE = 50

type ReportsQuerySnapshot = { reports: ReportRow[]; total: number }
const reportsQueryCache = new Map<string, ReportsQuerySnapshot>()

function buildReportParams(
  f: ReportsFilters,
  s: ReportsSort,
  p: number,
  search: string,
): ReportListParams {
  const params: ReportListParams = {
    sort_by: s.column,
    sort_dir: s.direction,
    page: p,
    limit: PAGE_SIZE,
    archived: f.archived,
  }
  if (f.province) params.province = f.province
  if (f.site) params.site = f.site
  if (f.class_id) params.class_id = f.class_id
  if (f.game_type) params.game_type = f.game_type
  if (f.date_from) params.date_from = f.date_from
  if (f.date_to) params.date_to = f.date_to
  if (search) params.search = search
  return params
}

function reportsCacheKey(params: ReportListParams): string {
  return JSON.stringify(params)
}

export function useReportsQuery() {
  const initialParams = buildReportParams(DEFAULT_FILTERS, DEFAULT_SORT, 0, '')
  const initialCached = reportsQueryCache.get(reportsCacheKey(initialParams))
  const [filters, setFilters] = useState<ReportsFilters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<ReportsSort>(DEFAULT_SORT)
  const [page, setPage] = useState(0)
  const [reports, setReports] = useState<ReportRow[]>(() => initialCached?.reports ?? [])
  const [total, setTotal] = useState(() => initialCached?.total ?? 0)
  const [loading, setLoading] = useState(() => !initialCached)
  const [refreshKey, setRefreshKey] = useState(0)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The debounced search value that actually triggers fetches
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce the search filter
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search)
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [filters.search])

  const fetchReports = useCallback(async (
    f: ReportsFilters,
    s: ReportsSort,
    p: number,
    search: string,
  ) => {
    const params = buildReportParams(f, s, p, search)
    const key = reportsCacheKey(params)
    const cached = reportsQueryCache.get(key)

    if (cached) {
      setReports(cached.reports)
      setTotal(cached.total)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      const result = await api.reports.listAll(params)
      reportsQueryCache.set(key, { reports: result.data, total: result.total })
      setReports(result.data)
      setTotal(result.total)
    } catch (err) {
      console.error('useReportsQuery fetch error:', (err as Error).message)
      if (!cached) {
        setReports([])
        setTotal(0)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount and whenever filters/sort/page/debouncedSearch change
  useEffect(() => {
    fetchReports(filters, sort, page, debouncedSearch)
  }, [filters, sort, page, debouncedSearch, fetchReports, refreshKey])

  const refetch = useCallback(() => {
    reportsQueryCache.clear()
    api.cache.clear('/reports')
    setRefreshKey(k => k + 1)
  }, [])

  const updateFilter = useCallback(<K extends keyof ReportsFilters>(key: K, value: ReportsFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(0) // Reset to first page on any filter change
  }, [])

  const toggleSort = useCallback((column: string) => {
    setSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc',
    }))
    setPage(0)
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setSort(DEFAULT_SORT)
    setPage(0)
  }, [])

  return {
    reports,
    total,
    page,
    limit: PAGE_SIZE,
    loading,
    filters,
    sort,
    setFilter: updateFilter,
    setSort: toggleSort,
    setPage,
    resetFilters,
    refetch,
  }
}
