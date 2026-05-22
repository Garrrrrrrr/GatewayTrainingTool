interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  variant?: 'primary' | 'neutral'
}

export function EmptyState({ icon, title, description, action, variant = 'primary' }: EmptyStateProps) {
  const iconBox = variant === 'primary'
    ? 'bg-tt-blue/15 border border-tt-blue/25'
    : 'bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]'

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
      {icon && (
        <div className={`w-14 h-14 rounded-[14px] flex items-center justify-center mb-4 ${iconBox}`}>
          <div className="text-tt-blue w-6 h-6">{icon}</div>
        </div>
      )}
      <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{title}</p>
      {description && <p className="mt-1.5 text-sm text-slate-400 dark:text-slate-500 max-w-xs">{description}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-tt-blue to-tt-teal px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition-all duration-150"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
