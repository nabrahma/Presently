import { useEffect, useState } from 'react'
import { todayKey } from './date'

/**
 * Today's date key, kept correct while the app stays open.
 *
 * A phone left on the check-in screen overnight would otherwise keep writing to
 * yesterday. The timer targets the next local midnight rather than polling, and
 * a resume from sleep re-checks immediately because the wake-up may be late.
 */
export function useTodayKey(): string {
  const [key, setKey] = useState(todayKey)

  useEffect(() => {
    let timer = 0

    const schedule = () => {
      const now = new Date()
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 200)

      timer = window.setTimeout(() => {
        setKey(todayKey())
        schedule()
      }, midnight.getTime() - now.getTime())
    }

    const resync = () => {
      if (document.visibilityState !== 'visible') return
      setKey((current) => {
        const next = todayKey()
        return next === current ? current : next
      })
    }

    schedule()
    document.addEventListener('visibilitychange', resync)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', resync)
    }
  }, [])

  return key
}
