import { useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths
} from 'date-fns'
import { CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react'
import { Empty } from '../components/Empty'
import { PageHeader, Shell } from '../components/Shell'
import { Sheet } from '../components/Sheet'
import { StatusControl } from '../components/StatusControl'
import { cn } from '../lib/cn'
import { dateKey, keyToDate } from '../lib/date'
import { sessionsForDate } from '../lib/schedule'
import { useStore } from '../lib/store'
import { useTodayKey } from '../lib/useTodayKey'
import { SUBJECT_TYPE_LABELS, WEEKDAY_LABELS, type AttendanceStatus } from '../types'

type DayMark = 'none' | 'complete' | 'partial' | 'absent' | 'off'

export function Calendar() {
  const { subjects, records, setRecords } = useStore()
  const today = useTodayKey()

  const [month, setMonth] = useState(() => startOfMonth(keyToDate(today)))
  const [selected, setSelected] = useState<string | null>(null)

  const active = useMemo(() => subjects.filter((subject) => !subject.isArchived), [subjects])

  const grid = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 })
      }),
    [month]
  )

  /** One pass over records; a per-day filter would rescan the whole set 42 times. */
  const marks = useMemo(() => {
    const byDate = new Map<string, AttendanceStatus[]>()
    for (const record of records) {
      const list = byDate.get(record.recordDate)
      if (list) list.push(record.status)
      else byDate.set(record.recordDate, [record.status])
    }

    const result = new Map<string, DayMark>()
    for (const [key, statuses] of byDate) {
      if (statuses.some((status) => status === 'absent')) result.set(key, 'absent')
      else if (statuses.some((status) => status === 'present')) result.set(key, 'complete')
      else result.set(key, 'off')
    }
    return result
  }, [records])

  const selectedSessions = useMemo(
    () => (selected ? sessionsForDate(active, records, selected) : []),
    [active, records, selected]
  )

  const selectedRecords = useMemo(() => {
    const map = new Map<string, AttendanceStatus>()
    if (!selected) return map
    for (const record of records) {
      if (record.recordDate === selected) {
        map.set(`${record.subjectId}|${record.sessionIndex}`, record.status)
      }
    }
    return map
  }, [records, selected])

  const markWholeDay = (status: AttendanceStatus) => {
    if (!selected) return
    void setRecords(
      selectedSessions.map((slot) => ({
        subjectId: slot.subject.id,
        recordDate: selected,
        sessionIndex: slot.sessionIndex,
        status
      }))
    )
  }

  const monthLabel = format(month, 'MMMM yyyy')
  const atCurrentMonth = isSameMonth(month, keyToDate(today))

  return (
    <Shell>
      <PageHeader
        eyebrow="Fill in a missed day"
        title="Calendar"
        action={
          atCurrentMonth ? null : (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setMonth(startOfMonth(keyToDate(today)))}
            >
              Today
            </button>
          )
        }
      />

      <section className="card px-3 py-4">
        <div className="mb-4 flex items-center justify-between px-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth((value) => subMonths(value, 1))}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <ChevronLeft size={17} />
          </button>
          <h2 aria-live="polite" className="text-[0.95rem] font-semibold tracking-tight">
            {monthLabel}
          </h2>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth((value) => addMonths(value, 1))}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="grid grid-cols-7" role="presentation">
          {WEEKDAY_LABELS.map((day) => (
            <span key={day} className="pb-2 text-center text-[0.65rem] font-semibold text-ink-faint">
              {day.slice(0, 1)}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {grid.map((day) => {
            const key = dateKey(day)
            const outside = !isSameMonth(day, month)
            const future = key > today
            const isToday = key === today
            const mark = marks.get(key) ?? 'none'

            return (
              <button
                key={key}
                type="button"
                disabled={future}
                onClick={() => setSelected(key)}
                aria-label={`${format(day, 'EEEE d MMMM yyyy')}${
                  future ? ', in the future' : mark === 'none' ? ', nothing recorded' : ', has records'
                }`}
                aria-current={isToday ? 'date' : undefined}
                className={cn(
                  'relative grid aspect-square place-items-center rounded-xl text-[0.8rem] transition-colors',
                  future
                    ? 'cursor-not-allowed text-ink-faint/40'
                    : 'hover:bg-canvas active:scale-95',
                  outside && !future && 'text-ink-faint',
                  isToday && 'font-semibold'
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-7 place-items-center rounded-full',
                    isToday && 'bg-ink text-canvas'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {mark !== 'none' ? (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute bottom-1 h-1 w-1 rounded-full',
                      mark === 'absent' && 'bg-critical',
                      mark === 'complete' && 'bg-positive',
                      mark === 'off' && 'bg-ink-faint'
                    )}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </section>

      <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[0.7rem] text-ink-muted">
        {(
          [
            ['bg-positive', 'Attended'],
            ['bg-critical', 'Missed'],
            ['bg-ink-faint', 'Cancelled or holiday']
          ] as const
        ).map(([color, label]) => (
          <li key={label} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${color}`} />
            {label}
          </li>
        ))}
      </ul>

      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? format(keyToDate(selected), 'EEEE d MMMM') : ''}
        description={selected === today ? 'Today' : undefined}
      >
        {selectedSessions.length === 0 ? (
          <Empty
            icon={<CalendarOff size={20} strokeWidth={1.8} />}
            title="Nothing scheduled"
            text="No subject meets on this day, so there is nothing to record."
          />
        ) : (
          <>
            <div className="mb-5 flex gap-2.5">
              <button type="button" className="btn-secondary flex-1" onClick={() => markWholeDay('present')}>
                All present
              </button>
              <button type="button" className="btn-secondary flex-1" onClick={() => markWholeDay('holiday')}>
                Whole day off
              </button>
            </div>

            <ul className="space-y-4">
              {selectedSessions.map((slot) => (
                <li key={`${slot.subject.id}-${slot.sessionIndex}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: slot.subject.color }}
                    />
                    <p className="min-w-0 flex-1 truncate text-[0.86rem] font-medium">
                      {slot.subject.name}
                    </p>
                    <span className="shrink-0 text-[0.7rem] text-ink-muted">
                      {slot.sessionIndex > 1
                        ? `Session ${slot.sessionIndex}`
                        : SUBJECT_TYPE_LABELS[slot.subject.subjectType]}
                    </span>
                  </div>

                  {slot.unscheduled ? (
                    <p className="mb-2 text-[0.7rem] text-ink-faint">
                      Recorded before the timetable changed — still editable.
                    </p>
                  ) : null}

                  <StatusControl
                    value={selectedRecords.get(`${slot.subject.id}|${slot.sessionIndex}`)}
                    label={`${slot.subject.name} attendance`}
                    onChange={(status) =>
                      void setRecords([
                        {
                          subjectId: slot.subject.id,
                          recordDate: selected!,
                          sessionIndex: slot.sessionIndex,
                          status
                        }
                      ])
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>
    </Shell>
  )
}
