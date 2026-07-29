import type { ReactNode } from 'react'

interface EmptyProps {
  icon: ReactNode
  title: string
  text: string
  action?: ReactNode
}

export function Empty({ icon, title, text, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line px-6 py-12 text-center">
      <div className="mb-3.5 grid h-11 w-11 place-items-center rounded-xl bg-canvas text-ink-muted">
        {icon}
      </div>
      <h3 className="text-[0.95rem] font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-[16rem] text-[0.82rem] leading-relaxed text-ink-muted">{text}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
