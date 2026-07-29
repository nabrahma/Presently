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

  // The drawer uses pointer capture for its drag gesture; jsdom has no
  // implementation, which surfaces as a thrown error mid-interaction.
  const element = window.Element.prototype as unknown as Record<string, unknown>
  element.setPointerCapture ??= () => undefined
  element.releasePointerCapture ??= () => undefined
  element.hasPointerCapture ??= () => false

  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })
}
