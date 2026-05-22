import { useState } from 'react'
import { api } from '../../lib/apiClient'
import { useTrainerClassDetail } from '../../contexts/TrainerClassDetailContext'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../contexts/ToastContext'
import type { ClassLoggedHours } from '../../types'

type HoursTab = 'my-hours' | 'student-hours'

const fieldClass = 'w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-500 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15'

export function TrainerHoursSection() {
  const { classId, classInfo, trainerHours, studentHours, enrollments, loading, refreshHours, setTrainerHours, setStudentHours } = useTrainerClassDetail()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<HoursTab>('my-hours')
  const archived = classInfo?.archived ?? false

  // ─── My Hours state ────────────────────────────────────────────────────────
  const [myFormOpen, setMyFormOpen] = useState(false)
  const [myEditing, setMyEditing] = useState<ClassLoggedHours | null>(null)
  const [myDate, setMyDate] = useState(new Date().toISOString().slice(0, 10))
  const [myHours, setMyHours] = useState('')
  const [myPaid, setMyPaid] = useState(false)
  const [myLive, setMyLive] = useState(false)
  const [myNotes, setMyNotes] = useState('')
  const [mySaving, setMySaving] = useState(false)
  const [myDeleteTarget, setMyDeleteTarget] = useState<ClassLoggedHours | null>(null)

  // ─── Student Hours state ───────────────────────────────────────────────────
  const [stuFormOpen, setStuFormOpen] = useState(false)
  const [stuBulkMode, setStuBulkMode] = useState(false)
  const [stuEditing, setStuEditing] = useState<ClassLoggedHours | null>(null)
  const [stuDate, setStuDate] = useState(new Date().toISOString().slice(0, 10))
  const [stuEnrollmentId, setStuEnrollmentId] = useState('')
  const [stuHours, setStuHours] = useState('')
  const [stuPaid, setStuPaid] = useState(false)
  const [stuLive, setStuLive] = useState(false)
  const [stuNotes, setStuNotes] = useState('')
  const [stuSaving, setStuSaving] = useState(false)
  const [stuDeleteTarget, setStuDeleteTarget] = useState<ClassLoggedHours | null>(null)
  // Bulk mode
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().slice(0, 10))
  const [bulkPaid, setBulkPaid] = useState(false)
  const [bulkLive, setBulkLive] = useState(false)
  const [bulkHoursMap, setBulkHoursMap] = useState<Record<string, string>>({})
  const [bulkSaving, setBulkSaving] = useState(false)

  const enrolledStudents = enrollments.filter(e => e.status === 'enrolled')
  const totalMyHours = trainerHours.reduce((s, h) => s + h.hours, 0)

  // ─── My Hours handlers ─────────────────────────────────────────────────────
  function openMyEdit(h: ClassLoggedHours) {
    setMyEditing(h)
    setMyDate(h.log_date)
    setMyHours(String(h.hours))
    setMyPaid(h.paid)
    setMyLive(h.live_training)
    setMyNotes(h.notes ?? '')
    setMyFormOpen(true)
  }

  function resetMyForm() {
    setMyEditing(null)
    setMyDate(new Date().toISOString().slice(0, 10))
    setMyHours('')
    setMyPaid(false)
    setMyLive(false)
    setMyNotes('')
    setMyFormOpen(false)
  }

  async function handleMySave(e: React.FormEvent) {
    e.preventDefault()
    if (!myHours) return
    setMySaving(true)
    try {
      if (myEditing) {
        await api.selfService.updateHours(classId, myEditing.id, {
          log_date: myDate, hours: Number(myHours), paid: myPaid, live_training: myLive, notes: myNotes || null,
        })
        toast('Hours updated', 'success')
      } else {
        await api.selfService.createHours(classId, {
          log_date: myDate, person_type: 'trainer', hours: Number(myHours), paid: myPaid, live_training: myLive, notes: myNotes || null,
        })
        toast('Hours logged', 'success')
      }
      resetMyForm()
      refreshHours()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setMySaving(false)
    }
  }

  async function handleMyDelete() {
    if (!myDeleteTarget) return
    const prev = trainerHours
    setTrainerHours(h => h.filter(entry => entry.id !== myDeleteTarget.id))
    setMyDeleteTarget(null)
    toast('Hours entry deleted', 'success')
    try {
      await api.selfService.deleteHours(classId, myDeleteTarget.id)
    } catch (err) {
      toast((err as Error).message, 'error')
      setTrainerHours(prev)
    }
  }

  // ─── Student Hours handlers ────────────────────────────────────────────────
  function openStuEdit(h: ClassLoggedHours) {
    setStuEditing(h)
    setStuDate(h.log_date)
    setStuEnrollmentId(h.enrollment_id ?? '')
    setStuHours(String(h.hours))
    setStuPaid(h.paid)
    setStuLive(h.live_training)
    setStuNotes(h.notes ?? '')
    setStuFormOpen(true)
    setStuBulkMode(false)
  }

  function resetStuForm() {
    setStuEditing(null)
    setStuDate(new Date().toISOString().slice(0, 10))
    setStuEnrollmentId('')
    setStuHours('')
    setStuPaid(false)
    setStuLive(false)
    setStuNotes('')
    setStuFormOpen(false)
    setStuBulkMode(false)
    setBulkHoursMap({})
  }

  async function handleStuSave(e: React.FormEvent) {
    e.preventDefault()
    if (!stuHours || !stuEnrollmentId) return
    setStuSaving(true)
    try {
      if (stuEditing) {
        await api.selfService.updateHours(classId, stuEditing.id, {
          log_date: stuDate, hours: Number(stuHours), paid: stuPaid, live_training: stuLive, notes: stuNotes || null,
        })
        toast('Hours updated', 'success')
      } else {
        await api.selfService.createHours(classId, {
          log_date: stuDate, person_type: 'student', enrollment_id: stuEnrollmentId, hours: Number(stuHours),
          paid: stuPaid, live_training: stuLive, notes: stuNotes || null,
        })
        toast('Hours logged', 'success')
      }
      resetStuForm()
      refreshHours()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setStuSaving(false)
    }
  }

  async function handleBulkSave(e: React.FormEvent) {
    e.preventDefault()
    const entries = Object.entries(bulkHoursMap)
      .filter(([, h]) => h !== '' && Number(h) > 0)
      .map(([enrollment_id, h]) => ({ enrollment_id, hours: Number(h) }))
    if (entries.length === 0) { toast('No hours entered', 'error'); return }
    setBulkSaving(true)
    try {
      await api.selfService.createHoursBulk(classId, { log_date: bulkDate, entries, paid: bulkPaid, live_training: bulkLive })
      toast(`Logged hours for ${entries.length} student${entries.length !== 1 ? 's' : ''}`, 'success')
      setBulkHoursMap({})
      setStuFormOpen(false)
      setStuBulkMode(false)
      refreshHours()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBulkSaving(false)
    }
  }

  async function handleStuDelete() {
    if (!stuDeleteTarget) return
    const prev = studentHours
    setStudentHours(h => h.filter(entry => entry.id !== stuDeleteTarget.id))
    setStuDeleteTarget(null)
    toast('Hours entry deleted', 'success')
    try {
      await api.selfService.deleteHours(classId, stuDeleteTarget.id)
    } catch (err) {
      toast((err as Error).message, 'error')
      setStudentHours(prev)
    }
  }

  const enrollmentMap = new Map(enrollments.map(e => [e.id, e]))

  return (
    <section className="bg-white dark:bg-tt-surface rounded-[10px] p-4 flex flex-col gap-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-white/[0.06] -mx-4 px-4">
        {(['my-hours', 'student-hours'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t ? 'border-tt-blue text-tt-blue' : 'border-transparent text-slate-500 hover:text-slate-600 dark:text-slate-300'
            }`}
          >
            {t === 'my-hours' ? 'My Hours' : 'Student Hours'}
          </button>
        ))}
      </div>

      {/* ── My Hours ── */}
      {activeTab === 'my-hours' && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Total: <span className="text-tt-blue">{totalMyHours}h</span></p>
              <p className="text-xs text-slate-500">Paid: {trainerHours.filter(h => h.paid).reduce((s, h) => s + h.hours, 0)}h · Unpaid: {trainerHours.filter(h => !h.paid).reduce((s, h) => s + h.hours, 0)}h</p>
            </div>
            {!archived && (
              <button type="button" onClick={() => myFormOpen ? resetMyForm() : setMyFormOpen(true)} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white font-semibold px-3 py-1.5 text-xs hover:brightness-110 transition-all">
                {myFormOpen ? 'Cancel' : '+ Log hours'}
              </button>
            )}
          </div>

          {myFormOpen && (
            <form onSubmit={handleMySave} className="rounded-[10px] border border-slate-200 dark:border-white/[0.06] bg-slate-100 dark:bg-tt-elevated p-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{myEditing ? 'Edit hours entry' : 'Log my hours'}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date
                    <input type="date" value={myDate} onChange={e => setMyDate(e.target.value)} className={fieldClass + ' mt-1'} required />
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Hours
                    <input type="number" min={0} step={0.5} value={myHours} onChange={e => setMyHours(e.target.value)} className={fieldClass + ' mt-1'} required />
                  </label>
                </div>
                <div className="flex flex-col gap-2 justify-end">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={myPaid} onChange={e => setMyPaid(e.target.checked)} className="accent-tt-blue" /> Paid
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={myLive} onChange={e => setMyLive(e.target.checked)} className="accent-tt-blue" /> Live training
                  </label>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Notes
                    <input type="text" value={myNotes} onChange={e => setMyNotes(e.target.value)} className={fieldClass + ' mt-1'} placeholder="Optional…" />
                  </label>
                </div>
                <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
                  <button type="button" onClick={resetMyForm} className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold">Cancel</button>
                  <button type="submit" disabled={mySaving} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                    {mySaving ? 'Saving…' : myEditing ? 'Update' : 'Log hours'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {loading ? (
            <SkeletonTable rows={3} cols={5} />
          ) : trainerHours.length === 0 ? (
            <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px]">
              <EmptyState title="No hours logged yet" description="Log your training hours for this class." variant="neutral" />
            </div>
          ) : (
            <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px] overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Hours</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Paid</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">Live</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden md:table-cell">Notes</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trainerHours.map(h => (
                    <tr key={h.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-white dark:bg-tt-surface transition-colors">
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{h.log_date}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">{h.hours}h</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${h.paid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500'}`}>
                          {h.paid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{h.live_training ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2 text-slate-500 hidden md:table-cell">{h.notes ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {!archived && (
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={() => openMyEdit(h)} className="rounded px-2 py-1 text-[11px] font-medium text-tt-blue hover:bg-tt-blue/10">Edit</button>
                            <button type="button" onClick={() => setMyDeleteTarget(h)} className="rounded px-2 py-1 text-[11px] font-medium text-rose-400 hover:bg-rose-500/10">Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ConfirmDialog open={!!myDeleteTarget} title="Delete hours entry" message={`Delete ${myDeleteTarget?.hours}h on ${myDeleteTarget?.log_date}?`} confirmLabel="Delete" confirmVariant="danger" onConfirm={handleMyDelete} onCancel={() => setMyDeleteTarget(null)} />
        </>
      )}

      {/* ── Student Hours ── */}
      {activeTab === 'student-hours' && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">Log hours for enrolled students.</p>
            {!archived && (
              <div className="flex gap-2">
                <button type="button" onClick={() => { setStuFormOpen(!stuFormOpen || stuBulkMode); setStuBulkMode(false); if (stuEditing) resetStuForm() }} className="rounded-md bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 font-semibold px-3 py-1.5 text-xs hover:bg-slate-100 dark:bg-tt-elevated transition-all">
                  {stuFormOpen && !stuBulkMode ? 'Cancel' : '+ Individual'}
                </button>
                <button type="button" onClick={() => { setStuFormOpen(!stuFormOpen || !stuBulkMode); setStuBulkMode(true); setStuEditing(null) }} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white font-semibold px-3 py-1.5 text-xs hover:brightness-110 transition-all">
                  {stuFormOpen && stuBulkMode ? 'Cancel' : '+ Bulk log'}
                </button>
              </div>
            )}
          </div>

          {/* Individual form */}
          {stuFormOpen && !stuBulkMode && (
            <form onSubmit={handleStuSave} className="rounded-[10px] border border-slate-200 dark:border-white/[0.06] bg-slate-100 dark:bg-tt-elevated p-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{stuEditing ? 'Edit student hours' : 'Log student hours'}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date
                    <input type="date" value={stuDate} onChange={e => setStuDate(e.target.value)} className={fieldClass + ' mt-1'} required />
                  </label>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Student
                    <select value={stuEnrollmentId} onChange={e => setStuEnrollmentId(e.target.value)} className={fieldClass + ' mt-1'} required disabled={!!stuEditing}>
                      <option value="">Select student…</option>
                      {enrolledStudents.map(e => <option key={e.id} value={e.id}>{e.student_name}</option>)}
                    </select>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Hours
                    <input type="number" min={0} step={0.5} value={stuHours} onChange={e => setStuHours(e.target.value)} className={fieldClass + ' mt-1'} required />
                  </label>
                </div>
                <div className="flex flex-col gap-2 justify-end">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={stuPaid} onChange={e => setStuPaid(e.target.checked)} className="accent-tt-blue" /> Paid
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={stuLive} onChange={e => setStuLive(e.target.checked)} className="accent-tt-blue" /> Live training
                  </label>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Notes
                    <input type="text" value={stuNotes} onChange={e => setStuNotes(e.target.value)} className={fieldClass + ' mt-1'} placeholder="Optional…" />
                  </label>
                </div>
                <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
                  <button type="button" onClick={resetStuForm} className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold">Cancel</button>
                  <button type="submit" disabled={stuSaving} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                    {stuSaving ? 'Saving…' : stuEditing ? 'Update' : 'Log hours'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Bulk form */}
          {stuFormOpen && stuBulkMode && (
            <form onSubmit={handleBulkSave} className="rounded-[10px] border border-slate-200 dark:border-white/[0.06] bg-slate-100 dark:bg-tt-elevated p-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Bulk log hours for all students</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date
                    <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} className={fieldClass + ' mt-1'} required />
                  </label>
                </div>
                <div className="flex flex-col gap-2 justify-end">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={bulkPaid} onChange={e => setBulkPaid(e.target.checked)} className="accent-tt-blue" /> Paid
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={bulkLive} onChange={e => setBulkLive(e.target.checked)} className="accent-tt-blue" /> Live training
                  </label>
                </div>
              </div>
              <div className="bg-white dark:bg-tt-surface rounded-[10px] overflow-hidden mb-3">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Student</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 w-24">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrolledStudents.map(e => (
                      <tr key={e.id} className="border-b border-slate-100 dark:border-white/[0.03]">
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{e.student_name}</td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={bulkHoursMap[e.id] ?? ''}
                            onChange={ev => setBulkHoursMap(prev => ({ ...prev, [e.id]: ev.target.value }))}
                            className="w-20 bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded px-1.5 py-1 text-[10px] text-slate-700 dark:text-slate-200 outline-none"
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setStuFormOpen(false); setStuBulkMode(false) }} className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold">Cancel</button>
                <button type="submit" disabled={bulkSaving} className="rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                  {bulkSaving ? 'Saving…' : 'Log all'}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <SkeletonTable rows={4} cols={5} />
          ) : studentHours.length === 0 ? (
            <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px]">
              <EmptyState title="No student hours yet" description="Log hours for enrolled students." variant="neutral" />
            </div>
          ) : (
            <div className="bg-slate-100 dark:bg-tt-elevated rounded-[10px] overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Student</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Hours</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">Paid</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden md:table-cell">Notes</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {studentHours.map(h => {
                    const enr = enrollmentMap.get(h.enrollment_id ?? '')
                    return (
                      <tr key={h.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-white dark:bg-tt-surface transition-colors">
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{h.log_date}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{enr?.student_name ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">{h.hours}h</td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${h.paid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500'}`}>
                            {h.paid ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 hidden md:table-cell">{h.notes ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          {!archived && (
                            <div className="flex items-center justify-end gap-1">
                              <button type="button" onClick={() => openStuEdit(h)} className="rounded px-2 py-1 text-[11px] font-medium text-tt-blue hover:bg-tt-blue/10">Edit</button>
                              <button type="button" onClick={() => setStuDeleteTarget(h)} className="rounded px-2 py-1 text-[11px] font-medium text-rose-400 hover:bg-rose-500/10">Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <ConfirmDialog open={!!stuDeleteTarget} title="Delete hours entry" message={`Delete this hours entry?`} confirmLabel="Delete" confirmVariant="danger" onConfirm={handleStuDelete} onCancel={() => setStuDeleteTarget(null)} />
        </>
      )}
    </section>
  )
}
