import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { CalendarCheck, Check, ChevronRight } from 'lucide-react'
import { AttendanceMeter } from '../components/AttendanceMeter'
import { Empty } from '../components/Empty'
import { PageHeader, Shell } from '../components/Shell'
import { StatusControl } from '../components/StatusControl'
import { attendanceStats, safetyZone } from '../lib/attendanceMath'
import { keyToDate } from '../lib/date'
import { sessionsForDate } from '../lib/schedule'
import { useStore } from '../lib/store'
import { useTodayKey } from '../lib/useTodayKey'
import { SUBJECT_TYPE_LABELS, type AttendanceRecord } from '../types'

export function Today() {
  const { subjects, records, profile, setRecords } = useStore()
  const date = useTodayKey()

  const target = profile?.defaultTargetPercentage ?? 75
  const active = useMemo(() => subjects.filter((subject) => !subject.isArchived), [subjects])

  const overall = useMemo(() => {
    const activeIds = new Set(active.map((subject) => subject.id))
    return attendanceStats(
      records.filter((record) => activeIds.has(record.subjectId)),
      target
    )
  }, [active, records, target])

  const sessions = useMemo(
    () => sessionsForDate(active, records, date),
    [active, records, date]
  )

  const todaysRecords = useMemo(() => {
    const map = new Map<string, AttendanceRecord>()
    for (const record of records) {
      if (record.recordDate === date) map.set(`${record.subjectId}|${record.sessionIndex}`, record)
    }
    return map
  }, [records, date])

  const unmarked = sessions.filter(
    (slot) => !todaysRecords.has(`${slot.subject.id}|${slot.sessionIndex}`)
  )

  const atRisk = useMemo(
    () =>
      active
        .map((subject) => ({
          subject,
          stats: attendanceStats(
            records.filter((record) => record.subjectId === subject.id),
            subject.targetPercentage
          )
        }))
        .filter(({ subject, stats }) => stats.percentage !== null && stats.percentage < subject.targetPercentage)
        .sort((a, b) => (a.stats.percentage ?? 0) - (b.stats.percentage ?? 0)),
    [active, records]
  )

  const markRemainingPresent = () =>
    void setRecords(
      unmarked.map((slot) => ({
        subjectId: slot.subject.id,
        recordDate: date,
        sessionIndex: slot.sessionIndex,
        status: 'present' as const
      }))
    )

  const zone = safetyZone(overall.percentage, target)

  return (
    <Shell>
      <PageHeader eyebrow={format(keyToDate(date), 'EEEE')} title={format(keyToDate(date), 'd MMMM')} />

      <section className="card px-5 py-6" aria-labelledby="overall-heading">
        <p id="overall-heading" className="eyebrow">
          Overall attendance
        </p>

        <div className="mt-3 mb-6 flex items-baseline gap-2.5">
          <span className="text-[3.75rem] leading-[0.85] font-semibold tracking-[-0.055em] tabular">
            {overall.percentage === null ? '—' : overall.percentage}
          </span>
          {overall.percentage !== null ? (
            <span className="text-[1.4rem] font-medium tracking-tight text-ink-faint">%</span>
          ) : null}
        </div>

        <AttendanceMeter percentage={overall.percentage} target={target} zone={zone} />

        <p className="mt-4 text-[0.84rem] leading-relaxed text-ink-muted">
          {overall.total === 0
            ? 'Nothing recorded yet. Mark your first class to see where you stand.'
            : `${overall.present} of ${overall.total} classes attended across ${active.length} ${
                active.length === 1 ? 'subject' : 'subjects'
              }.`}
        </p>
      </section>

      <section className="mt-9" aria-labelledby="today-heading">
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h2 id="today-heading" className="text-[1.05rem] font-semibold tracking-tight">
            Today
          </h2>
          {unmarked.length > 0 ? (
            <button type="button" className="btn-ghost" onClick={markRemainingPresent}>
              <Check size={14} strokeWidth={2.5} />
              Mark {unmarked.length === sessions.length ? 'all' : 'rest'} present
            </button>
          ) : sessions.length > 0 ? (
            <span className="text-[0.75rem] font-medium text-ink-faint">All marked</span>
          ) : null}
        </div>

        {sessions.length === 0 ? (
          <Empty
            icon={<CalendarCheck size={20} strokeWidth={1.8} />}
            title={active.length === 0 ? 'No subjects yet' : 'Nothing scheduled today'}
            text={
              active.length === 0
                ? 'Add your subjects and their weekly timetable to start tracking.'
                : 'Enjoy the gap. Anything unexpected can be added from the calendar.'
            }
            action={
              active.length === 0 ? (
                <Link to="/subjects" className="btn-primary">
                  Add a subject
                </Link>
              ) : null
            }
          />
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {sessions.map((slot) => {
              const record = todaysRecords.get(`${slot.subject.id}|${slot.sessionIndex}`)
              return (
                <li
                  key={`${slot.subject.id}-${slot.sessionIndex}`}
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <span
                    aria-hidden
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: slot.subject.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9rem] leading-snug font-medium">
                      {slot.subject.name}
                    </p>
                    <p className="mt-1 truncate text-[0.72rem] text-ink-muted">
                      {slot.subject.code ? `${slot.subject.code} · ` : ''}
                      {SUBJECT_TYPE_LABELS[slot.subject.subjectType]}
                      {slot.sessionIndex > 1 ? ` · Session ${slot.sessionIndex}` : ''}
                    </p>
                  </div>
                  <StatusControl
                    compact
                    value={record?.status}
                    label={`${slot.subject.name} attendance`}
                    onChange={(status) =>
                      void setRecords([
                        {
                          subjectId: slot.subject.id,
                          recordDate: date,
                          sessionIndex: slot.sessionIndex,
                          status
                        }
                      ])
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {atRisk.length > 0 ? (
        <section className="mt-9" aria-labelledby="risk-heading">
          <h2 id="risk-heading" className="mb-3.5 text-[1.05rem] font-semibold tracking-tight">
            Below target
          </h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {atRisk.map(({ subject, stats }) => (
              <li key={subject.id}>
                <Link
                  to={`/subjects/${subject.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-canvas"
                >
                  <span
                    aria-hidden
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: subject.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9rem] leading-snug font-medium">{subject.name}</p>
                    <p className="mt-1 text-[0.72rem] text-critical">
                      {stats.percentage}% ·{' '}
                      {stats.comeback === null
                        ? `A ${subject.targetPercentage}% target cannot be recovered`
                        : `attend the next ${stats.comeback} to reach ${subject.targetPercentage}%`}
                    </p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  )
}
