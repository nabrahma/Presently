import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, CircleSlash, House, Layers, Settings2 } from 'lucide-react'
import { Booting } from './Booting'
import { cn } from '../lib/cn'
import { useStore } from '../lib/store'

const NAV = [
  { to: '/', label: 'Today', icon: House, end: true },
  { to: '/subjects', label: 'Subjects', icon: Layers, end: false },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, end: false },
  { to: '/settings', label: 'Settings', icon: Settings2, end: false }
]

/**
 * The persistent frame every screen renders into.
 *
 * This is a layout route rather than a wrapper each screen imports, so the
 * header and dock are mounted once for the life of the session. That is what
 * lets the dock indicator slide between tabs and stops the chrome flashing on
 * every navigation — the thing that most makes a PWA read as a web page.
 */
export function Shell() {
  const location = useLocation()
  const { online, syncing, pendingCount, isDemo } = useStore()
  const scrollRef = useRef<HTMLElement>(null)

  // A persistent scroll container keeps its offset, so without this, arriving
  // at a new screen already scrolled halfway down is the default. Assigning
  // scrollTop is an instant jump, which is what a navigation should be.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [location.pathname])

  return (
    <div className="mx-auto flex h-full w-full max-w-[30rem] flex-col">
      <header
        className="flex shrink-0 items-center justify-between px-5 pb-3"
        style={{ paddingTop: 'max(0.9rem, env(safe-area-inset-top))' }}
      >
        <NavLink to="/" className="flex items-baseline gap-2" aria-label="Presently, go to today">
          <span className="font-mono text-[0.95rem] font-medium tracking-[-0.02em] text-ink">
            Presently
          </span>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
        </NavLink>

        <StatusFlag online={online} syncing={syncing} pending={pendingCount} demo={isDemo} />
      </header>

      <main ref={scrollRef} className="scroll-region min-h-0 flex-1 px-5">
        <Suspense fallback={<Booting />}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
            >
              <Outlet />
              {/* Clears the dock so the last row is never trapped behind it. */}
              <div aria-hidden className="h-6" />
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </main>

      <nav
        aria-label="Sections"
        className="shrink-0 px-5 pt-2"
        style={{ paddingBottom: 'max(0.9rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5',
                  'font-mono text-[0.62rem] font-medium tracking-[0.1em] uppercase transition-colors',
                  isActive ? 'text-bg' : 'text-ink-muted'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    /* One element slides between tabs rather than four
                       cross-fading, which is what makes it read as a control. */
                    <motion.span
                      layoutId="dock-active"
                      className="absolute inset-0 rounded-full bg-accent"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  <Icon size={14} strokeWidth={2} className="relative z-10" />
                  <span className="relative z-10">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

function StatusFlag({
  online,
  syncing,
  pending,
  demo
}: {
  online: boolean
  syncing: boolean
  pending: number
  demo: boolean
}) {
  if (demo) {
    return <span className="label rounded-full border border-line px-2.5 py-1.5 text-accent">Demo</span>
  }
  if (!online) {
    return (
      <span className="label flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1.5">
        <CircleSlash size={11} strokeWidth={2.2} />
        Offline
      </span>
    )
  }
  if (syncing || pending > 0) {
    return (
      <span className="label flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1.5">
        <motion.span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-accent"
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        {syncing ? 'Syncing' : `${pending} queued`}
      </span>
    )
  }
  return null
}

/** Screen title block: a small caps label above a large heading. */
export function ScreenHead({
  label,
  title,
  action
}: {
  label: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="label">{label}</p>
        <h1 className="readout mt-2.5 truncate text-[1.9rem]">{title}</h1>
      </div>
      {action}
    </div>
  )
}
