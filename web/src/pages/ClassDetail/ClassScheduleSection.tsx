/**
 * pages/ClassDetail/ClassScheduleSection.tsx — Schedule slot management tab
 *
 * Allows coordinators to create, edit, and delete time-slot entries for a class.
 * Schedule slots define when trainer(s) will work with a specific student
 * group (A, B, C) on a given date and time range.
 *
 * The component fetches both schedule slots and trainers in parallel on mount:
 *   - Slots are the primary data (the schedule table)
 *   - Trainers are loaded so the slot form can offer a "Trainer" dropdown; this
 *     is non-critical and failures are silently ignored
 *
 * The form is rendered as a full-screen modal overlay (not inline) since it needs
 * to be accessible above the table without shifting layout.
 *
 * Clicking a row in the schedule table opens the edit form pre-populated with
 * that slot's data. Clicking the Remove button deletes without a confirmation
 * dialog (low-stakes operation compared to deleting a class or report).
 *
 * The `trainerNames` helper resolves `trainer_ids` (class_trainers.id values)
 * to display names for the schedule table, falling back to em-dash if none exist.
 */

import { useState, useMemo } from 'react'
import { api } from '../../lib/apiClient'
import { useClassDetail } from '../../contexts/ClassDetailContext'
import { useToast } from '../../contexts/ToastContext'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import type { ClassScheduleSlot } from '../../types'

interface ClassScheduleSectionProps {
  classId: string
  className: string
  startDate?: string
  endDate?: string
}

export function ClassScheduleSection({ classId, className, startDate, endDate }: ClassScheduleSectionProps) {
  const { schedule: slots, trainers, loading, refreshSchedule } = useClassDetail()
  const { toast } = useToast()
  const [error, setError] = useState<string | null>(null)
  // Controls the slot form modal (both add and edit use the same form)
  const [formOpen, setFormOpen] = useState(false)
  // Null when adding a new slot; set to the slot being edited when in edit mode
  const [editingSlot, setEditingSlot] = useState<ClassScheduleSlot | null>(null)
  // Form field state
  const [slotDate, setSlotDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [notes, setNotes] = useState('')
  const [trainerIds, setTrainerIds] = useState<string[]>([])
  const [groupLabel, setGroupLabel] = useState('')
  const [saving, setSaving] = useState(false)

  // Recurring schedule modal state
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [recDays, setRecDays] = useState<number[]>([])
  const [recStartTime, setRecStartTime] = useState('')
  const [recEndTime, setRecEndTime] = useState('')
  const [recTrainerIds, setRecTrainerIds] = useState<string[]>([])
  const [recGroupLabel, setRecGroupLabel] = useState('')
  const [recDateFrom, setRecDateFrom] = useState(startDate ?? '')
  const [recDateTo, setRecDateTo] = useState(endDate ?? '')
  const [recSaving, setRecSaving] = useState(false)

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const recPreviewCount = useMemo(() => {
    if (!recDays.length || !recDateFrom || !recDateTo) return 0
    const daySet = new Set(recDays)
    let count = 0
    const cursor = new Date(recDateFrom + 'T12:00:00')
    const end = new Date(recDateTo + 'T12:00:00')
    while (cursor <= end) {
      if (daySet.has(cursor.getDay())) count++
      cursor.setDate(cursor.getDate() + 1)
    }
    return count
  }, [recDays, recDateFrom, recDateTo])

  function toggleRecDay(day: number) {
    setRecDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  async function handleRecurringSave(e: React.FormEvent) {
    e.preventDefault()
    if (!recDays.length || !recStartTime || !recEndTime || !recDateFrom || !recDateTo) return
    setRecSaving(true)
    setError(null)
    try {
      const result = await api.schedule.createBatch(classId, {
        days_of_week: recDays,
        start_time: recStartTime,
        end_time: recEndTime,
        trainer_ids: recTrainerIds,
        group_label: recGroupLabel.trim() || undefined,
        date_from: recDateFrom,
        date_to: recDateTo,
      })
      toast(`Created ${result.inserted} schedule slot${result.inserted !== 1 ? 's' : ''}`, 'success')
      setRecurringOpen(false)
      refreshSchedule()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setRecSaving(false)
    }
  }

  /** Resets form fields and opens the modal in "add new slot" mode. */
  function openAddForm() {
    setEditingSlot(null)
    setSlotDate('')
    setStartTime('')
    setEndTime('')
    setNotes('')
    setTrainerIds([])
    setGroupLabel('')
    setFormOpen(true)
  }

  /** Pre-fills the form with an existing slot's data and opens it in "edit" mode. */
  function openEditForm(slot: ClassScheduleSlot) {
    setEditingSlot(slot)
    setSlotDate(slot.slot_date)
    setStartTime(slot.start_time)
    setEndTime(slot.end_time)
    setNotes(slot.notes ?? '')
    setTrainerIds(slot.trainer_ids?.length ? slot.trainer_ids : slot.trainer_id ? [slot.trainer_id] : [])
    setGroupLabel(slot.group_label ?? '')
    setFormOpen(true)
  }

  /** Closes the modal and clears the editing state. */
  function closeForm() {
    setFormOpen(false)
    setEditingSlot(null)
  }

  /**
   * Handles both create and update depending on whether `editingSlot` is set.
   * Empty string fields are converted to null before sending to the API.
   */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!slotDate || !startTime || !endTime) return
    setSaving(true)
    setError(null)

    const payload = {
      slot_date: slotDate,
      start_time: startTime,
      end_time: endTime,
      notes: notes.trim() || null,
      trainer_id: trainerIds[0] ?? null,
      trainer_ids: trainerIds,
      group_label: groupLabel.trim() || null,
    }

    try {
      if (editingSlot) {
        await api.schedule.update(classId, editingSlot.id, payload)
        toast('Schedule slot updated', 'success')
      } else {
        await api.schedule.create(classId, payload)
        toast('Schedule slot added', 'success')
      }
      closeForm()
      refreshSchedule()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(id: string) {
    try {
      await api.schedule.delete(classId, id)
      refreshSchedule()
      toast('Schedule slot removed', 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  /**
   * Resolves a trainer ID to a display name for the schedule table.
   * Returns em-dash if no trainer is assigned or the ID can't be found.
   */
  function toggleTrainer(id: string) {
    setTrainerIds(prev => prev.includes(id) ? prev.filter(trainerId => trainerId !== id) : [...prev, id])
  }

  function toggleRecTrainer(id: string) {
    setRecTrainerIds(prev => prev.includes(id) ? prev.filter(trainerId => trainerId !== id) : [...prev, id])
  }

  function trainerNames(slot: ClassScheduleSlot) {
    const ids = slot.trainer_ids?.length ? slot.trainer_ids : slot.trainer_id ? [slot.trainer_id] : []
    if (ids.length === 0) return '—'
    return ids.map(id => trainers.find(t => t.id === id)?.trainer_name).filter(Boolean).join(', ') || '—'
  }

  const fieldClass = 'mt-1 w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-500 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15'

  return (
    <section className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Schedule</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Schedule trainers and student groups for different times. Assign trainers from the Trainers tab first.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
          <button type="button" onClick={() => { setRecDateFrom(startDate ?? ''); setRecDateTo(endDate ?? ''); setRecurringOpen(true) }} className="rounded-md bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-medium px-3 py-1.5 text-xs hover:bg-white/[0.08] transition-colors">
            Recurring
          </button>
          <button type="button" onClick={openAddForm} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white font-semibold px-3 py-1.5 text-xs hover:brightness-110 transition-all duration-150">
            + Add slot
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-3 rounded-md bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[14px] shadow-2xl p-4">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{editingSlot ? 'Edit schedule slot' : 'Add schedule slot'}</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">Set date, time range, trainer, and student group for this slot.</p>
              </div>
              <button type="button" onClick={closeForm} className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-500 hover:text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors" aria-label="Close">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>

            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date
                  <input type="date" value={slotDate} onChange={e => setSlotDate(e.target.value)} className={fieldClass} required />
                </label>
              </div>
              <div className="flex gap-2">
                <label className="flex-1 block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Start time
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={fieldClass} required />
                </label>
                <label className="flex-1 block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">End time
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={fieldClass} required />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Trainers
                  <div className="mt-1 max-h-32 overflow-auto rounded-md border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-tt-elevated">
                    {trainers.length === 0 ? (
                      <p className="px-2 py-1.5 text-[11px] text-slate-500">Assign trainers first.</p>
                    ) : trainers.map(t => (
                      <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-tt-surface">
                        <input type="checkbox" checked={trainerIds.includes(t.id)} onChange={() => toggleTrainer(t.id)} className="accent-tt-blue" />
                        <span>{t.trainer_name} ({t.role})</span>
                      </label>
                    ))}
                  </div>
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Student group (A/B/C)
                  <input type="text" value={groupLabel} onChange={e => setGroupLabel(e.target.value)} className={fieldClass} placeholder="e.g. A" />
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Notes
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={fieldClass} placeholder="Optional notes" />
                </label>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={closeForm} className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-slate-100 dark:bg-tt-elevated transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-[11px] font-semibold hover:brightness-110 transition-all disabled:opacity-60">
                  {saving ? 'Saving…' : editingSlot ? 'Save changes' : 'Add slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {recurringOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[14px] shadow-2xl p-4">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Create recurring schedule</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">Generate slots for selected days of the week within a date range.</p>
              </div>
              <button type="button" onClick={() => setRecurringOpen(false)} className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-500 hover:text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors" aria-label="Close">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>

            <form onSubmit={handleRecurringSave} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Days of the week</label>
                <div className="flex gap-1.5">
                  {DAY_NAMES.map((name, i) => (
                    <button key={i} type="button" onClick={() => toggleRecDay(i)} className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${recDays.includes(i) ? 'bg-tt-blue/20 border border-tt-blue/35 text-tt-blue' : 'bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200'}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Start time
                  <input type="time" value={recStartTime} onChange={e => setRecStartTime(e.target.value)} className={fieldClass} required />
                </label>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">End time
                  <input type="time" value={recEndTime} onChange={e => setRecEndTime(e.target.value)} className={fieldClass} required />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">From date
                  <input type="date" value={recDateFrom} onChange={e => setRecDateFrom(e.target.value)} className={fieldClass} required />
                </label>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">To date
                  <input type="date" value={recDateTo} onChange={e => setRecDateTo(e.target.value)} className={fieldClass} required />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Trainers
                  <div className="mt-1 max-h-32 overflow-auto rounded-md border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-tt-elevated">
                    {trainers.length === 0 ? (
                      <p className="px-2 py-1.5 text-[11px] text-slate-500">Assign trainers first.</p>
                    ) : trainers.map(t => (
                      <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-tt-surface">
                        <input type="checkbox" checked={recTrainerIds.includes(t.id)} onChange={() => toggleRecTrainer(t.id)} className="accent-tt-blue" />
                        <span>{t.trainer_name}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Group
                  <input type="text" value={recGroupLabel} onChange={e => setRecGroupLabel(e.target.value)} className={fieldClass} placeholder="e.g. A" />
                </label>
              </div>

              {recPreviewCount > 0 && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">This will create <span className="font-semibold text-slate-700 dark:text-slate-200">{recPreviewCount}</span> slot{recPreviewCount !== 1 ? 's' : ''} (duplicates will be skipped).</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setRecurringOpen(false)} className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-slate-100 dark:bg-tt-elevated transition-colors">Cancel</button>
                <button type="submit" disabled={recSaving || recDays.length === 0} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-[11px] font-semibold hover:brightness-110 transition-all disabled:opacity-60">
                  {recSaving ? 'Creating…' : `Create ${recPreviewCount} slot${recPreviewCount !== 1 ? 's' : ''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={3} cols={7} />
      ) : slots.length === 0 ? (
        <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px]">
          <EmptyState
            title="No schedule slots yet"
            description={`Add slots for ${className} to assign trainers and groups to specific times.`}
            variant="neutral"
          />
        </div>
      ) : (
        <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px] overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Start</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">End</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Trainer</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Group</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slots.map(slot => (
                <tr key={slot.id} className="border-b border-white/[0.03] hover:bg-white dark:bg-tt-surface cursor-pointer transition-colors duration-100" onClick={() => openEditForm(slot)}>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{slot.slot_date}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{slot.start_time}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{slot.end_time}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{trainerNames(slot)}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{slot.group_label ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 max-w-[120px] truncate" title={slot.notes ?? undefined}>{slot.notes ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={e => { e.stopPropagation(); handleRemove(slot.id) }} className="rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/25 px-2 py-1 text-[11px] font-medium hover:bg-rose-500/20 transition-colors">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
