/**
 * pages/ClassDetail/ClassStudentsSection.tsx — Student enrollment management tab
 *
 * Allows coordinators to enroll trainees in a class, update their enrollment
 * status, assign them to a competency group, and remove them.
 *
 * Follows the same pattern as ClassTrainersSection:
 *   1. "Enroll student" button opens a search modal querying role="trainee" profiles
 *   2. Already-enrolled students are filtered out by email
 *   3. On click, a `class_enrollments` record is created with the selected status and group
 *   4. Clicking a student row opens an edit modal to change status or group
 *
 * Groups (A, B, C etc.) are used to split students into concurrent training sub-groups
 * that can be assigned to different schedule slots and trainers.
 *
 * Enrollment statuses:
 *   enrolled  — Currently active in the class
 *   dropped   — Has left the class (record kept for history)
 *   failed    — Did not complete the class
 *
 * The `saving` state is shown inside the search modal while the enrollment
 * API call is in flight, since the modal stays open for batch enrollments.
 */

import { useState } from 'react'
import { api } from '../../lib/apiClient'
import { useToast } from '../../contexts/ToastContext'
import { useClassDetail } from '../../contexts/ClassDetailContext'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import type { ClassEnrollment, EnrollmentStatus, Profile } from '../../types'

interface ClassStudentsSectionProps {
  classId: string   // UUID of the class
  className: string // Display name — used in the empty-state message
  archived?: boolean
}

export function ClassStudentsSection({ classId, className, archived = false }: ClassStudentsSectionProps) {
  const { toast } = useToast()
  const { enrollments: students, loading, refreshEnrollments, setEnrollments } = useClassDetail()
  const [error, setError] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; confirmLabel: string; confirmVariant: 'danger' | 'primary'; onConfirm: () => void } | null>(null)
  // Controls the enroll-student search modal
  const [enrollOpen, setEnrollOpen] = useState(false)
  // Status and group to assign when enrolling from the search modal
  const [status, setStatus] = useState<EnrollmentStatus>('enrolled')
  const [groupLabel, setGroupLabel] = useState('')
  // True while the enrollment create API call is in flight
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Pick<Profile, 'id' | 'full_name' | 'email'>[]>(
    [],
  )
  const [searchLoading, setSearchLoading] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  // Set when a student row is clicked to open the edit modal
  const [editingEnrollment, setEditingEnrollment] = useState<ClassEnrollment | null>(null)
  // Edit form field state
  const [editStatus, setEditStatus] = useState<EnrollmentStatus>('enrolled')
  const [editGroupLabel, setEditGroupLabel] = useState('')
  // Loading state for fail/unfail action
  const [failActionLoading, setFailActionLoading] = useState<string | null>(null)

  // CSV import state
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<{ email: string; group_label?: string; valid: boolean }[]>([])
  const [csvSaving, setCsvSaving] = useState(false)
  const [csvResult, setCsvResult] = useState<{ inserted: number; skipped: number; not_found: string[] } | null>(null)

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      const rows = lines.map(line => {
        const parts = line.split(',').map(s => s.trim())
        const email = parts[0] ?? ''
        const group_label = parts[1] || undefined
        const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        return { email, group_label, valid }
      })
      // Skip header row if first row looks like a header
      if (rows.length > 0 && (rows[0].email.toLowerCase() === 'email' || !rows[0].valid)) {
        rows.shift()
      }
      setCsvRows(rows)
    }
    reader.readAsText(file)
  }

  async function handleCsvImport() {
    const validRows = csvRows.filter(r => r.valid)
    if (!validRows.length) return
    setCsvSaving(true)
    setError(null)
    try {
      const result = await api.enrollments.createBatch(classId, {
        students: validRows.map(r => ({ email: r.email, group_label: r.group_label })),
      })
      setCsvResult(result)
      refreshEnrollments()
      toast(`Imported ${result.inserted} student${result.inserted !== 1 ? 's' : ''}`, 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setCsvSaving(false)
    }
  }

  /**
   * Searches for trainee profiles matching the search term.
   * Filters out already-enrolled students by email to prevent duplicates.
   */
  async function searchProfiles(term: string) {
    setSearchLoading(true)
    setError(null)
    try {
      const raw = await api.profiles.search({ role: 'trainee', search: term || undefined })
      const existingEmails = new Set(students.map(s => s.student_email.toLowerCase()))
      setSearchResults(raw.filter(p => !existingEmails.has(p.email.toLowerCase())))
    } catch (err) {
      console.error('searchStudents error:', (err as Error).message)
      setError((err as Error).message)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  /**
   * Creates an enrollment record for the selected profile.
   * Uses the `status` and `groupLabel` from the search modal controls.
   * Refreshes both the student list and search results after enrollment.
   */
  async function handleEnrollStudent(profile: Pick<Profile, 'id' | 'full_name' | 'email'>) {
    setSaving(true)
    setError(null)
    // Optimistic: remove from search, add to list
    setSearchResults(prev => prev.filter(p => p.id !== profile.id))
    const tempId = `temp-${Date.now()}`
    const optimistic: ClassEnrollment = {
      id: tempId,
      class_id: classId,
      student_name: profile.full_name ?? profile.email,
      student_email: profile.email,
      status,
      group_label: groupLabel.trim() || null,
      created_at: new Date().toISOString(),
    }
    setEnrollments(prev => [...prev, optimistic])
    toast('Student enrolled', 'success')
    setStatus('enrolled')
    setGroupLabel('')
    try {
      await api.enrollments.create(classId, {
        student_name: profile.full_name ?? profile.email,
        student_email: profile.email,
        status,
        group_label: groupLabel.trim() || null,
      })
      refreshEnrollments()
    } catch (err) {
      console.error('createEnrollment error:', (err as Error).message)
      toast((err as Error).message, 'error')
      setEnrollments(prev => prev.filter(e => e.id !== tempId))
      setSearchResults(prev => [...prev, profile])
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateManualStudent(e: React.FormEvent) {
    e.preventDefault()
    const studentName = manualName.trim()
    const studentEmail = manualEmail.trim().toLowerCase()
    if (!studentName) {
      setError('Student name is required')
      return
    }
    if (studentEmail && students.some(s => s.student_email.toLowerCase() === studentEmail)) {
      setError('Student is already enrolled in this class')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const created = await api.enrollments.create(classId, {
        student_name: studentName,
        ...(studentEmail ? { student_email: studentEmail } : {}),
        status,
        group_label: groupLabel.trim() || null,
      })
      setEnrollments(prev => [...prev, created])
      setManualName('')
      setManualEmail('')
      setStatus('enrolled')
      setGroupLabel('')
      toast('Student created and enrolled', 'success')
      refreshEnrollments()
    } catch (err) {
      console.error('manualCreateEnrollment error:', (err as Error).message)
      toast((err as Error).message, 'error')
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /** Pre-fills the edit modal with the selected enrollment's current values. */
  function openEditStudent(enrollment: ClassEnrollment) {
    setEditingEnrollment(enrollment)
    setEditStatus(enrollment.status)
    setEditGroupLabel(enrollment.group_label ?? '')
  }

  /** Saves changes to an existing enrollment (status and/or group label). */
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingEnrollment) return
    setError(null)
    try {
      await api.enrollments.update(classId, editingEnrollment.id, {
        status: editStatus,
        group_label: editGroupLabel.trim() || null,
      })
      setEditingEnrollment(null)
      refreshEnrollments()
      toast('Student updated', 'success')
    } catch (err) {
      console.error('updateEnrollment error:', (err as Error).message)
      toast((err as Error).message, 'error')
    }
  }

  /** Removes a student's enrollment from this class after confirmation. */
  function handleRemove(id: string, name: string) {
    setConfirmState({
      title: 'Remove student',
      message: `Remove "${name}" from this class?`,
      confirmLabel: 'Remove',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmState(null)
        const prev = students
        setEnrollments(s => s.filter(e => e.id !== id))
        toast('Student removed', 'success')
        try {
          await api.enrollments.delete(classId, id)
        } catch (err) {
          console.error('removeEnrollment error:', (err as Error).message)
          toast((err as Error).message, 'error')
          setEnrollments(prev)
        }
      },
    })
  }

  async function handleToggleFail(enrollment: ClassEnrollment) {
    if (failActionLoading) return
    const newStatus: EnrollmentStatus = enrollment.status === 'failed' ? 'enrolled' : 'failed'
    const prev = students
    setEnrollments(s => s.map(e => e.id === enrollment.id ? { ...e, status: newStatus } : e))
    toast(newStatus === 'failed' ? 'Student marked as failed' : 'Student reinstated', 'success')
    setFailActionLoading(enrollment.id)
    try {
      await api.enrollments.update(classId, enrollment.id, {
        status: newStatus,
        group_label: enrollment.group_label,
      })
      refreshEnrollments()
    } catch (err) {
      console.error('toggleFail error:', (err as Error).message)
      toast((err as Error).message, 'error')
      setEnrollments(prev)
    } finally {
      setFailActionLoading(null)
    }
  }

  const fieldClass = 'mt-1 w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-500 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15'

  return (
    <section className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Students</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            View and manage students enrolled in this class, including competency groups.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
          <button type="button" onClick={() => { setCsvOpen(true); setCsvRows([]); setCsvResult(null) }} className="rounded-md bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-medium px-3 py-1.5 text-xs hover:bg-white/[0.08] transition-colors">
            Import CSV
          </button>
          <button type="button" onClick={() => { setEnrollOpen(true); searchProfiles('') }} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white font-semibold px-3 py-1.5 text-xs hover:brightness-110 transition-all duration-150">
            + Enroll student
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-3 rounded-md bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}

      {csvOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[14px] shadow-2xl p-4">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Import students from CSV</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">Upload a CSV with columns: email, group (optional). One student per line.</p>
              </div>
              <button type="button" onClick={() => setCsvOpen(false)} className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-500 hover:text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors" aria-label="Close">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>

            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="mb-3 block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 dark:bg-tt-elevated file:px-3 file:py-1.5 file:text-xs file:text-slate-700 dark:text-slate-200 file:cursor-pointer" />

            {csvRows.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-md bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/[0.06] mb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                      <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-slate-500">Email</th>
                      <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-slate-500">Group</th>
                      <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-white/[0.03]">
                        <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{r.email}</td>
                        <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{r.group_label || '—'}</td>
                        <td className="px-3 py-1.5">
                          {r.valid
                            ? <span className="text-emerald-400 text-[10px]">Valid</span>
                            : <span className="text-rose-400 text-[10px]">Invalid email</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {csvResult && (
              <div className="mb-3 text-xs space-y-1">
                <p className="text-emerald-400">Imported {csvResult.inserted} student{csvResult.inserted !== 1 ? 's' : ''}. {csvResult.skipped > 0 && `${csvResult.skipped} already enrolled.`}</p>
                {csvResult.not_found.length > 0 && (
                  <p className="text-amber-400">Not found: {csvResult.not_found.join(', ')}</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCsvOpen(false)} className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-slate-100 dark:bg-tt-elevated transition-colors">Close</button>
              <button type="button" onClick={handleCsvImport} disabled={csvSaving || csvRows.filter(r => r.valid).length === 0} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-[11px] font-semibold hover:brightness-110 transition-all disabled:opacity-60">
                {csvSaving ? 'Importing…' : `Import ${csvRows.filter(r => r.valid).length} student${csvRows.filter(r => r.valid).length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {enrollOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md mx-2 max-h-[80vh] overflow-y-auto bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[14px] shadow-2xl p-4">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Enroll student</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">Search existing trainee profiles and add them to this class.</p>
              </div>
              <button type="button" onClick={() => { setEnrollOpen(false); setSearchTerm(''); setSearchResults([]); setGroupLabel(''); setStatus('enrolled'); setManualName(''); setManualEmail('') }} className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-500 hover:text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors" aria-label="Close">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>

            <div className="mb-3 flex flex-col gap-2 text-xs sm:flex-row sm:items-center">
              <input type="search" value={searchTerm} onChange={e => { const val = e.target.value; setSearchTerm(val); searchProfiles(val) }} placeholder="Search students by name…" className={`flex-1 ${fieldClass}`} />
              <select value={status} onChange={e => setStatus(e.target.value as EnrollmentStatus)} className={`w-28 ${fieldClass}`}>
                <option value="enrolled">Enrolled</option>
                <option value="dropped">Dropped</option>
              </select>
              <input type="text" value={groupLabel} onChange={e => setGroupLabel(e.target.value)} placeholder="Group" className={`w-20 ${fieldClass}`} />
            </div>

            <form onSubmit={handleCreateManualStudent} className="mb-3 rounded-[10px] border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-tt-elevated p-3">
              <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Create student manually</h5>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Full name" className={fieldClass} />
                <input type="email" value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder="Email optional" className={fieldClass} />
              </div>
              <div className="mt-2 flex justify-end">
                <button type="submit" disabled={saving || !manualName.trim()} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-[11px] font-semibold hover:brightness-110 transition-all disabled:opacity-60">
                  Create and enroll
                </button>
              </div>
            </form>

            <div className="max-h-64 overflow-auto rounded-[10px] bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/[0.06]">
              {searchLoading ? (
                <p className="px-3 py-2 text-[11px] text-slate-500">Searching…</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-2 text-[11px] text-slate-500">No students found.</p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-white/[0.04] text-xs">
                  {searchResults.map(p => (
                    <li key={p.id} className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-white dark:bg-tt-surface transition-colors" onClick={() => handleEnrollStudent(p)}>
                      <div>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{p.full_name ?? p.email}</p>
                        <p className="text-[11px] text-slate-500">{p.email}</p>
                      </div>
                      <span className="text-[11px] text-tt-blue">Enroll</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {saving && <p className="mt-2 text-[11px] text-slate-500">Saving enrollment…</p>}
          </div>
        </div>
      )}

      {editingEnrollment && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md mx-2 bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[14px] shadow-2xl p-4">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Edit student</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">Update this student&apos;s enrollment status and competency group.</p>
              </div>
              <button type="button" onClick={() => setEditingEnrollment(null)} className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-500 hover:text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors" aria-label="Close">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>

            <div className="mb-3 text-xs">
              <p className="font-medium text-slate-700 dark:text-slate-200">{editingEnrollment.student_name}</p>
              <p className="text-[11px] text-slate-500">{editingEnrollment.student_email}</p>
            </div>

            <form onSubmit={handleSaveEdit} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Status
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value as EnrollmentStatus)} className={fieldClass}>
                    <option value="enrolled">Enrolled</option>
                    <option value="failed">Failed</option>
                    <option value="dropped">Dropped</option>
                  </select>
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Group (A/B/C)
                  <input type="text" value={editGroupLabel} onChange={e => setEditGroupLabel(e.target.value)} className={fieldClass} placeholder="e.g. A" />
                </label>
              </div>
              <div className="md:col-span-3 flex justify-end items-end gap-2">
                <button type="button" onClick={() => setEditingEnrollment(null)} className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-slate-100 dark:bg-tt-elevated transition-colors">Cancel</button>
                <button type="submit" className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-[11px] font-semibold hover:brightness-110 transition-all">Save changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={3} cols={5} />
      ) : students.length === 0 ? (
        <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px]">
          <EmptyState
            title="No students enrolled yet"
            description={`Enroll students in ${className} to start tracking their progress.`}
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
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Group</th>
                  {!archived && <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-white dark:bg-tt-surface cursor-pointer transition-colors duration-100" onClick={() => openEditStudent(s)}>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{s.student_name}</td>
                    <td className="hidden sm:table-cell px-3 py-2 text-slate-500 dark:text-slate-400">{s.student_email}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        s.status === 'enrolled' ? 'bg-emerald-500/15 text-emerald-300' :
                        s.status === 'failed'   ? 'bg-rose-500/15 text-rose-400' :
                        'bg-slate-500/15 text-slate-400'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{s.group_label ?? '—'}</td>
                    {!archived && (
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(s.status === 'enrolled' || s.status === 'failed') && (
                            <button
                              type="button"
                              disabled={failActionLoading === s.id}
                              onClick={e => { e.stopPropagation(); handleToggleFail(s) }}
                              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                s.status === 'failed'
                                  ? 'text-emerald-400 hover:bg-emerald-500/10'
                                  : 'text-rose-400 hover:bg-rose-500/10'
                              }`}
                            >
                              {s.status === 'failed' ? 'Unfail' : 'Fail'}
                            </button>
                          )}
                          <button type="button" onClick={e => { e.stopPropagation(); handleRemove(s.id, s.student_name) }} className="rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/25 px-2 py-1 text-[11px] font-medium hover:bg-rose-500/20 transition-colors">Remove</button>
                        </div>
                      </td>
                    )}
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
