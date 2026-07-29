import type { AppData } from '../types'

const VERSION = 'presently:v3'
const LEGACY_PREFIX = 'presently-data-v2'

export const GUEST_ACCOUNT = 'guest'
export const MODE_KEY = `${VERSION}:mode`

/**
 * Every mutation made while a write could not reach the server is remembered
 * here as a *reference*, never as a payload snapshot.
 *
 * Referencing means a flush always sends whatever the entity looks like right
 * now, so ten edits to one subject collapse into one request and a stale queue
 * can never resurrect an older value.
 */
export interface Outbox {
  profile: boolean
  subjects: string[]
  records: string[]
  deletedSubjects: string[]
  deletedRecords: string[]
}

export const EMPTY_OUTBOX: Outbox = {
  profile: false,
  subjects: [],
  records: [],
  deletedSubjects: [],
  deletedRecords: []
}

export const EMPTY_DATA: AppData = { profile: null, subjects: [], records: [] }

export function outboxSize(outbox: Outbox): number {
  return (
    (outbox.profile ? 1 : 0) +
    outbox.subjects.length +
    outbox.records.length +
    outbox.deletedSubjects.length +
    outbox.deletedRecords.length
  )
}

/**
 * Storage access is wrapped because it throws outright in some privacy modes
 * and when a device is out of quota. Losing the cache is recoverable; crashing
 * the app is not.
 */
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* nothing useful to do */
  }
}

const dataKey = (account: string) => `${VERSION}:data:${account}`
const outboxKey = (account: string) => `${VERSION}:outbox:${account}`

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Cached JSON is untrusted input: it may come from an older release, a partial
 * write, or a hand-edited devtools session. Anything unrecognised is dropped
 * rather than allowed to crash a render deep in the tree.
 */
function reviveData(raw: string | null): AppData {
  if (!raw) return EMPTY_DATA

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecordLike(parsed)) return EMPTY_DATA

    const subjects = Array.isArray(parsed.subjects) ? parsed.subjects : []
    const records = Array.isArray(parsed.records) ? parsed.records : []

    return {
      profile: isRecordLike(parsed.profile) ? (parsed.profile as unknown as AppData['profile']) : null,
      subjects: subjects.filter(
        (item): item is AppData['subjects'][number] =>
          isRecordLike(item) && typeof item.id === 'string' && typeof item.name === 'string'
      ),
      records: records.filter(
        (item): item is AppData['records'][number] =>
          isRecordLike(item) && typeof item.id === 'string' && typeof item.subjectId === 'string'
      )
    }
  } catch {
    return EMPTY_DATA
  }
}

export function readData(account: string): AppData {
  return reviveData(safeGet(dataKey(account)))
}

export function writeData(account: string, data: AppData): void {
  safeSet(dataKey(account), JSON.stringify(data))
}

export function readOutbox(account: string): Outbox {
  const raw = safeGet(outboxKey(account))
  if (!raw) return EMPTY_OUTBOX

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecordLike(parsed)) return EMPTY_OUTBOX

    const list = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

    return {
      profile: parsed.profile === true,
      subjects: list(parsed.subjects),
      records: list(parsed.records),
      deletedSubjects: list(parsed.deletedSubjects),
      deletedRecords: list(parsed.deletedRecords)
    }
  } catch {
    return EMPTY_OUTBOX
  }
}

export function writeOutbox(account: string, outbox: Outbox): void {
  if (outboxSize(outbox) === 0) {
    safeRemove(outboxKey(account))
    return
  }
  safeSet(outboxKey(account), JSON.stringify(outbox))
}

/** Removes everything this device holds for one account. */
export function clearAccount(account: string): void {
  safeRemove(dataKey(account))
  safeRemove(outboxKey(account))
  safeRemove(`${LEGACY_PREFIX}:${account}`)
}

export function readMode(): string | null {
  return safeGet(MODE_KEY)
}

export function writeMode(mode: string | null): void {
  if (mode === null) safeRemove(MODE_KEY)
  else safeSet(MODE_KEY, mode)
}

/**
 * `crypto.randomUUID` only exists in secure contexts, so a plain-HTTP LAN
 * preview would otherwise throw on the first subject a user adds.
 */
export function createId(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID()

  const bytes = new Uint8Array(16)
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    cryptoRef.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
