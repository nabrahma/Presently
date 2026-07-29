import { describe, expect, it } from 'vitest'
import { buildCsv } from './csv'
import type { AttendanceRecord, Subject } from '../types'

const subject = (overrides: Partial<Subject> = {}): Subject => ({
  id: 's1',
  name: 'Data Structures',
  code: 'CS201',
  subjectType: 'lecture',
  color: '#000000',
  targetPercentage: 75,
  isArchived: false,
  schedule: [],
  createdAt: '',
  ...overrides
})

const entry = (overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: 'r1',
  subjectId: 's1',
  recordDate: '2026-07-29',
  sessionIndex: 1,
  status: 'present',
  createdAt: '',
  updatedAt: '',
  ...overrides
})

describe('buildCsv', () => {
  it('writes a header and one row per record', () => {
    const csv = buildCsv({ subjects: [subject()], records: [entry()] })
    const lines = csv.split('\r\n')

    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('"subject","code","type","date","session","status"')
    expect(lines[1]).toBe('"Data Structures","CS201","lecture","2026-07-29","1","present"')
  })

  it('escapes quotes by doubling them', () => {
    const csv = buildCsv({
      subjects: [subject({ name: 'The "Hard" One' })],
      records: [entry()]
    })
    expect(csv).toContain('"The ""Hard"" One"')
  })

  it('neutralises values a spreadsheet would run as a formula', () => {
    // A subject named =HYPERLINK(...) must not execute for whoever opens it.
    const csv = buildCsv({
      subjects: [subject({ name: '=HYPERLINK("http://x")' })],
      records: [entry()]
    })
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(csv).not.toContain('"=HYPERLINK')
  })

  it('flattens newlines so a row can never span lines', () => {
    const csv = buildCsv({ subjects: [subject({ name: 'Line\nBreak' })], records: [entry()] })
    expect(csv.split('\r\n')).toHaveLength(2)
    expect(csv).toContain('"Line Break"')
  })

  it('keeps records whose subject has been deleted', () => {
    const csv = buildCsv({ subjects: [], records: [entry()] })
    expect(csv).toContain('"Deleted subject"')
  })

  it('sorts by date, then subject, then session', () => {
    const csv = buildCsv({
      subjects: [subject(), subject({ id: 's2', name: 'Algorithms', code: 'CS202' })],
      records: [
        entry({ id: 'a', recordDate: '2026-07-30' }),
        entry({ id: 'b', recordDate: '2026-07-29', sessionIndex: 2 }),
        entry({ id: 'c', recordDate: '2026-07-29', sessionIndex: 1 }),
        entry({ id: 'd', recordDate: '2026-07-29', subjectId: 's2' })
      ]
    })

    const dataRows = csv.split('\r\n').slice(1)
    expect(dataRows[0]).toContain('Algorithms')
    expect(dataRows[1]).toContain('"1"')
    expect(dataRows[2]).toContain('"2"')
    expect(dataRows[3]).toContain('2026-07-30')
  })

  it('produces only a header when there is nothing recorded', () => {
    expect(buildCsv({ subjects: [], records: [] })).toBe(
      '"subject","code","type","date","session","status"'
    )
  })

  it('leaves an absent code as an empty cell rather than "undefined"', () => {
    const csv = buildCsv({ subjects: [subject({ code: undefined })], records: [entry()] })
    expect(csv).toContain('"Data Structures","",')
  })
})
