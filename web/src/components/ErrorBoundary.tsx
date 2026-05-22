import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Top-level error boundary that catches render errors and displays a branded
 * fallback UI instead of a blank white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-tt-darkest flex items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            {/* Logo */}
            <div className="w-14 h-14 rounded-[14px] bg-gradient-to-br from-tt-blue to-tt-teal flex items-center justify-center mx-auto mb-6">
              <span className="text-white font-bold text-xl leading-none select-none">G</span>
            </div>

            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              An unexpected error occurred. You can try reloading the page or going back.
            </p>

            <div className="flex items-center justify-center gap-3 mb-8">
              <button
                type="button"
                onClick={this.handleReload}
                className="rounded-[10px] bg-gradient-to-r from-tt-blue to-tt-teal text-white px-5 py-2.5 text-sm font-semibold hover:brightness-110 transition-all duration-150"
              >
                Reload page
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-[10px] border border-slate-200 dark:border-white/[0.08] px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
              >
                Try again
              </button>
            </div>

            {/* Collapsible error details */}
            {this.state.error && (
              <details className="text-left bg-white dark:bg-tt-surface rounded-[10px] border border-slate-200 dark:border-white/[0.06] p-4">
                <summary className="text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-400 dark:hover:text-slate-400 transition-colors">
                  Error details
                </summary>
                <pre className="mt-3 text-[11px] leading-relaxed text-rose-400/80 whitespace-pre-wrap break-words font-mono">
                  {this.state.error.message}
                  {this.state.error.stack && (
                    <>
                      {'\n\n'}
                      {this.state.error.stack}
                    </>
                  )}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
