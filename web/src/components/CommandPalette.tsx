import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useClasses } from '../contexts/ClassesContext'
import { classSlug } from '../lib/utils'
import { api } from '../lib/apiClient'
import type { SearchResults } from '../lib/apiClient'

interface PaletteItem {
  id: string
  label: string
  description?: string
  path: string
  icon: string
}

type ApiSearchResult =
  | SearchResults['classes'][number]
  | SearchResults['students'][number]
  | SearchResults['trainers'][number]
  | SearchResults['reports'][number]

const EMPTY_SEARCH_RESULTS: SearchResults = { classes: [], students: [], trainers: [], reports: [] }

const COORDINATOR_PAGES: PaletteItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', path: '/dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z' },
  { id: 'nav-classes', label: 'Classes', path: '/classes', icon: 'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 17V5a2 2 0 012-2h14a2 2 0 012 2v12a2.5 2.5 0 01-2.5 2.5H4z' },
  { id: 'nav-students', label: 'Students', path: '/students', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8z' },
  { id: 'nav-trainers', label: 'Trainers', path: '/trainers', icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M8.5 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6' },
  { id: 'nav-reports', label: 'Reports', path: '/reports', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6' },
  { id: 'nav-schedule', label: 'Schedule', path: '/schedule', icon: 'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18' },
  { id: 'nav-health', label: 'System Health', path: '/system-health', icon: 'M22 12h-4l-3 8L9 4l-3 8H2' },
  { id: 'nav-settings', label: 'Settings', path: '/settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z' },
]

const TRAINER_PAGES: PaletteItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', path: '/dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z' },
  { id: 'nav-my-classes', label: 'My Classes', path: '/my-classes', icon: 'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 17V5a2 2 0 012-2h14a2 2 0 012 2v12a2.5 2.5 0 01-2.5 2.5H4z' },
  { id: 'nav-reports', label: 'Reports', path: '/reports', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6' },
  { id: 'nav-schedule', label: 'Schedule', path: '/schedule', icon: 'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18' },
  { id: 'nav-hours', label: 'Hours', path: '/hours', icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2' },
]

const STUDENT_PAGES: PaletteItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', path: '/dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z' },
  { id: 'nav-settings', label: 'Settings', path: '/settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<SearchResults>(EMPTY_SEARCH_RESULTS)
  const [searchLoading, setSearchLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { role } = useAuth()
  const { active, archived } = useClasses()

  // Get classes for coordinator search
  const classItems: PaletteItem[] = useMemo(() => {
    if (role !== 'coordinator') return []
    return [...active, ...archived].map(c => ({
      id: `class-${c.id}`,
      label: c.name,
      description: `${c.site} · ${c.province}`,
      path: `/classes/${classSlug(c.name)}`,
      icon: 'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 17V5a2 2 0 012-2h14a2 2 0 012 2v12a2.5 2.5 0 01-2.5 2.5H4z',
    }))
  }, [active, archived, role])

  const pages = role === 'coordinator'
    ? COORDINATOR_PAGES
    : role === 'trainer'
      ? TRAINER_PAGES
      : STUDENT_PAGES

  const allItems = useMemo(() => [...pages, ...classItems], [pages, classItems])

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 12)
    const q = query.toLowerCase()
    return allItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      (item.description?.toLowerCase().includes(q))
    ).slice(0, 12)
  }, [allItems, query])

  // Reset selection when filtered changes
  useEffect(() => { setSelectedIndex(0) }, [filtered])

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setSearchResults(EMPTY_SEARCH_RESULTS)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounced API search — fires 300ms after query changes when query >= 2 chars
  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults(EMPTY_SEARCH_RESULTS)
      return
    }
    setSearchLoading(true)
    const timer = setTimeout(async () => {
      try {
        const results = await api.search.query(query.trim())
        setSearchResults(results)
      } catch {
        setSearchResults(EMPTY_SEARCH_RESULTS)
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const selectItem = useCallback((item: PaletteItem) => {
    setOpen(false)
    navigate(item.path)
  }, [navigate])

  const navigateToResult = useCallback((item: ApiSearchResult) => {
    setOpen(false)
    if (item.type === 'class') {
      navigate(role === 'coordinator' ? `/classes/${classSlug(item.name)}` : `/my-classes/${item.id}`)
    } else if (item.type === 'student') {
      const path = role === 'coordinator'
        ? `/classes/${classSlug(item.className)}`
        : `/my-classes/${item.classId}`
      navigate(path)
    } else if (item.type === 'trainer') {
      navigate(role === 'coordinator' ? '/trainers' : `/my-classes/${item.classId}`)
    } else if (item.type === 'report') {
      const path = role === 'coordinator'
        ? `/classes/${classSlug(item.className)}/reports/${item.id}`
        : `/my-classes/${item.classId}`
      navigate(path)
    }
  }, [navigate, role])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      selectItem(filtered[selectedIndex])
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/40 dark:bg-black/60 animate-backdrop-in px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[14px] shadow-2xl overflow-hidden animate-modal-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-white/[0.06]">
          <svg className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, classes, students…"
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-[10px] font-medium text-slate-500 dark:text-slate-500">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2">
          {/* Local page/class shortcuts */}
          {filtered.length === 0 && query.trim().length < 2 ? (
            <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500 text-center">No results found</p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectItem(item)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-75 ${
                  i === selectedIndex ? 'bg-tt-blue/10 text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                }`}
              >
                <svg className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.description && (
                    <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{item.description}</span>
                  )}
                </div>
                {i === selectedIndex && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">Enter ↵</span>
                )}
              </button>
            ))
          )}

          {/* API search results — shown when query >= 2 chars */}
          {query.trim().length >= 2 && (
            <>
              {searchLoading && (
                <p className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">Searching…</p>
              )}

              {!searchLoading && searchResults.classes.length > 0 && (
                <div className="mt-1">
                  <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Classes</p>
                  {searchResults.classes.map(c => (
                    <button key={`api-class-${c.id}`} type="button" onClick={() => navigateToResult(c)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors duration-75">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                          {c.site} · {c.gameType ?? 'Class'} · {c.startDate.slice(0, 4)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!searchLoading && searchResults.students.length > 0 && (
                <div className="mt-1">
                  <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Students</p>
                  {searchResults.students.map(s => (
                    <button key={`student-${s.id}-${s.classId}`} type="button" onClick={() => navigateToResult(s)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors duration-75">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                          {s.className}{s.groupLabel ? ` · Group ${s.groupLabel}` : ''}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!searchLoading && searchResults.trainers.length > 0 && (
                <div className="mt-1">
                  <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Trainers</p>
                  {searchResults.trainers.map(t => (
                    <button key={`trainer-${t.id}`} type="button" onClick={() => navigateToResult(t)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors duration-75">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{t.name}</span>
                        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{t.email}{t.className ? ` · ${t.className}` : ''}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!searchLoading && searchResults.reports.length > 0 && (
                <div className="mt-1">
                  <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Reports</p>
                  {searchResults.reports.map(r => (
                    <button key={`report-${r.id}`} type="button" onClick={() => navigateToResult(r)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors duration-75">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{r.className}</span>
                        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                          {r.reportDate}{r.sessionLabel ? ` · ${r.sessionLabel}` : ''}{r.groupLabel ? ` · Group ${r.groupLabel}` : ''}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-white/[0.06] flex items-center gap-4 text-[10px] text-slate-600">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
