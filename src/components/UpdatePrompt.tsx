import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * A new build is offered rather than forced.
 *
 * Auto-reloading is worse than it sounds here: it can swap the page out
 * mid-tap, which on this app means losing a check-in someone just made.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisterError: (error) => console.error('Service worker registration failed', error)
  })

  useEffect(() => {
    if (!needRefresh) return

    toast('A new version is ready', {
      description: 'Reload to pick up the latest changes.',
      duration: Infinity,
      action: {
        label: 'Reload',
        onClick: () => void updateServiceWorker(true)
      },
      onDismiss: () => setNeedRefresh(false)
    })
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
