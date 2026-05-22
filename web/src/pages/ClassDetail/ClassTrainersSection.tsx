/**
 * pages/ClassDetail/ClassTrainersSection.tsx — Trainer assignment management tab
 *
 * Allows coordinators to assign existing trainer profiles to a class and manage
 * their role (primary vs. assistant). Trainers assigned here appear in:
 *   - The schedule slot "Trainer" dropdown (ClassScheduleSection)
 *   - The daily report "Trainers for the day" checkboxes (ClassReportsSection)
 *
 * Workflow:
 *   1. "Assign trainer" button opens a search modal that queries the `/profiles`
 *      endpoint filtered by role="trainer".
 *   2. Already-assigned trainers are filtered out of results by email comparison
 *      so they cannot be added twice.
 *   3. After selecting a profile, a `class_trainers` record is created with the
 *      trainer's name, email, and selected role (primary/assistant).
 *   4. Clicking a trainer row in the table opens an edit modal to change their
 *      name, email, or role for this class (without affecting their profile).
 *
 * Note: trainer records store a snapshot of the name/email at assignment time.
 * They are not automatically updated if the user profile changes later.
 */

import { useState } from 'react'
import { api } from '../../lib/apiClient'
import { useToast } from '../../contexts/ToastContext'
import { useClassDetail } from '../../contexts/ClassDetailContext'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import type { ClassTrainer, TrainerRole, Profile } from '../../types'

interface ClassTrainersSectionProps {
  classId: string   // UUID of the class
  className: string // Display name — used in the empty-state message
}

export function ClassTrainersSection({ classId, className }: ClassTrainersSectionProps) {
  const { toast } = useToast()
  const { trainers, loading, refreshTrainers, setTrainers } = useClassDetail()
  const [error, setError] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; confirmLabel: string; confirmVariant: 'danger' | 'primary'; onConfirm: () => void } | null>(null)
  // Controls the assign-trainer search modal
  const [assignOpen, setAssignOpen] = useState(false)
  // The role to assign when clicking a profile from the search results
  const [role, setRole] = useState<TrainerRole>('primary')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Pick<Profile, 'id' | 'full_name' | 'email'>[]>(
    [],
  )
  const [searchLoading, setSearchLoading] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [saving, setSaving] = useState(false)
  // Set when a trainer row is clicked to open the edit modal
  const [editingTrainer, setEditingTrainer] = useState<ClassTrainer | null>(null)
  // Edit form field state
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState<TrainerRole>('primary')

  /**
   * Searches the profiles table for users with role="trainer" matching the term.
   * Filters out trainers already assigned to this class by email to prevent
   * duplicate assignments.
   */
  async function searchProfiles(term: string) {
    setSearchLoading(true)
    setError(null)
    try {
      const raw = await api.profiles.search({ role: 'trainer', search: term || undefined })
      const existingEmails = new Set(trainers.map(t => t.trainer_email.toLowerCase()))
      // Exclude profiles already assigned to avoid duplicates
      setSearchResults(raw.filter(p => !existingEmails.has(p.email.toLowerCase())))
    } catch (err) {
      console.error('searchTrainers error:', (err as Error).message)
      setError((err as Error).message)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  /**
   * Creates a class_trainers record for the selected profile.
   * Falls back to the profile's email as the display name if full_name is not set.
   * After assigning, refreshes both the trainers list and the search results.
   */
  async function handleAssignTrainer(profile: Pick<Profile, 'id' | 'full_name' | 'email'>) {
    setError(null)
    // Optimistic: remove from search results immediately
    setSearchResults(prev => prev.filter(p => p.id !== profile.id))
    // Optimistic: add to trainers list immediately with a temp ID
    const tempId = `temp-${Date.now()}`
    const optimisticTrainer: ClassTrainer = {
      id: tempId,
      class_id: classId,
      trainer_name: profile.full_name ?? profile.email,
      trainer_email: profile.email,
      role,
      created_at: new Date().toISOString(),
    }
    setTrainers(prev => [...prev, optimisticTrainer])
    toast('Trainer assigned', 'success')
    try {
      await api.trainers.create(classId, {
        trainer_name: profile.full_name ?? profile.email,
        trainer_email: profile.email,
        role,
      })
      // Sync with server to get real ID
      refreshTrainers()
    } catch (err) {
      console.error('createTrainer error:', (err as Error).message)
      toast((err as Error).message, 'error')
      // Roll back optimistic updates
      setTrainers(prev => prev.filter(t => t.id !== tempId))
      setSearchResults(prev => [...prev, profile])
    }
  }

  async function handleCreateManualTrainer(e: React.FormEvent) {
    e.preventDefault()
    const trainerName = manualName.trim()
    const trainerEmail = manualEmail.trim().toLowerCase()
    if (!trainerName) {
      setError('Trainer name is required')
      return
    }
    if (trainerEmail && trainers.some(t => t.trainer_email.toLowerCase() === trainerEmail)) {
      setError('Trainer is already assigned to this class')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const created = await api.trainers.create(classId, {
        trainer_name: trainerName,
        ...(trainerEmail ? { trainer_email: trainerEmail } : {}),
        role,
      })
      setTrainers(prev => [...prev, created])
      setManualName('')
      setManualEmail('')
      toast('Trainer created and assigned', 'success')
      refreshTrainers()
    } catch (err) {
      console.error('manualCreateTrainer error:', (err as Error).message)
      toast((err as Error).message, 'error')
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /** Pre-fills the edit modal with the selected trainer's current values. */
  function openEditTrainer(t: ClassTrainer) {
    setEditingTrainer(t)
    setEditName(t.trainer_name)
    setEditEmail(t.trainer_email)
    setEditRole(t.role)
  }

  /** Saves changes to an existing class_trainers record (name, email, or role). */
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingTrainer) return
    if (!editName.trim() || !editEmail.trim()) return
    setError(null)
    try {
      await api.trainers.update(classId, editingTrainer.id, {
        trainer_name: editName.trim(),
        trainer_email: editEmail.trim(),
        role: editRole,
      })
      setEditingTrainer(null)
      refreshTrainers()
      toast('Trainer updated', 'success')
    } catch (err) {
      console.error('updateTrainer error:', (err as Error).message)
      toast((err as Error).message, 'error')
    }
  }

  /** Removes a trainer from this class after confirmation. */
  function handleRemove(id: string, name: string) {
    setConfirmState({
      title: 'Remove trainer',
      message: `Remove "${name}" from this class?`,
      confirmLabel: 'Remove',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmState(null)
        // Optimistic: remove from list immediately
        const prev = trainers
        setTrainers(t => t.filter(tr => tr.id !== id))
        toast('Trainer removed', 'success')
        try {
          await api.trainers.delete(classId, id)
        } catch (err) {
          console.error('removeTrainer error:', (err as Error).message)
          toast((err as Error).message, 'error')
          setTrainers(prev) // roll back
        }
      },
    })
  }

  const fieldClass = 'mt-1 w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-500 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15'

  return (
    <section className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Trainers</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Assign primary and assistant trainers to this class.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setAssignOpen(true); searchProfiles('') }}
          className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white font-semibold px-3 py-1.5 text-xs hover:brightness-110 transition-all duration-150 self-start sm:self-auto flex-shrink-0"
        >
          + Assign trainer
        </button>
      </header>

      {error && (
        <p className="mb-3 rounded-md bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md mx-2 max-h-[80vh] overflow-y-auto bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[14px] shadow-2xl p-4">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Assign trainer</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">Search existing trainer profiles and assign them to this class.</p>
              </div>
              <button type="button" onClick={() => { setAssignOpen(false); setSearchTerm(''); setSearchResults([]); setManualName(''); setManualEmail('') }} className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-500 hover:text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors" aria-label="Close">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>

            <div className="mb-3 flex flex-col gap-2 text-xs sm:flex-row sm:items-center">
              <input type="search" value={searchTerm} onChange={e => { const val = e.target.value; setSearchTerm(val); searchProfiles(val) }} placeholder="Search trainers by name…" className={`flex-1 ${fieldClass}`} />
              <select value={role} onChange={e => setRole(e.target.value as TrainerRole)} className={`w-32 ${fieldClass}`}>
                <option value="primary">Primary</option>
                <option value="assistant">Assistant</option>
              </select>
            </div>

            <form onSubmit={handleCreateManualTrainer} className="mb-3 rounded-[10px] border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-tt-elevated p-3">
              <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Create trainer manually</h5>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Full name" className={fieldClass} />
                <input type="email" value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder="Email optional" className={fieldClass} />
              </div>
              <div className="mt-2 flex justify-end">
                <button type="submit" disabled={saving || !manualName.trim()} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-[11px] font-semibold hover:brightness-110 transition-all disabled:opacity-60">
                  Create and assign
                </button>
              </div>
            </form>

            <div className="max-h-64 overflow-auto rounded-[10px] bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/[0.06]">
              {searchLoading ? (
                <p className="px-3 py-2 text-[11px] text-slate-500">Searching…</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-2 text-[11px] text-slate-500">No trainers found.</p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-white/[0.04] text-xs">
                  {searchResults.map(p => (
                    <li key={p.id} className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-white dark:bg-tt-surface transition-colors" onClick={() => handleAssignTrainer(p)}>
                      <div>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{p.full_name ?? p.email}</p>
                        <p className="text-[11px] text-slate-500">{p.email}</p>
                      </div>
                      <span className="text-[11px] text-tt-blue">Assign</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {editingTrainer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md mx-2 bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[14px] shadow-2xl p-4">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Edit trainer</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">Update trainer details or role for this class.</p>
              </div>
              <button type="button" onClick={() => setEditingTrainer(null)} className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-500 hover:text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors" aria-label="Close">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>

            <form onSubmit={handleSaveEdit} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Trainer name
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className={fieldClass} required />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email
                  <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className={fieldClass} required />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Role
                  <select value={editRole} onChange={e => setEditRole(e.target.value as TrainerRole)} className={fieldClass}>
                    <option value="primary">Primary</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </label>
              </div>
              <div className="md:col-span-3 flex justify-end items-end gap-2">
                <button type="button" onClick={() => setEditingTrainer(null)} className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-slate-100 dark:bg-tt-elevated transition-colors">Cancel</button>
                <button type="submit" className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-[11px] font-semibold hover:brightness-110 transition-all">Save changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={3} cols={4} />
      ) : trainers.length === 0 ? (
        <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px]">
          <EmptyState
            title="No trainers assigned yet"
            description={`Assign trainers to ${className} to include them in schedules and reports.`}
            variant="neutral"
          />
        </div>
      ) : (
        <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                  <th className="hidden sm:table-cell px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trainers.map(t => (
                  <tr key={t.id} className="border-b border-white/[0.03] hover:bg-white dark:bg-tt-surface cursor-pointer transition-colors duration-100" onClick={() => openEditTrainer(t)}>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{t.trainer_name}</td>
                    <td className="hidden sm:table-cell px-3 py-2 text-slate-500 dark:text-slate-400">{t.trainer_email}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 capitalize">{t.role}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={e => { e.stopPropagation(); handleRemove(t.id, t.trainer_name) }} className="rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/25 px-2 py-1 text-[11px] font-medium hover:bg-rose-500/20 transition-colors">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        confirmVariant={confirmState?.confirmVariant}
        onConfirm={confirmState?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmState(null)}
      />
    </section>
  )
}
