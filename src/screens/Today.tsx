import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import { Empty } from '../components/Empty'
import { Gauge, Meter } from '../components/Gauge'
import { DataRow, Panel, Readout, SectionHead } from '../components/Panel'
import { ScreenHead } from '../components/Shell'
import { StatusControl } from '../components/StatusControl'
import { attendanceStats, safetyZone } from '../lib/attendanceMath'
import { formatDayMonth, formatWeekday, keyToDate } from '../lib/date'
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
    const ids = new Set(active.map((subject) => subject.id))
    return attendanceStats(records.filter((record) => ids.has(record.subjectId)), target)
  }, [active, records, target])

  const sessions = useMemo(() => sessionsForDate(active, records, date), [active, records, date])

  const marked = useMemo(() => {
    const map = new Map<string, AttendanceRecord>()
    for (const record of records) {
      if (record.recordDate === date) map.set(`${record.subjectId}|${record.sessionIndex}`, record)
    }
    return map
  }, [records, date])

  const unmarked = sessions.filter((slot) => !marked.has(`${slot.subject.id}|${slot.sessionIndex}`))

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

  // Total spare classes across everything still on target — the one number
  // that answers "can I skip today".
  const spare = useMemo(
    () =>
      active.reduce((total, subject) => {
        const stats = attendanceStats(
          records.filter((record) => record.subjectId === subject.id),
          subject.targetPercentage
        )
        return total + (stats.bunkable ?? 0)
      }, 0),
    [active, records]
  )

  const zone = safetyZone(overall.percentage, target)

  const markRest = () =>
    void setRecords(
      unmarked.map((slot) => ({
        subjectId: slot.subject.id,
        recordDate: date,
        sessionIndex: slot.sessionIndex,
        status: 'present' as const
      }))
    )

  return (
    <>
      <ScreenHead label={formatWeekday(keyToDate(date))} title={formatDayMonth(keyToDate(date))} />

      {/* Overall standing, as the pill readout from the reference panel. */}
      <Panel className="flex items-center gap-4 px-5 py-4">
        <Gauge percentage={overall.percentage} zone={zone} />
        <div className="min-w-0 flex-1">
          <p className="label">Overall</p>
          <p className="readout mt-2 text-[1.75rem]">
            {overall.percentage === null ? '––' : overall.percentage}
            <span className="text-[0.5em] text-ink-faint">%</span>
          </p>
          <div className="mt-3">
            <Meter percentage={overall.percentage} target={target} zone={zone} />
          </div>
          <p className="mt-2.5 font-mono text-[0.62rem] tracking-[0.08em] text-ink-faint uppercase">
            {overall.total === 0 ? 'No classes yet' : `${overall.present}/${overall.total} · target ${target}%`}
          </p>
        </div>
      </Panel>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Panel className="px-5 py-4">
          <Readout
            label="Can miss"
            value={String(spare)}
            suffix={spare === 1 ? 'class' : 'classes'}
            tone={spare === 0 ? 'muted' : 'accent'}
          />
        </Panel>
        <Panel className="px-5 py-4">
          <Readout
            label="Below target"
            value={String(atRisk.length)}
            suffix={atRisk.length === 1 ? 'subject' : 'subjects'}
            tone={atRisk.length > 0 ? 'danger' : 'muted'}
          />
        </Panel>
      </div>

      <div className="mt-7">
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
                          status
                        }
                      ])
                    }
                  />
                </DataRow>
              )
            })}
          </div>
        )}
      </div>

      {atRisk.length > 0 ? (
        <div className="mt-7">
          <SectionHead label="Needs attention" />
          {atRisk.map(({ subject, stats }) => (
            <Link key={subject.id} to={`/subjects/${subject.id}`} className="block">
              <DataRow>
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
    </>
  )
}
