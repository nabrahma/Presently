import { useId, useMemo, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../lib/cn'
import { weeklyLoad } from '../lib/schedule'
import {
  MAX_SESSIONS_PER_DAY,
  MAX_SUBJECT_CODE_LENGTH,
  MAX_SUBJECT_NAME_LENGTH,
  MAX_TARGET,
  MIN_TARGET,
  SUBJECT_COLORS,
  SUBJECT_TYPE_LABELS,
  WEEKDAY_LABELS,
  type ScheduleItem,
  type Subject,
  type SubjectType
} from '../types'

export type SubjectDraft = Omit<Subject, 'id' | 'createdAt'>

interface SubjectFormProps {
  initial?: Subject
  defaultTarget?: number
  existingNames?: string[]
  submitLabel: string
  onSubmit: (draft: SubjectDraft) => void | Promise<void>
  onCancel?: () => void
}

interface Errors {
  name?: string
  target?: string
}

export function SubjectForm({
  initial,
  defaultTarget = 75,
  existingNames = [],
  submitLabel,
  onSubmit,
  onCancel
}: SubjectFormProps) {
  const formId = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [type, setType] = useState<SubjectType>(initial?.subjectType ?? 'lecture')
  const [color, setColor] = useState(initial?.color ?? SUBJECT_COLORS[0])
  // Held as a string so clearing the field does not momentarily mean zero.
  const [target, setTarget] = useState(String(initial?.targetPercentage ?? defaultTarget))
  const [schedule, setSchedule] = useState<ScheduleItem[]>(initial?.schedule ?? [])
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  const takenNames = useMemo(
    () => new Set(existingNames.map((value) => value.trim().toLowerCase())),
    [existingNames]
  )

  const toggleDay = (weekday: number) =>
    setSchedule((previous) =>
      previous.some((item) => item.weekday === weekday)
        ? previous.filter((item) => item.weekday !== weekday)
        : [...previous, { weekday, sessionsPerDay: 1 }].sort((a, b) => a.weekday - b.weekday)
    )

  const setSessions = (weekday: number, raw: number) =>
    setSchedule((previous) =>
      previous.map((item) =>
        item.weekday === weekday
          ? {
              ...item,
              sessionsPerDay: Number.isFinite(raw)
                ? Math.min(MAX_SESSIONS_PER_DAY, Math.max(1, Math.round(raw)))
                : 1
            }
          : item
      )
    )

  const validate = (): SubjectDraft | null => {
    const trimmedName = name.trim().slice(0, MAX_SUBJECT_NAME_LENGTH)
    const parsedTarget = Number(target)
    const next: Errors = {}

    if (!trimmedName) {
      next.name = 'Give the subject a name.'
    } else if (
      takenNames.has(trimmedName.toLowerCase()) &&
      trimmedName.toLowerCase() !== initial?.name.trim().toLowerCase()
    ) {
      next.name = 'You already have a subject with this name.'
    }

    if (!Number.isFinite(parsedTarget) || parsedTarget < MIN_TARGET || parsedTarget > MAX_TARGET) {
      next.target = `Pick a target between ${MIN_TARGET} and ${MAX_TARGET}.`
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return null

    return {
      name: trimmedName,
      code: code.trim().slice(0, MAX_SUBJECT_CODE_LENGTH) || undefined,
      subjectType: type,
      color,
      targetPercentage: Math.round(parsedTarget),
      isArchived: initial?.isArchived ?? false,
      schedule: [...schedule].sort((a, b) => a.weekday - b.weekday)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return

    const draft = validate()
    if (!draft) return

    setBusy(true)
    try {
      await onSubmit(draft)
    } finally {
      setBusy(false)
    }
  }

  const perWeek = weeklyLoad({ schedule } as Subject)

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <label className="field-label" htmlFor={`${formId}-name`}>
          Subject name
        </label>
        <input
          id={`${formId}-name`}
          className={cn('field', errors.name && 'border-critical')}
          value={name}
          maxLength={MAX_SUBJECT_NAME_LENGTH}
          autoComplete="off"
          placeholder="Data Structures & Algorithms"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? `${formId}-name-error` : undefined}
          onChange={(event) => {
            setName(event.target.value)
            if (errors.name) setErrors((previous) => ({ ...previous, name: undefined }))
          }}
        />
        {errors.name ? (
          <p id={`${formId}-name-error`} role="alert" className="mt-1.5 text-[0.75rem] text-critical">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor={`${formId}-code`}>
            Code
          </label>
          <input
            id={`${formId}-code`}
            className="field"
            value={code}
            maxLength={MAX_SUBJECT_CODE_LENGTH}
            autoComplete="off"
            placeholder="CS201"
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`${formId}-type`}>
            Type
          </label>
          <select
            id={`${formId}-type`}
            className="field"
            value={type}
            onChange={(event) => setType(event.target.value as SubjectType)}
          >
            {Object.entries(SUBJECT_TYPE_LABELS).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor={`${formId}-target`}>
          Attendance target
        </label>
        <div className="relative">
          <input
            id={`${formId}-target`}
            className={cn('field pr-9', errors.target && 'border-critical')}
            type="number"
            inputMode="numeric"
            min={MIN_TARGET}
            max={MAX_TARGET}
            value={target}
            aria-invalid={Boolean(errors.target)}
            aria-describedby={errors.target ? `${formId}-target-error` : undefined}
            onChange={(event) => {
              setTarget(event.target.value)
              if (errors.target) setErrors((previous) => ({ ...previous, target: undefined }))
            }}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[0.9rem] text-ink-faint">
            %
          </span>
        </div>
        {errors.target ? (
          <p id={`${formId}-target-error`} role="alert" className="mt-1.5 text-[0.75rem] text-critical">
            {errors.target}
          </p>
        ) : null}
      </div>

      <fieldset>
        <legend className="field-label">Colour</legend>
        <div className="flex flex-wrap gap-2.5">
          {SUBJECT_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`Colour ${option}`}
              aria-pressed={color === option}
              onClick={() => setColor(option)}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-full transition-transform',
                color === option ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
              )}
              style={{ backgroundColor: option }}
            >
              {color === option ? <Check size={14} strokeWidth={3} className="text-white" /> : null}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="field-label">Which days does it meet?</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((day, weekday) => {
            const active = schedule.some((item) => item.weekday === weekday)
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDay(weekday)}
                className={cn(
                  'h-11 min-w-11 rounded-xl border px-3 text-[0.78rem] font-semibold transition-colors',
                  active
                    ? 'border-ink bg-ink text-canvas'
                    : 'border-line bg-surface text-ink-muted hover:border-line-strong'
                )}
              >
                {day}
              </button>
            )
          })}
        </div>

        {schedule.length > 0 ? (
          <div className="mt-4 divide-y divide-line rounded-xl border border-line">
            {schedule.map((item) => (
              <div key={item.weekday} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="text-[0.85rem] font-medium">{WEEKDAY_LABELS[item.weekday]}</span>
                <label className="flex items-center gap-2 text-[0.75rem] text-ink-muted">
                  Sessions
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_SESSIONS_PER_DAY}
                    value={item.sessionsPerDay}
                    aria-label={`Sessions on ${WEEKDAY_LABELS[item.weekday]}`}
                    onChange={(event) => setSessions(item.weekday, Number(event.target.value))}
                    className="h-10 w-16 rounded-lg border border-line bg-surface px-2.5 text-center text-[0.85rem] text-ink"
                  />
                </label>
              </div>
            ))}
          </div>
        ) : (
          /* A subject with no days never appears on the daily check-in, which
             is confusing enough to be worth saying out loud. */
          <p className="mt-3 text-[0.78rem] leading-relaxed text-ink-muted">
            No days selected. You can still add this subject and mark it from the calendar, but it
            will not show up in your daily check-in.
          </p>
        )}

        {perWeek > 0 ? (
          <p className="mt-3 text-[0.78rem] text-ink-muted">
            {perWeek} {perWeek === 1 ? 'session' : 'sessions'} a week.
          </p>
        ) : null}
      </fieldset>

      <div className="flex gap-2.5 pt-1">
        {onCancel ? (
          <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="btn-primary flex-1" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
