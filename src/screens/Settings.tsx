import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Check,
  Download,
  LogOut,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Trash2
} from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeader, Shell } from '../components/Shell'
import { buildCsv, downloadCsv } from '../lib/csv'
import { cn } from '../lib/cn'
import { todayKey } from '../lib/date'
import { useStore } from '../lib/store'
import { useTheme } from '../lib/theme'
import { useInstallPrompt } from '../lib/useInstallPrompt'
import {
  BRANCHES,
  MAX_SEMESTER,
  MAX_TARGET,
  MIN_SEMESTER,
  MIN_TARGET,
  type ThemeMode
} from '../types'

const THEMES: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor }
]

export function Settings() {
  const navigate = useNavigate()
  const {
    profile,
    subjects,
    records,
    email,
    isDemo,
    cloud,
    saveProfile,
    clearAllData,
    signOut
  } = useStore()
  const { mode, setMode } = useTheme()
  const { canInstall, installed, install } = useInstallPrompt()

  const [branch, setBranch] = useState(profile?.branch ?? BRANCHES[0])
  const [semester, setSemester] = useState(String(profile?.semester ?? 1))
  const [target, setTarget] = useState(String(profile?.defaultTargetPercentage ?? 75))
  const [saving, setSaving] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)

  const parsedSemester = Number(semester)
  const parsedTarget = Number(target)
  const valid =
    Number.isFinite(parsedSemester) &&
    parsedSemester >= MIN_SEMESTER &&
    parsedSemester <= MAX_SEMESTER &&
    Number.isFinite(parsedTarget) &&
    parsedTarget >= MIN_TARGET &&
    parsedTarget <= MAX_TARGET

  const dirty =
    branch !== profile?.branch ||
    parsedSemester !== profile?.semester ||
    parsedTarget !== profile?.defaultTargetPercentage

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await saveProfile({
        branch,
        semester: parsedSemester,
        defaultTargetPercentage: parsedTarget,
        fullName: profile?.fullName,
        onboarded: true
      })
      toast.success('Preferences saved')
    } finally {
      setSaving(false)
    }
  }

  const exportData = () => {
    if (records.length === 0) {
      toast.info('Nothing to export yet')
      return
    }
    downloadCsv(buildCsv({ subjects, records }), `presently-${todayKey()}.csv`)
    toast.success(`Exported ${records.length} records`)
  }

  return (
    <Shell>
      <PageHeader eyebrow={email ?? (isDemo ? 'Demo session' : 'This device')} title="Settings" />

      <section className="card p-5" aria-labelledby="prefs-heading">
        <h2 id="prefs-heading" className="eyebrow mb-4">
          Defaults
        </h2>

        <div className="space-y-4">
          <div>
            <label className="field-label" htmlFor="settings-branch">
              Branch
            </label>
            <select
              id="settings-branch"
              className="field"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            >
              {/* A value loaded from an older release may not be in the list. */}
              {(BRANCHES.includes(branch) ? BRANCHES : [branch, ...BRANCHES]).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="settings-semester">
                Semester
              </label>
              <input
                id="settings-semester"
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
              <label className="field-label" htmlFor="settings-target">
                Target %
              </label>
              <input
                id="settings-target"
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

          <p className="text-[0.75rem] leading-relaxed text-ink-muted">
            The target applies to your overall percentage and to new subjects. Existing subjects keep
            their own.
          </p>

          {!valid ? (
            <p role="alert" className="text-[0.78rem] text-critical">
              Semester must be {MIN_SEMESTER}–{MAX_SEMESTER} and target {MIN_TARGET}–{MAX_TARGET}.
            </p>
          ) : null}

          <button
            type="button"
            className="btn-primary w-full"
            disabled={!valid || !dirty || saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : dirty ? 'Save preferences' : 'Saved'}
          </button>
        </div>
      </section>

      <section className="card mt-4 p-5" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="eyebrow mb-4">
          Appearance
        </h2>
        <div role="radiogroup" aria-label="Theme" className="flex rounded-xl border border-line bg-canvas p-1">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[0.8rem] font-semibold transition-colors',
                mode === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              )}
            >
              <Icon size={14} strokeWidth={2.2} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="card mt-4 divide-y divide-line" aria-labelledby="data-heading">
        <h2 id="data-heading" className="eyebrow px-5 pt-5 pb-3">
          Your data
        </h2>

        <SettingRow
          icon={<Download size={17} strokeWidth={1.9} />}
          title="Export as CSV"
          detail={`${records.length} ${records.length === 1 ? 'record' : 'records'} across ${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'}`}
          onClick={exportData}
        />

        {canInstall ? (
          <SettingRow
            icon={<Smartphone size={17} strokeWidth={1.9} />}
            title="Install Presently"
            detail="Add it to your home screen for one-tap check-ins"
            onClick={() => void install()}
          />
        ) : installed ? (
          <div className="flex items-center gap-3.5 px-5 py-4 text-ink-muted">
            <Check size={17} strokeWidth={1.9} />
            <div>
              <p className="text-[0.88rem] font-medium text-ink">Installed</p>
              <p className="mt-0.5 text-[0.74rem]">Running as an installed app.</p>
            </div>
          </div>
        ) : null}

        {cloud && !isDemo ? (
          <SettingRow
            icon={<LogOut size={17} strokeWidth={1.9} />}
            title="Sign out"
            detail="Also clears the copy cached on this device"
            onClick={() => setConfirmSignOut(true)}
          />
        ) : null}

        <SettingRow
          icon={<Trash2 size={17} strokeWidth={1.9} />}
          title={isDemo ? 'Leave the demo' : 'Delete everything'}
          detail={
            isDemo
              ? 'Clear the sample data and start fresh'
              : cloud
                ? 'Removes every subject and record from your account'
                : 'Removes every subject and record from this device'
          }
          destructive
          onClick={() => setConfirmWipe(true)}
        />
      </section>

      <p className="mt-8 text-center text-[0.72rem] leading-relaxed text-ink-faint">
        Presently · Only Present and Absent count toward your percentage.
      </p>

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        description="Your attendance stays in your account. The copy cached on this device is removed so nobody else can read it."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={async () => {
          await signOut()
          navigate('/auth', { replace: true })
        }}
      />

      <ConfirmDialog
        open={confirmWipe}
        destructive
        title={isDemo ? 'Leave the demo?' : 'Delete everything?'}
        description={
          isDemo
            ? 'The sample subjects and records will be removed.'
            : `This permanently removes ${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'} and ${records.length} attendance ${records.length === 1 ? 'record' : 'records'}${cloud ? ' from your account and every device' : ''}. It cannot be undone — export first if you want a copy.`
        }
        confirmLabel={isDemo ? 'Leave demo' : 'Delete everything'}
        requirePhrase={isDemo ? undefined : 'DELETE'}
        onCancel={() => setConfirmWipe(false)}
        onConfirm={async () => {
          await clearAllData()
          setConfirmWipe(false)
          toast.success(isDemo ? 'Demo cleared' : 'Everything deleted')
          navigate(isDemo ? '/auth' : '/onboarding', { replace: true })
        }}
      />
    </Shell>
  )
}

function SettingRow({
  icon,
  title,
  detail,
  onClick,
  destructive = false
}: {
  icon: ReactNode
  title: string
  detail: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-canvas"
    >
      <span className={cn('shrink-0', destructive ? 'text-critical' : 'text-ink-muted')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[0.88rem] font-medium', destructive && 'text-critical')}>
          {title}
        </span>
        <span className="mt-0.5 block text-[0.74rem] text-ink-muted">{detail}</span>
      </span>
    </button>
  )
}
