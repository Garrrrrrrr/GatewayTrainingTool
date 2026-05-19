import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api } from '../lib/apiClient'
import type {
  ClassEnrollment,
  ClassScheduleSlot,
  ClassDailyReport,
  ClassLoggedHours,
  ClassDrill,
  ClassTrainer,
  TrainerClassDetailResponse,
} from '../types'

interface TrainerClassDetailContextValue {
  classId: string
  classInfo: TrainerClassDetailResponse | null
  enrollments: ClassEnrollment[]
  schedule: ClassScheduleSlot[]
  reports: ClassDailyReport[]
  trainers: ClassTrainer[]
  trainerHours: ClassLoggedHours[]
  studentHours: ClassLoggedHours[]
  drills: ClassDrill[]
  loading: boolean
  refreshReports: () => Promise<void>
  refreshHours: () => Promise<void>
  refreshDrills: () => Promise<void>
  refreshSchedule: () => Promise<void>
  refreshEnrollments: () => Promise<void>
  // Direct state setters for optimistic UI updates
  setReports: React.Dispatch<React.SetStateAction<ClassDailyReport[]>>
  setTrainerHours: React.Dispatch<React.SetStateAction<ClassLoggedHours[]>>
  setStudentHours: React.Dispatch<React.SetStateAction<ClassLoggedHours[]>>
  setDrills: React.Dispatch<React.SetStateAction<ClassDrill[]>>
  setSchedule: React.Dispatch<React.SetStateAction<ClassScheduleSlot[]>>
  setEnrollments: React.Dispatch<React.SetStateAction<ClassEnrollment[]>>
}

const TrainerClassDetailContext = createContext<TrainerClassDetailContextValue | null>(null)

type TrainerClassDetailSnapshot = Pick<
  TrainerClassDetailContextValue,
  | 'classInfo'
  | 'enrollments'
  | 'schedule'
  | 'reports'
  | 'trainers'
  | 'trainerHours'
  | 'studentHours'
  | 'drills'
>

const trainerClassDetailCache = new Map<string, TrainerClassDetailSnapshot>()

function updateTrainerClassDetailCache(classId: string, patch: Partial<TrainerClassDetailSnapshot>) {
  const prev = trainerClassDetailCache.get(classId)
  if (!prev) return
  trainerClassDetailCache.set(classId, { ...prev, ...patch })
}

export function TrainerClassDetailProvider({ classId, children }: { classId: string; children: ReactNode }) {
  const initial = trainerClassDetailCache.get(classId)
  const [classInfo, setClassInfo] = useState<TrainerClassDetailResponse | null>(() => initial?.classInfo ?? null)
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>(() => initial?.enrollments ?? [])
  const [schedule, setSchedule] = useState<ClassScheduleSlot[]>(() => initial?.schedule ?? [])
  const [reports, setReports] = useState<ClassDailyReport[]>(() => initial?.reports ?? [])
  const [trainers, setTrainers] = useState<ClassTrainer[]>(() => initial?.trainers ?? [])
  const [trainerHours, setTrainerHours] = useState<ClassLoggedHours[]>(() => initial?.trainerHours ?? [])
  const [studentHours, setStudentHours] = useState<ClassLoggedHours[]>(() => initial?.studentHours ?? [])
  const [drills, setDrills] = useState<ClassDrill[]>(() => initial?.drills ?? [])
  const [loading, setLoading] = useState(() => !initial)

  const refreshReports = useCallback(async () => {
    const data = await api.selfService.classReports(classId)
    setReports(data)
    updateTrainerClassDetailCache(classId, { reports: data })
  }, [classId])

  const refreshHours = useCallback(async () => {
    const data = await api.selfService.classHours(classId)
    setTrainerHours(data.trainer_hours)
    setStudentHours(data.student_hours)
    updateTrainerClassDetailCache(classId, {
      trainerHours: data.trainer_hours,
      studentHours: data.student_hours,
    })
  }, [classId])

  const refreshDrills = useCallback(async () => {
    const detail = await api.selfService.classDetail(classId)
    setClassInfo(detail)
    setDrills(detail.drills)
    setEnrollments(detail.enrollments)
    setTrainers(detail.trainers ?? [])
    updateTrainerClassDetailCache(classId, {
      classInfo: detail,
      drills: detail.drills,
      enrollments: detail.enrollments,
      trainers: detail.trainers ?? [],
    })
  }, [classId])

  const refreshSchedule = useCallback(async () => {
    const data = await api.selfService.classSchedule(classId)
    setSchedule(data)
    updateTrainerClassDetailCache(classId, { schedule: data })
  }, [classId])

  const refreshEnrollments = useCallback(async () => {
    const detail = await api.selfService.classDetail(classId)
    setClassInfo(detail)
    setEnrollments(detail.enrollments)
    setDrills(detail.drills)
    setTrainers(detail.trainers ?? [])
    updateTrainerClassDetailCache(classId, {
      classInfo: detail,
      enrollments: detail.enrollments,
      drills: detail.drills,
      trainers: detail.trainers ?? [],
    })
  }, [classId])

  useEffect(() => {
    let cancelled = false
    const cached = trainerClassDetailCache.get(classId)
    if (cached) {
      setClassInfo(cached.classInfo)
      setEnrollments(cached.enrollments)
      setDrills(cached.drills)
      setTrainers(cached.trainers)
      setSchedule(cached.schedule)
      setReports(cached.reports)
      setTrainerHours(cached.trainerHours)
      setStudentHours(cached.studentHours)
      setLoading(false)
    } else {
      setLoading(true)
    }

    Promise.all([
      api.selfService.classDetail(classId),
      api.selfService.classSchedule(classId),
      api.selfService.classReports(classId),
      api.selfService.classHours(classId),
    ])
      .then(([detail, sched, reps, hrs]) => {
        if (cancelled) return
        setClassInfo(detail)
        setEnrollments(detail.enrollments)
        setDrills(detail.drills)
        setTrainers(detail.trainers ?? [])
        setSchedule(sched)
        setReports(reps)
        setTrainerHours(hrs.trainer_hours)
        setStudentHours(hrs.student_hours)
        trainerClassDetailCache.set(classId, {
          classInfo: detail,
          enrollments: detail.enrollments,
          drills: detail.drills,
          trainers: detail.trainers ?? [],
          schedule: sched,
          reports: reps,
          trainerHours: hrs.trainer_hours,
          studentHours: hrs.student_hours,
        })
      })
      .catch(err => console.error('TrainerClassDetailContext fetch error:', (err as Error).message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [classId])

  return (
    <TrainerClassDetailContext.Provider value={{
      classId, classInfo, enrollments, schedule, reports,
      trainers,
      trainerHours, studentHours, drills, loading,
      refreshReports, refreshHours, refreshDrills, refreshSchedule, refreshEnrollments,
      setReports, setTrainerHours, setStudentHours, setDrills, setSchedule, setEnrollments,
    }}>
      {children}
    </TrainerClassDetailContext.Provider>
  )
}

export function useTrainerClassDetail() {
  const ctx = useContext(TrainerClassDetailContext)
  if (!ctx) throw new Error('useTrainerClassDetail must be used within TrainerClassDetailProvider')
  return ctx
}
