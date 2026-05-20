/**
 * components/GoogleLoginForm.tsx — Google OAuth sign-in button
 *
 * Exports `GoogleButton`, a standalone button that initiates a Google OAuth
 * flow via Supabase's `signInWithOAuth`. This triggers a browser redirect to
 * Google's consent screen; on completion, Supabase redirects back to `redirectTo`
 * (the app's root), where the AuthContext session listener picks up the new session.
 *
 * This component is rendered inside LoginForm.tsx for the signin and signup modes.
 * The `GoogleIcon` SVG is a local inline copy of the official Google brand icon.
 *
 * Note: For Google OAuth to work, the Google provider must be enabled in the
 * Supabase project dashboard under Authentication > Providers > Google.
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildAuthRedirectUrl } from '../lib/authRedirect'

export function GoogleButton() {
  // True while the OAuth redirect is being initiated
  const [loading, setLoading] = useState(false)
  // Error message if the OAuth initiation fails (e.g. provider not enabled)
  const [error, setError] = useState('')

  /**
   * Starts the Google OAuth flow. If Supabase returns an error (e.g. provider
   * misconfigured), it is shown in the UI. On success, the browser is redirected
   * to Google — no further action is needed in this component.
   */
  async function handleGoogleSignIn() {
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Supabase will redirect the browser here after the OAuth callback
        redirectTo: buildAuthRedirectUrl('/'),
        queryParams: {
          prompt: 'select_account',
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success Supabase redirects the browser — no further action needed here
  }

  return (
    <div>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        onClick={handleGoogleSignIn}
        disabled={loading}
      >
        <GoogleIcon />
        {loading ? 'Redirecting…' : 'Continue with Google'}
      </button>

      {error && (
        <p
          className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}
