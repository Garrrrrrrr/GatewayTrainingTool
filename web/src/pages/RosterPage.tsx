import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { SkeletonTable } from '../components/Skeleton'
import { Pagination } from '../components/Pagination'
import { EmptyState } from '../components/EmptyState'

type RosterRow = { id: string; full_name: string | null; email: string }

interface RosterPageProps {
  role: 'trainee' | 'trainer'
  title: string
  subtitle: string
}

const PAGE_SIZE = 25
type RosterSnapshot = { rows: RosterRow[]; total: number }
const rosterCache = new Map<string, RosterSnapshot>()

function rosterCacheKey(role: RosterPageProps['role'], q: string, p: number): string {
  return `${role}:${q}:${p}`
}

export function RosterPage({ role, title, subtitle }: RosterPageProps) {
  const navigate = useNavigate()
  const initialCached = rosterCache.get(rosterCacheKey(role, '', 0))
  const [rows, setRows] = useState<RosterRow[]>(() => initialCached?.rows ?? [])
  const [total, setTotal] = useState(() => initialCached?.total ?? 0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(() => !initialCached)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRows = useCallback(async (q: string, p: number) => {
    const key = rosterCacheKey(role, q, p)
    const cached = rosterCache.get(key)
    if (cached) {
      setRows(cached.rows)
      setTotal(cached.total)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      const res = await api.profiles.searchPaginated({
        role,
        search: q || undefined,
        page: p,
        limit: PAGE_SIZE,
      })
      const nextRows = res.data as RosterRow[]
      rosterCache.set(key, { rows: nextRows, total: res.total })
      setRows(nextRows)
      setTotal(res.total)
    } catch (err) {
      console.error('fetchRows error:', (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    setPage(0)
    fetchRows('', 0)
  }, [role, fetchRows])

  function handleSearch(value: string) {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(0)
      fetchRows(value, 0)
    }, 300)
  }

  function handlePageChange(newPage: number) {
    setPage(newPage)
    fetchRows(search, newPage)
  }

  const [sortCol, setSortCol] = useState<'full_name' | 'email'>('full_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(col: 'full_name' | 'email') {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sortedRows = useMemo(() =>
    [...rows].sort((a, b) => {
      const aVal = (sortCol === 'full_name' ? a.full_name ?? '' : a.email).toLowerCase()
      const bVal = (sortCol === 'full_name' ? b.full_name ?? '' : b.email).toLowerCase()
      const cmp = aVal.localeCompare(bVal)
      return sortDir === 'asc' ? cmp : -cmp
    }),
    [rows, sortCol, sortDir],
  )

  const itemLabel = role === 'trainer' ? 'trainer' : 'student'

  function handleExportCsv() {
    const header = 'Name,Email'
    const csvRows = rows.map(r => `"${(r.full_name ?? '').replace(/"/g, '""')}","${r.email.replace(/"/g, '""')}"`)
    const blob = new Blob([header + '\n' + csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${role}-roster.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {title}
            {!loading && total > 0 && (
              <span className="ml-1.5 text-sm font-normal text-slate-400 dark:text-slate-500">({total})</span>
            )}
          </h2>
          <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full sm:w-64 bg-slate-100 dark:bg-gw-elevated border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-gw-blue/40 focus:ring-2 focus:ring-gw-blue/15"
          />
          {rows.length > 0 && (
            <button type="button" onClick={handleExportCsv} className="shrink-0 rounded-md bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-medium px-3 py-2 text-xs hover:bg-white/[0.08] transition-colors">
              Export CSV
            </button>
          )}
        </div>
      </header>

      <div className="mt-4 flex-1 min-h-0 overflow-auto">
        {loading ? (
          <SkeletonTable rows={5} cols={2} />
        ) : rows.length === 0 ? (
          <div className="bg-white dark:bg-gw-surface rounded-[10px]">
            <EmptyState
              title={search ? `No ${title.toLowerCase()} match your search` : `No ${title.toLowerCase()} found`}
              description={search ? 'Try a different search term.' : `${title} appear here once enrolled in a class.`}
              variant="neutral"
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-gw-surface rounded-[10px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                    {([{ key: 'full_name' as const, label: 'Name' }, { key: 'email' as const, label: 'Email' }]).map(col => (
                      <th key={col.key} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 cursor-pointer select-none group hover:text-slate-700 dark:hover:text-slate-300 transition-colors" onClick={() => toggleSort(col.key)}>
                        {col.label}
                        {sortCol === col.key ? (
                          <svg className="w-3 h-3 ml-1 inline text-gw-blue" viewBox="0 0 12 12" fill="currentColor">{sortDir === 'asc' ? <path d="M6 2l3 4H3z" /> : <path d="M6 10l-3-4h6z" />}</svg>
                        ) : (
                          <svg className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-30 inline" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2l3 4H3z" /><path d="M6 10l-3-4h6z" /></svg>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map(r => (
                    <tr
                      key={r.id}
                      className={`border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-gw-elevated transition-colors duration-100${role === 'trainee' ? ' cursor-pointer' : ''}`}
                      onClick={role === 'trainee' ? () => navigate(`/students/progress/${encodeURIComponent(r.email)}`) : undefined}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.full_name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-slate-100 dark:border-white/[0.03]">
              <Pagination
                page={page}
                limit={PAGE_SIZE}
                total={total}
                onPageChange={handlePageChange}
                itemLabel={itemLabel}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
