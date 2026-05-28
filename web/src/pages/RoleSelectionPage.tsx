import { useState } from 'react'
import { api } from '../lib/apiClient'
import { useAuth } from '../contexts/AuthContext'
import { STUDENT_SELF_SERVICE_ENABLED } from '../lib/features'

type SelectedRole = 'trainee' | 'trainer' | 'coordinator'

const ROLES: { value: SelectedRole; label: string; description: string; requiresApproval: boolean }[] = [
  { value: 'trainee', label: 'Student', description: 'View your classes, track progress, and submit drill times.', requiresApproval: false },
  { value: 'trainer', label: 'Trainer', description: 'Access assigned classes, daily work queues, reports, schedule, and training records.', requiresApproval: true },
  { value: 'coordinator', label: 'Coordinator', description: 'Manage internal training operations, classes, trainers, students, reports, and approvals.', requiresApproval: true },
]

const roleIcons: Record<SelectedRole, string> = {
  trainee: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8z',
  trainer: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  coordinator: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
}

/** Formats phone input as (XXX) XXX-XXXX */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function RoleSelectionPage() {
  const { refreshAuth, signOut } = useAuth()
  const [selected, setSelected] = useState<SelectedRole | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = selected && firstName.trim() && lastName.trim() && !submitting
  const visibleRoles = STUDENT_SELF_SERVICE_ENABLED ? ROLES : ROLES.filter(r => r.value !== 'trainee')

  const handleSubmit = async () => {
    if (!selected || !firstName.trim() || !lastName.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await api.profiles.selectRole({
        selected_role: selected,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.replace(/\D/g, '').length >= 10 ? phone : undefined,
      })
      if (result.status === 'pending') {
        setPending(true)
      } else {
        await refreshAuth()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (pending) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-tt-darkest flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
              <path d="M12 8v4M12 16h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Pending Approval</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Your request to become a <span className="text-slate-800 dark:text-slate-200 font-medium">{selected === 'trainer' ? 'Trainer' : 'Coordinator'}</span> has been submitted. A coordinator will review your request shortly.
          </p>
          <button
            type="button"
            onClick={signOut}
            className="rounded-[10px] border border-slate-200 dark:border-white/[0.08] px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-tt-darkest flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-tt-blue to-tt-teal flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg leading-none select-none">G</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Welcome to Training Tool</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Complete your internal training profile to get started.</p>
        </div>

        {/* Profile fields */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor="firstName" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                First Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="John"
                className="rounded-[10px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-tt-surface px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-tt-blue/40 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor="lastName" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Last Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Doe"
                className="rounded-[10px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-tt-surface px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-tt-blue/40 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Phone Number <span className="text-slate-400 dark:text-slate-600">(optional)</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              placeholder="(604) 555-1234"
              className="rounded-[10px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-tt-surface px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-tt-blue/40 focus:outline-none"
            />
          </div>
        </div>

        {/* Role selection */}
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Select your role</p>
        <div className="flex flex-col gap-3 mb-6">
          {visibleRoles.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => setSelected(r.value)}
              className={`flex items-start gap-4 p-4 rounded-[10px] border text-left transition-colors ${
                selected === r.value
                  ? 'bg-tt-blue/10 border-tt-blue/40'
                  : 'bg-white dark:bg-tt-surface border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15]'
              }`}
            >
              <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 ${
                selected === r.value ? 'bg-tt-blue/20' : 'bg-slate-100 dark:bg-white/[0.04]'
              }`}>
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={selected === r.value ? 'text-tt-blue' : 'text-slate-500 dark:text-slate-400'}>
                  <path d={roleIcons[r.value]} />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.label}</span>
                  {r.requiresApproval && (
                    <span className="text-[10px] font-medium text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      Requires approval
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.description}</p>
              </div>
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-rose-400 text-center mb-4">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-[10px] bg-tt-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-tt-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Submitting...' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
