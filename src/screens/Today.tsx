import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import { Empty } from '../components/Empty'
import { Gauge, Meter } from '../components/Gauge'
import { DataRow, Panel, Readout, SectionHead } from '../components/Panel'
import { ScreenHead } from '../components/Shell'
import { StatusControl } from '../components/StatusControl'
import {
  attendanceStats,
  safetyZone,
  standings,
  type AttendanceStats
} from '../lib/attendanceMath'
import { formatDayMonth, formatWeekday, keyToDate } from '../lib/date'
import { sessionsForDate } from '../lib/schedule'
import { useStore } from '../lib/store'
import { useTodayKey } from '../lib/useTodayKey'
import { SUBJECT_TYPE_LABELS, type AttendanceRecord } from '../types'

export function Today() {
  const { subjects, records, setRecords } = useStore()
  const date = useTodayKey()

  const active = useMemo(() => subjects.filter((subject) => !subject.isArchived), [subjects])

  const sessions = useMemo(() => sessionsForDate(active, records, date), [active, records, date])

  const marked = useMemo(() => {
    const map = new Map<string, AttendanceRecord>()
    for (const record of records) {
      if (record.recordDate === date) map.set(`${record.subjectId}|${record.sessionIndex}`, record)
    }
    return map
  }, [records, date])

  const unmarked = sessions.filter((slot) => !marked.has(`${slot.subject.id}|${slot.sessionIndex}`))

  /*
    Colleges hold each subject to its own target, so everything here is per
    subject. A pooled percentage looked reassuring while one subject sat below
    the line, and summing spare classes across subjects promised absences that
    no single subject could actually afford.

    Every figure comes from one pass over the records.
  */
  const { statsFor, lowest, leastSpare, below } = useMemo(() => {
    const bySubject = new Map<string, typeof records>()
    for (const record of records) {
      const list = bySubject.get(record.subjectId)
      if (list) list.push(record)
      else bySubject.set(record.subjectId, [record])
    }

    const scored = active.map((subject) => ({
      item: subject,
      stats: attendanceStats(bySubject.get(subject.id) ?? [], subject.targetPercentage),
      target: subject.targetPercentage
    }))

    return {
      statsFor: new Map(scored.map((entry) => [entry.item.id, entry.stats])),
      ...standings(scored)
    }
  }, [active, records])

  const markRest = () =>
    void setRecords(
      unmarked.map((slot) => ({
        subjectId: slot.subject.id,
        recordDate: date,
        sessionIndex: slot.sessionIndex,
        status: 'present' as const,
      })),
    )

  return (
    <>
      <ScreenHead label={formatWeekday(keyToDate(date))} title={formatDayMonth(keyToDate(date))} />

      {/*
        Phone: one column, summary then list. From `lg` the day's list becomes
        the working surface on the left and the summary settles into a rail on
        the right, which is what a wide screen is actually for.
      */}
      <div className="lg:flex lg:flex-row-reverse lg:items-start lg:gap-8">
        <div className="lg:sticky lg:top-0 lg:w-[20rem] lg:shrink-0 lg:space-y-3">
          {/*
            The subject closest to (or furthest below) its own target. That one
            subject, not an average, decides whether someone is safe.
          */}
          <Panel className="px-5 py-4">
            {lowest ? (
              <Link to={`/subjects/${lowest.item.id}`} className="block active:opacity-60">
                <LowestSubject
                  label={`Lowest · ${lowest.item.code || lowest.item.name}`}
                  stats={lowest.stats}
                  target={lowest.target}
                />
              </Link>
            ) : (
              <LowestSubject label="Lowest subject" stats={null} target={75} />
            )}
          </Panel>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:mt-0">
            <Panel className="px-5 py-4">
              <Readout
                label="Least spare"
                value={leastSpare ? String(leastSpare.stats.bunkable) : '––'}
                suffix={leastSpare?.stats.bunkable === 1 ? 'class' : 'classes'}
                tone={leastSpare && leastSpare.stats.bunkable ? 'accent' : 'muted'}
              />
              <p className="mt-1.5 truncate font-mono text-[0.6rem] tracking-[0.08em] text-ink-faint uppercase">
                {leastSpare
                  ? leastSpare.item.code || leastSpare.item.name
                  : lowest
                    ? 'None on target'
                    : 'No classes yet'}
              </p>
            </Panel>
            <Panel className="px-5 py-4">
              <Readout
                label="Below target"
                value={String(below.length)}
                suffix={below.length === 1 ? 'subject' : 'subjects'}
                tone={below.length > 0 ? 'danger' : 'muted'}
              />
            </Panel>
          </div>
        </div>

        <div className="min-w-0 lg:flex-1">
          <div className="mt-7 lg:mt-0">
            <SectionHead
              label={`Today · ${sessions.length} ${sessions.length === 1 ? 'class' : 'classes'}`}
              action={
                unmarked.length > 0 ? (
                  <button
                    type="button"
                    onClick={markRest}
                    className="font-mono text-[0.65rem] tracking-[0.1em] text-accent uppercase active:opacity-60"
                  >
                    +All present
                  </button>
                ) : sessions.length > 0 ? (
                  <span className="label text-accent">Complete</span>
                ) : null
              }
            />

            {sessions.length === 0 ? (
              <div className="mt-4">
                <Empty
                  icon={<CalendarCheck size={18} strokeWidth={1.8} />}
                  title={active.length === 0 ? 'No subjects yet' : 'Nothing scheduled'}
                  text={
                    active.length === 0
                      ? 'Add your subjects and the days they meet to start tracking.'
                      : 'A clear day. Anything unexpected can be added from the calendar.'
                  }
                  action={
                    active.length === 0 ? (
                      <Link to="/subjects" className="btn-primary">
                        Add a subject
                      </Link>
                    ) : null
                  }
                />
              </div>
            ) : (
              <div>
                {sessions.map((slot) => {
                  const record = marked.get(`${slot.subject.id}|${slot.sessionIndex}`)
                  return (
                    <DataRow key={`${slot.subject.id}-${slot.sessionIndex}`}>
                      <span
                        aria-hidden
                        className="h-7 w-[2px] shrink-0 rounded-full"
                        style={{ backgroundColor: slot.subject.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[0.82rem] tracking-[0.02em] text-ink uppercase">
                          {slot.subject.code || slot.subject.name}
                        </p>
                        <p className="mt-1 truncate font-mono text-[0.6rem] tracking-[0.08em] text-ink-faint uppercase">
                          {SUBJECT_TYPE_LABELS[slot.subject.subjectType]}
                          {slot.sessionIndex > 1 ? ` · S${slot.sessionIndex}` : ''}
                          <MarginNote stats={statsFor.get(slot.subject.id)} />
                        </p>
                      </div>
                      <StatusControl
                        compact
                        layoutId={`${slot.subject.id}-${slot.sessionIndex}`}
                        value={record?.status}
                        label={`${slot.subject.name} attendance`}
                        onChange={(status) =>
                          void setRecords([
                            {
                              subjectId: slot.subject.id,
                              recordDate: date,
                              sessionIndex: slot.sessionIndex,
                              status,
                            },
                          ])
                        }
                      />
                    </DataRow>
                  )
                })}
              </div>
            )}
          </div>

          {below.length > 0 ? (
            <div className="mt-7">
              <SectionHead label="Needs attention" />
              {below.map(({ item: subject, stats }) => (
                <Link key={subject.id} to={`/subjects/${subject.id}`} className="block">
                  <DataRow className="hover-row md:px-2">
                    <span
                      aria-hidden
                      className="h-7 w-[2px] shrink-0 rounded-full"
                      style={{ backgroundColor: subject.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[0.82rem] text-ink uppercase">
                        {subject.code || subject.name}
                      </p>
                      <p className="mt-1 font-mono text-[0.6rem] tracking-[0.08em] text-danger uppercase">
                        {stats.comeback === null
                          ? `${subject.targetPercentage}% unreachable`
                          : `Attend next ${stats.comeback}`}
                      </p>
                    </div>
                    <span className="readout text-[1.05rem] text-danger">{stats.percentage}%</span>
                    <ChevronRight size={15} className="shrink-0 text-ink-faint" />
                  </DataRow>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}

/** The gauge readout for the subject that decides whether someone is safe. */
function LowestSubject({
  label,
  stats,
  target
}: {
  label: string
  stats: AttendanceStats | null
  target: number
}) {
  const percentage = stats?.percentage ?? null
  const zone = safetyZone(percentage, target)

  return (
    <div className="flex items-center gap-4">
      <Gauge percentage={percentage} zone={zone} />
      <div className="min-w-0 flex-1">
        <p className="label truncate">{label}</p>
        <p className="readout mt-2 text-[1.75rem]">
          {percentage ?? '––'}
          <span className="text-[0.5em] text-ink-faint">%</span>
        </p>
        <div className="mt-3">
          <Meter percentage={percentage} target={target} zone={zone} />
        </div>
        <p className="mt-2.5 truncate font-mono text-[0.62rem] tracking-[0.08em] text-ink-faint uppercase">
          {stats ? `${stats.present}/${stats.total} · target ${target}%` : 'No classes yet'}
        </p>
      </div>
    </div>
  )
}

/**
 * The subject's own margin, beside each of today's classes: the figure that
 * actually answers "can I skip this one".
 */
function MarginNote({ stats }: { stats: AttendanceStats | undefined }) {
  if (!stats || stats.total === 0) return null

  if (stats.bunkable !== null) {
    return (
      <span className={stats.bunkable > 0 ? 'text-accent' : undefined}>
        {` · ${stats.bunkable} spare`}
      </span>
    )
  }

  return (
    <span className="text-danger">
      {stats.comeback === null ? ' · unreachable' : ` · attend next ${stats.comeback}`}
    </span>
  )
}
