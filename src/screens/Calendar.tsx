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
import { Panel } from '../components/Panel'
import { ScreenHead } from '../components/Shell'
import { Sheet } from '../components/Sheet'
import { StatusControl } from '../components/StatusControl'
import { cn } from '../lib/cn'
import { dateKey, keyToDate } from '../lib/date'
import { sessionsForDate } from '../lib/schedule'
import { useStore } from '../lib/store'
import { useTodayKey } from '../lib/useTodayKey'
import { SUBJECT_TYPE_LABELS, WEEKDAY_LABELS, type AttendanceStatus } from '../types'

type DayMark = 'none' | 'present' | 'absent' | 'off'

export function Calendar() {
  const { subjects, records, setRecords } = useStore()
  const today = useTodayKey()

  const [month, setMonth] = useState(() => startOfMonth(keyToDate(today)))
  const [selected, setSelected] = useState<string | null>(null)

  const active = useMemo(() => subjects.filter((subject) => !subject.isArchived), [subjects])

  const grid = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
      }),
    [month]
  )

  /** One pass over records; filtering per day would rescan the set 42 times. */
  const marks = useMemo(() => {
    const byDate = new Map<string, AttendanceStatus[]>()
    for (const record of records) {
      const list = byDate.get(record.recordDate)
      if (list) list.push(record.status)
      else byDate.set(record.recordDate, [record.status])
    }

    const result = new Map<string, DayMark>()
    for (const [key, statuses] of byDate) {
      if (statuses.includes('absent')) result.set(key, 'absent')
      else if (statuses.includes('present')) result.set(key, 'present')
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

  const atCurrentMonth = isSameMonth(month, keyToDate(today))

  return (
    <>
      <ScreenHead
        label="Backfill"
        title="Calendar"
        action={
          atCurrentMonth ? null : (
            <button
              type="button"
              onClick={() => setMonth(startOfMonth(keyToDate(today)))}
              className="font-mono text-[0.65rem] tracking-[0.1em] text-accent uppercase active:opacity-60"
            >
              Today
            </button>
          )
        }
      />

      <Panel className="px-3 py-4">
        <div className="mb-4 flex items-center justify-between px-2">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth((value) => subMonths(value, 1))}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted active:opacity-60"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 aria-live="polite" className="readout text-[0.9rem] tracking-[0.04em] uppercase">
            {format(month, 'MMM yyyy')}
          </h2>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth((value) => addMonths(value, 1))}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted active:opacity-60"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7" role="presentation">
          {[1, 2, 3, 4, 5, 6, 0].map((weekday) => (
            <span
              key={weekday}
              className="pb-2 text-center font-mono text-[0.58rem] tracking-[0.08em] text-ink-faint uppercase"
            >
              {WEEKDAY_LABELS[weekday].slice(0, 1)}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7">
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
                  'relative grid aspect-square place-items-center font-mono text-[0.76rem] tabular-nums',
                  future ? 'text-ink-faint/30' : 'active:opacity-60',
                  outside && !future && 'text-ink-faint'
                )}
              >
                <span
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full',
                    isToday && 'bg-accent text-bg',
                    !isToday && !outside && !future && 'text-ink'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {mark !== 'none' && !isToday ? (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute bottom-1 h-1 w-1 rounded-full',
                      mark === 'absent' && 'bg-danger',
                      mark === 'present' && 'bg-accent',
                      mark === 'off' && 'bg-ink-faint'
                    )}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </Panel>

      <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2">
        {(
          [
            ['bg-accent', 'Attended'],
            ['bg-danger', 'Missed'],
            ['bg-ink-faint', 'Off']
          ] as const
        ).map(([color, text]) => (
          <li key={text} className="label flex items-center gap-1.5">
            <span aria-hidden className={cn('h-1 w-1 rounded-full', color)} />
            {text}
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
            icon={<CalendarOff size={18} strokeWidth={1.8} />}
            title="Nothing scheduled"
            text="No subject meets on this day, so there is nothing to record."
          />
        ) : (
          <>
            <div className="mb-6 flex gap-3">
              <button type="button" className="btn-secondary flex-1" onClick={() => markWholeDay('present')}>
                All present
              </button>
              <button type="button" className="btn-secondary flex-1" onClick={() => markWholeDay('holiday')}>
                Day off
              </button>
            </div>

            <div className="space-y-5">
              {selectedSessions.map((slot) => (
                <div key={`${slot.subject.id}-${slot.sessionIndex}`}>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slot.subject.color }}
                    />
                    <p className="min-w-0 flex-1 truncate text-[0.85rem]">{slot.subject.name}</p>
                    <span className="label shrink-0">
                      {slot.sessionIndex > 1
                        ? `S${slot.sessionIndex}`
                        : SUBJECT_TYPE_LABELS[slot.subject.subjectType]}
                    </span>
                  </div>

                  {slot.unscheduled ? (
                    <p className="mb-2 font-mono text-[0.6rem] tracking-[0.06em] text-ink-faint uppercase">
                      Recorded before the timetable changed
                    </p>
                  ) : null}

                  <StatusControl
                    value={selectedRecords.get(`${slot.subject.id}|${slot.sessionIndex}`)}
                    layoutId={`cal-${slot.subject.id}-${slot.sessionIndex}`}
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
                </div>
              ))}
            </div>
          </>
        )}
      </Sheet>
    </>
  )
}
