import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Trash2 } from 'lucide-react'
import { SubjectForm, type SubjectDraft } from '../components/SubjectForm'
import { AuthLoading } from './Auth'
import { cn } from '../lib/cn'
import { weeklyLoad } from '../lib/schedule'
import { useStore } from '../lib/store'
import {
  BRANCHES,
  MAX_SEMESTER,
  MAX_TARGET,
  MIN_SEMESTER,
  MIN_TARGET,
  WEEKDAY_LABELS,
  type Subject
} from '../types'

export function Onboarding() {
  const navigate = useNavigate()
  const { profile, userId, cloud, hydrated, isDemo, saveProfile, addSubject } = useStore()

  const [step, setStep] = useState(1)
  const [branch, setBranch] = useState(profile?.branch ?? BRANCHES[0])
  const [semester, setSemester] = useState(String(profile?.semester ?? 1))
  const [target, setTarget] = useState(String(profile?.defaultTargetPercentage ?? 75))
  const [drafts, setDrafts] = useState<SubjectDraft[]>([])
  const [busy, setBusy] = useState(false)

  if (!hydrated) return <AuthLoading />
  // Setup writes to an account, so it needs one. This route used to be open,
  // which let people build a timetable that was never saved anywhere.
  if (cloud && !userId && !isDemo) return <Navigate to="/auth" replace />

  const parsedSemester = Number(semester)
  const parsedTarget = Number(target)
  const detailsValid =
    Number.isFinite(parsedSemester) &&
    parsedSemester >= MIN_SEMESTER &&
    parsedSemester <= MAX_SEMESTER &&
    Number.isFinite(parsedTarget) &&
    parsedTarget >= MIN_TARGET &&
    parsedTarget <= MAX_TARGET

  const finish = async () => {
    if (busy) return
    setBusy(true)
    try {
      await saveProfile({
        branch,
        semester: parsedSemester,
        defaultTargetPercentage: parsedTarget,
        onboarded: true
      })
      // Sequential so each subject's schedule lands with it, and so a failure
      // part-way through does not leave a half-written timetable.
      for (const draft of drafts) await addSubject(draft)
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col px-5 py-8">
      <div className="mb-8">
        <div className="mb-5 flex items-center justify-between">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-[0.85rem] font-bold text-canvas">
            P
          </span>
          <span className="text-[0.75rem] font-medium text-ink-muted">Step {step} of 2</span>
        </div>
        <div className="h-0.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-500"
            style={{ width: `${step * 50}%` }}
          />
        </div>
      </div>

      {step === 1 ? (
        <section>
          <h1 className="text-[1.7rem] leading-tight font-semibold tracking-[-0.035em]">
            A little about your term
          </h1>
          <p className="mt-2.5 text-[0.9rem] leading-relaxed text-ink-muted">
            Only used to set sensible defaults. You can change all of it later.
          </p>

          <div className="mt-7 space-y-5">
            <div>
              <label className="field-label" htmlFor="onboard-branch">
                Branch
              </label>
              <select
                id="onboard-branch"
                className="field"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
              >
                {BRANCHES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="onboard-semester">
                  Semester
                </label>
                <input
                  id="onboard-semester"
                  className="field"
                  type="number"
                  inputMode="numeric"
                  min={MIN_SEMESTER}
                  max={MAX_SEMESTER}
                  value={semester}
                  onChange={(event) => setSemester(event.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="onboard-target">
                  Target
                </label>
                <input
                  id="onboard-target"
                  className="field"
                  type="number"
                  inputMode="numeric"
                  min={MIN_TARGET}
                  max={MAX_TARGET}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                />
              </div>
            </div>

            {!detailsValid ? (
              <p role="alert" className="text-[0.78rem] text-critical">
                Semester must be {MIN_SEMESTER}–{MAX_SEMESTER} and target {MIN_TARGET}–{MAX_TARGET}.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            className="btn-primary mt-8 w-full"
            disabled={!detailsValid}
            onClick={() => setStep(2)}
          >
            Continue
            <ArrowRight size={16} strokeWidth={2.2} />
          </button>
        </section>
      ) : (
        <section>
          <h1 className="text-[1.7rem] leading-tight font-semibold tracking-[-0.035em]">
            Add your subjects
          </h1>
          <p className="mt-2.5 text-[0.9rem] leading-relaxed text-ink-muted">
            Pick the days each one meets. This is what fills your daily check-in.
          </p>

          {drafts.length > 0 ? (
            <ul className="mt-6 divide-y divide-line rounded-card border border-line">
              {drafts.map((draft, index) => (
                <li key={`${draft.name}-${index}`} className="flex items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className="h-7 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: draft.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.86rem] font-medium">{draft.name}</p>
                    <p className="mt-0.5 text-[0.7rem] text-ink-muted">
                      {draft.schedule.length > 0
                        ? `${draft.schedule.map((item) => WEEKDAY_LABELS[item.weekday]).join(', ')} · ${weeklyLoad(draft as Subject)} a week`
                        : 'No days set'}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${draft.name}`}
                    onClick={() => setDrafts((list) => list.filter((_, position) => position !== index))}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-canvas hover:text-critical"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className={cn('rounded-card border border-line p-4', drafts.length > 0 ? 'mt-4' : 'mt-6')}>
            <SubjectForm
              key={drafts.length}
              submitLabel="Add to list"
              defaultTarget={parsedTarget}
              existingNames={drafts.map((draft) => draft.name)}
              onSubmit={(draft) => setDrafts((list) => [...list, draft])}
            />
          </div>

          <div className="mt-7 space-y-2.5">
            <button
              type="button"
              className="btn-primary w-full"
              disabled={busy}
              onClick={() => void finish()}
            >
              {busy ? (
                'Setting up…'
              ) : drafts.length > 0 ? (
                <>
                  <Check size={16} strokeWidth={2.4} />
                  Finish with {drafts.length} {drafts.length === 1 ? 'subject' : 'subjects'}
                </>
              ) : (
                'Skip for now'
              )}
            </button>
            <button type="button" className="btn-ghost mx-auto block" onClick={() => setStep(1)}>
              Back
            </button>
          </div>
        </section>
      )}
    </main>
  )
}
