import { useEffect, useState } from 'react'

/**
 * Subscribes to a media query.
 *
 * Used for the handful of decisions that change the markup rather than the
 * styling — a bottom drawer versus a centred dialog, for instance, which CSS
 * alone cannot express because the two need different behaviour, not different
 * appearance.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const media = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)

    // Re-read on subscribe: the query may have changed between the initial
    // render and this effect.
    setMatches(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * True on a desktop-shaped screen driven by a pointer.
 *
 * Both halves matter: a large touch screen still wants the drawer, and a small
 * window on a laptop still wants the phone layout.
 */
export function useDesktop(): boolean {
  return useMediaQuery('(min-width: 768px) and (pointer: fine)')
}
