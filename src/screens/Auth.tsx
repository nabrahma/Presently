import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, MailCheck } from 'lucide-react'
import { cn } from '../lib/cn'
import { useStore } from '../lib/store'
import { describeError, supabase } from '../lib/supabaseClient'

type Mode = 'signIn' | 'signUp'
type Method = 'link' | 'password'

const RESEND_SECONDS = 45

export function Auth() {
  const navigate = useNavigate()
  const { userId, hydrated, profile, cloud, startDemo, isDemo } = useStore()

  const [mode, setMode] = useState<Mode>('signIn')
  const [method, setMethod] = useState<Method>('link')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    timerRef.current = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [cooldown])

  // A signed-in visitor never has a reason to look at this screen.
  if (userId && !hydrated) return <AuthLoading />
  if (userId) return <Navigate to={profile?.onboarded ? '/' : '/onboarding'} replace />
  if (isDemo) return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return

    const address = email.trim().toLowerCase()
    if (!address) {
      setError('Enter your email address.')
      return
    }
    if (!supabase) {
      setError('This build has no Supabase credentials, so accounts are unavailable.')
      return
    }
    if (method === 'password' && password.length < 6) {
      setError('Passwords need at least 6 characters.')
      return
    }

    setBusy(true)
    setError('')

    try {
      // Magic links and confirmation emails must come back to this exact
      // origin, otherwise the session is created somewhere the user is not.
      const emailRedirectTo = `${window.location.origin}/`

      if (method === 'link') {
        const { error: failure } = await supabase.auth.signInWithOtp({
          email: address,
          options: { emailRedirectTo, shouldCreateUser: true }
        })
        if (failure) throw failure
        setSentTo(address)
        setCooldown(RESEND_SECONDS)
      } else if (mode === 'signUp') {
        const { data, error: failure } = await supabase.auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo }
        })
        if (failure) throw failure

        // Supabase returns a user with no identities when the address is
        // already taken, rather than an error.
        if (data.user && data.user.identities?.length === 0) {
          setError('That email already has an account. Sign in instead.')
          setMode('signIn')
          return
        }
        if (!data.session) {
          setSentTo(address)
          setCooldown(RESEND_SECONDS)
          return
        }
        navigate('/onboarding', { replace: true })
      } else {
        const { error: failure } = await supabase.auth.signInWithPassword({
          email: address,
          password
        })
        if (failure) throw failure
        navigate('/', { replace: true })
      }
    } catch (failure) {
      setError(describeError(failure))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <AuthLayout>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-canvas">
          <MailCheck size={22} strokeWidth={1.8} />
        </div>
        <h1 className="mt-6 text-[1.6rem] leading-tight font-semibold tracking-[-0.03em]">
          Check your inbox
        </h1>
        <p className="mt-2.5 text-[0.9rem] leading-relaxed text-ink-muted">
          We sent a sign-in link to <span className="font-medium text-ink">{sentTo}</span>. Open it
          in this browser to continue.
        </p>

        <button
          type="button"
          className="btn-secondary mt-7 w-full"
          disabled={cooldown > 0 || busy}
          onClick={() => {
            setSentTo('')
            setEmail(sentTo)
          }}
        >
          {cooldown > 0 ? `Send again in ${cooldown}s` : 'Use a different email'}
        </button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-[1.05rem] font-bold text-canvas">
        P
      </div>

      <h1 className="mt-6 text-[1.7rem] leading-[1.1] font-semibold tracking-[-0.035em]">
        Attendance, without
        <br />
        the mental arithmetic.
      </h1>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-ink-muted">
        Mark what happened. Presently works out how many classes you can still miss.
      </p>

      {cloud ? (
        <>
          <div
            role="tablist"
            aria-label="Account action"
            className="mt-7 flex rounded-xl border border-line bg-canvas p-1"
          >
            {(
              [
                ['signIn', 'Sign in'],
                ['signUp', 'Create account']
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={mode === key}
                onClick={() => {
                  setMode(key)
                  setError('')
                }}
                className={cn(
                  'flex-1 rounded-lg py-2.5 text-[0.82rem] font-semibold transition-colors',
                  mode === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} noValidate className="mt-5 space-y-4">
            <div>
              <label className="field-label" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                className="field"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                placeholder="you@college.edu"
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (error) setError('')
                }}
              />
            </div>

            {method === 'password' ? (
              <div>
                <label className="field-label" htmlFor="auth-password">
                  Password
                </label>
                <input
                  id="auth-password"
                  className="field"
                  type="password"
                  minLength={6}
                  autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  placeholder="At least 6 characters"
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (error) setError('')
                  }}
                />
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-xl bg-critical-wash px-3.5 py-2.5 text-[0.8rem] text-critical">
                {error}
              </p>
            ) : null}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? (
                <Loader2 size={16} className="motion-safe:animate-spin" />
              ) : (
                <>
                  {method === 'link'
                    ? 'Email me a sign-in link'
                    : mode === 'signUp'
                      ? 'Create account'
                      : 'Sign in'}
                  <ArrowRight size={16} strokeWidth={2.2} />
                </>
              )}
            </button>
          </form>

          <button
            type="button"
            className="btn-ghost mx-auto mt-3 block"
            onClick={() => {
              setMethod(method === 'link' ? 'password' : 'link')
              setError('')
            }}
          >
            {method === 'link' ? 'Use a password instead' : 'Email me a link instead'}
          </button>
        </>
      ) : (
        <p className="mt-7 rounded-xl bg-canvas px-4 py-3.5 text-[0.82rem] leading-relaxed text-ink-muted">
          This build has no Supabase credentials, so accounts and cloud sync are off. Everything
          below still works and stays on this device.
        </p>
      )}

      <div className="my-6 flex items-center gap-3 text-[0.72rem] text-ink-faint">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        className="btn-secondary w-full"
        onClick={() => {
          startDemo()
          navigate('/', { replace: true })
        }}
      >
        Explore with sample data
      </button>

      <p className="mt-6 text-center text-[0.72rem] leading-relaxed text-ink-faint">
        Your attendance stays private to your account.
      </p>
    </AuthLayout>
  )
}

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[24rem]">{children}</div>
    </main>
  )
}

export function AuthLoading() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-[1.05rem] font-bold text-canvas">
        P
      </div>
      <p className="text-[0.85rem] text-ink-muted">Loading your attendance…</p>
    </main>
  )
}
