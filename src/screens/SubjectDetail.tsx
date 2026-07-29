import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Archive, ArchiveRestore, ChevronLeft, History, Pencil, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Empty } from '../components/Empty'
import { Meter } from '../components/Gauge'
import { DataRow, Panel, Readout, SectionHead } from '../components/Panel'
import { Sheet } from '../components/Sheet'
import { StatusControl } from '../components/StatusControl'
import { Booting } from '../components/Booting'
import { SubjectForm, type SubjectDraft } from '../components/SubjectForm'
import { attendanceStats, safetyZone } from '../lib/attendanceMath'
import { cn } from '../lib/cn'
import { keyToDate } from '../lib/date'
import { weeklyLoad } from '../lib/schedule'
import { useStore } from '../lib/store'
import {
  STATUS_LABELS,
  SUBJECT_TYPE_LABELS,
  WEEKDAY_LABELS,
  type AttendanceRecord,
  type AttendanceStatus
} from '../types'

export function SubjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { subjects, records, hydrated, updateSubject, deleteSubject, setRecords, removeRecord } =
    useStore()

  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const subject = subjects.find((item) => item.id === id)

  const subjectRecords = useMemo(
    () =>
      records
        .filter((record) => record.subjectId === id)
        .sort((a, b) =>
          a.recordDate === b.recordDate
            ? a.sessionIndex - b.sessionIndex
            : b.recordDate.localeCompare(a.recordDate)
        ),
    [id, records]
  )

  // Deciding before the first fetch lands would bounce a returning user away
  // from a subject that does exist.
  if (!hydrated) return <Booting />
  if (!subject) return <Navigate to="/subjects" replace />

  const stats = attendanceStats(subjectRecords, subject.targetPercentage)
  const zone = safetyZone(stats.percentage, subject.targetPercentage)
  const perWeek = weeklyLoad(subject)

  const margin =
    stats.percentage === null
      ? { value: '––', caption: 'no data', tone: 'muted' as const }
      : stats.bunkable !== null
        ? {
            value: String(stats.bunkable),
            caption: stats.bunkable === 1 ? 'class spare' : 'classes spare',
            tone: (stats.bunkable === 0 ? 'default' : 'accent') as 'default' | 'accent'
          }
        : stats.comeback !== null
          ? {
              value: String(stats.comeback),
              caption: stats.comeback === 1 ? 'class needed' : 'classes needed',
              tone: 'danger' as const
            }
          : { value: '––', caption: 'unreachable', tone: 'danger' as const }

  const explanation =
    stats.percentage === null
      ? 'Mark a class to see how much room you have.'
      : stats.bunkable !== null
        ? stats.bunkable === 0
          ? `Exactly on target. One more absence drops you below ${subject.targetPercentage}%.`
          : `You can miss ${stats.bunkable} more ${stats.bunkable === 1 ? 'class' : 'classes'} and stay at or above ${subject.targetPercentage}%.`
        : stats.comeback !== null
          ? `Attend the next ${stats.comeback} ${stats.comeback === 1 ? 'class' : 'classes'} in a row to reach ${subject.targetPercentage}%.`
          : `A ${subject.targetPercentage}% target cannot be recovered once a class has been missed.`

  return (
    <>
      <Link
        to="/subjects"
        className="mb-5 inline-flex items-center gap-1.5 font-mono text-[0.65rem] tracking-[0.1em] text-ink-muted uppercase active:opacity-60"
      >
        <ChevronLeft size={14} strokeWidth={2.2} />
        Subjects
      </Link>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: subject.color }}
            />
            <p className="label truncate">
              {subject.code ? `${subject.code} · ` : ''}
              {SUBJECT_TYPE_LABELS[subject.subjectType]}
              {subject.isArchived ? ' · Archived' : ''}
            </p>
          </div>
          <h1 className="mt-2.5 text-[1.4rem] leading-tight tracking-[-0.01em]">{subject.name}</h1>
          <p className="mt-2 font-mono text-[0.6rem] tracking-[0.08em] text-ink-faint uppercase">
            {perWeek > 0
              ? `${subject.schedule.map((item) => WEEKDAY_LABELS[item.weekday]).join(' ')} · ${perWeek}/wk`
              : 'No timetable set'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${subject.name}`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-ink-muted active:opacity-60"
        >
          <Pencil size={15} strokeWidth={2} />
        </button>
      </header>

      <Panel className="px-5 py-5">
        <Readout label="Margin" value={margin.value} suffix={margin.caption} tone={margin.tone} size="xl" />
        <p className="mt-4 text-[0.82rem] leading-relaxed text-ink-muted">{explanation}</p>

        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className={cn('readout text-[1.1rem]', zone === 'danger' && 'text-danger', zone === 'safe' && 'text-accent')}>
              {stats.percentage === null ? '––' : stats.percentage}
              <span className="text-[0.55em] text-ink-faint">%</span>
            </span>
            <span className="font-mono text-[0.62rem] tracking-[0.08em] text-ink-faint uppercase">
              {stats.present}/{stats.total} · target {subject.targetPercentage}%
            </span>
          </div>
          <Meter percentage={stats.percentage} target={subject.targetPercentage} zone={zone} />
        </div>

        <dl className="mt-5 grid grid-cols-4 gap-3 border-t border-line pt-4">
          {(
            [
              ['present', stats.present],
              ['absent', stats.absent],
              ['cancelled', stats.cancelled],
              ['holiday', stats.holiday]
            ] as const
          ).map(([status, count]) => (
            <div key={status}>
              <dt className="label">{STATUS_LABELS[status as AttendanceStatus].slice(0, 4)}</dt>
              <dd className="readout mt-2 text-[1.1rem]">{count}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="mt-7">
        <SectionHead label={`History · ${subjectRecords.length}`} />

        {subjectRecords.length === 0 ? (
          <div className="mt-4">
            <Empty
              icon={<History size={18} strokeWidth={1.8} />}
              title="Nothing recorded"
              text="Every class you mark appears here, newest first, and stays editable."
            />
          </div>
        ) : (
          <div>
            {subjectRecords.map((record) => (
              <HistoryRow
                key={record.id}
                record={record}
                onChange={(status) =>
                  void setRecords([
                    {
                      subjectId: record.subjectId,
                      recordDate: record.recordDate,
                      sessionIndex: record.sessionIndex,
                      status
                    }
                  ])
                }
                onDelete={() => void removeRecord(record.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit subject">
        <SubjectForm
          initial={subject}
          submitLabel="Save changes"
          existingNames={subjects.map((item) => item.name)}
          onSubmit={async (draft: SubjectDraft) => {
            await updateSubject(subject.id, draft)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />

        <div className="mt-7 space-y-3 border-t border-line pt-6">
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => {
              void updateSubject(subject.id, { isArchived: !subject.isArchived })
              setEditing(false)
            }}
          >
            {subject.isArchived ? (
              <>
                <ArchiveRestore size={14} /> Restore
              </>
            ) : (
              <>
                <Archive size={14} /> Archive
              </>
            )}
          </button>
          <p className="text-[0.72rem] leading-relaxed text-ink-faint">
            Archiving keeps the history but removes the subject from your daily check-in and overall
            percentage.
          </p>

          <button
            type="button"
            className="btn-danger w-full"
            onClick={() => {
              setEditing(false)
              setConfirmDelete(true)
            }}
          >
            <Trash2 size={14} /> Delete permanently
          </button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        destructive
        title={`Delete ${subject.name}?`}
        description={`This removes the subject and all ${stats.recorded} of its attendance ${
          stats.recorded === 1 ? 'record' : 'records'
        }. It cannot be undone — archiving is the reversible option.`}
        confirmLabel="Delete forever"
        requirePhrase="DELETE"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteSubject(subject.id)
          navigate('/subjects', { replace: true })
        }}
      />
    </>
  )
}

const DOT: Record<AttendanceStatus, string> = {
  present: 'bg-accent',
  absent: 'bg-danger',
  cancelled: 'bg-ink-faint',
  holiday: 'bg-ink-faint'
}

function HistoryRow({
  record,
  onChange,
  onDelete
}: {
  record: AttendanceRecord
  onChange: (status: AttendanceStatus) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-3.5 text-left active:opacity-60"
      >
        <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[record.status])} />
        <span className="min-w-0 flex-1 font-mono text-[0.78rem] text-ink tabular-nums">
          {format(keyToDate(record.recordDate), 'dd MMM yyyy')}
        </span>
        <span className="label">
          {STATUS_LABELS[record.status]}
          {record.sessionIndex > 1 ? ` S${record.sessionIndex}` : ''}
        </span>
      </button>

      {open ? (
        <div className="flex items-center gap-2 pb-4">
          <div className="min-w-0 flex-1">
            <StatusControl
              value={record.status}
              onChange={onChange}
              layoutId={record.id}
              label={`Status for ${record.recordDate}`}
            />
          </div>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete the record for ${record.recordDate}`}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-danger/40 text-danger active:opacity-60"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
