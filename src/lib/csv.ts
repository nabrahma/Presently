import type { AppData, AttendanceRecord, Subject } from '../types'

/**
 * Escapes a value for CSV.
 *
 * The leading-character guard stops spreadsheet apps from interpreting a value
 * like `=cmd()` or `+1` as a formula, which is a well known CSV injection
 * vector when the sheet is opened by someone else.
 */
function escapeCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ').trim()
  const safe = /^[=+\-@\t\r]/.test(normalized) ? `'${normalized}` : normalized
  return `"${safe.replace(/"/g, '""')}"`
}

const HEADERS = ['subject', 'code', 'type', 'date', 'session', 'status'] as const

/**
 * Records are sorted by date then subject so a diff between two exports is
 * meaningful, and archived subjects are still resolvable by name.
 */
export function buildCsv(data: Pick<AppData, 'subjects' | 'records'>): string {
  const byId = new Map<string, Subject>(data.subjects.map((subject) => [subject.id, subject]))

  const sorted = [...data.records].sort((a, b) => {
    if (a.recordDate !== b.recordDate) return a.recordDate.localeCompare(b.recordDate)
    const nameA = byId.get(a.subjectId)?.name ?? ''
    const nameB = byId.get(b.subjectId)?.name ?? ''
    if (nameA !== nameB) return nameA.localeCompare(nameB)
    return a.sessionIndex - b.sessionIndex
  })

  const rows = sorted.map((record: AttendanceRecord) => {
    const subject = byId.get(record.subjectId)
    return [
      escapeCell(subject?.name ?? 'Deleted subject'),
      escapeCell(subject?.code ?? ''),
      escapeCell(subject?.subjectType ?? ''),
      escapeCell(record.recordDate),
      escapeCell(String(record.sessionIndex)),
      escapeCell(record.status)
    ].join(',')
  })

  // CRLF is what Excel expects; the join keeps a trailing newline off the file.
  return [HEADERS.map(escapeCell).join(','), ...rows].join('\r\n')
}

/**
 * Triggers a browser download.
 *
 * The anchor is attached to the document because Firefox ignores clicks on
 * detached nodes, and the object URL is revoked on the next frame because
 * revoking synchronously cancels the download in some browsers.
 */
export function downloadCsv(contents: string, filename: string): void {
  // The BOM makes Excel read the file as UTF-8 rather than the system codepage.
  const blob = new Blob([`﻿${contents}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()

  window.setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 0)
}
