import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, MailCheck } from 'lucide-react'
import { Booting } from '../components/Booting'
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

  if (userId && !hydrated) return <Booting />
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
      // Links must return to this exact origin, or the session is created
      // somewhere the person is not.
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

        // Supabase returns a user with no identities for an address that is
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
      <Frame>
        <div className="grid h-11 w-11 place-items-center rounded-full border border-line text-accent">
          <MailCheck size={19} strokeWidth={1.8} />
        </div>
        <h1 className="readout mt-7 text-[1.6rem] leading-tight">Check your inbox</h1>
        <p className="mt-3 text-[0.88rem] leading-relaxed text-ink-muted">
          A sign-in link is on its way to <span className="text-ink">{sentTo}</span>. Open it in this
          browser to continue.
        </p>
        <button
          type="button"
          className="btn-secondary mt-8 w-full"
          disabled={cooldown > 0 || busy}
          onClick={() => {
            setSentTo('')
            setEmail(sentTo)
          }}
        >
          {cooldown > 0 ? `Retry in ${cooldown}s` : 'Use a different email'}
        </button>
      </Frame>
    )
  }

  return (
    <Frame>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[0.95rem] tracking-[-0.02em]">Presently</span>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
      </div>

      <h1 className="mt-8 text-[1.75rem] leading-[1.15] tracking-[-0.02em]">
        Attendance, without
        <br />
        the mental arithmetic.
      </h1>
      <p className="mt-4 text-[0.88rem] leading-relaxed text-ink-muted">
        Mark what happened. Presently works out how many classes you can still miss.
      </p>

      {cloud ? (
        <>
          <div role="tablist" aria-label="Account action" className="mt-8 flex gap-2">
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
                  'rounded-full border px-4 py-2.5 font-mono text-[0.65rem] tracking-[0.1em] uppercase transition-colors',
                  mode === key ? 'border-accent bg-accent text-bg' : 'border-line text-ink-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            <div>
              <label className="label mb-2.5 block" htmlFor="auth-email">
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
                <label className="label mb-2.5 block" htmlFor="auth-password">
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
              <p
                role="alert"
                className="rounded-2xl border border-danger/30 bg-danger-wash px-4 py-3 text-[0.78rem] text-danger"
              >
                {error}
              </p>
            ) : null}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? (
                <Loader2 size={15} className="motion-safe:animate-spin" />
              ) : (
                <>
                  {method === 'link' ? 'Send link' : mode === 'signUp' ? 'Create account' : 'Sign in'}
                  <ArrowRight size={14} strokeWidth={2.2} />
                </>
              )}
            </button>
          </form>

          <button
            type="button"
            className="mx-auto mt-4 block font-mono text-[0.65rem] tracking-[0.08em] text-ink-muted uppercase active:opacity-60"
            onClick={() => {
              setMethod(method === 'link' ? 'password' : 'link')
              setError('')
            }}
          >
            {method === 'link' ? 'Use a password' : 'Email me a link'}
          </button>
        </>
      ) : (
        <p className="mt-8 rounded-2xl border border-line px-4 py-4 text-[0.8rem] leading-relaxed text-ink-muted">
          No Supabase credentials in this build, so accounts and sync are off. Everything else works
          and stays on this device.
        </p>
      )}

      <div className="my-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="label">or</span>
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
        Explore sample data
      </button>

      <p className="mt-8 text-center font-mono text-[0.6rem] tracking-[0.08em] text-ink-faint uppercase">
        Private to your account
      </p>
    </Frame>
  )
}

/** Auth sits outside the app shell, so it owns its own scroll region. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-region h-full">
      <div
        className="mx-auto flex min-h-full w-full max-w-[26rem] flex-col justify-center px-6"
        style={{
          paddingTop: 'max(2rem, env(safe-area-inset-top))',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))'
        }}
      >
        {children}
      </div>
    </div>
  )
}

