import { createContext, useCallback, useContext, useState, useEffect, useRef, type ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

type Toast = {
  id: number
  message: string
  type: ToastType
}

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_ACCENT: Record<ToastType, string> = {
  success: 'border-l-4 border-emerald-400',
  error:   'border-l-4 border-rose-400',
  info:    'border-l-4 border-tt-blue',
}

const TOAST_ICON_BG: Record<ToastType, string> = {
  success: 'bg-emerald-500/15 text-emerald-400',
  error:   'bg-rose-500/15 text-rose-400',
  info:    'bg-tt-blue/15 text-tt-blue',
}

function ToastIcon({ type }: { type: ToastType }) {
  if (type === 'success') {
    return (
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
      </svg>
    )
  }
  if (type === 'error') {
    return (
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l10 10M11 1L1 11" />
      </svg>
    )
  }
  return (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 5v3M6 3h.01" />
      <circle cx="6" cy="6" r="5" />
    </svg>
  )
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message, type }])
    const timer = setTimeout(() => removeToast(id), 4000)
    timers.current.set(id, timer)
  }, [removeToast])

  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      activeTimers.forEach(t => clearTimeout(t))
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-20 md:bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-toast-in flex items-start gap-3 bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[10px] px-4 py-3 shadow-xl ${TOAST_ACCENT[t.type]}`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${TOAST_ICON_BG[t.type]}`}>
              <ToastIcon type={t.type} />
            </div>
            <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{t.message}</span>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="ml-1 shrink-0 rounded p-0.5 opacity-50 hover:opacity-100 text-slate-500 dark:text-slate-400 transition-opacity"
              aria-label="Dismiss"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 1l12 12M13 1L1 13" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
