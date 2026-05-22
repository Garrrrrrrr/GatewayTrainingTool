type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  const confirmClass =
    confirmVariant === 'danger'
      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25 hover:bg-rose-500/20'
      : 'bg-gradient-to-r from-tt-blue to-tt-teal text-white hover:brightness-110'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4 animate-backdrop-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-sm bg-white dark:bg-tt-surface border border-slate-200 dark:border-white/[0.08] rounded-[14px] p-6 shadow-2xl animate-modal-in">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 id="confirm-dialog-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="w-7 h-7 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-center shrink-0 transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-white dark:bg-tt-surface text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-tt-elevated transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-all duration-150 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
