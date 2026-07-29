import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ChevronRight, Layers, Plus } from 'lucide-react'
import { MiniMeter } from '../components/AttendanceMeter'
import { Empty } from '../components/Empty'
import { PageHeader, Shell } from '../components/Shell'
import { Sheet } from '../components/Sheet'
import { SubjectForm, type SubjectDraft } from '../components/SubjectForm'
import { attendanceStats, safetyZone } from '../lib/attendanceMath'
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

  const create = async (draft: SubjectDraft) => {
    await addSubject(draft)
    setAdding(false)
  }

  return (
    <Shell>
      <PageHeader
        eyebrow="Your semester"
        title="Subjects"
        action={
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add a subject"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-canvas
                       transition-transform active:scale-95"
          >
            <Plus size={19} strokeWidth={2.4} />
          </button>
        }
      />

      {archivedCount > 0 ? (
        <div role="tablist" aria-label="Subject filter" className="mb-4 flex rounded-xl border border-line bg-canvas p-1">
          {(
            [
              [false, `Active (${subjects.length - archivedCount})`],
              [true, `Archived (${archivedCount})`]
            ] as const
          ).map(([key, label]) => (
            <button
              key={String(key)}
              role="tab"
              type="button"
              aria-selected={showArchived === key}
              onClick={() => setShowArchived(key)}
              className={
                showArchived === key
                  ? 'flex-1 rounded-lg bg-surface py-2 text-[0.8rem] font-semibold shadow-sm'
                  : 'flex-1 rounded-lg py-2 text-[0.8rem] font-semibold text-ink-muted hover:text-ink'
              }
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <Empty
          icon={showArchived ? <Archive size={20} strokeWidth={1.8} /> : <Layers size={20} strokeWidth={1.8} />}
          title={showArchived ? 'Nothing archived' : 'No subjects yet'}
          text={
            showArchived
              ? 'Subjects you archive keep their history and stop counting toward your overall percentage.'
              : 'Add each subject once, with the days it meets. Everything else follows from that.'
          }
          action={
            showArchived ? null : (
              <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
                Add your first subject
              </button>
            )
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((subject) => (
            <SubjectRow
              key={subject.id}
              subject={subject}
              records={records.filter((record) => record.subjectId === subject.id)}
            />
          ))}
        </ul>
      )}

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="New subject"
        description="You can change any of this later."
      >
        <SubjectForm
          submitLabel="Add subject"
          defaultTarget={profile?.defaultTargetPercentage ?? 75}
          existingNames={subjects.map((subject) => subject.name)}
          onSubmit={create}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </Shell>
  )
}

function SubjectRow({ subject, records }: { subject: Subject; records: AttendanceRecord[] }) {
  const stats = attendanceStats(records, subject.targetPercentage)
  const zone = safetyZone(stats.percentage, subject.targetPercentage)
  const perWeek = weeklyLoad(subject)

  return (
    <li>
      <Link
        to={`/subjects/${subject.id}`}
        className="card block px-4 py-3.5 transition-colors hover:border-line-strong"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-9 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: subject.color }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.92rem] leading-snug font-medium">{subject.name}</p>
            <p className="mt-1 truncate text-[0.72rem] text-ink-muted">
              {subject.code ? `${subject.code} · ` : ''}
              {SUBJECT_TYPE_LABELS[subject.subjectType]}
              {perWeek > 0 ? ` · ${perWeek}/week` : ' · no days set'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[1.15rem] leading-none font-semibold tracking-tight tabular">
              {stats.percentage === null ? '—' : `${stats.percentage}%`}
            </p>
            <p className="mt-1 text-[0.7rem] text-ink-faint">
              {stats.total === 0 ? 'no classes' : `${stats.present}/${stats.total}`}
            </p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-ink-faint" />
        </div>

        <div className="mt-3.5 pl-4">
          <MiniMeter
            percentage={stats.percentage}
            target={subject.targetPercentage}
            zone={zone}
          />
        </div>
      </Link>
    </li>
  )
}
