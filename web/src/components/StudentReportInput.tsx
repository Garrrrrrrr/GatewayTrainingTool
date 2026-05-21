import { useState } from 'react'
import { api } from '../lib/apiClient'
import { useToast } from '../contexts/ToastContext'
import type { StudentReportView, DailyRating, DrillType } from '../types'

const RATINGS: DailyRating[] = ['EE', 'ME', 'AD', 'NI']
const RATING_COLOR: Record<DailyRating, string> = {
  EE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ME: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  AD: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  NI: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
}
const RATING_SELECTED: Record<DailyRating, string> = {
  EE: 'bg-emerald-500/30 text-emerald-300 border-emerald-400/50',
  ME: 'bg-blue-500/30 text-blue-300 border-blue-400/50',
  AD: 'bg-amber-500/30 text-amber-300 border-amber-400/50',
  NI: 'bg-rose-500/30 text-rose-300 border-rose-400/50',
}

interface DrillInput {
  drill_id: string
  drill_name: string
  drill_type: DrillType
  time_seconds: number | null
  score: number | null
  par_time_seconds: number | null
  target_score: number | null
}

export function StudentReportInput({
  report,
  classId,
  onUpdate,
  readOnly = false,
}: {
  report: StudentReportView
  classId: string
  onUpdate: (updated: StudentReportView) => void
  readOnly?: boolean
}) {
  const { toast } = useToast()
  const prog = report.my_progress

  const [gk, setGk] = useState<DailyRating | null>(prog?.gk_rating ?? null)
  const [dex, setDex] = useState<DailyRating | null>(prog?.dex_rating ?? null)
  const [hom, setHom] = useState<DailyRating | null>(prog?.hom_rating ?? null)
  const [signingIn, setSigningIn] = useState(false)
  const [saving, setSaving] = useState(false)

  // Build drill input state from existing data + available drills
  const [drillInputs, setDrillInputs] = useState<DrillInput[]>(() => {
    return report.drills.map(d => {
      const existing = report.my_drill_times.find(dt => dt.drill_id === d.id)
      return {
        drill_id: d.id,
        drill_name: d.name,
        drill_type: d.type,
        time_seconds: existing?.time_seconds ?? null,
        score: existing?.score ?? null,
        par_time_seconds: d.par_time_seconds,
        target_score: d.target_score,
      }
    })
  })

  const isSignedIn = prog?.attendance === true
  const isLate = prog?.late === true

  const handleSignIn = async () => {
    if (readOnly) return
    setSigningIn(true)
    try {
      const result = await api.selfService.signInAttendance(classId, report.report_id)
      onUpdate({
        ...report,
        my_progress: {
          gk_rating: prog?.gk_rating ?? null,
          dex_rating: prog?.dex_rating ?? null,
          hom_rating: prog?.hom_rating ?? null,
          attendance: true,
          late: result.late,
          homework_completed: prog?.homework_completed ?? false,
          progress_text: prog?.progress_text ?? null,
          coming_back_next_day: prog?.coming_back_next_day ?? null,
        },
      })
      if (result.late) {
        toast('Signed in — marked as late', 'info')
      } else {
        toast('Signed in successfully', 'success')
      }
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSigningIn(false)
    }
  }

  const handleSave = async () => {
    if (readOnly) return
    setSaving(true)
    try {
      const drillTimesPayload = drillInputs
        .filter(d => d.time_seconds != null || d.score != null)
        .map(d => ({ drill_id: d.drill_id, time_seconds: d.time_seconds, score: d.score }))

      await api.selfService.updateMyProgress(classId, report.report_id, {
        gk_rating: gk,
        dex_rating: dex,
        hom_rating: hom,
        drill_times: drillTimesPayload.length > 0 ? drillTimesPayload : undefined,
      })

      onUpdate({
        ...report,
        my_progress: {
          gk_rating: gk,
          dex_rating: dex,
          hom_rating: hom,
          attendance: prog?.attendance ?? false,
          late: prog?.late ?? false,
          homework_completed: prog?.homework_completed ?? false,
          progress_text: prog?.progress_text ?? null,
          coming_back_next_day: prog?.coming_back_next_day ?? null,
        },
        my_drill_times: drillInputs.map(d => ({
          drill_id: d.drill_id,
          drill_name: d.drill_name,
          drill_type: d.drill_type,
          time_seconds: d.time_seconds,
          score: d.score,
          par_time_seconds: d.par_time_seconds,
          target_score: d.target_score,
        })),
      })
      toast('Progress saved', 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateDrill = (idx: number, field: 'time_seconds' | 'score', value: string) => {
    if (readOnly) return
    setDrillInputs(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value === '' ? null : Number(value) }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4 pt-3 border-t border-slate-200 dark:border-white/[0.06]">
      {/* Attendance sign-in */}
      <div>
        {isSignedIn ? (
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-emerald-400 font-medium">Signed in</span>
            {isLate && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Late
              </span>
            )}
          </div>
        ) : readOnly ? (
          <span className="text-[10px] text-slate-500">Not signed in</span>
        ) : (
          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="rounded-[10px] bg-gw-blue px-4 py-2 text-sm font-semibold text-white hover:bg-gw-blue/90 disabled:opacity-40 transition-colors"
          >
            {signingIn ? 'Signing in...' : 'Sign In for Attendance'}
          </button>
        )}
      </div>

      {/* Self-assessment ratings */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Self-Assessment
          {readOnly && <span className="ml-2 text-[10px] font-normal text-slate-500 normal-case">(read only)</span>}
        </p>
        {([['Game Knowledge (GK)', gk, setGk], ['Dexterity (DEX)', dex, setDex], ['Habits of Mind (HOM)', hom, setHom]] as const).map(([label, value, setter]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-sm text-slate-700 dark:text-slate-300 w-44 shrink-0">{label}</span>
            <div className="flex gap-1.5">
              {RATINGS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => !readOnly && setter(value === r ? null : r)}
                  disabled={readOnly}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded border transition-colors ${
                    value === r ? RATING_SELECTED[r] : RATING_COLOR[r]
                  } ${readOnly ? 'cursor-default opacity-70' : ''}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Drill/test inputs */}
      {drillInputs.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Drills & Tests</p>
          {drillInputs.map((d, idx) => {
            const isDrill = d.drill_type === 'drill'
            return (
              <div key={d.drill_id} className="flex items-center gap-3 bg-slate-100 dark:bg-gw-elevated rounded-[10px] px-3 py-2">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-800 dark:text-slate-200 font-medium">{d.drill_name}</span>
                  <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded ${isDrill ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400'}`}>
                    {d.drill_type}
                  </span>
                  {isDrill && d.par_time_seconds != null && (
                    <span className="ml-2 text-[10px] text-slate-500">Par: {d.par_time_seconds}s</span>
                  )}
                  {!isDrill && d.target_score != null && (
                    <span className="ml-2 text-[10px] text-slate-500">Target: {d.target_score}</span>
                  )}
                </div>
                <div className="shrink-0">
                  {readOnly ? (
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {isDrill ? (d.time_seconds != null ? `${d.time_seconds}s` : '—') : (d.score != null ? d.score : '—')}
                    </span>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step={isDrill ? 1 : undefined}
                      value={isDrill ? (d.time_seconds ?? '') : (d.score ?? '')}
                      onChange={e => updateDrill(idx, isDrill ? 'time_seconds' : 'score', e.target.value)}
                      placeholder={isDrill ? 'Time (s)' : 'Score'}
                      className="w-24 rounded-md bg-white dark:bg-gw-surface border border-slate-200 dark:border-white/[0.08] px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-600 focus:border-gw-blue/40 focus:outline-none"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Save button — only shown when writable */}
      {!readOnly && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="self-start rounded-[10px] bg-gw-blue px-5 py-2 text-sm font-semibold text-white hover:bg-gw-blue/90 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Progress'}
        </button>
      )}
    </div>
  )
}
