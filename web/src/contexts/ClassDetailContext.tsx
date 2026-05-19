/**
 * contexts/ClassDetailContext.tsx — Cached class detail data context
 *
 * Fetches trainers, enrollments, schedule, reports, hours, and drills ONCE
 * when the class detail page mounts, then shares them across all tab sections.
 *
 * Each data type has its own refresh function so mutations in one tab
 * can update the shared cache without re-fetching everything.
 *
 * This eliminates redundant API calls — previously trainers were fetched 4×,
 * enrollments 3×, and schedule 3× across the different tab sections.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api } from '../lib/apiClient'
import type {
  ClassTrainer,
  ClassEnrollment,
  ClassScheduleSlot,
  ClassDailyReport,
  ClassLoggedHours,
  ClassDrill,
} from '../types'

interface ClassDetailContextValue {
  classId: string
  trainers: ClassTrainer[]
  enrollments: ClassEnrollment[]
  schedule: ClassScheduleSlot[]
  reports: ClassDailyReport[]
  hours: ClassLoggedHours[]
  drills: ClassDrill[]
  loading: boolean
  refreshTrainers: () => Promise<void>
  refreshEnrollments: () => Promise<void>
  refreshSchedule: () => Promise<void>
  refreshReports: () => Promise<void>
  refreshHours: () => Promise<void>
  refreshDrills: () => Promise<void>
  // Direct state setters for optimistic UI updates
  setTrainers: React.Dispatch<React.SetStateAction<ClassTrainer[]>>
  setEnrollments: React.Dispatch<React.SetStateAction<ClassEnrollment[]>>
  setSchedule: React.Dispatch<React.SetStateAction<ClassScheduleSlot[]>>
  setReports: React.Dispatch<React.SetStateAction<ClassDailyReport[]>>
  setHours: React.Dispatch<React.SetStateAction<ClassLoggedHours[]>>
  setDrills: React.Dispatch<React.SetStateAction<ClassDrill[]>>
}

const ClassDetailContext = createContext<ClassDetailContextValue | null>(null)

type ClassDetailSnapshot = Pick<
  ClassDetailContextValue,
  'trainers' | 'enrollments' | 'schedule' | 'reports' | 'hours' | 'drills'
>

const classDetailCache = new Map<string, ClassDetailSnapshot>()

function updateClassDetailCache(classId: string, patch: Partial<ClassDetailSnapshot>) {
  const prev = classDetailCache.get(classId)
  if (!prev) return
  classDetailCache.set(classId, { ...prev, ...patch })
}

export function ClassDetailProvider({ classId, children }: { classId: string; children: ReactNode }) {
  const initial = classDetailCache.get(classId)
  const [trainers, setTrainers] = useState<ClassTrainer[]>(() => initial?.trainers ?? [])
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>(() => initial?.enrollments ?? [])
  const [schedule, setSchedule] = useState<ClassScheduleSlot[]>(() => initial?.schedule ?? [])
  const [reports, setReports] = useState<ClassDailyReport[]>(() => initial?.reports ?? [])
  const [hours, setHours] = useState<ClassLoggedHours[]>(() => initial?.hours ?? [])
  const [drills, setDrills] = useState<ClassDrill[]>(() => initial?.drills ?? [])
  const [loading, setLoading] = useState(() => !initial)

  const refreshTrainers = useCallback(async () => {
    const data = await api.trainers.list(classId)
    setTrainers(data)
    updateClassDetailCache(classId, { trainers: data })
  }, [classId])

  const refreshEnrollments = useCallback(async () => {
    const data = await api.enrollments.list(classId)
    setEnrollments(data)
    updateClassDetailCache(classId, { enrollments: data })
  }, [classId])

  const refreshSchedule = useCallback(async () => {
    const data = await api.schedule.list(classId)
    setSchedule(data)
    updateClassDetailCache(classId, { schedule: data })
  }, [classId])

  const refreshReports = useCallback(async () => {
    const data = await api.reports.list(classId)
    setReports(data)
    updateClassDetailCache(classId, { reports: data })
  }, [classId])

  const refreshHours = useCallback(async () => {
    const data = await api.hours.list(classId)
    setHours(data)
    updateClassDetailCache(classId, { hours: data })
  }, [classId])

  const refreshDrills = useCallback(async () => {
    const data = await api.drills.list(classId)
    setDrills(data)
    updateClassDetailCache(classId, { drills: data })
  }, [classId])

  useEffect(() => {
    let cancelled = false
    const cached = classDetailCache.get(classId)
    if (cached) {
      setTrainers(cached.trainers)
      setEnrollments(cached.enrollments)
      setSchedule(cached.schedule)
      setReports(cached.reports)
      setHours(cached.hours)
      setDrills(cached.drills)
      setLoading(false)
    } else {
      setLoading(true)
    }

    Promise.all([
      api.trainers.list(classId),
      api.enrollments.list(classId),
      api.schedule.list(classId),
      api.reports.list(classId),
      api.hours.list(classId),
      api.drills.list(classId),
    ])
      .then(([t, e, s, r, h, d]) => {
        if (cancelled) return
        setTrainers(t)
        setEnrollments(e)
        setSchedule(s)
        setReports(r)
        setHours(h)
        setDrills(d)
        classDetailCache.set(classId, {
          trainers: t,
          enrollments: e,
          schedule: s,
          reports: r,
          hours: h,
          drills: d,
        })
      })
      .catch(err => console.error('ClassDetailContext fetch error:', (err as Error).message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [classId])

  return (
    <ClassDetailContext.Provider value={{
      classId,
      trainers, enrollments, schedule, reports, hours, drills,
      loading,
      refreshTrainers, refreshEnrollments, refreshSchedule,
      refreshReports, refreshHours, refreshDrills,
      setTrainers, setEnrollments, setSchedule,
      setReports, setHours, setDrills,
    }}>
      {children}
    </ClassDetailContext.Provider>
  )
}

export function useClassDetail() {
  const ctx = useContext(ClassDetailContext)
  if (!ctx) throw new Error('useClassDetail must be used within ClassDetailProvider')
  return ctx
}
