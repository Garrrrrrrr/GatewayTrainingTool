const WIDTHS = ['w-full', 'w-3/4', 'w-1/2', 'w-5/6']

export function SkeletonText({ className = '' }: { className?: string }) {
  return <div className={`h-3 rounded animate-shimmer ${className}`} />
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-[10px] bg-white dark:bg-tt-surface p-4">
      <div className="h-4 w-1/3 rounded animate-shimmer mb-3" />
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`h-3 rounded animate-shimmer mt-2 ${WIDTHS[i % WIDTHS.length]}`}
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-[10px] bg-white dark:bg-tt-surface overflow-hidden">
      <div className="bg-slate-50 dark:bg-white/[0.02] px-4 py-3 flex gap-4 border-b border-slate-200 dark:border-white/[0.06]">
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className="h-3 w-20 rounded animate-shimmer" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="border-b border-slate-200/50 dark:border-white/[0.03] px-4 py-3 flex gap-4">
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={c}
              className={`h-3 rounded animate-shimmer ${c === 0 ? 'w-[30%]' : 'w-[15%]'}`}
              style={{ animationDelay: `${(r * cols + c) * 0.05}s` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
