import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Archive, ArchiveRestore, ChevronLeft, History, Pencil, Trash2 } from 'lucide-react'
import { AttendanceMeter } from '../components/AttendanceMeter'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Empty } from '../components/Empty'
import { Shell } from '../components/Shell'
import { Sheet } from '../components/Sheet'
import { StatusControl } from '../components/StatusControl'
import { SubjectForm, type SubjectDraft } from '../components/SubjectForm'
import { AuthLoading } from './Auth'
import { attendanceStats, safetyZone } from '../lib/attendanceMath'
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

  // Redirecting before the first load resolves would bounce a returning user
  // away from a subject that does exist.
  if (!hydrated) return <AuthLoading />
  if (!subject) return <Navigate to="/subjects" replace />

  const stats = attendanceStats(subjectRecords, subject.targetPercentage)
  const zone = safetyZone(stats.percentage, subject.targetPercentage)
  const perWeek = weeklyLoad(subject)

  const headline =
    stats.percentage === null
      ? '—'
      : stats.bunkable !== null
        ? String(stats.bunkable)
        : stats.comeback !== null
          ? String(stats.comeback)
          : '—'

  const explanation =
    stats.percentage === null
      ? 'Mark a class to see how much room you have.'
      : stats.bunkable !== null
        ? stats.bunkable === 0
          ? `You are exactly on target. Missing even one more class drops you below ${subject.targetPercentage}%.`
          : `You can miss ${stats.bunkable} more ${stats.bunkable === 1 ? 'class' : 'classes'} and stay at or above ${subject.targetPercentage}%.`
        : stats.comeback !== null
          ? `Attend the next ${stats.comeback} ${stats.comeback === 1 ? 'class' : 'classes'} in a row to reach ${subject.targetPercentage}%.`
          : `A ${subject.targetPercentage}% target cannot be recovered once a class has been missed.`

  const caption =
    stats.percentage === null
      ? 'No classes yet'
      : stats.bunkable !== null
        ? stats.bunkable === 1
          ? 'class you can miss'
          : 'classes you can miss'
        : stats.comeback !== null
          ? stats.comeback === 1
            ? 'class to attend'
            : 'classes to attend'
          : 'out of reach'

  const save = async (draft: SubjectDraft) => {
    await updateSubject(subject.id, draft)
    setEditing(false)
  }

  return (
    <Shell>
      <Link
        to="/subjects"
        className="-ml-1.5 mb-4 inline-flex items-center gap-1 text-[0.8rem] font-semibold text-ink-muted hover:text-ink"
      >
        <ChevronLeft size={16} strokeWidth={2.2} />
        Subjects
      </Link>

      <header className="mb-7 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: subject.color }}
            />
            <p className="eyebrow truncate">
              {subject.code ? `${subject.code} · ` : ''}
              {SUBJECT_TYPE_LABELS[subject.subjectType]}
            </p>
          </div>
          <h1 className="mt-2 text-[1.6rem] leading-tight font-semibold tracking-[-0.03em]">
            {subject.name}
          </h1>
          <p className="mt-1.5 text-[0.78rem] text-ink-muted">
            {perWeek > 0
              ? `${subject.schedule.map((item) => WEEKDAY_LABELS[item.weekday]).join(', ')} · ${perWeek} a week`
              : 'No timetable set'}
            {subject.isArchived ? ' · Archived' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${subject.name}`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line
                     text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <Pencil size={16} strokeWidth={2} />
        </button>
      </header>

      <section className="card px-5 py-6">
        <p className="eyebrow">Your margin</p>
        <div className="mt-3 mb-1 flex items-baseline gap-3">
          <span className="text-[3.75rem] leading-[0.85] font-semibold tracking-[-0.055em] tabular">
            {headline}
          </span>
          <span className="text-[0.8rem] font-medium text-ink-muted">{caption}</span>
        </div>
        <p className="mt-4 text-[0.84rem] leading-relaxed text-ink-muted">{explanation}</p>

        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-4 flex items-baseline justify-between">
            <span className="text-[1.1rem] font-semibold tracking-tight tabular">
              {stats.percentage === null ? '—' : `${stats.percentage}%`}
            </span>
            <span className="text-[0.75rem] text-ink-muted">
              {stats.present}/{stats.total} counted
            </span>
          </div>
          <AttendanceMeter
            percentage={stats.percentage}
            target={subject.targetPercentage}
            zone={zone}
          />
        </div>

        <dl className="mt-5 grid grid-cols-4 gap-2 border-t border-line pt-5">
          {(
            [
              ['present', stats.present],
              ['absent', stats.absent],
              ['cancelled', stats.cancelled],
              ['holiday', stats.holiday]
            ] as const
          ).map(([status, count]) => (
            <div key={status}>
              <dt className="text-[0.68rem] tracking-wide text-ink-muted">
                {STATUS_LABELS[status as AttendanceStatus]}
              </dt>
              <dd className="mt-0.5 text-[1.05rem] font-semibold tabular">{count}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-9">
        <h2 className="mb-3.5 text-[1.05rem] font-semibold tracking-tight">History</h2>

        {subjectRecords.length === 0 ? (
          <Empty
            icon={<History size={20} strokeWidth={1.8} />}
            title="Nothing recorded"
            text="Every class you mark shows up here, newest first, and stays editable."
          />
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
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
          </ul>
        )}
      </section>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit subject">
        <SubjectForm
          initial={subject}
          submitLabel="Save changes"
          existingNames={subjects.map((item) => item.name)}
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />

        <div className="mt-7 space-y-2.5 border-t border-line pt-6">
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
                <ArchiveRestore size={15} /> Restore to active
              </>
            ) : (
              <>
                <Archive size={15} /> Archive subject
              </>
            )}
          </button>
          <p className="px-1 text-[0.74rem] leading-relaxed text-ink-muted">
            Archiving keeps the history but removes the subject from your daily check-in and overall
            percentage.
          </p>

          <button
            type="button"
            className="btn-danger mt-4 w-full"
            onClick={() => {
              setEditing(false)
              setConfirmDelete(true)
            }}
          >
            <Trash2 size={15} /> Delete permanently
          </button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        destructive
        title={`Delete ${subject.name}?`}
        description={`This removes the subject and all ${stats.recorded} of its attendance ${
          stats.recorded === 1 ? 'record' : 'records'
        }. This cannot be undone — archiving is the reversible option.`}
        confirmLabel="Delete forever"
        requirePhrase="DELETE"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteSubject(subject.id)
          navigate('/subjects', { replace: true })
        }}
      />
    </Shell>
  )
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

  const DOT: Record<AttendanceStatus, string> = {
    present: 'bg-positive',
    absent: 'bg-critical',
    cancelled: 'bg-ink-faint',
    holiday: 'bg-ink-faint'
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-canvas"
      >
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[record.status]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.86rem] font-medium">
            {format(keyToDate(record.recordDate), 'EEE, d MMM yyyy')}
          </p>
          <p className="mt-0.5 text-[0.72rem] text-ink-muted">
            {STATUS_LABELS[record.status]}
            {record.sessionIndex > 1 ? ` · Session ${record.sessionIndex}` : ''}
          </p>
        </div>
        <span className="text-[0.72rem] font-semibold text-ink-faint">{open ? 'Done' : 'Edit'}</span>
      </button>

      {open ? (
        <div className="flex items-center gap-2 px-4 pb-4">
          <div className="flex-1">
            <StatusControl
              value={record.status}
              onChange={onChange}
              label={`Status for ${record.recordDate}`}
            />
          </div>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete the record for ${record.recordDate}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line
                       text-critical transition-colors hover:bg-critical-wash"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : null}
    </li>
  )
}
