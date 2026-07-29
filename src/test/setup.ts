import { afterEach, vi } from 'vitest'

/**
 * jsdom implements neither of these, and both are used on paths the app takes
 * on first paint, so without stubs a render test fails for reasons that have
 * nothing to do with the app.
 */
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    })) as typeof window.matchMedia
  }

  if (!window.scrollTo) {
    window.scrollTo = (() => undefined) as typeof window.scrollTo
  }

  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })
}
