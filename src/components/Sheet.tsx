import type { ReactNode } from 'react'
import { Drawer } from 'vaul'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

/**
 * The app's only modal surface, built on Vaul so it drags and flicks away the
 * way a native sheet does. Vaul sits on Radix Dialog underneath, so focus
 * trapping, Escape, focus restore and scroll locking come with it.
 */
export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      // A sheet that can be dragged past its top edge looks broken on a
      // fixed-height shell.
      dismissible
      repositionInputs={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px]" />

        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[30rem]
                     flex-col rounded-t-[1.75rem] border-t border-line bg-surface outline-none"
        >
          {/* The grab handle is the affordance that says "this drags". */}
          <div aria-hidden className="mx-auto mt-3 h-1 w-9 shrink-0 rounded-full bg-line-strong" />

          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-4">
            <div className="min-w-0">
              <Drawer.Title className="readout truncate text-[1.15rem]">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="mt-1.5 text-[0.8rem] text-ink-muted">
                  {description}
                </Drawer.Description>
              ) : (
                <Drawer.Description className="sr-only">{title}</Drawer.Description>
              )}
            </div>
          </div>

          <div className="scroll-region min-h-0 flex-1 px-5 pb-5">{children}</div>

          {footer ? (
            <div
              className="shrink-0 border-t border-line px-5 pt-4"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              {footer}
            </div>
          ) : (
            <div aria-hidden style={{ height: 'env(safe-area-inset-bottom)' }} />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
