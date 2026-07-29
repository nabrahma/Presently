import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Without this, one bad render anywhere in the tree leaves a blank white page
 * and no way forward. Attendance data lives in local storage and on the server,
 * so reloading is a genuine recovery rather than a placebo.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Presently crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold tracking-tight">Something broke</h1>
          <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-muted">
            Your attendance is safe — it is stored on this device and in your account. Reloading
            usually clears this.
          </p>
          <button
            type="button"
            className="btn-primary mt-6 w-full"
            onClick={() => window.location.assign('/')}
          >
            Reload Presently
          </button>
          {import.meta.env.DEV ? (
            <pre className="mt-6 overflow-x-auto rounded-xl bg-canvas p-3 text-left text-[0.7rem] text-ink-muted">
              {error.message}
            </pre>
          ) : null}
        </div>
      </main>
    )
  }
}
