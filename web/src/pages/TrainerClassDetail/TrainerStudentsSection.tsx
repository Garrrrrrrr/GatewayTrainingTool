import { useState } from 'react'
import { api } from '../../lib/apiClient'
import { useTrainerClassDetail } from '../../contexts/TrainerClassDetailContext'
import { useToast } from '../../contexts/ToastContext'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonTable } from '../../components/Skeleton'
import type { ClassEnrollment, EnrollmentStatus, Profile } from '../../types'

export function TrainerStudentsSection() {
  const { classId, classInfo, enrollments, loading, setEnrollments, refreshEnrollments } = useTrainerClassDetail()
  const { toast } = useToast()
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [status, setStatus] = useState<EnrollmentStatus>('enrolled')
  const [groupLabel, setGroupLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Pick<Profile, 'id' | 'full_name' | 'email'>[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const archived = classInfo?.archived ?? false

  async function searchProfiles(term: string) {
    setSearchLoading(true)
    setError(null)
    try {
      const raw = await api.selfService.availableTrainees(classId, term || undefined)
      const existingEmails = new Set(enrollments.map(s => s.student_email.toLowerCase()))
      setSearchResults(raw.filter(p => !existingEmails.has(p.email.toLowerCase())))
    } catch (err) {
      setError((err as Error).message)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  async function handleEnrollStudent(profile: Pick<Profile, 'id' | 'full_name' | 'email'>) {
    setSaving(true)
    setError(null)
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
      await api.selfService.createEnrollment(classId, {
        student_name: profile.full_name ?? profile.email,
        student_email: profile.email,
        status,
        group_label: groupLabel.trim() || null,
      })
      refreshEnrollments()
    } catch (err) {
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
    if (studentEmail && enrollments.some(s => s.student_email.toLowerCase() === studentEmail)) {
      setError('Student is already enrolled in this class')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const created = await api.selfService.createEnrollment(classId, {
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
      toast((err as Error).message, 'error')
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = 'mt-1 w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-500 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15'

  async function handleToggleFail(enrollment: ClassEnrollment) {
    if (actionLoading) return
    const newStatus = enrollment.status === 'failed' ? 'enrolled' : 'failed'
    const prev = enrollments
    setEnrollments(es => es.map(e => e.id === enrollment.id ? { ...e, status: newStatus } : e))
    toast(newStatus === 'failed' ? 'Student marked as failed' : 'Student reinstated', 'success')
    setActionLoading(enrollment.id)
    try {
      await api.selfService.updateEnrollmentStatus(classId, enrollment.id, { status: newStatus })
      refreshEnrollments()
    } catch (err) {
      toast((err as Error).message, 'error')
      setEnrollments(prev)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <section className="bg-white dark:bg-tt-surface rounded-[10px] p-4">
      <header className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Enrolled students
            {!loading && enrollments.length > 0 && (
              <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-500">({enrollments.length})</span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">Students enrolled in this class.</p>
        </div>
        {!archived && (
          <button type="button" onClick={() => { setEnrollOpen(true); searchProfiles('') }} className="self-start sm:self-auto rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white font-semibold px-3 py-1.5 text-xs hover:brightness-110 transition-all duration-150">
            + Enroll student
          </button>
        )}
      </header>

      {error && (
        <p className="mb-3 rounded-md bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}

      {enrollOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md mx-2 max-h-[80vh] overflow-y-auto bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[14px] shadow-2xl p-4">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Enroll student</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">Search trainee profiles and add them to this class.</p>
              </div>
              <button type="button" onClick={() => { setEnrollOpen(false); setSearchTerm(''); setSearchResults([]); setGroupLabel(''); setStatus('enrolled'); setManualName(''); setManualEmail('') }} className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-500 hover:text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors" aria-label="Close">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>

            <div className="mb-3 flex flex-col gap-2 text-xs sm:flex-row sm:items-center">
              <input type="search" value={searchTerm} onChange={e => { const val = e.target.value; setSearchTerm(val); searchProfiles(val) }} placeholder="Search students by name..." className={`flex-1 ${fieldClass}`} />
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
                <p className="px-3 py-2 text-[11px] text-slate-500">Searching...</p>
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

            {saving && <p className="mt-2 text-[11px] text-slate-500">Saving enrollment...</p>}
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : enrollments.length === 0 ? (
        <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px]">
          <EmptyState title="No students enrolled" description="No students are currently enrolled in this class." variant="neutral" />
        </div>
      ) : (
        <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px] overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">Email</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">Group</th>
                {!archived && <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {enrollments.map(e => (
                <tr key={e.id} className="border-b border-white/[0.03] hover:bg-white dark:bg-tt-surface transition-colors duration-100">
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{e.student_name}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{e.student_email}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      e.status === 'enrolled' ? 'bg-emerald-500/15 text-emerald-300' :
                      e.status === 'failed'   ? 'bg-rose-500/15 text-rose-400' :
                      'bg-slate-500/15 text-slate-400'
                    }`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{e.group_label ?? '—'}</td>
                  {!archived && (
                    <td className="px-3 py-2 text-right">
                      {(e.status === 'enrolled' || e.status === 'failed') && (
                        <button
                          type="button"
                          onClick={() => handleToggleFail(e)}
                          disabled={actionLoading === e.id}
                          className={`rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                            e.status === 'failed'
                              ? 'text-emerald-400 hover:bg-emerald-500/10'
                              : 'text-rose-400 hover:bg-rose-500/10'
                          }`}
                        >
                          {e.status === 'failed' ? 'Unfail' : 'Fail'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
