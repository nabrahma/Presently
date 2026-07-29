import { afterEach, describe, expect, it, vi } from 'vitest'
import { dateKey, isFutureKey, isValidDateKey, keyToDate, shiftKey, todayKey } from './date'

afterEach(() => {
  vi.useRealTimers()
})

describe('dateKey', () => {
  it('uses the local calendar day, not the UTC one', () => {
    // 1am on 12 March local. Anywhere east of UTC, toISOString() would report
    // the 11th here — the bug that filed early-morning check-ins a day late.
    const local = new Date(2026, 2, 12, 1, 30, 0)
    expect(dateKey(local)).toBe('2026-03-12')
  })

  it('is stable at both ends of a day', () => {
    expect(dateKey(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01')
    expect(dateKey(new Date(2026, 0, 1, 23, 59, 59))).toBe('2026-01-01')
  })

  it('zero-pads single-digit months and days', () => {
    expect(dateKey(new Date(2026, 8, 5))).toBe('2026-09-05')
  })
})

describe('todayKey', () => {
  it('follows the system clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 29, 4, 15))
    expect(todayKey()).toBe('2026-07-29')
  })
})

describe('keyToDate', () => {
  it('round-trips through dateKey', () => {
    for (const key of ['2026-01-01', '2026-02-28', '2024-02-29', '2026-12-31', '2026-06-15']) {
      expect(dateKey(keyToDate(key))).toBe(key)
    }
  })

  it('lands at midday so a daylight-saving shift cannot move the day', () => {
    expect(keyToDate('2026-03-29').getHours()).toBe(12)
  })

  it('returns an invalid date for junk rather than throwing', () => {
    expect(Number.isNaN(keyToDate('not-a-date').getTime())).toBe(true)
  })
})

describe('isValidDateKey', () => {
  it('accepts real calendar days', () => {
    expect(isValidDateKey('2026-07-29')).toBe(true)
    expect(isValidDateKey('2024-02-29')).toBe(true)
  })

  it('rejects malformed and non-existent days', () => {
    expect(isValidDateKey('2026-2-3')).toBe(false)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('2026-02-30')).toBe(false)
    expect(isValidDateKey('2025-02-29')).toBe(false)
    expect(isValidDateKey('')).toBe(false)
  })
})

describe('shiftKey', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftKey('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftKey('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('handles long spans used by the demo history', () => {
    expect(shiftKey('2026-07-29', -56)).toBe('2026-06-03')
  })
})

describe('isFutureKey', () => {
  it('treats today as not future', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 29, 23, 0))
    expect(isFutureKey('2026-07-29')).toBe(false)
    expect(isFutureKey('2026-07-30')).toBe(true)
    expect(isFutureKey('2026-07-28')).toBe(false)
  })
})
