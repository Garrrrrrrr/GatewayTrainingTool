import { useState, useEffect } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { CoordinatorLayout } from '../components/CoordinatorLayout'
import { TrainerLayout, TRAINER_NAV_ITEMS } from '../components/TrainerLayout'
import { StudentLayout, STUDENT_NAV_ITEMS } from '../components/StudentLayout'
import { BrandedLoader } from '../components/BrandedLoader'
import { CommandPalette } from '../components/CommandPalette'
import { RoleSelectionPage } from '../pages/RoleSelectionPage'
import { api } from '../lib/apiClient'

const navIcon = (d: string) => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d={d} />
  </svg>
)

const BOTTOM_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: navIcon('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z') },
  { to: '/classes',   label: 'Classes',   icon: navIcon('M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 17V5a2 2 0 012-2h14a2 2 0 012 2v12a2.5 2.5 0 01-2.5 2.5H4z') },
  { to: '/schedule',  label: 'Schedule',  icon: navIcon('M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18') },
  { to: '/reports',   label: 'Reports',   icon: navIcon('M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8') },
]

const MORE_ITEMS = [
  { to: '/students',        label: 'Students',        icon: navIcon('M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75') },
  { to: '/trainers',        label: 'Trainers',        icon: navIcon('M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M8.5 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6') },
  { to: '/audit',           label: 'Audit',           icon: navIcon('M9 12l2 2 4-4M7 3h10l4 4v14H3V7l4-4z') },
  { to: '/system-health',   label: 'Health',          icon: navIcon('M22 12h-4l-3 8L9 4l-3 8H2') },
  { to: '/settings',        label: 'Settings',        icon: navIcon('M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z') },
]

export function ProtectedLayout() {
  const { session, role, roleSelected, loading, email, signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const [pendingRequest, setPendingRequest] = useState<boolean | null>(null)

  const initials = email ? email.slice(0, 2).toUpperCase() : 'CO'

  // Check for pending role request when user is a trainee with role_selected=true
  // (they selected trainer/coordinator and are waiting for approval)
  useEffect(() => {
    if (!session || !roleSelected || role !== 'trainee') {
      setPendingRequest(false)
      return
    }
    api.selfService.myRoleRequest().then(rr => {
      setPendingRequest(rr?.status === 'pending')
    }).catch(() => setPendingRequest(false))
  }, [session, role, roleSelected])

  if (loading || role === null) {
    if (!session && !loading) {
      return <Navigate to="/login" replace />
    }
    return <BrandedLoader />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Gate: user hasn't completed role selection yet
  if (!roleSelected) {
    return <RoleSelectionPage />
  }

  // Gate: user selected trainer/coordinator and is waiting for approval
  if (pendingRequest === null) {
    return <BrandedLoader message="Checking your account status…" />
  }
  if (pendingRequest) {
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
            Your role request is being reviewed by a coordinator. You will be able to access the full application once approved.
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

  // Coordinator layout: icon sidebar (desktop) + bottom nav (mobile)
  if (role === 'coordinator') {
    return (
      <>
      <CommandPalette />
      <div className="min-h-screen w-screen bg-slate-50 dark:bg-tt-darkest">
        {/* Desktop icon sidebar — hidden on mobile */}
        <CoordinatorLayout />

        {/* Mobile top bar */}
        <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between h-14 bg-white dark:bg-tt-darkest border-b border-slate-200 dark:border-white/[0.06] px-4 md:hidden">
          <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-tt-blue to-tt-teal flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm leading-none select-none">G</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-tt-blue/20 border border-tt-blue/30 flex items-center justify-center select-none">
            <span className="text-xs font-semibold text-tt-blue">{initials}</span>
          </div>
        </div>

        {/* Main content area */}
        <section className="md:ml-16 pt-14 md:pt-4 pb-20 md:pb-6 min-h-screen px-4 md:px-6 flex flex-col gap-4 overflow-auto">
          <Outlet />
        </section>

        {/* Mobile bottom nav */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around h-16 bg-white dark:bg-tt-surface border-t border-slate-200 dark:border-white/[0.06] md:hidden"
          aria-label="Mobile navigation"
        >
          {BOTTOM_NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1 transition-colors duration-100 ${
                  isActive ? 'text-tt-blue' : 'text-slate-400 dark:text-slate-500'
                }`
              }
            >
              {icon}
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 text-slate-400 dark:text-slate-500"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h.01M12 12h.01M19 12h.01" />
            </svg>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </nav>

        {/* "More" bottom sheet */}
        {moreOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end md:hidden bg-black/40 dark:bg-black/60 animate-backdrop-in"
            onClick={() => setMoreOpen(false)}
          >
            <div
              className="w-full bg-white dark:bg-tt-surface border-t border-slate-200 dark:border-white/[0.08] rounded-t-[14px] p-4 pb-8 animate-modal-in"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
              <div className="grid grid-cols-2 gap-2">
                {MORE_ITEMS.map(({ to, label, icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-[10px] px-3 py-3 transition-colors duration-100 ${
                        isActive
                          ? 'bg-tt-blue/20 border border-tt-blue/35 text-slate-900 dark:text-slate-100'
                          : 'bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`
                    }
                  >
                    {icon}
                    <span className="text-sm font-medium">{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      </>
    )
  }

  // Trainer layout: icon sidebar (desktop) + bottom nav (mobile)
  if (role === 'trainer') {
    const TRAINER_BOTTOM_NAV = TRAINER_NAV_ITEMS.slice(0, 4)
    const TRAINER_MORE_ITEMS = [
      TRAINER_NAV_ITEMS[4], // Hours
    ]

    return (
      <>
      <CommandPalette />
      <div className="min-h-screen w-screen bg-slate-50 dark:bg-tt-darkest">
        <TrainerLayout />

        {/* Mobile top bar */}
        <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between h-14 bg-white dark:bg-tt-darkest border-b border-slate-200 dark:border-white/[0.06] px-4 md:hidden">
          <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-tt-blue to-tt-teal flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm leading-none select-none">G</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-tt-blue/20 border border-tt-blue/30 flex items-center justify-center select-none">
              <span className="text-xs font-semibold text-tt-blue">{initials}</span>
            </div>
          </div>
        </div>

        {/* Main content */}
        <section className="md:ml-16 pt-14 md:pt-4 pb-20 md:pb-6 min-h-screen px-4 md:px-6 flex flex-col gap-4 overflow-auto">
          <Outlet />
        </section>

        {/* Mobile bottom nav */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around h-16 bg-white dark:bg-tt-surface border-t border-slate-200 dark:border-white/[0.06] md:hidden"
          aria-label="Mobile navigation"
        >
          {TRAINER_BOTTOM_NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1 transition-colors duration-100 ${
                  isActive ? 'text-tt-blue' : 'text-slate-400 dark:text-slate-500'
                }`
              }
            >
              {icon}
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 text-slate-400 dark:text-slate-500"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h.01M12 12h.01M19 12h.01" />
            </svg>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </nav>

        {/* More bottom sheet */}
        {moreOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end md:hidden bg-black/40 dark:bg-black/60 animate-backdrop-in"
            onClick={() => setMoreOpen(false)}
          >
            <div
              className="w-full bg-white dark:bg-tt-surface border-t border-slate-200 dark:border-white/[0.08] rounded-t-[14px] p-4 pb-8 animate-modal-in"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
              <div className="grid grid-cols-2 gap-2">
                {TRAINER_MORE_ITEMS.map(({ to, label, icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-[10px] px-3 py-3 transition-colors duration-100 ${
                        isActive
                          ? 'bg-tt-blue/20 border border-tt-blue/35 text-slate-900 dark:text-slate-100'
                          : 'bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`
                    }
                  >
                    {icon}
                    <span className="text-sm font-medium">{label}</span>
                  </NavLink>
                ))}
                <button
                  type="button"
                  onClick={() => { signOut(); setMoreOpen(false) }}
                  className="flex items-center gap-3 rounded-[10px] px-3 py-3 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors duration-100"
                >
                  {navIcon('M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9')}
                  <span className="text-sm font-medium">Sign out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </>
    )
  }

  // Student (trainee) layout: icon sidebar (desktop) + bottom nav (mobile)
  return (
    <>
    <CommandPalette />
    <div className="min-h-screen w-screen bg-slate-50 dark:bg-tt-darkest">
      <StudentLayout />

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between h-14 bg-white dark:bg-tt-darkest border-b border-slate-200 dark:border-white/[0.06] px-4 md:hidden">
        <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-tt-blue to-tt-teal flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm leading-none select-none">G</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-tt-blue/20 border border-tt-blue/30 flex items-center justify-center select-none">
          <span className="text-xs font-semibold text-tt-blue">{initials}</span>
        </div>
      </div>

      {/* Main content */}
      <section className="md:ml-16 pt-14 md:pt-4 pb-20 md:pb-6 min-h-screen px-4 md:px-6 flex flex-col gap-4 overflow-auto">
        <Outlet />
      </section>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around h-16 bg-white dark:bg-tt-surface border-t border-slate-200 dark:border-white/[0.06] md:hidden"
        aria-label="Mobile navigation"
      >
        {STUDENT_NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 transition-colors duration-100 ${
                isActive ? 'text-tt-blue' : 'text-slate-400 dark:text-slate-500'
              }`
            }
          >
            {icon}
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={signOut}
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-slate-400 dark:text-slate-500"
        >
          {navIcon('M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9')}
          <span className="text-[10px] font-medium">Sign out</span>
        </button>
      </nav>
    </div>
    </>
  )
}
