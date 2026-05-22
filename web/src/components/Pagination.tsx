interface PaginationProps {
  page: number
  limit: number
  total: number
  onPageChange: (page: number) => void
  /** Label for the count text, e.g. "report" → "Showing 1–50 of 100 reports" */
  itemLabel?: string
}

export function Pagination({ page, limit, total, onPageChange, itemLabel = 'result' }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : page * limit + 1
  const to = Math.min((page + 1) * limit, total)

  if (total <= limit) return null

  const pages: (number | 'ellipsis')[] = []
  for (let i = 0; i < totalPages; i++) {
    if (
      i === 0 ||
      i === totalPages - 1 ||
      (i >= page - 1 && i <= page + 1)
    ) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis')
    }
  }

  const btnBase = 'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors duration-100'
  const btnDefault = `${btnBase} border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-tt-elevated hover:text-slate-800 dark:hover:text-slate-200`
  const btnActive = `${btnBase} border-tt-blue/35 bg-tt-blue/20 text-tt-blue`
  const btnDisabled = `${btnBase} border-slate-200/50 dark:border-white/[0.05] text-slate-400 dark:text-slate-600 cursor-not-allowed`

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <span className="text-xs text-slate-400 dark:text-slate-500">
        Showing {from}–{to} of {total} {itemLabel}{total !== 1 ? 's' : ''}
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={page === 0 ? btnDisabled : btnDefault}
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </button>

        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="px-1 text-xs text-slate-400 dark:text-slate-600">...</span>
          ) : (
            <button
              key={p}
              type="button"
              className={p === page ? btnActive : btnDefault}
              onClick={() => onPageChange(p)}
            >
              {p + 1}
            </button>
          ),
        )}

        <button
          type="button"
          className={page >= totalPages - 1 ? btnDisabled : btnDefault}
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}
