import { useCallback, useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/apiClient'
import type { Class } from '../types'
import { PROVINCES } from '../types'
import { CreateClassModal } from '../components/CreateClassModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useAuth } from '../contexts/AuthContext'
import { useClasses } from '../contexts/ClassesContext'
import { useToast } from '../contexts/ToastContext'
import { classSlug, provinceLabel } from '../lib/utils'
import { SkeletonTable } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const provinceBadge: Record<string, string> = {
  BC: 'bg-blue-500/15 text-blue-300',
  AB: 'bg-orange-400/15 text-orange-300',
  ON: 'bg-purple-500/15 text-purple-300',
}

const inputClass = 'bg-slate-100 dark:bg-tt-elevated border border-slate-200 dark:border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-tt-blue/40 focus:ring-2 focus:ring-tt-blue/15 [color-scheme:dark]'
const labelClass = 'text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block'

export function ClassesPage() {
  useAuth()
  useDocumentTitle('Classes')
  const { toast } = useToast()
  const { active, archived, loading, refresh: fetchClasses } = useClasses()
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmState, setConfirmState] = useState<{
    title: string
    message: string
    confirmLabel: string
    confirmVariant: 'danger' | 'primary'
    onConfirm: () => void
  } | null>(null)

  const [attendanceRates, setAttendanceRates] = useState<Record<string, number>>({})
  useEffect(() => {
    api.dashboard.classAttendanceRates()
      .then(res => setAttendanceRates(res.rates))
      .catch(() => {})
  }, [])

  const [province, setProvince] = useState('')
  const [site, setSite] = useState('')
  const [gameType, setGameType] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol] = useState<string>('start_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sortClasses = useCallback((classes: Class[]): Class[] => {
    return [...classes].sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortCol] as string | null ?? ''
      const bVal = (b as unknown as Record<string, unknown>)[sortCol] as string | null ?? ''
      const cmp = String(aVal).localeCompare(String(bVal))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [sortCol, sortDir])

  const navigate = useNavigate()

  const allClasses = useMemo(() => [...active, ...archived], [active, archived])

  const siteOptions = useMemo(() => {
    const source = province ? allClasses.filter(c => c.province === province) : allClasses
    return [...new Set(source.map(c => c.site))].sort()
  }, [allClasses, province])

  const gameTypeOptions = useMemo(() => {
    return [...new Set(allClasses.map(c => c.game_type).filter((g): g is string => g != null))].sort()
  }, [allClasses])

  const hasFilters = province !== '' || site !== '' || gameType !== '' || search !== ''

  function resetFilters() {
    setProvince(''); setSite(''); setGameType(''); setSearch('')
  }

  const applyFilters = useCallback((classes: Class[]): Class[] => {
    let result = classes
    if (province) result = result.filter(c => c.province === province)
    if (site) result = result.filter(c => c.site === site)
    if (gameType) result = result.filter(c => c.game_type === gameType)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q))
    }
    return result
  }, [gameType, province, search, site])

  const filteredActive = useMemo(() => sortClasses(applyFilters(active)), [active, applyFilters, sortClasses])
  const filteredArchived = useMemo(() => sortClasses(applyFilters(archived)), [archived, applyFilters, sortClasses])

  function handleArchive(c: Class, e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmState({
      title: 'Archive class',
      message: `Archive "${c.name}"? It will be hidden from the active list.`,
      confirmLabel: 'Archive',
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmState(null)
        try {
          await api.classes.archive(c.id)
          fetchClasses()
          toast('Class archived', 'success')
        } catch (err) {
          toast((err as Error).message, 'error')
        }
      }
    })
  }

  async function handleUnarchive(c: Class) {
    try {
      await api.classes.unarchive(c.id)
      fetchClasses()
      toast('Class restored', 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  function handleDelete(c: Class) {
    setConfirmState({
      title: 'Delete class',
      message: `Permanently delete "${c.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmState(null)
        try {
          await api.classes.delete(c.id)
          fetchClasses()
          toast('Class deleted', 'success')
        } catch (err) {
          toast((err as Error).message, 'error')
        }
      }
    })
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filteredActive.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredActive.map(c => c.id)))
    }
  }

  function handleBulkArchive() {
    setConfirmState({
      title: 'Bulk archive',
      message: `Archive ${selected.size} class${selected.size !== 1 ? 'es' : ''}?`,
      confirmLabel: 'Archive',
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmState(null)
        try {
          await api.classes.batch([...selected], 'archive')
          setSelected(new Set())
          fetchClasses()
          toast(`${selected.size} class${selected.size !== 1 ? 'es' : ''} archived`, 'success')
        } catch (err) {
          toast((err as Error).message, 'error')
        }
      }
    })
  }

  function handleBulkDelete() {
    setConfirmState({
      title: 'Bulk delete',
      message: `Permanently delete ${selected.size} class${selected.size !== 1 ? 'es' : ''}? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmState(null)
        try {
          await api.classes.batch([...selected], 'delete')
          setSelected(new Set())
          fetchClasses()
          toast(`${selected.size} class${selected.size !== 1 ? 'es' : ''} deleted`, 'success')
        } catch (err) {
          toast((err as Error).message, 'error')
        }
      }
    })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Classes</h2>
          <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">Create and manage training classes</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white font-semibold px-4 py-2 text-sm hover:brightness-110 transition-all duration-150"
        >
          + Create class
        </button>
      </header>

      {/* Filter bar */}
      {!loading && (
        <div className="mt-4 bg-white dark:bg-tt-surface rounded-[10px] p-3 flex-shrink-0">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelClass}>Province</label>
              <select
                value={province}
                onChange={e => { setProvince(e.target.value); setSite('') }}
                className={inputClass}
              >
                <option value="">All provinces</option>
                {PROVINCES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Site</label>
              <select value={site} onChange={e => setSite(e.target.value)} className={inputClass}>
                <option value="">All sites</option>
                {siteOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Game type</label>
              <select value={gameType} onChange={e => setGameType(e.target.value)} className={inputClass}>
                <option value="">All game types</option>
                {gameTypeOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Search</label>
              <input
                type="text"
                placeholder="Filter by name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={inputClass}
              />
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-tt-blue underline underline-offset-2 hover:text-blue-300 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex-1 min-h-0 overflow-auto flex flex-col gap-6">
        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : filteredActive.length === 0 && filteredArchived.length === 0 && hasFilters ? (
          <div className="bg-white dark:bg-tt-surface rounded-[10px]">
            <EmptyState
              title="No classes match your filters"
              description="Try adjusting your filters or reset them."
              action={{ label: 'Reset filters', onClick: resetFilters }}
              variant="neutral"
            />
          </div>
        ) : (
          <>
            {/* Active classes */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active</h3>
              {filteredActive.length === 0 ? (
                <div className="bg-white dark:bg-tt-surface rounded-[10px] p-8 text-center">
                  <p className="text-sm text-slate-700 dark:text-slate-300">No active classes</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Create your first class to get started.</p>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-tt-blue to-tt-teal text-white font-semibold px-4 py-2 text-sm hover:brightness-110 transition-all duration-150"
                  >
                    + Create class
                  </button>
                </div>
              ) : (
                <div className="bg-white dark:bg-tt-surface rounded-[10px] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                          <th className="w-10 px-3 py-3">
                            <input type="checkbox" checked={selected.size === filteredActive.length && filteredActive.length > 0} onChange={toggleSelectAll} className="rounded border-white/20 bg-slate-100 dark:bg-tt-elevated text-tt-blue focus:ring-tt-blue/30 [color-scheme:dark]" />
                          </th>
                          {([
                            { key: 'name', label: 'Name', hide: '' },
                            { key: 'site', label: 'Site', hide: '' },
                            { key: 'province', label: 'Province', hide: 'hidden sm:table-cell' },
                            { key: 'game_type', label: 'Game type', hide: 'hidden sm:table-cell' },
                            { key: 'start_date', label: 'Start', hide: 'hidden md:table-cell' },
                            { key: 'end_date', label: 'End', hide: 'hidden md:table-cell' },
                          ] as const).map(col => (
                            <th key={col.key} className={`${col.hide} px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 cursor-pointer select-none group hover:text-slate-700 dark:hover:text-slate-300 transition-colors`} onClick={() => toggleSort(col.key)}>
                              {col.label}
                              {sortCol === col.key ? (
                                <svg className="w-3 h-3 ml-1 inline text-tt-blue" viewBox="0 0 12 12" fill="currentColor">{sortDir === 'asc' ? <path d="M6 2l3 4H3z" /> : <path d="M6 10l-3-4h6z" />}</svg>
                              ) : (
                                <svg className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-30 inline" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2l3 4H3z" /><path d="M6 10l-3-4h6z" /></svg>
                              )}
                            </th>
                          ))}
                          <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Attendance</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredActive.map(c => {
                          const rate = attendanceRates[c.id]
                          const rateColor = rate == null ? 'text-slate-500' : rate >= 80 ? 'text-emerald-400' : rate >= 50 ? 'text-amber-400' : 'text-rose-400'
                          return (
                          <tr
                            key={c.id}
                            className={`border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-tt-elevated cursor-pointer transition-colors duration-100 ${selected.has(c.id) ? 'bg-tt-blue/[0.06]' : ''}`}
                            onClick={() => navigate(`/classes/${classSlug(c.name)}`)}
                          >
                            <td className="w-10 px-3 py-3" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id, { stopPropagation: () => {} } as React.MouseEvent)} className="rounded border-white/20 bg-slate-100 dark:bg-tt-elevated text-tt-blue focus:ring-tt-blue/30 [color-scheme:dark]" />
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{c.name}</td>
                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{c.site}</td>
                            <td className="hidden sm:table-cell px-4 py-3">
                              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${provinceBadge[c.province] ?? 'bg-white/10 text-slate-400'}`}>
                                {provinceLabel(c.province)}
                              </span>
                            </td>
                            <td className="hidden sm:table-cell px-4 py-3 text-slate-500 dark:text-slate-400">{c.game_type ?? '—'}</td>
                            <td className="hidden md:table-cell px-4 py-3 text-slate-500 dark:text-slate-400">{c.start_date}</td>
                            <td className="hidden md:table-cell px-4 py-3 text-slate-500 dark:text-slate-400">{c.end_date}</td>
                            <td className="hidden lg:table-cell px-4 py-3">
                              <span className={`text-xs font-medium ${rateColor}`}>{rate != null ? `${rate}%` : '—'}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={e => handleArchive(c, e)}
                                className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-tt-elevated transition-colors duration-150"
                              >
                                Archive
                              </button>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {selected.size > 0 && (
                    <div className="sticky bottom-0 flex items-center justify-between gap-3 bg-tt-dark border-t border-slate-200 dark:border-white/[0.08] px-4 py-2.5">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{selected.size} selected</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">Clear</button>
                        <button type="button" onClick={handleBulkArchive} className="rounded-md bg-white dark:bg-tt-surface text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-tt-elevated transition-colors">Archive</button>
                        <button type="button" onClick={handleBulkDelete} className="rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/25 px-3 py-1.5 text-xs font-semibold hover:bg-rose-500/20 transition-colors">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Archived classes */}
            {filteredArchived.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Archived</h3>
                <div className="bg-white dark:bg-tt-surface rounded-[10px] overflow-hidden opacity-75">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Name</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Site</th>
                          <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Province</th>
                          <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Start</th>
                          <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">End</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredArchived.map(c => (
                          <tr key={c.id} className="border-b border-slate-100 dark:border-white/[0.03]">
                            <td className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{c.name}</td>
                            <td className="px-4 py-3 text-slate-400 dark:text-slate-500">{c.site}</td>
                            <td className="hidden sm:table-cell px-4 py-3 text-slate-400 dark:text-slate-500">{provinceLabel(c.province)}</td>
                            <td className="hidden md:table-cell px-4 py-3 text-slate-400 dark:text-slate-500">{c.start_date}</td>
                            <td className="hidden md:table-cell px-4 py-3 text-slate-400 dark:text-slate-500">{c.end_date}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleUnarchive(c)}
                                  className="rounded-md bg-white dark:bg-tt-surface text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-tt-elevated transition-colors duration-150"
                                >
                                  Unarchive
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(c)}
                                  className="rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/25 px-2 py-1 text-xs font-medium hover:bg-rose-500/20 transition-colors duration-150"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {createOpen && (
        <CreateClassModal onClose={() => setCreateOpen(false)} onSuccess={fetchClasses} />
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
    </div>
  )
}
