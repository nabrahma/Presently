import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Check, Trash2 } from 'lucide-react'
import { Booting } from '../components/Booting'
import { SubjectForm, type SubjectDraft } from '../components/SubjectForm'
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

  if (!hydrated) return <Booting />
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
      // Sequential so each subject's schedule lands with it, and a failure
      // part-way through does not leave a half-written timetable.
      for (const draft of drafts) await addSubject(draft)
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scroll-region h-full">
      <div
        className="mx-auto flex min-h-full w-full max-w-[28rem] flex-col px-6"
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))'
        }}
      >
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[0.9rem] tracking-[-0.02em]">Presently</span>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            </div>
            <span className="label">Step {step}/2</span>
          </div>
          <div className="h-px bg-line">
            <motion.div
              className="h-full bg-accent"
              initial={false}
              animate={{ width: `${step * 50}%` }}
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            />
          </div>
        </div>

        {step === 1 ? (
          <section>
            <h1 className="text-[1.6rem] leading-tight tracking-[-0.02em]">
              A little about your term
            </h1>
            <p className="mt-3 text-[0.86rem] leading-relaxed text-ink-muted">
              Used only to set sensible defaults. All of it can change later.
            </p>

            <div className="mt-8 space-y-5">
              <div>
                <label className="label mb-2.5 block" htmlFor="onboard-branch">
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
                  <label className="label mb-2.5 block" htmlFor="onboard-semester">
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
                  <label className="label mb-2.5 block" htmlFor="onboard-target">
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
                <p role="alert" className="text-[0.75rem] text-danger">
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
              <ArrowRight size={14} strokeWidth={2.2} />
            </button>
          </section>
        ) : (
          <section>
            <h1 className="text-[1.6rem] leading-tight tracking-[-0.02em]">Add your subjects</h1>
            <p className="mt-3 text-[0.86rem] leading-relaxed text-ink-muted">
              Pick the days each one meets. This is what fills your daily check-in.
            </p>

            {drafts.length > 0 ? (
              <div className="mt-6 rounded-panel border border-line px-4">
                {drafts.map((draft, index) => (
                  <div
                    key={`${draft.name}-${index}`}
                    className="flex items-center gap-3 border-b border-line py-3 last:border-b-0"
                  >
                    <span
                      aria-hidden
                      className="h-7 w-[2px] shrink-0 rounded-full"
                      style={{ backgroundColor: draft.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.85rem]">{draft.name}</p>
                      <p className="label mt-1.5">
                        {draft.schedule.length > 0
                          ? `${draft.schedule.map((item) => WEEKDAY_LABELS[item.weekday]).join(' ')} · ${weeklyLoad(draft as Subject)}/wk`
                          : 'No days set'}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${draft.name}`}
                      onClick={() => setDrafts((list) => list.filter((_, position) => position !== index))}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint active:opacity-60"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 rounded-panel border border-line p-5">
              <SubjectForm
                key={drafts.length}
                submitLabel="Add to list"
                defaultTarget={parsedTarget}
                existingNames={drafts.map((draft) => draft.name)}
                onSubmit={(draft) => setDrafts((list) => [...list, draft])}
              />
            </div>

            <div className="mt-7 space-y-3">
              <button
                type="button"
                className="btn-primary w-full"
                disabled={busy}
                onClick={() => void finish()}
              >
                {busy ? (
                  'Setting up'
                ) : drafts.length > 0 ? (
                  <>
                    <Check size={14} strokeWidth={2.4} />
                    Finish · {drafts.length}
                  </>
                ) : (
                  'Skip for now'
                )}
              </button>
              <button
                type="button"
                className="mx-auto block font-mono text-[0.65rem] tracking-[0.08em] text-ink-muted uppercase active:opacity-60"
                onClick={() => setStep(1)}
              >
                Back
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
