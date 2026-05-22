/**
 * BrandedLoader — Full-page loading screen with animated logo.
 * Replaces the bare "Loading…" text for a more polished first impression.
 */
export function BrandedLoader({ message = 'Loading your dashboard…' }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-tt-darkest gap-5">
      {/* Animated logo mark */}
      <div className="w-14 h-14 rounded-[14px] bg-gradient-to-br from-tt-blue to-tt-teal flex items-center justify-center animate-branded-pulse">
        <span className="text-white font-bold text-xl leading-none select-none">T</span>
      </div>
      <p className="text-sm text-slate-400 dark:text-slate-500 animate-fade-in">{message}</p>
    </div>
  )
}
