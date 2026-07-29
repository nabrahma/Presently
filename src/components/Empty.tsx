import type { ReactNode } from 'react'

interface EmptyProps {
  icon: ReactNode
  title: string
  text: string
  action?: ReactNode
}

export function Empty({ icon, title, text, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center rounded-panel border border-dashed border-line px-6 py-10 text-center">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-full border border-line text-ink-faint">
        {icon}
      </div>
      <h3 className="readout text-[0.95rem]">{title}</h3>
      <p className="mt-2 max-w-[15rem] text-[0.8rem] leading-relaxed text-ink-muted">{text}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
