import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { CalendarDays, CloudOff, House, Layers, RefreshCw, Settings2 } from 'lucide-react'
import { cn } from '../lib/cn'
import { useStore } from '../lib/store'

const NAV = [
  { to: '/', label: 'Today', icon: House, end: true },
  { to: '/subjects', label: 'Subjects', icon: Layers, end: false },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, end: false },
  { to: '/settings', label: 'Settings', icon: Settings2, end: false }
]

/** A single honest line about whether what you see has reached the server. */
function SyncBadge() {
  const { online, syncing, pendingCount, cloud, isDemo } = useStore()

  if (isDemo) {
    return (
      <span className="chip border-accent/40 bg-accent-wash text-accent">Demo data</span>
    )
  }
  if (!cloud) return null

  if (!online) {
    return (
      <span className="chip gap-1.5">
        <CloudOff size={12} strokeWidth={2.2} />
        Offline
      </span>
    )
  }
  if (syncing) {
    return (
      <span className="chip gap-1.5">
        <RefreshCw size={12} strokeWidth={2.2} className="motion-safe:animate-spin" />
        Syncing
      </span>
    )
  }
  if (pendingCount > 0) {
    return <span className="chip gap-1.5">{pendingCount} to sync</span>
  }
  return null
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col px-4">
      <header className="flex h-16 shrink-0 items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2" aria-label="Presently, go to today">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[0.8rem] font-bold text-canvas">
            P
          </span>
          <span className="text-[0.95rem] font-semibold tracking-tight">Presently</span>
        </NavLink>
        <SyncBadge />
      </header>

      <main className="flex-1 pb-32">{children}</main>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4
                   pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex w-full max-w-[26rem] items-center gap-1 rounded-full bg-ink p-1.5 shadow-lg">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5',
                  'text-[0.72rem] font-semibold transition-colors duration-200',
                  isActive ? 'bg-canvas text-ink' : 'text-canvas/60 hover:text-canvas'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} strokeWidth={isActive ? 2.4 : 2} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/** Consistent page header: small context line above a large title. */
export function PageHeader({
  eyebrow,
  title,
  action
}: {
  eyebrow: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1.5 truncate text-[1.75rem] leading-none font-semibold tracking-[-0.03em]">
          {title}
        </h1>
      </div>
      {action}
    </div>
  )
}
