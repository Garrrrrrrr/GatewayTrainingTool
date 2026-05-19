import { useState, useEffect, useCallback, useRef } from 'react'
import { api, type ScheduleRow, type ScheduleListParams } from '../lib/apiClient'
import type { Province } from '../types'

export interface ScheduleFilters {
  province: Province | ''
  site: string
  class_id: string
  archived: boolean
  game_type: string
  date_from: string
  date_to: string
  group_label: string
  search: string
}

export interface ScheduleSort {
  column: string
  direction: 'asc' | 'desc'
}

const DEFAULT_FILTERS: ScheduleFilters = {
  province: '',
  site: '',
  class_id: '',
  archived: false,
  game_type: '',
  date_from: '',
  date_to: '',
  group_label: '',
  search: '',
}

const DEFAULT_SORT: ScheduleSort = { column: 'slot_date', direction: 'asc' }
const PAGE_SIZE = 50

type ScheduleQuerySnapshot = { slots: ScheduleRow[]; total: number }
const scheduleQueryCache = new Map<string, ScheduleQuerySnapshot>()

function buildScheduleParams(
  f: ScheduleFilters,
  s: ScheduleSort,
  p: number,
  search: string,
): ScheduleListParams {
  const params: ScheduleListParams = {
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
  if (f.group_label) params.group_label = f.group_label
  if (search) params.search = search
  return params
}

function scheduleCacheKey(params: ScheduleListParams): string {
  return JSON.stringify(params)
}

export function useScheduleQuery() {
  const initialParams = buildScheduleParams(DEFAULT_FILTERS, DEFAULT_SORT, 0, '')
  const initialCached = scheduleQueryCache.get(scheduleCacheKey(initialParams))
  const [filters, setFilters] = useState<ScheduleFilters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<ScheduleSort>(DEFAULT_SORT)
  const [page, setPage] = useState(0)
  const [slots, setSlots] = useState<ScheduleRow[]>(() => initialCached?.slots ?? [])
  const [total, setTotal] = useState(() => initialCached?.total ?? 0)
  const [loading, setLoading] = useState(() => !initialCached)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search)
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [filters.search])

  const fetchSlots = useCallback(async (
    f: ScheduleFilters,
    s: ScheduleSort,
    p: number,
    search: string,
  ) => {
    const params = buildScheduleParams(f, s, p, search)
    const key = scheduleCacheKey(params)
    const cached = scheduleQueryCache.get(key)

    if (cached) {
      setSlots(cached.slots)
      setTotal(cached.total)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      const result = await api.schedule.listAll(params)
      scheduleQueryCache.set(key, { slots: result.data, total: result.total })
      setSlots(result.data)
      setTotal(result.total)
    } catch (err) {
      console.error('useScheduleQuery fetch error:', (err as Error).message)
      if (!cached) {
        setSlots([])
        setTotal(0)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSlots(filters, sort, page, debouncedSearch)
  }, [filters, sort, page, debouncedSearch, fetchSlots])

  const updateFilter = useCallback(<K extends keyof ScheduleFilters>(key: K, value: ScheduleFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(0)
  }, [])

  const toggleSort = useCallback((column: string) => {
    setSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
    setPage(0)
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setSort(DEFAULT_SORT)
    setPage(0)
  }, [])

  return {
    slots,
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
  }
}
