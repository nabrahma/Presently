import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function isUsable(value: string | undefined): value is string {
  // The example env file ships placeholder values; treat those as unconfigured
  // rather than letting the client fail on every request.
  if (!value) return false
  return !value.includes('your-project') && !value.includes('your-anon')
}

function create(): SupabaseClient | null {
  if (!isUsable(url) || !isUsable(anonKey)) return null

  try {
    void new URL(url)
  } catch {
    console.warn('VITE_SUPABASE_URL is not a valid URL; running without cloud sync.')
    return null
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Magic links land back on the app with a code that must be exchanged
      // for a session before anything can be read.
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  })
}

export const supabase = create()

/** True when the build has real credentials, so cloud sync is available. */
export const isCloudEnabled = supabase !== null

/** Turns any thrown value into something worth showing a person. */
export function describeError(error: unknown): string {
  if (!error) return 'Something went wrong.'
  if (typeof error === 'string') return error

  const message = (error as { message?: string }).message ?? ''

  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Cannot reach the server. Check your connection.'
  }
  if (/invalid login credentials/i.test(message)) {
    return 'That email and password combination is not recognised.'
  }
  if (/email not confirmed/i.test(message)) {
    return 'Confirm your email address first — check your inbox.'
  }
  if (/user already registered|already been registered/i.test(message)) {
    return 'That email already has an account. Sign in instead.'
  }
  if (/for security purposes|rate limit|too many requests/i.test(message)) {
    return 'Too many attempts. Wait a minute, then try again.'
  }
  if (/password should be at least/i.test(message)) {
    return 'Passwords need at least 6 characters.'
  }

  return message || 'Something went wrong.'
}
