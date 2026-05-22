import { useEffect, useMemo, useState } from 'react'
import { api, type LegacyStudentClaimRow } from '../lib/apiClient'
import { useToast } from '../contexts/ToastContext'

const inputClass = 'w-full bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-tt-blue/60 focus:ring-2 focus:ring-tt-blue/20 dark:focus:border-tt-blue/40 dark:focus:ring-tt-blue/15'

export function LegacyStudentClaimsSection() {
  const { toast } = useToast()
  const [rows, setRows] = useState<LegacyStudentClaimRow[]>([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)
  const [manualEmails, setManualEmails] = useState<Record<string, string>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkEmail, setBulkEmail] = useState('')

  async function loadRows() {
    setLoading(true)
    try {
      const result = await api.profiles.legacyUnclaimedStudents()
      setRows(result.data)
      setSelectedIds(prev => {
        const current = new Set(result.data.map(row => row.id))
        return new Set([...prev].filter(id => current.has(id)))
      })
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const duplicateRows = rows.filter(row => row.duplicate_count > 1).length
  const matchedRows = rows.filter(row => row.matched_profiles.length > 0).length
  const selectedRows = useMemo(
    () => rows.filter(row => selectedIds.has(row.id)),
    [rows, selectedIds],
  )

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(rows.map(row => row.id)))
  }

  async function mergeRows(enrollmentIds: string[], targetEmail: string, targetName?: string) {
    const email = targetEmail.trim().toLowerCase()
    if (!email) {
      toast('Choose or enter a student account email first.', 'error')
      return
    }
    setMerging(true)
    try {
      const result = await api.profiles.mergeLegacyStudents({
        enrollment_ids: enrollmentIds,
        target_email: email,
        target_name: targetName,
      })
      await loadRows()
      setBulkEmail('')
      toast(`Merged ${result.updated}, removed ${result.removed_duplicates} duplicate${result.removed_duplicates === 1 ? '' : 's'}.`, 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-tt-elevated px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Unclaimed</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{rows.length}</p>
        </div>
        <div className="rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-tt-elevated px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Matched</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{matchedRows}</p>
        </div>
        <div className="rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-tt-elevated px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Duplicates</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{duplicateRows}</p>
        </div>
        <div className="rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-tt-elevated px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Selected</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedIds.size}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-end gap-2">
        <label className="flex-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Merge selected into student email
          <input
            type="email"
            value={bulkEmail}
            onChange={e => setBulkEmail(e.target.value)}
            placeholder="student@example.com"
            className={`${inputClass} mt-1`}
          />
        </label>
        <button
          type="button"
          disabled={merging || selectedIds.size === 0}
          onClick={() => mergeRows([...selectedIds], bulkEmail, selectedRows[0]?.student_name)}
          className="rounded-md bg-tt-blue text-white px-3 py-2 text-xs font-semibold hover:brightness-110 transition-all disabled:opacity-50"
        >
          Merge selected
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading legacy students…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No unclaimed legacy students.</p>
      ) : (
        <div className="overflow-auto rounded-md border border-slate-200 dark:border-white/10">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                <th className="px-2 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    onChange={toggleAllVisible}
                    className="accent-tt-blue"
                    aria-label="Select all legacy students"
                  />
                </th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Student</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Class</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Matched Account</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Merge</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const singleMatch = row.matched_profiles.length === 1 ? row.matched_profiles[0] : null
                const manualEmail = manualEmails[row.id] ?? singleMatch?.email ?? ''
                return (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                    <td className="px-2 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        className="accent-tt-blue"
                        aria-label={`Select ${row.student_name}`}
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{row.student_name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{row.student_email}</p>
                    </td>
                    <td className="px-2 py-2 align-top text-slate-600 dark:text-slate-300">
                      <p>{row.class_name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{row.group_label ? `Group ${row.group_label}` : 'No group'}</p>
                    </td>
                    <td className="px-2 py-2 align-top text-slate-600 dark:text-slate-300">
                      <p>{row.claimed ? 'Claimed' : 'Unclaimed'}</p>
                      <p className={`mt-0.5 text-[11px] ${row.duplicate_count > 1 ? 'text-amber-500' : 'text-slate-500'}`}>
                        {row.duplicate_count > 1 ? `${row.duplicate_count} duplicate rows` : 'No duplicates'}
                      </p>
                    </td>
                    <td className="px-2 py-2 align-top">
                      {row.matched_profiles.length > 0 ? (
                        <select
                          value={manualEmail}
                          onChange={e => setManualEmails(prev => ({ ...prev, [row.id]: e.target.value }))}
                          className={inputClass}
                        >
                          {row.matched_profiles.map(profile => (
                            <option key={profile.email} value={profile.email}>
                              {profile.full_name} · {profile.email}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="email"
                          value={manualEmail}
                          onChange={e => setManualEmails(prev => ({ ...prev, [row.id]: e.target.value }))}
                          placeholder="student@example.com"
                          className={inputClass}
                        />
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        disabled={merging || !manualEmail}
                        onClick={() => mergeRows([row.id], manualEmail, row.student_name)}
                        className="rounded-md bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                      >
                        Merge
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
