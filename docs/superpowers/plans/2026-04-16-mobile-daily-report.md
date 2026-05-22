# Mobile-Optimized Daily Report Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `ReportEditForm` into focused section components and add responsive mobile layouts — cards for timeline/drill times, a per-trainee detail modal, and a localStorage draft — so the daily report form is fully usable on a phone without changing any call sites.

**Architecture:** Extract the 562-line `ReportEditForm` into a thin orchestrator (state + save) and seven focused section components. Three sections (Timeline, TraineeProgress, DrillTimes) gain sibling mobile-only layouts using Tailwind `md:hidden` / `hidden md:block`. A `useReportDraft` hook persists form state to `localStorage` on every change and restores it on mount. A `TraineeProgressDetailModal` provides a full-screen per-trainee editor for the mobile flow.

**Tech Stack:** React 19, TypeScript, Tailwind CSS (existing project stack). No new dependencies.

**Testing note:** No test runner in this codebase. Verification is `tsc --noEmit` + manual QA on DevTools mobile emulator (iPhone 12 / 390px).

**Spec reference:** `docs/superpowers/specs/2026-04-16-mobile-daily-report-design.md`

---

## File Structure

**New files:**
```
web/src/components/sections/formStyles.ts           — shared CSS class strings
web/src/components/sections/HeaderFieldsSection.tsx
web/src/components/sections/TrainersSection.tsx
web/src/components/sections/HoursTotalsSection.tsx
web/src/components/sections/TimelineSection.tsx     — desktop table + mobile cards + arrow reorder
web/src/components/sections/TraineeProgressSection.tsx — desktop table + mobile compact list
web/src/components/sections/DrillTimesSection.tsx   — desktop table + mobile cards
web/src/components/sections/CoordinatorNotesSection.tsx
web/src/components/TraineeProgressDetailModal.tsx   — full-screen per-trainee mobile editor
web/src/hooks/useReportDraft.ts                     — localStorage draft hook
```

**Modified:**
```
web/src/components/ReportEditForm.tsx               — rewritten as orchestrator (~150 lines)
```

**Unchanged:** all call sites (`ClassReportsSection`, `TrainerReportsSection`), `ReportPreviewModal`, PDF logic, all server code.

---

## Task 1: Shared form style constants

**Files:**
- Create: `web/src/components/sections/formStyles.ts`

These class strings are currently duplicated inline in `ReportEditForm`. Extracting them avoids repeating them across seven section files.

- [ ] **Step 1: Create `web/src/components/sections/formStyles.ts`**

```ts
export const fieldClass =
  'mt-1 w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-base md:text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15'

export const inlineFieldClass =
  'bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-1 py-0.5 text-base md:text-[11px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-tt-blue/40'
```

Note: `text-base md:text-xs` (instead of the original `text-xs`) prevents iOS zoom-on-focus (iOS zooms when font-size < 16px).

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/sections/formStyles.ts
git commit -m "feat(mobile-report): shared form style constants with mobile font-size fix"
```

---

## Task 2: `useReportDraft` hook

**Files:**
- Create: `web/src/hooks/useReportDraft.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useEffect, useState } from 'react'
import type {
  ClassDailyReportTimelineItem,
  ClassDailyReportTraineeProgress,
  ClassDailyReportDrillTime,
} from '../types'

export interface ReportDraftState {
  reportDate: string
  reportGroup: string
  reportGame: string
  reportSessionLabel: string
  reportStartTime: string
  reportEndTime: string
  mgConfirmed: string
  mgAttended: string
  currentTrainees: string
  licensesReceived: string
  overrideHoursToDate: string
  overridePaidHours: string
  overrideLiveHours: string
  selectedTrainerIds: string[]
  timelineItems: ClassDailyReportTimelineItem[]
  progressRows: ClassDailyReportTraineeProgress[]
  drillTimeRows: ClassDailyReportDrillTime[]
  coordinatorNotes: string
}

export function isValidDraft(v: unknown): v is ReportDraftState {
  if (typeof v !== 'object' || v === null) return false
  const d = v as ReportDraftState
  return (
    typeof d.reportDate === 'string' &&
    d.reportDate !== '' &&
    Array.isArray(d.timelineItems) &&
    Array.isArray(d.progressRows) &&
    Array.isArray(d.drillTimeRows)
  )
}

/**
 * Persists form state to localStorage (debounced 500ms) and exposes
 * hasDraft / discardDraft for the draft-restored banner.
 *
 * Does NOT read from localStorage — reading happens in ReportEditForm's
 * init useEffect so it can decide whether to use draft or server data.
 *
 * key should be stable per report: `report-draft-${classId}-${reportId ?? 'new'}`
 */
export function useReportDraft(
  key: string,
  state: ReportDraftState,
  initialized: boolean,
): { hasDraft: boolean; discardDraft: () => void } {
  const [hasDraft, setHasDraft] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return false
      return isValidDraft(JSON.parse(raw))
    } catch {
      return false
    }
  })

  // Re-check hasDraft when key changes (e.g. user opens a different report)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      setHasDraft(!!raw && isValidDraft(JSON.parse(raw)))
    } catch {
      setHasDraft(false)
    }
  }, [key])

  // Write state to localStorage, debounced 500ms, only after form is initialized
  useEffect(() => {
    if (!initialized) return
    const id = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state))
        setHasDraft(true)
      } catch {
        // QuotaExceededError — silently ignore, draft is optional
        console.error('[useReportDraft] localStorage write failed')
      }
    }, 500)
    return () => clearTimeout(id)
  }, [key, state, initialized])

  function discardDraft() {
    localStorage.removeItem(key)
    setHasDraft(false)
  }

  return { hasDraft, discardDraft }
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useReportDraft.ts
git commit -m "feat(mobile-report): useReportDraft hook for localStorage draft persistence"
```

---

## Task 3: `HeaderFieldsSection`

**Files:**
- Create: `web/src/components/sections/HeaderFieldsSection.tsx`

This extracts the header grid (date, group, game, session, start/end time, M&G, trainees, licenses) from `ReportEditForm`. Mobile polish: inputs already single-column; font-size fix applied via `formStyles.ts`.

- [ ] **Step 1: Create the component**

```tsx
import { fieldClass } from './formStyles'

interface Props {
  reportDate: string
  reportGroup: string
  reportGame: string
  reportSessionLabel: string
  reportStartTime: string
  reportEndTime: string
  mgConfirmed: string
  mgAttended: string
  currentTrainees: string
  licensesReceived: string
  onChange: (patch: Partial<{
    reportDate: string; reportGroup: string; reportGame: string
    reportSessionLabel: string; reportStartTime: string; reportEndTime: string
    mgConfirmed: string; mgAttended: string; currentTrainees: string; licensesReceived: string
  }>) => void
}

export function HeaderFieldsSection({
  reportDate, reportGroup, reportGame, reportSessionLabel,
  reportStartTime, reportEndTime, mgConfirmed, mgAttended,
  currentTrainees, licensesReceived, onChange,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Date
          <input type="date" value={reportDate} onChange={e => onChange({ reportDate: e.target.value })} className={fieldClass} required />
        </label>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Group
          <input type="text" value={reportGroup} onChange={e => onChange({ reportGroup: e.target.value })} className={fieldClass} placeholder="e.g. A" />
        </label>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Game
          <input type="text" value={reportGame} onChange={e => onChange({ reportGame: e.target.value })} className={fieldClass} placeholder="e.g. Blackjack" />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Session
          <input type="text" value={reportSessionLabel} onChange={e => onChange({ reportSessionLabel: e.target.value })} className={fieldClass} placeholder="e.g. Day 4 PM" />
        </label>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Class start time
          <input type="time" value={reportStartTime} onChange={e => onChange({ reportStartTime: e.target.value })} className={fieldClass} />
        </label>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Class end time
          <input type="time" value={reportEndTime} onChange={e => onChange({ reportEndTime: e.target.value })} className={fieldClass} />
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">M&amp;G confirmed
          <input type="number" min="0" value={mgConfirmed} onChange={e => onChange({ mgConfirmed: e.target.value })} className={fieldClass} />
        </label>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">M&amp;G attended
          <input type="number" min="0" value={mgAttended} onChange={e => onChange({ mgAttended: e.target.value })} className={fieldClass} />
        </label>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Current trainees
          <input type="number" min="0" value={currentTrainees} onChange={e => onChange({ currentTrainees: e.target.value })} className={fieldClass} />
        </label>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Licenses received
          <input type="number" min="0" value={licensesReceived} onChange={e => onChange({ licensesReceived: e.target.value })} className={fieldClass} />
        </label>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/sections/HeaderFieldsSection.tsx
git commit -m "feat(mobile-report): extract HeaderFieldsSection"
```

---

## Task 4: `TrainersSection`, `HoursTotalsSection`, `CoordinatorNotesSection`

These three sections are already responsive. Extract them as thin wrappers.

**Files:**
- Create: `web/src/components/sections/TrainersSection.tsx`
- Create: `web/src/components/sections/HoursTotalsSection.tsx`
- Create: `web/src/components/sections/CoordinatorNotesSection.tsx`

- [ ] **Step 1: Create `TrainersSection.tsx`**

```tsx
import type { ClassTrainer } from '../../types'

interface Props {
  trainers: ClassTrainer[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function TrainersSection({ trainers, selectedIds, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {trainers.length === 0 ? (
        <span className="text-[11px] text-slate-500">No trainers assigned yet. Use the Trainers tab first.</span>
      ) : (
        trainers.map(t => {
          const checked = selectedIds.includes(t.id)
          return (
            <label
              key={t.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] cursor-pointer ${
                checked
                  ? 'border-tt-blue/40 bg-tt-blue/15 text-tt-blue'
                  : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={e => {
                  onChange(e.target.checked ? [...selectedIds, t.id] : selectedIds.filter(id => id !== t.id))
                }}
                className="accent-tt-blue"
              />
              {t.trainer_name}
            </label>
          )
        })
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `HoursTotalsSection.tsx`**

```tsx
import { fieldClass } from './formStyles'
import type { ClassLoggedHours } from '../../types'

interface ComputedTotals { hoursToDate: number; paid: number; live: number }

interface Props {
  reportDate: string
  hours: ClassLoggedHours[]
  overrideHoursToDate: string
  overridePaidHours: string
  overrideLiveHours: string
  onChange: (patch: Partial<{ overrideHoursToDate: string; overridePaidHours: string; overrideLiveHours: string }>) => void
}

function computeTotals(date: string, hours: ClassLoggedHours[]): ComputedTotals {
  if (!date) return { hoursToDate: 0, paid: 0, live: 0 }
  const relevant = hours.filter(h => h.log_date <= date)
  return {
    hoursToDate: relevant.reduce((s, h) => s + h.hours, 0),
    paid: relevant.filter(h => h.paid).reduce((s, h) => s + h.hours, 0),
    live: relevant.filter(h => h.live_training).reduce((s, h) => s + h.hours, 0),
  }
}

export function HoursTotalsSection({
  reportDate, hours, overrideHoursToDate, overridePaidHours, overrideLiveHours, onChange,
}: Props) {
  const totals = computeTotals(reportDate, hours)
  const display = {
    hoursToDate: overrideHoursToDate.trim() !== '' ? Number(overrideHoursToDate) : totals.hoursToDate,
    paid: overridePaidHours.trim() !== '' ? Number(overridePaidHours) : totals.paid,
    live: overrideLiveHours.trim() !== '' ? Number(overrideLiveHours) : totals.live,
  }

  function fmt(n: number) { return Number.isNaN(n) ? '—' : n.toFixed(2) }

  return (
    <div className="bg-white dark:bg-tt-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06] p-3">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Hours totals</p>
      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
        Calculated from logged hours up to this report date; override fields take precedence.
      </p>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
        {([
          { label: 'Training hours to date', display: display.hoursToDate, calc: totals.hoursToDate, val: overrideHoursToDate, key: 'overrideHoursToDate' as const },
          { label: 'Total paid hours',        display: display.paid,         calc: totals.paid,         val: overridePaidHours,    key: 'overridePaidHours' as const },
          { label: 'Total live training hours', display: display.live,       calc: totals.live,         val: overrideLiveHours,    key: 'overrideLiveHours' as const },
        ] as const).map(item => (
          <div key={item.key} className="bg-slate-100 dark:bg-tt-elevated rounded-md border border-slate-200 dark:border-white/[0.06] p-2">
            <div className="text-[10px] text-slate-400 dark:text-slate-500">{item.label}</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fmt(item.display)}</div>
            <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Calculated: {item.calc.toFixed(2)}</div>
            <label className="mt-2 block text-[10px] text-slate-500 dark:text-slate-400">Override
              <input type="number" step="0.25" min="0" value={item.val}
                onChange={e => onChange({ [item.key]: e.target.value })}
                className={`${fieldClass} mt-1`} />
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `CoordinatorNotesSection.tsx`**

```tsx
import { fieldClass } from './formStyles'

interface Props {
  notes: string
  canEdit: boolean
  onChange: (notes: string) => void
}

export function CoordinatorNotesSection({ notes, canEdit, onChange }: Props) {
  if (canEdit) {
    return (
      <textarea
        value={notes}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder="Leave feedback for the trainer…"
        className={fieldClass}
      />
    )
  }
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400 italic border-l-2 border-slate-300 dark:border-white/20 pl-3">
      {notes}
    </p>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/sections/TrainersSection.tsx web/src/components/sections/HoursTotalsSection.tsx web/src/components/sections/CoordinatorNotesSection.tsx
git commit -m "feat(mobile-report): extract TrainersSection, HoursTotalsSection, CoordinatorNotesSection"
```

---

## Task 5: `TimelineSection` with mobile cards and arrow-button reorder

**Files:**
- Create: `web/src/components/sections/TimelineSection.tsx`

Desktop layout: same table as before, minus the drag handle. Mobile layout: stacked cards with ↑/↓ arrow buttons.

- [ ] **Step 1: Create `TimelineSection.tsx`**

```tsx
import { fieldClass, inlineFieldClass } from './formStyles'
import type { ClassDailyReportTimelineItem } from '../../types'

interface Props {
  items: ClassDailyReportTimelineItem[]
  reportId: string
  onChange: (items: ClassDailyReportTimelineItem[]) => void
}

function newItem(reportId: string, position: number): ClassDailyReportTimelineItem {
  return {
    id: crypto.randomUUID(),
    report_id: reportId,
    start_time: '',
    end_time: '',
    activity: '',
    homework_handouts_tests: '',
    category: '',
    position,
    created_at: new Date().toISOString(),
  }
}

export function TimelineSection({ items, reportId, onChange }: Props) {
  function move(index: number, dir: -1 | 1) {
    const next = [...items]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  function update(index: number, patch: Partial<ClassDailyReportTimelineItem>) {
    onChange(items.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onChange([...items, newItem(reportId, items.length)])}
          className="rounded-md bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
        >
          + Add time block
        </button>
      </div>

      {items.length === 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">No timeline rows yet.</p>
      )}

      {/* Desktop table (unchanged layout, drag removed) */}
      {items.length > 0 && (
        <div className="hidden md:block overflow-auto bg-white dark:bg-tt-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06]">
          <table className="min-w-full text-[11px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                <th className="px-2 py-1 w-16 text-left font-semibold uppercase tracking-wide text-slate-400">Order</th>
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">Start–end</th>
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">Activity</th>
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">Homework / handouts / tests</th>
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">Category</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-tt-elevated transition-colors">
                  <td className="px-2 py-1">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                        aria-label="Move up"
                        className="rounded px-1 py-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1}
                        aria-label="Move down"
                        className="rounded px-1 py-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex gap-1">
                      <input type="time" value={item.start_time ?? ''} onChange={e => update(index, { start_time: e.target.value })} className={`w-20 ${inlineFieldClass}`} />
                      <span className="self-center text-slate-400">–</span>
                      <input type="time" value={item.end_time ?? ''} onChange={e => update(index, { end_time: e.target.value })} className={`w-20 ${inlineFieldClass}`} />
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <input type="text" value={item.activity ?? ''} onChange={e => update(index, { activity: e.target.value })} className={`w-full ${inlineFieldClass}`} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="text" value={item.homework_handouts_tests ?? ''} onChange={e => update(index, { homework_handouts_tests: e.target.value })} className={`w-full ${inlineFieldClass}`} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="text" value={item.category ?? ''} onChange={e => update(index, { category: e.target.value })} className={`w-full ${inlineFieldClass}`} placeholder="Lecture / Dexterity…" />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button type="button" onClick={() => remove(index)} className="rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 text-[10px] hover:bg-rose-500/15 transition-colors">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {items.length > 0 && (
        <div className="md:hidden space-y-3">
          {items.map((item, index) => (
            <div key={item.id} className="bg-white dark:bg-tt-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                    aria-label="Move up"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md border border-slate-200 dark:border-white/10 text-slate-500 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1}
                    aria-label="Move down"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md border border-slate-200 dark:border-white/10 text-slate-500 disabled:opacity-30">↓</button>
                </div>
                <button type="button" onClick={() => remove(index)} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-sm">✕</button>
              </div>
              <div className="flex gap-2 items-center">
                <input type="time" value={item.start_time ?? ''} onChange={e => update(index, { start_time: e.target.value })} className={`flex-1 ${fieldClass}`} />
                <span className="text-slate-400">–</span>
                <input type="time" value={item.end_time ?? ''} onChange={e => update(index, { end_time: e.target.value })} className={`flex-1 ${fieldClass}`} />
              </div>
              <label className="block text-xs text-slate-500 dark:text-slate-400">Activity
                <input type="text" value={item.activity ?? ''} onChange={e => update(index, { activity: e.target.value })} className={fieldClass} />
              </label>
              <label className="block text-xs text-slate-500 dark:text-slate-400">Homework / handouts / tests
                <input type="text" value={item.homework_handouts_tests ?? ''} onChange={e => update(index, { homework_handouts_tests: e.target.value })} className={fieldClass} />
              </label>
              <label className="block text-xs text-slate-500 dark:text-slate-400">Category
                <input type="text" value={item.category ?? ''} onChange={e => update(index, { category: e.target.value })} className={fieldClass} placeholder="Lecture / Dexterity…" />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/sections/TimelineSection.tsx
git commit -m "feat(mobile-report): TimelineSection with mobile cards and arrow-button reorder"
```

---

## Task 6: `TraineeProgressDetailModal`

**Files:**
- Create: `web/src/components/TraineeProgressDetailModal.tsx`

Full-screen modal for editing one trainee's progress row. Renders on mobile only (caller wraps in `md:hidden`).

- [ ] **Step 1: Create the modal**

```tsx
import { useEffect } from 'react'
import type { ClassDailyReportTraineeProgress, ClassEnrollment, DailyRating } from '../types'

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

interface Props {
  rows: ClassDailyReportTraineeProgress[]
  enrollments: ClassEnrollment[]
  selectedIndex: number
  onSelectIndex: (i: number) => void
  onUpdate: (updated: ClassDailyReportTraineeProgress) => void
  onClose: () => void
}

export function TraineeProgressDetailModal({
  rows, enrollments, selectedIndex, onSelectIndex, onUpdate, onClose,
}: Props) {
  const row = rows[selectedIndex]
  const enrollment = enrollments.find(e => e.id === row?.enrollment_id)

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!row) return null

  function patch(p: Partial<ClassDailyReportTraineeProgress>) {
    onUpdate({ ...row, ...p })
  }

  function ratingField(field: 'gk_rating' | 'dex_rating' | 'hom_rating', label: string) {
    return (
      <div className="space-y-1">
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
        <div className="flex gap-2">
          {RATINGS.map(r => {
            const selected = row[field] === r
            return (
              <button
                key={r}
                type="button"
                onClick={() => patch({ [field]: selected ? null : r })}
                className={`flex-1 min-h-[44px] rounded-md border text-sm font-semibold transition-colors ${selected ? RATING_SELECTED[r] : RATING_COLOR[r]}`}
              >
                {r}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function toggleRow(label: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) {
    return (
      <label className={`flex items-center gap-3 min-h-[44px] ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
        <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">{label}</span>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="accent-tt-blue w-5 h-5" />
      </label>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900" role="dialog" aria-modal="true">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
        <h2 className="font-semibold text-base text-slate-900 dark:text-slate-100">
          {enrollment?.student_name ?? 'Unknown trainee'}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900">✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Progress notes */}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Progress notes</label>
          <textarea
            value={row.progress_text ?? ''}
            onChange={e => patch({ progress_text: e.target.value })}
            rows={4}
            className="w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-base text-slate-800 dark:text-slate-200 outline-none focus:border-tt-blue/40 resize-none"
          />
        </div>

        {/* Ratings */}
        {ratingField('gk_rating', 'GK rating')}
        {ratingField('dex_rating', 'Dex rating')}
        {ratingField('hom_rating', 'HoM rating')}

        {/* Toggles */}
        <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {toggleRow('Attended', row.attendance ?? true, v => patch({ attendance: v, ...(v ? {} : { late: false }) }))}
          {toggleRow('Late', row.late ?? false, v => patch({ late: v }), !(row.attendance ?? true))}
          {toggleRow('Coming back tomorrow', row.coming_back_next_day ?? true, v => patch({ coming_back_next_day: v }))}
          {toggleRow('Homework done', row.homework_completed ?? false, v => patch({ homework_completed: v }))}
        </div>
      </div>

      {/* Prev / Next navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/10">
        <button type="button" onClick={() => onSelectIndex(selectedIndex - 1)} disabled={selectedIndex === 0}
          className="min-h-[44px] px-4 rounded-md border border-slate-200 dark:border-white/10 text-sm text-slate-600 disabled:opacity-30">
          ← Prev
        </button>
        <span className="text-xs text-slate-400">{selectedIndex + 1} / {rows.length}</span>
        <button type="button" onClick={() => onSelectIndex(selectedIndex + 1)} disabled={selectedIndex === rows.length - 1}
          className="min-h-[44px] px-4 rounded-md border border-slate-200 dark:border-white/10 text-sm text-slate-600 disabled:opacity-30">
          Next →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/TraineeProgressDetailModal.tsx
git commit -m "feat(mobile-report): TraineeProgressDetailModal for mobile per-trainee editing"
```

---

## Task 7: `TraineeProgressSection`

**Files:**
- Create: `web/src/components/sections/TraineeProgressSection.tsx`

Desktop: existing table layout. Mobile: compact one-row-per-trainee list, tap to open the detail modal.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react'
import { inlineFieldClass } from './formStyles'
import { TraineeProgressDetailModal } from '../TraineeProgressDetailModal'
import type { ClassDailyReportTraineeProgress, ClassEnrollment, DailyRating } from '../../types'

const RATINGS: DailyRating[] = ['EE', 'ME', 'AD', 'NI']

interface Props {
  rows: ClassDailyReportTraineeProgress[]
  enrollments: ClassEnrollment[]
  onChange: (rows: ClassDailyReportTraineeProgress[]) => void
  reportId: string
}

export function TraineeProgressSection({ rows, enrollments, onChange, reportId }: Props) {
  const [modalIndex, setModalIndex] = useState<number | null>(null)

  function updateRow(index: number, patch: Partial<ClassDailyReportTraineeProgress>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function loadTrainees() {
    onChange(enrollments.map(enr => {
      const existing = rows.find(r => r.enrollment_id === enr.id)
      return existing ?? {
        id: crypto.randomUUID(),
        report_id: reportId,
        enrollment_id: enr.id,
        progress_text: '',
        gk_rating: null,
        dex_rating: null,
        hom_rating: null,
        coming_back_next_day: true,
        homework_completed: false,
        attendance: true,
        late: false,
        created_at: new Date().toISOString(),
      }
    }))
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" onClick={loadTrainees}
          className="rounded-md bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
          Load current trainees
        </button>
      </div>

      {rows.length === 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          No progress rows yet. Click &quot;Load current trainees&quot; to start.
        </p>
      )}

      {/* Desktop table */}
      {rows.length > 0 && (
        <div className="hidden md:block overflow-auto bg-white dark:bg-tt-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06]">
          <table className="min-w-full text-[11px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">Trainee</th>
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">Progress notes</th>
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">Ratings (GK / Dex / HoM)</th>
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">Attended?</th>
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">Late?</th>
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">Coming back?</th>
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-400">HW done?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const enr = enrollments.find(e => e.id === row.enrollment_id)
                return (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-tt-elevated transition-colors">
                    <td className="px-2 py-1 align-top">
                      <div className="text-slate-800 dark:text-slate-200">{enr?.student_name ?? 'Unknown'}</div>
                      <div className="text-[10px] text-slate-400">{enr?.student_email}</div>
                    </td>
                    <td className="px-2 py-1 align-top">
                      <textarea value={row.progress_text ?? ''} onChange={e => updateRow(index, { progress_text: e.target.value })} rows={3} className={`w-full ${inlineFieldClass}`} />
                    </td>
                    <td className="px-2 py-1 align-top">
                      <div className="flex flex-col gap-1">
                        {(['gk_rating', 'dex_rating', 'hom_rating'] as const).map(field => (
                          <label key={field} className="flex items-center gap-1">
                            <span className="w-8 text-slate-400">{field === 'gk_rating' ? 'GK' : field === 'dex_rating' ? 'Dex' : 'HoM'}</span>
                            <select value={row[field] ?? ''} onChange={e => updateRow(index, { [field]: (e.target.value || null) as DailyRating | null })} className={`flex-1 ${inlineFieldClass}`}>
                              <option value="">—</option>
                              {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-1 align-top">
                      <label className="inline-flex items-center gap-1.5 text-slate-500 cursor-pointer">
                        <input type="checkbox" checked={row.attendance ?? true} onChange={e => updateRow(index, { attendance: e.target.checked, ...(e.target.checked ? {} : { late: false }) })} className="accent-tt-blue" />
                        <span>Yes</span>
                      </label>
                    </td>
                    <td className="px-2 py-1 align-top">
                      <label className="inline-flex items-center gap-1.5 text-slate-500 cursor-pointer">
                        <input type="checkbox" checked={row.late ?? false} disabled={!(row.attendance ?? true)} onChange={e => updateRow(index, { late: e.target.checked })} className="accent-amber-400 disabled:opacity-30" />
                        <span>Yes</span>
                      </label>
                    </td>
                    <td className="px-2 py-1 align-top">
                      <label className="inline-flex items-center gap-1.5 text-slate-500 cursor-pointer">
                        <input type="checkbox" checked={row.coming_back_next_day ?? true} onChange={e => updateRow(index, { coming_back_next_day: e.target.checked })} className="accent-tt-blue" />
                        <span>Yes</span>
                      </label>
                    </td>
                    <td className="px-2 py-1 align-top">
                      <label className="inline-flex items-center gap-1.5 text-slate-400 cursor-pointer">
                        <input type="checkbox" checked={row.homework_completed ?? false} onChange={e => updateRow(index, { homework_completed: e.target.checked })} className="accent-tt-blue" />
                        <span>Yes</span>
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile compact list */}
      {rows.length > 0 && (
        <div className="md:hidden space-y-2">
          {rows.map((row, index) => {
            const enr = enrollments.find(e => e.id === row.enrollment_id)
            const ratingLabel = (v: DailyRating | null | undefined) => v ?? '—'
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setModalIndex(index)}
                className="w-full text-left bg-white dark:bg-tt-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06] p-3 min-h-[60px] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-start justify-between">
                  <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{enr?.student_name ?? 'Unknown'}</span>
                  <span className="text-xs text-slate-400 flex gap-2">
                    <span>GK: {ratingLabel(row.gk_rating)}</span>
                    <span>Dex: {ratingLabel(row.dex_rating)}</span>
                    <span>HoM: {ratingLabel(row.hom_rating)}</span>
                  </span>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-slate-400">
                  {(row.attendance ?? true) && <span>✓ Attended</span>}
                  {!(row.attendance ?? true) && <span className="text-rose-400">✗ Absent</span>}
                  {(row.coming_back_next_day ?? true) && <span>✓ Coming back</span>}
                  {!(row.coming_back_next_day ?? true) && <span className="text-amber-400">✗ Not returning</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Mobile detail modal */}
      {modalIndex !== null && (
        <div className="md:hidden">
          <TraineeProgressDetailModal
            rows={rows}
            enrollments={enrollments}
            selectedIndex={modalIndex}
            onSelectIndex={setModalIndex}
            onUpdate={updated => updateRow(modalIndex, updated)}
            onClose={() => setModalIndex(null)}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/sections/TraineeProgressSection.tsx
git commit -m "feat(mobile-report): TraineeProgressSection with mobile compact list and detail modal"
```

---

## Task 8: `DrillTimesSection`

**Files:**
- Create: `web/src/components/sections/DrillTimesSection.tsx`

Desktop: existing table (sticky first column). Mobile: one card per drill per trainee, grouped by drill.

- [ ] **Step 1: Create the component**

```tsx
import { inlineFieldClass, fieldClass } from './formStyles'
import type { ClassDrill, ClassEnrollment, ClassDailyReportDrillTime } from '../../types'

interface Props {
  rows: ClassDailyReportDrillTime[]
  drills: ClassDrill[]
  enrollments: ClassEnrollment[]
  reportId: string
  onChange: (rows: ClassDailyReportDrillTime[]) => void
}

function drillInputClass(drill: ClassDrill, row: ClassDailyReportDrillTime): string {
  const base = 'rounded-md border px-1 py-0.5 text-[11px] outline-none '
  if (drill.type === 'drill' && row.time_seconds != null && drill.par_time_seconds != null) {
    return base + (row.time_seconds <= drill.par_time_seconds
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : 'border-amber-500/40 bg-amber-500/10 text-amber-300')
  }
  if (drill.type === 'test' && row.score != null && drill.target_score != null) {
    return base + (row.score >= drill.target_score
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : 'border-amber-500/40 bg-amber-500/10 text-amber-300')
  }
  return base + 'border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-tt-elevated text-slate-800 dark:text-slate-200'
}

export function DrillTimesSection({ rows, drills, enrollments, reportId, onChange }: Props) {
  const activeDrills = drills.filter(d => d.active)

  function updateCell(enrollmentId: string, drillId: string, patch: Partial<ClassDailyReportDrillTime>) {
    onChange(rows.map(r => r.enrollment_id === enrollmentId && r.drill_id === drillId ? { ...r, ...patch } : r))
  }

  function loadDrills() {
    const next: ClassDailyReportDrillTime[] = []
    for (const enr of enrollments) {
      for (const drill of activeDrills) {
        const existing = rows.find(r => r.enrollment_id === enr.id && r.drill_id === drill.id)
        next.push(existing ?? {
          id: crypto.randomUUID(),
          report_id: reportId,
          enrollment_id: enr.id,
          drill_id: drill.id,
          time_seconds: null,
          score: null,
          created_at: new Date().toISOString(),
        })
      }
    }
    onChange(next)
  }

  if (activeDrills.length === 0) {
    return <p className="text-[11px] text-slate-500">No active drills or tests defined. Add them in the Drills &amp; tests tab.</p>
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <>
          <p className="text-[11px] text-slate-500">Click &quot;Load drills for trainees&quot; to populate the grid.</p>
          <div className="flex justify-end">
            <button type="button" onClick={loadDrills}
              className="rounded-md bg-white/[0.06] border border-slate-200 dark:border-white/10 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-white/10 transition-colors">
              Load drills for trainees
            </button>
          </div>
        </>
      )}

      {/* Desktop table */}
      {rows.length > 0 && (
        <div className="hidden md:block overflow-auto bg-white dark:bg-tt-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06]">
          <table className="min-w-full text-[11px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-500 sticky left-0 bg-white dark:bg-tt-surface">Trainee</th>
                {activeDrills.map(drill => (
                  <th key={drill.id} className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-500">
                    <div>{drill.name}</div>
                    <div className="font-normal text-[10px] text-slate-500">
                      {drill.type === 'drill' ? `Time (s)${drill.par_time_seconds ? ` · par ${drill.par_time_seconds}` : ''}` : `Score${drill.target_score ? ` · target ${drill.target_score}` : ''}`}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enrollments.map(enr => (
                <tr key={enr.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-tt-elevated transition-colors">
                  <td className="px-2 py-1 text-slate-800 dark:text-slate-200 whitespace-nowrap sticky left-0 bg-white dark:bg-tt-surface">{enr.student_name}</td>
                  {activeDrills.map(drill => {
                    const row = rows.find(r => r.enrollment_id === enr.id && r.drill_id === drill.id)
                    if (!row) return <td key={drill.id} className="px-2 py-1 text-slate-500">—</td>
                    const value = drill.type === 'drill' ? row.time_seconds : row.score
                    return (
                      <td key={drill.id} className="px-2 py-1">
                        <input
                          type="number" step={drill.type === 'drill' ? '0.1' : '1'} min="0"
                          value={value ?? ''}
                          onChange={e => {
                            const v = e.target.value.trim()
                            const num = v === '' ? null : Number(v)
                            updateCell(enr.id, drill.id, drill.type === 'drill' ? { time_seconds: num } : { score: num })
                          }}
                          className={`w-20 ${drillInputClass(drill, row)}`}
                          placeholder={drill.type === 'drill' ? 'sec' : 'score'}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards — grouped by drill */}
      {rows.length > 0 && (
        <div className="md:hidden space-y-4">
          {activeDrills.map(drill => (
            <div key={drill.id} className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {drill.name} {drill.type === 'drill' ? `(sec${drill.par_time_seconds ? ` · par ${drill.par_time_seconds}` : ''})` : `(score${drill.target_score ? ` · target ${drill.target_score}` : ''})`}
              </h4>
              {enrollments.map(enr => {
                const row = rows.find(r => r.enrollment_id === enr.id && r.drill_id === drill.id)
                if (!row) return null
                const value = drill.type === 'drill' ? row.time_seconds : row.score
                return (
                  <div key={enr.id} className="bg-white dark:bg-tt-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06] p-3">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{enr.student_name}</div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400">
                      {drill.type === 'drill' ? 'Time (sec)' : 'Score'}
                      <input
                        type="number" step={drill.type === 'drill' ? '0.1' : '1'} min="0"
                        inputMode="decimal"
                        value={value ?? ''}
                        onChange={e => {
                          const v = e.target.value.trim()
                          const num = v === '' ? null : Number(v)
                          updateCell(enr.id, drill.id, drill.type === 'drill' ? { time_seconds: num } : { score: num })
                        }}
                        className={`${fieldClass} mt-1`}
                        placeholder={drill.type === 'drill' ? 'seconds' : 'score'}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/sections/DrillTimesSection.tsx
git commit -m "feat(mobile-report): DrillTimesSection with mobile cards grouped by drill"
```

---

## Task 9: Rewrite `ReportEditForm` as orchestrator

Replace the 562-line monolith with a thin orchestrator that owns state and delegates rendering to the section components from Tasks 3–8.

**Files:**
- Modify: `web/src/components/ReportEditForm.tsx` (full rewrite)

- [ ] **Step 1: Rewrite `ReportEditForm.tsx`**

```tsx
/**
 * components/ReportEditForm.tsx — Daily report edit form (orchestrator)
 *
 * Owns all form state. Delegates rendering to section components in
 * web/src/components/sections/. Persists unsaved state to localStorage via
 * useReportDraft so accidental navigation doesn't lose work.
 *
 * External contract unchanged: receives ReportEditFormProps, calls onSave(body).
 */

import { useEffect, useRef, useState } from 'react'
import { CollapsibleSection } from './CollapsibleSection'
import { HeaderFieldsSection } from './sections/HeaderFieldsSection'
import { TrainersSection } from './sections/TrainersSection'
import { HoursTotalsSection } from './sections/HoursTotalsSection'
import { TimelineSection } from './sections/TimelineSection'
import { TraineeProgressSection } from './sections/TraineeProgressSection'
import { DrillTimesSection } from './sections/DrillTimesSection'
import { CoordinatorNotesSection } from './sections/CoordinatorNotesSection'
import { useReportDraft, isValidDraft, type ReportDraftState } from '../hooks/useReportDraft'
import type { ReportBody, ReportWithNested } from '../lib/apiClient'
import type {
  ClassTrainer, ClassEnrollment, ClassDrill, ClassLoggedHours,
  ClassDailyReportTimelineItem, ClassDailyReportTraineeProgress, ClassDailyReportDrillTime,
} from '../types'

interface ReportEditFormProps {
  report: ReportWithNested | null
  classId?: string   // used for draft key namespacing; optional — call sites need no changes
  trainers: ClassTrainer[]
  enrollments: ClassEnrollment[]
  drills: ClassDrill[]
  hours: ClassLoggedHours[]
  defaultGame?: string
  onSave: (body: ReportBody) => Promise<void>
  onCancel: () => void
  canDelete: boolean
  onDelete?: () => void
  canEditCoordinatorNotes: boolean
}

const parseIntOrNull = (v: string) => {
  if (!v.trim()) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

export function ReportEditForm({
  report, classId, trainers, enrollments, drills, hours, defaultGame = '',
  onSave, onCancel, canDelete, onDelete, canEditCoordinatorNotes,
}: ReportEditFormProps) {
  // --- header fields ---
  const [reportDate, setReportDate]               = useState('')
  const [reportGroup, setReportGroup]             = useState('')
  const [reportGame, setReportGame]               = useState('')
  const [reportSessionLabel, setReportSessionLabel] = useState('')
  const [reportStartTime, setReportStartTime]     = useState('')
  const [reportEndTime, setReportEndTime]         = useState('')
  const [mgConfirmed, setMgConfirmed]             = useState('')
  const [mgAttended, setMgAttended]               = useState('')
  const [currentTrainees, setCurrentTrainees]     = useState('')
  const [licensesReceived, setLicensesReceived]   = useState('')
  // --- hours overrides ---
  const [overrideHoursToDate, setOverrideHoursToDate] = useState('')
  const [overridePaidHours, setOverridePaidHours]     = useState('')
  const [overrideLiveHours, setOverrideLiveHours]     = useState('')
  // --- nested ---
  const [selectedTrainerIds, setSelectedTrainerIds] = useState<string[]>([])
  const [timelineItems, setTimelineItems]           = useState<ClassDailyReportTimelineItem[]>([])
  const [progressRows, setProgressRows]             = useState<ClassDailyReportTraineeProgress[]>([])
  const [drillTimeRows, setDrillTimeRows]           = useState<ClassDailyReportDrillTime[]>([])
  const [coordinatorNotes, setCoordinatorNotes]     = useState('')
  // --- meta ---
  const [saving, setSaving]         = useState(false)
  const [initialized, setInitialized] = useState(false)

  const draftKey = `report-draft-${classId ?? report?.class_id ?? 'unknown'}-${report?.id ?? 'new'}`
  const { hasDraft, discardDraft } = useReportDraft(
    draftKey,
    {
      reportDate, reportGroup, reportGame, reportSessionLabel,
      reportStartTime, reportEndTime, mgConfirmed, mgAttended,
      currentTrainees, licensesReceived,
      overrideHoursToDate, overridePaidHours, overrideLiveHours,
      selectedTrainerIds, timelineItems, progressRows, drillTimeRows,
      coordinatorNotes,
    } satisfies ReportDraftState,
    initialized,
  )

  function applyServerState() {
    if (report) {
      setReportDate(report.report_date)
      setReportGroup(report.group_label ?? '')
      setReportGame(report.game ?? '')
      setReportSessionLabel(report.session_label ?? '')
      setReportStartTime(report.class_start_time ?? '')
      setReportEndTime(report.class_end_time ?? '')
      setMgConfirmed(report.mg_confirmed != null ? String(report.mg_confirmed) : '')
      setMgAttended(report.mg_attended != null ? String(report.mg_attended) : '')
      setCurrentTrainees(report.current_trainees != null ? String(report.current_trainees) : '')
      setLicensesReceived(report.licenses_received != null ? String(report.licenses_received) : '')
      setOverrideHoursToDate(report.override_hours_to_date != null ? String(report.override_hours_to_date) : '')
      setOverridePaidHours(report.override_paid_hours_total != null ? String(report.override_paid_hours_total) : '')
      setOverrideLiveHours(report.override_live_hours_total != null ? String(report.override_live_hours_total) : '')
      setSelectedTrainerIds(report.trainer_ids)
      setTimelineItems(report.timeline)
      setProgressRows(report.progress)
      setDrillTimeRows(report.drill_times)
      setCoordinatorNotes(report.coordinator_notes ?? '')
    } else {
      setReportDate(new Date().toISOString().slice(0, 10))
      setReportGroup(''); setReportGame(defaultGame); setReportSessionLabel('')
      setReportStartTime(''); setReportEndTime(''); setMgConfirmed(''); setMgAttended('')
      setCurrentTrainees(String(enrollments.length)); setLicensesReceived('')
      setOverrideHoursToDate(''); setOverridePaidHours(''); setOverrideLiveHours('')
      setSelectedTrainerIds([]); setTimelineItems([]); setProgressRows([]); setDrillTimeRows([])
      setCoordinatorNotes('')
    }
  }

  function applyDraft(d: ReportDraftState) {
    setReportDate(d.reportDate)
    setReportGroup(d.reportGroup)
    setReportGame(d.reportGame)
    setReportSessionLabel(d.reportSessionLabel)
    setReportStartTime(d.reportStartTime)
    setReportEndTime(d.reportEndTime)
    setMgConfirmed(d.mgConfirmed)
    setMgAttended(d.mgAttended)
    setCurrentTrainees(d.currentTrainees)
    setLicensesReceived(d.licensesReceived)
    setOverrideHoursToDate(d.overrideHoursToDate)
    setOverridePaidHours(d.overridePaidHours)
    setOverrideLiveHours(d.overrideLiveHours)
    setSelectedTrainerIds(d.selectedTrainerIds)
    setTimelineItems(d.timelineItems)
    setProgressRows(d.progressRows)
    setDrillTimeRows(d.drillTimeRows)
    setCoordinatorNotes(d.coordinatorNotes)
  }

  // Initialize from draft (if present) or from server report / defaults
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (isValidDraft(parsed)) {
          applyDraft(parsed)
          setInitialized(true)
          return
        }
      }
    } catch { /* ignore corrupt draft */ }

    if (report) {
      setReportDate(report.report_date)
      setReportGroup(report.group_label ?? '')
      setReportGame(report.game ?? '')
      setReportSessionLabel(report.session_label ?? '')
      setReportStartTime(report.class_start_time ?? '')
      setReportEndTime(report.class_end_time ?? '')
      setMgConfirmed(report.mg_confirmed != null ? String(report.mg_confirmed) : '')
      setMgAttended(report.mg_attended != null ? String(report.mg_attended) : '')
      setCurrentTrainees(report.current_trainees != null ? String(report.current_trainees) : '')
      setLicensesReceived(report.licenses_received != null ? String(report.licenses_received) : '')
      setOverrideHoursToDate(report.override_hours_to_date != null ? String(report.override_hours_to_date) : '')
      setOverridePaidHours(report.override_paid_hours_total != null ? String(report.override_paid_hours_total) : '')
      setOverrideLiveHours(report.override_live_hours_total != null ? String(report.override_live_hours_total) : '')
      setSelectedTrainerIds(report.trainer_ids)
      setTimelineItems(report.timeline)
      setProgressRows(report.progress)
      setDrillTimeRows(report.drill_times)
      setCoordinatorNotes(report.coordinator_notes ?? '')
    } else {
      setReportDate(new Date().toISOString().slice(0, 10))
      setReportGroup('')
      setReportGame(defaultGame)
      setReportSessionLabel('')
      setReportStartTime('')
      setReportEndTime('')
      setMgConfirmed('')
      setMgAttended('')
      setCurrentTrainees(String(enrollments.length))
      setLicensesReceived('')
      setOverrideHoursToDate('')
      setOverridePaidHours('')
      setOverrideLiveHours('')
      setSelectedTrainerIds([])
      setTimelineItems([])
      setProgressRows([])
      setDrillTimeRows([])
      setCoordinatorNotes('')
    }
    setInitialized(true)
  }, [report])

  function buildBody(): ReportBody {
    return {
      report_date: reportDate,
      group_label: reportGroup.trim() || null,
      game: reportGame.trim() || null,
      session_label: reportSessionLabel.trim() || null,
      class_start_time: reportStartTime.trim() || null,
      class_end_time: reportEndTime.trim() || null,
      mg_confirmed: parseIntOrNull(mgConfirmed),
      mg_attended: parseIntOrNull(mgAttended),
      current_trainees: parseIntOrNull(currentTrainees),
      licenses_received: parseIntOrNull(licensesReceived),
      override_hours_to_date: parseIntOrNull(overrideHoursToDate),
      override_paid_hours_total: parseIntOrNull(overridePaidHours),
      override_live_hours_total: parseIntOrNull(overrideLiveHours),
      trainer_ids: selectedTrainerIds,
      timeline: timelineItems.map(item => ({
        start_time: item.start_time, end_time: item.end_time,
        activity: item.activity, homework_handouts_tests: item.homework_handouts_tests,
        category: item.category,
      })),
      progress: progressRows.map(row => ({
        enrollment_id: row.enrollment_id, progress_text: row.progress_text,
        gk_rating: row.gk_rating, dex_rating: row.dex_rating, hom_rating: row.hom_rating,
        coming_back_next_day: row.coming_back_next_day ?? false,
        homework_completed: row.homework_completed ?? false,
        attendance: row.attendance ?? true, late: row.late ?? false,
      })),
      drill_times: drillTimeRows.map(row => ({
        enrollment_id: row.enrollment_id, drill_id: row.drill_id,
        time_seconds: row.time_seconds, score: row.score,
      })),
      coordinator_notes: canEditCoordinatorNotes ? (coordinatorNotes.trim() || null) : undefined,
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reportDate) return
    setSaving(true)
    try {
      await onSave(buildBody())
      discardDraft()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4 bg-slate-100 dark:bg-tt-elevated rounded-[10px] border border-slate-200 dark:border-white/[0.06] p-3 space-y-4 text-xs">
      {/* Draft restored banner */}
      {hasDraft && initialized && (
        <div role="status" className="flex items-center justify-between rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <span>Unsaved draft restored from your last session.</span>
          <button type="button" onClick={() => { discardDraft(); applyServerState() }}
            className="ml-4 underline hover:no-underline">Discard</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <HeaderFieldsSection
          reportDate={reportDate} reportGroup={reportGroup} reportGame={reportGame}
          reportSessionLabel={reportSessionLabel} reportStartTime={reportStartTime} reportEndTime={reportEndTime}
          mgConfirmed={mgConfirmed} mgAttended={mgAttended} currentTrainees={currentTrainees} licensesReceived={licensesReceived}
          onChange={patch => {
            if (patch.reportDate !== undefined)       setReportDate(patch.reportDate)
            if (patch.reportGroup !== undefined)      setReportGroup(patch.reportGroup)
            if (patch.reportGame !== undefined)       setReportGame(patch.reportGame)
            if (patch.reportSessionLabel !== undefined) setReportSessionLabel(patch.reportSessionLabel)
            if (patch.reportStartTime !== undefined)  setReportStartTime(patch.reportStartTime)
            if (patch.reportEndTime !== undefined)    setReportEndTime(patch.reportEndTime)
            if (patch.mgConfirmed !== undefined)      setMgConfirmed(patch.mgConfirmed)
            if (patch.mgAttended !== undefined)       setMgAttended(patch.mgAttended)
            if (patch.currentTrainees !== undefined)  setCurrentTrainees(patch.currentTrainees)
            if (patch.licensesReceived !== undefined) setLicensesReceived(patch.licensesReceived)
          }}
        />

        <CollapsibleSection label="Trainers for the day" defaultOpen>
          <TrainersSection trainers={trainers} selectedIds={selectedTrainerIds} onChange={setSelectedTrainerIds} />
        </CollapsibleSection>

        <CollapsibleSection label="Hours totals">
          <HoursTotalsSection
            reportDate={reportDate} hours={hours}
            overrideHoursToDate={overrideHoursToDate} overridePaidHours={overridePaidHours} overrideLiveHours={overrideLiveHours}
            onChange={patch => {
              if (patch.overrideHoursToDate !== undefined) setOverrideHoursToDate(patch.overrideHoursToDate)
              if (patch.overridePaidHours !== undefined)   setOverridePaidHours(patch.overridePaidHours)
              if (patch.overrideLiveHours !== undefined)   setOverrideLiveHours(patch.overrideLiveHours)
            }}
          />
        </CollapsibleSection>

        <CollapsibleSection label="Timeline & Progress" defaultOpen>
          <TimelineSection items={timelineItems} reportId={report?.id ?? 'new'} onChange={setTimelineItems} />
        </CollapsibleSection>

        <CollapsibleSection label="Per-trainee progress" defaultOpen>
          <TraineeProgressSection rows={progressRows} enrollments={enrollments} reportId={report?.id ?? 'new'} onChange={setProgressRows} />
        </CollapsibleSection>

        <CollapsibleSection label="Drill & test times">
          <DrillTimesSection rows={drillTimeRows} drills={drills} enrollments={enrollments} reportId={report?.id ?? 'new'} onChange={setDrillTimeRows} />
        </CollapsibleSection>

        {(canEditCoordinatorNotes || report?.coordinator_notes) && (
          <CollapsibleSection label="Coordinator feedback" defaultOpen={!!(report?.coordinator_notes)}>
            <CoordinatorNotesSection notes={coordinatorNotes} canEdit={canEditCoordinatorNotes} onChange={setCoordinatorNotes} />
          </CollapsibleSection>
        )}

        <div className="flex gap-2">
          {canDelete && onDelete && (
            <button type="button" onClick={onDelete}
              className="rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 text-xs font-semibold hover:bg-rose-500/15 transition-colors mr-auto">
              Delete report
            </button>
          )}
          <button type="button" onClick={onCancel}
            className="rounded-md bg-white dark:bg-tt-surface text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-xs font-semibold hover:brightness-110 transition-all disabled:opacity-60">
            {saving ? 'Saving…' : report ? 'Save changes' : 'Add report'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Optionally pass `classId` to call sites for better draft key namespacing**

`classId` is optional. Call sites work without it (draft key falls back to `report?.class_id`). For cleaner namespacing when creating new reports, you can add `classId={classId}` to the `<ReportEditForm ... />` JSX at the two call sites (`ClassReportsSection`, `TrainerReportsSection`) — both already have `classId` in scope from their context hooks. This is optional and both call sites type-check without it.

- [ ] **Step 3: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. If TypeScript reports missing `classId` prop at call sites, add it as noted in Step 2.

- [ ] **Step 4: Dev-server smoke check — desktop**

Run: `cd web && npm run dev`

Open a class's reports tab in the browser (desktop). Verify:
- Form renders correctly
- All sections visible
- Save a report → success, no console errors
- Cancel → form closes
- No drag handles on timeline rows; ↑/↓ arrows present and functional

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ReportEditForm.tsx web/src/pages/ClassDetail/ClassReportsSection.tsx web/src/pages/TrainerClassDetail/TrainerReportsSection.tsx
git commit -m "feat(mobile-report): rewrite ReportEditForm as orchestrator with section components and draft hook"
```

---

## Task 10: Manual QA — mobile

- [ ] **Step 1: Open DevTools → device emulator → iPhone 12 (390px width)**

Keep the dev server running from Task 9.

- [ ] **Step 2: Header fields checklist**

- [ ] Inputs render single-column
- [ ] Tapping a text input does **not** zoom the page (iOS zoom fix)
- [ ] Date / time inputs use native pickers

- [ ] **Step 3: Timeline section checklist**

- [ ] Cards visible (`md:hidden` working); desktop table hidden
- [ ] ↑/↓ buttons present and min 44px tall; reorder works
- [ ] First row: ↑ disabled. Last row: ↓ disabled
- [ ] `+ Add time block` → new card appears
- [ ] Remove button on card → card disappears
- [ ] Switch to desktop width → table appears; no drag handles anywhere

- [ ] **Step 4: Per-trainee progress checklist**

- [ ] Compact list visible on mobile
- [ ] Tap a trainee row → `TraineeProgressDetailModal` opens full-screen
- [ ] Edit progress notes → typing works; text persists when modal closes
- [ ] Change rating chips → compact list row updates immediately
- [ ] Toggle Attended off → Late becomes disabled (greyed out)
- [ ] Prev / Next navigation steps through all trainees
- [ ] First trainee: Prev disabled. Last trainee: Next disabled
- [ ] ✕ and Escape both close the modal
- [ ] Backdrop does NOT exist (full-screen modal, no backdrop)
- [ ] Switch to desktop → table visible; modal never shown

- [ ] **Step 5: Drill times checklist**

- [ ] Cards grouped by drill visible on mobile
- [ ] Time / score inputs open numeric keyboard (`inputMode="decimal"`)
- [ ] Value entered → card colour changes green/amber at par/target thresholds (same as desktop)

- [ ] **Step 6: Draft checklist**

- [ ] Fill in report (date + a timeline row + one trainee's notes)
- [ ] Hard-reload (Cmd+Shift+R) → amber draft banner appears
- [ ] Fields restored correctly
- [ ] Click Discard → page reloads with blank form; no banner on next reload
- [ ] Fill in report → save successfully → reload → no banner

- [ ] **Step 7: Dark mode**

Toggle dark mode (add `class="dark"` to `<html>` in DevTools). All mobile cards and modal should be themed correctly (dark backgrounds, appropriate text contrast).

- [ ] **Step 8: Final type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Final commit**

```bash
git commit --allow-empty -m "chore(mobile-report): QA pass complete"
```

---

## Open items for future work

- `StudentReportInput` mobile improvements (deliberately out of scope).
- If `ReportEditForm` sections need shared state (e.g., cross-section validation), consider adding a React Context to avoid passing too many props.
- If drag-and-drop reordering is missed on desktop, `@dnd-kit/core` is the recommended replacement (touch-capable, accessible).
