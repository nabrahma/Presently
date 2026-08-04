import { configure } from '@testing-library/dom'
import { afterEach, vi } from 'vitest'

/*
  Routes are code-split, and the runner transforms each chunk on demand the
  first time it is reached — far slower than the cached fetch a browser makes,
  and slower again when several test files compete for the CPU. The default
  one-second wait is not a meaningful deadline here.
*/
configure({ asyncUtilTimeout: 15_000 })

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
  element.scrollIntoView ??= () => undefined

  /*
    jsdom implements none of these, and the drawer measures itself with all
    three while opening. Without them its children render inconsistently, which
    looks exactly like a slow test rather than a missing browser API.
  */
  if (!('ResizeObserver' in window)) {
    class StubResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(window as unknown as Record<string, unknown>).ResizeObserver = StubResizeObserver
    ;(globalThis as unknown as Record<string, unknown>).ResizeObserver = StubResizeObserver
  }

  // Read before the guard below, which narrows `window` to never.
  const { innerWidth, innerHeight } = window

  if (!window.visualViewport) {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        width: innerWidth,
        height: innerHeight,
        offsetTop: 0,
        offsetLeft: 0,
        scale: 1,
        addEventListener: () => undefined,
        removeEventListener: () => undefined
      }
    })
  }

  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })
}
