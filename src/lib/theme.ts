import { useCallback, useEffect, useState } from 'react'
import type { ThemeMode } from '../types'
import { readTheme, writeTheme } from './storage'

const query = '(prefers-color-scheme: dark)'

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia(query).matches ? 'dark' : 'light'
}

function apply(mode: ThemeMode) {
  const resolved = resolve(mode)
  document.documentElement.dataset.theme = resolved
  // Keeps native form controls, scrollbars and the address bar in step.
  document.documentElement.style.colorScheme = resolved
}

/**
 * Theme choice is persisted, but "system" stays live: changing the OS setting
 * while the app is open updates it without a reload.
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = readTheme()
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  })

  useEffect(() => {
    apply(mode)

    if (mode !== 'system') return
    if (typeof window === 'undefined' || !window.matchMedia) return

    const media = window.matchMedia(query)
    const onChange = () => apply('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode])

  const update = useCallback((next: ThemeMode) => {
    setMode(next)
    // 'system' is stored as an explicit value so the pre-paint script in the
    // document head knows to fall back to the media query.
    writeTheme(next)
  }, [])

  return { mode, resolved: resolve(mode), setMode: update }
}
