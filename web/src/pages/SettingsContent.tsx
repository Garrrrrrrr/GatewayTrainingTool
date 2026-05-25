import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { api } from '../lib/apiClient'
import { SkeletonCard } from '../components/Skeleton'
import { RoleRequestsSection } from './RoleRequestsSection'
import { LegacyStudentClaimsSection } from './LegacyStudentClaimsSection'
import { FeedbackInboxSection } from './FeedbackInboxSection'
import { PROVINCES, type Profile } from '../types'

const inputClass = 'mt-1 w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-tt-blue/60 focus:ring-2 focus:ring-tt-blue/20 dark:focus:border-tt-blue/40 dark:focus:ring-tt-blue/15'
const fieldLabel = 'text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider'
const profileCache = new Map<string, Profile>()

/** Formats phone input as (XXX) XXX-XXXX */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function SettingsContent() {
  const { email, role, signOut } = useAuth()
  const { toast } = useToast()
  const { theme, toggleTheme } = useTheme()
  const initialProfile = profileCache.get(email) ?? null
  const [profile, setProfile] = useState<Profile | null>(initialProfile)
  const [loading, setLoading] = useState(!initialProfile)
  const [editing, setEditing] = useState(false)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editProvince, setEditProvince] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedbackCategory, setFeedbackCategory] = useState<'bug' | 'feature' | 'general'>('general')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [sendingFeedback, setSendingFeedback] = useState(false)

  useEffect(() => {
    const cached = profileCache.get(email)
    if (cached) {
      setProfile(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    api.profiles.me()
      .then(result => {
        profileCache.set(email, result)
        setProfile(result)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [email])

  function startEditing() {
    if (!profile) return
    setEditFirstName(profile.first_name ?? '')
    setEditLastName(profile.last_name ?? '')
    setEditPhone(profile.phone ?? '')
    setEditProvince(profile.province ?? '')
    setEditing(true)
  }

  function cancelEditing() { setEditing(false) }

  async function handleSave() {
    if (!editFirstName.trim() || !editLastName.trim()) {
      toast('First name and last name are required.', 'error')
      return
    }
    setSaving(true)
    try {
      const updated = await api.profiles.update({
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        phone: editPhone.replace(/\D/g, '').length >= 10 ? editPhone : editPhone.trim() || undefined,
        province: editProvince || undefined,
      })
      profileCache.set(email, updated)
      setProfile(updated)
      setEditing(false)
      toast('Profile updated', 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleFeedbackSubmit() {
    const message = feedbackMessage.trim()
    if (message.length < 10) {
      toast('Please include at least 10 characters of feedback.', 'error')
      return
    }
    if (message.length > 2000) {
      toast('Feedback must be 2000 characters or less.', 'error')
      return
    }

    setSendingFeedback(true)
    try {
      await api.selfService.submitFeedback({
        category: feedbackCategory,
        message,
        page: window.location.pathname,
      })
      setFeedbackMessage('')
      setFeedbackCategory('general')
      toast('Feedback submitted. Thank you.', 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSendingFeedback(false)
    }
  }

  const roleLabel = (r: string | null) => {
    if (r === 'coordinator') return 'Coordinator'
    if (r === 'trainer') return 'Trainer'
    return 'Student'
  }

  const provinceLabel = (code: Profile['province']) =>
    PROVINCES.find((p) => p.value === code)?.label ?? null

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  const memberSince = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

  const sectionClass = 'bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.06] rounded-[10px] p-5'
  const sectionHeading = 'text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400'

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Settings</h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">App and account settings</p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-0.5">
          <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{roleLabel(role)}</span>
          <span className="text-xs text-slate-600 dark:text-slate-300">{email}</span>
        </div>
      </header>

      {loading ? (
        <div className="mt-6"><SkeletonCard lines={5} /></div>
      ) : (
        <div className="mt-6 space-y-4">
          {/* Profile section */}
          <section className={sectionClass}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={sectionHeading}>Profile</h3>
              {!editing && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="rounded-md bg-slate-100 dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-tt-elevated transition-colors duration-150"
                >
                  Edit profile
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className={fieldLabel}>First Name</span>
                {editing ? (
                  <input type="text" value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className={inputClass} placeholder="First name" />
                ) : profile?.first_name ? (
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">{profile.first_name}</p>
                ) : (
                  <p className="text-sm italic text-slate-400 dark:text-slate-500 mt-1">Not set</p>
                )}
              </div>

              <div>
                <span className={fieldLabel}>Last Name</span>
                {editing ? (
                  <input type="text" value={editLastName} onChange={e => setEditLastName(e.target.value)} className={inputClass} placeholder="Last name" />
                ) : profile?.last_name ? (
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">{profile.last_name}</p>
                ) : (
                  <p className="text-sm italic text-slate-400 dark:text-slate-500 mt-1">Not set</p>
                )}
              </div>

              <div>
                <span className={fieldLabel}>Phone</span>
                {editing ? (
                  <input type="tel" value={editPhone} onChange={e => setEditPhone(formatPhone(e.target.value))} className={inputClass} placeholder="(604) 555-1234" />
                ) : profile?.phone ? (
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">{profile.phone}</p>
                ) : (
                  <p className="text-sm italic text-slate-400 dark:text-slate-500 mt-1">Not set</p>
                )}
              </div>

              <div>
                <span className={fieldLabel}>Email</span>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">{profile?.email ?? email}</p>
              </div>

              <div>
                <span className={fieldLabel}>Role</span>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">
                  {profile?.role ? capitalize(profile.role) : 'Unknown'}
                </p>
              </div>

              <div>
                <span className={fieldLabel}>Province</span>
                {editing ? (
                  <select value={editProvince} onChange={e => setEditProvince(e.target.value)} className={inputClass}>
                    <option value="">Select province</option>
                    {PROVINCES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                ) : profile?.province ? (
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">{provinceLabel(profile.province)}</p>
                ) : (
                  <p className="text-sm italic text-slate-400 dark:text-slate-500 mt-1">Not set</p>
                )}
              </div>

              <div>
                <span className={fieldLabel}>Member since</span>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">
                  {profile?.created_at ? memberSince(profile.created_at) : '---'}
                </p>
              </div>
            </div>

            {editing && (
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="rounded-md bg-slate-100 dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-4 py-2 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-tt-elevated transition-colors duration-150 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all duration-150 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            )}
          </section>

          {/* Appearance section — all roles */}
          <section className={sectionClass}>
            <h3 className={`${sectionHeading} mb-4`}>Appearance</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Theme</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {theme === 'dark' ? 'Dark mode is on' : 'Light mode is on'}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-tt-blue/50 ${
                  theme === 'dark' ? 'bg-tt-blue' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Feedback section — all roles */}
          <section className={sectionClass}>
            <h3 className={`${sectionHeading} mb-4`}>Feedback</h3>
            <div className="space-y-4">
              <div>
                <span className={fieldLabel}>Type</span>
                <select
                  value={feedbackCategory}
                  onChange={e => setFeedbackCategory(e.target.value as 'bug' | 'feature' | 'general')}
                  className={inputClass}
                >
                  <option value="general">General</option>
                  <option value="bug">Bug report</option>
                  <option value="feature">Feature request</option>
                </select>
              </div>

              <div>
                <span className={fieldLabel}>Message</span>
                <textarea
                  value={feedbackMessage}
                  onChange={e => setFeedbackMessage(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Describe what happened, what you expected, and any context that helps us reproduce it."
                  className={`${inputClass} resize-y min-h-[120px]`}
                />
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-right">
                  {feedbackMessage.length}/2000
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleFeedbackSubmit}
                  disabled={sendingFeedback}
                  className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all duration-150 disabled:opacity-50"
                >
                  {sendingFeedback ? 'Sending…' : 'Send feedback'}
                </button>
              </div>
            </div>
          </section>

          {/* Role Requests section — coordinators only */}
          {role === 'coordinator' && (
            <section className={sectionClass}>
              <h3 className={`${sectionHeading} mb-3`}>Role Requests</h3>
              <RoleRequestsSection />
            </section>
          )}

          {/* Feedback Inbox section — coordinators only */}
          {role === 'coordinator' && (
            <section className={sectionClass}>
              <h3 className={`${sectionHeading} mb-3`}>Feedback Inbox</h3>
              <FeedbackInboxSection />
            </section>
          )}

          {/* Legacy Student Claims section — coordinators only */}
          {role === 'coordinator' && (
            <section className={sectionClass}>
              <h3 className={`${sectionHeading} mb-3`}>Legacy Student Claims</h3>
              <LegacyStudentClaimsSection />
            </section>
          )}

          {/* Account section */}
          <section className={sectionClass}>
            <h3 className={`${sectionHeading} mb-3`}>Account</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Sign out of your {roleLabel(role).toLowerCase()} account.
            </p>
            <Link
              to="/privacy"
              className="mb-4 block text-sm font-medium text-tt-blue hover:text-tt-blue-hover dark:text-sky-300 dark:hover:text-sky-200"
            >
              Privacy Policy
            </Link>
            <button
              type="button"
              className="rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 dark:border-rose-500/25 px-3 py-1.5 text-sm font-semibold hover:bg-rose-500/20 transition-colors duration-150"
              onClick={signOut}
            >
              Sign out
            </button>
          </section>
        </div>
      )}
    </>
  )
}
