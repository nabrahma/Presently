import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ChevronRight, Layers, Plus } from 'lucide-react'
import { Empty } from '../components/Empty'
import { Meter } from '../components/Gauge'
import { DataRow } from '../components/Panel'
import { ScreenHead } from '../components/Shell'
import { Sheet } from '../components/Sheet'
import { SubjectForm, type SubjectDraft } from '../components/SubjectForm'
import { attendanceStats, safetyZone } from '../lib/attendanceMath'
import { cn } from '../lib/cn'
import { weeklyLoad } from '../lib/schedule'
import { useStore } from '../lib/store'
import { SUBJECT_TYPE_LABELS, type AttendanceRecord, type Subject } from '../types'

export function Subjects() {
  const { subjects, records, profile, addSubject } = useStore()
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const archivedCount = subjects.filter((subject) => subject.isArchived).length
  const visible = useMemo(
    () =>
      subjects
        .filter((subject) => (showArchived ? subject.isArchived : !subject.isArchived))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [showArchived, subjects]
  )

  return (
    <>
      <ScreenHead
        label={`${subjects.length - archivedCount} active`}
        title="Subjects"
        action={
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add a subject"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-bg active:opacity-80"
          >
            <Plus size={18} strokeWidth={2.4} />
          </button>
        }
      />

      {archivedCount > 0 ? (
        <div role="tablist" aria-label="Subject filter" className="mb-5 flex gap-2">
          {(
            [
              [false, 'Active'],
              [true, 'Archived']
            ] as const
          ).map(([key, label]) => (
            <button
              key={String(key)}
              role="tab"
              type="button"
              aria-selected={showArchived === key}
              onClick={() => setShowArchived(key)}
              className={cn(
                'rounded-full border px-4 py-2 font-mono text-[0.65rem] tracking-[0.1em] uppercase transition-colors',
                showArchived === key
                  ? 'border-accent bg-accent text-bg'
                  : 'border-line text-ink-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <Empty
          icon={showArchived ? <Archive size={18} strokeWidth={1.8} /> : <Layers size={18} strokeWidth={1.8} />}
          title={showArchived ? 'Nothing archived' : 'No subjects yet'}
          text={
            showArchived
              ? 'Archived subjects keep their history but stop counting toward your overall percentage.'
              : 'Add each subject once, with the days it meets. Everything else follows from that.'
          }
          action={
            showArchived ? null : (
              <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
                Add subject
              </button>
            )
          }
        />
      ) : (
        <div>
          {visible.map((subject) => (
            <SubjectRow
              key={subject.id}
              subject={subject}
              records={records.filter((record) => record.subjectId === subject.id)}
            />
          ))}
        </div>
      )}

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="New subject"
        description="All of this can be changed later."
      >
        <SubjectForm
          submitLabel="Add subject"
          defaultTarget={profile?.defaultTargetPercentage ?? 75}
          existingNames={subjects.map((subject) => subject.name)}
          onSubmit={async (draft: SubjectDraft) => {
            await addSubject(draft)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </>
  )
}

function SubjectRow({ subject, records }: { subject: Subject; records: AttendanceRecord[] }) {
  const stats = attendanceStats(records, subject.targetPercentage)
  const zone = safetyZone(stats.percentage, subject.targetPercentage)
  const perWeek = weeklyLoad(subject)

  return (
    <Link to={`/subjects/${subject.id}`} className="block">
      <DataRow className="py-4">
        <span
          aria-hidden
          className="h-9 w-[2px] shrink-0 rounded-full"
          style={{ backgroundColor: subject.color }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9rem] text-ink">{subject.name}</p>
          <p className="mt-1.5 truncate font-mono text-[0.6rem] tracking-[0.08em] text-ink-faint uppercase">
            {subject.code ? `${subject.code} · ` : ''}
            {SUBJECT_TYPE_LABELS[subject.subjectType]}
            {perWeek > 0 ? ` · ${perWeek}/wk` : ' · no days'}
          </p>
          <div className="mt-2.5 max-w-[9rem]">
            <Meter percentage={stats.percentage} target={subject.targetPercentage} zone={zone} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              'readout text-[1.15rem]',
              zone === 'danger' && 'text-danger',
              zone === 'safe' && 'text-accent'
            )}
          >
            {stats.percentage === null ? '––' : stats.percentage}
            <span className="text-[0.55em] text-ink-faint">%</span>
          </p>
          <p className="mt-1 font-mono text-[0.6rem] text-ink-faint tabular-nums">
            {stats.total === 0 ? '—' : `${stats.present}/${stats.total}`}
          </p>
        </div>
        <ChevronRight size={15} className="shrink-0 text-ink-faint" />
      </DataRow>
    </Link>
  )
}
