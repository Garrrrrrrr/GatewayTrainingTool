import { useState } from 'react'
import { api } from '../../lib/apiClient'
import { useTrainerClassDetail } from '../../contexts/TrainerClassDetailContext'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../contexts/ToastContext'
import type { ClassScheduleSlot } from '../../types'

export function TrainerScheduleSection() {
  const { classId, classInfo, schedule, loading, refreshSchedule, setSchedule } = useTrainerClassDetail()
  const { toast } = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editingSlot, setEditingSlot] = useState<ClassScheduleSlot | null>(null)
  const [formDate, setFormDate] = useState('')
  const [formStart, setFormStart] = useState('')
  const [formEnd, setFormEnd] = useState('')
  const [formGroup, setFormGroup] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ClassScheduleSlot | null>(null)

  const archived = classInfo?.archived ?? false

  function resetForm() {
    setFormDate('')
    setFormStart('')
    setFormEnd('')
    setFormGroup('')
    setFormNotes('')
    setEditingSlot(null)
    setFormOpen(false)
  }

  function openEditForm(slot: ClassScheduleSlot) {
    setEditingSlot(slot)
    setFormDate(slot.slot_date)
    setFormStart(slot.start_time)
    setFormEnd(slot.end_time)
    setFormGroup(slot.group_label ?? '')
    setFormNotes(slot.notes ?? '')
    setFormOpen(true)
  }

  function openAddForm() {
    setEditingSlot(null)
    setFormDate('')
    setFormStart('')
    setFormEnd('')
    setFormGroup('')
    setFormNotes('')
    setFormOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!formDate || !formStart || !formEnd) return
    setSaving(true)

    const body = {
      slot_date: formDate,
      start_time: formStart,
      end_time: formEnd,
      group_label: formGroup.trim() || null,
      notes: formNotes.trim() || null,
    }

    try {
      if (editingSlot) {
        await api.selfService.updateScheduleSlot(classId, editingSlot.id, body)
        toast('Slot updated', 'success')
      } else {
        await api.selfService.createScheduleSlot(classId, body)
        toast('Slot added', 'success')
      }
      resetForm()
      refreshSchedule()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const prev = schedule
    setSchedule(s => s.filter(slot => slot.id !== deleteTarget.id))
    setDeleteTarget(null)
    toast('Slot deleted', 'success')
    try {
      await api.selfService.deleteScheduleSlot(classId, deleteTarget.id)
    } catch (err) {
      toast((err as Error).message, 'error')
      setSchedule(prev)
    }
  }

  const fieldClass = 'mt-1 w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-500 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15'

  return (
    <section className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Schedule
            {!loading && schedule.length > 0 && (
              <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-500">({schedule.length} slots)</span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">All scheduled sessions for this class.</p>
        </div>
        {!archived && (
          <button
            type="button"
            onClick={() => formOpen ? resetForm() : openAddForm()}
            className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white font-semibold px-3 py-1.5 text-xs hover:brightness-110 transition-all duration-150 self-start sm:self-auto flex-shrink-0"
          >
            {formOpen ? 'Cancel' : '+ Add slot'}
          </button>
        )}
      </header>

      {formOpen && (
        <form onSubmit={handleSave} className="mb-4 rounded-[10px] border border-slate-200 dark:border-white/[0.06] bg-slate-100 dark:bg-tt-elevated p-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            {editingSlot ? `Editing slot — ${editingSlot.slot_date}` : 'New schedule slot'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className={fieldClass} required />
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Start time
                <input type="time" value={formStart} onChange={e => setFormStart(e.target.value)} className={fieldClass} required />
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">End time
                <input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)} className={fieldClass} required />
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Group label <span className="font-normal">(optional)</span>
                <input type="text" value={formGroup} onChange={e => setFormGroup(e.target.value)} className={fieldClass} placeholder="e.g. Group A" />
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Notes <span className="font-normal">(optional)</span>
                <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)} className={fieldClass} placeholder="Any notes for this session…" />
              </label>
            </div>
            <div className="md:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={resetForm} className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-tt-elevated transition-colors duration-150">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-xs font-semibold hover:brightness-110 transition-all duration-150 disabled:opacity-50">
                {saving ? 'Saving…' : editingSlot ? 'Update slot' : 'Save slot'}
              </button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : schedule.length === 0 ? (
        <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px]">
          <EmptyState title="No schedule yet" description="No schedule slots have been added to this class." variant="neutral" />
        </div>
      ) : (
        <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px] overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Time</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">Group</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden md:table-cell">Notes</th>
                {!archived && <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {schedule.map(slot => (
                <tr key={slot.id} className="border-b border-white/[0.03] hover:bg-white dark:bg-tt-surface transition-colors duration-100">
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">{slot.slot_date}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{slot.start_time}–{slot.end_time}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{slot.group_label ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-400 dark:text-slate-500 hidden md:table-cell">{slot.notes ?? '—'}</td>
                  {!archived && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => openEditForm(slot)} className="rounded px-2 py-1 text-[11px] font-medium text-tt-blue hover:bg-tt-blue/10 transition-colors">Edit</button>
                        <button type="button" onClick={() => setDeleteTarget(slot)} className="rounded px-2 py-1 text-[11px] font-medium text-rose-400 hover:bg-rose-500/10 transition-colors">Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete slot"
        message={`Delete the slot on ${deleteTarget?.slot_date} (${deleteTarget?.start_time}–${deleteTarget?.end_time})?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
