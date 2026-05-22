/**
 * pages/LoginView.tsx — Public login page
 *
 * Renders the full-page login layout with a branded hero panel on the left
 * and the authentication form on the right. On smaller screens, the hero
 * panel is hidden and a wordmark is shown above the form instead.
 *
 * If the user is already authenticated (has an active session), they are
 * immediately redirected to /dashboard — this prevents logged-in users
 * from seeing the login page when they navigate to /login directly.
 *
 * The actual authentication logic lives in LoginForm.tsx and GoogleLoginForm.tsx.
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoginForm } from '../components/LoginForm'

export function LoginView() {
  const { session } = useAuth()

  // Already authenticated — redirect to the main app
  if (session) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — branded hero panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-tt-darkest via-tt-dark to-tt-blue px-16 py-12">
        <div>
          <span className="text-xs font-semibold tracking-[0.25em] uppercase text-white/50">
            training teams
          </span>
        </div>

        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-bold text-white leading-snug">
            Training,<br />simplified.
          </h1>
          <p className="text-base text-white/60 leading-relaxed max-w-sm">
            Fast drill logging. Digital assessments. Real-time scheduling — all in one place for coordinators, trainers, and students across BC, AB, and ON.
          </p>
          <div className="flex flex-col gap-3 mt-2">
            {['Floor-ready drill logging', 'Digital competency tracking', 'Multi-site class management'].map(feature => (
              <div key={feature} className="flex items-center gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-tt-blue flex-shrink-0" />
                <span className="text-sm text-white/70">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/25">
          © {new Date().getFullYear()} Training Tool
        </p>
      </div>

      {/* Right — form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        {/* Mobile-only wordmark */}
        <div className="mb-8 lg:hidden text-center">
          <span className="text-xs font-semibold tracking-[0.25em] uppercase text-tt-dark">
            training teams
          </span>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
