import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, Download, LogOut, Smartphone, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DataRow, Panel, SectionHead } from '../components/Panel'
import { ScreenHead } from '../components/Shell'
import { buildCsv, downloadCsv } from '../lib/csv'
import { cn } from '../lib/cn'
import { todayKey } from '../lib/date'
import { useStore } from '../lib/store'
import { useInstallPrompt } from '../lib/useInstallPrompt'
import { BRANCHES, MAX_SEMESTER, MAX_TARGET, MIN_SEMESTER, MIN_TARGET } from '../types'

export function Settings() {
  const navigate = useNavigate()
  const { profile, subjects, records, email, isDemo, cloud, saveProfile, clearAllData, signOut } =
    useStore()
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
      toast.success('Saved')
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
    <>
      <ScreenHead label={isDemo ? 'Demo session' : (email ?? 'This device')} title="Settings" />

      <Panel className="px-5 py-5">
        <p className="label mb-4">Defaults</p>

        <div className="space-y-4">
          <div>
            <label className="label mb-2.5 block" htmlFor="settings-branch">
              Branch
            </label>
            <select
              id="settings-branch"
              className="field"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            >
              {/* A value stored by an older release may not be in the list. */}
              {(BRANCHES.includes(branch) ? BRANCHES : [branch, ...BRANCHES]).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-2.5 block" htmlFor="settings-semester">
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
              <label className="label mb-2.5 block" htmlFor="settings-target">
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

          <p className="text-[0.74rem] leading-relaxed text-ink-faint">
            The target applies to your overall percentage and to new subjects. Existing subjects keep
            their own.
          </p>

          {!valid ? (
            <p role="alert" className="text-[0.75rem] text-danger">
              Semester must be {MIN_SEMESTER}–{MAX_SEMESTER} and target {MIN_TARGET}–{MAX_TARGET}.
            </p>
          ) : null}

          <button
            type="button"
            className={cn('w-full', dirty && valid ? 'btn-primary' : 'btn-secondary')}
            disabled={!valid || !dirty || saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </Panel>

      <div className="mt-7">
        <SectionHead label="Data" />

        <ActionRow
          icon={<Download size={16} strokeWidth={1.9} />}
          title="Export CSV"
          detail={`${records.length} ${records.length === 1 ? 'record' : 'records'} · ${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'}`}
          onClick={exportData}
        />

        {canInstall ? (
          <ActionRow
            icon={<Smartphone size={16} strokeWidth={1.9} />}
            title="Install app"
            detail="Add to your home screen"
            onClick={() => void install()}
          />
        ) : installed ? (
          <DataRow>
            <span className="shrink-0 text-accent">
              <Check size={16} strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.85rem]">Installed</p>
              <p className="label mt-1.5">Running as an app</p>
            </div>
          </DataRow>
        ) : null}

        {cloud && !isDemo ? (
          <ActionRow
            icon={<LogOut size={16} strokeWidth={1.9} />}
            title="Sign out"
            detail="Also clears this device's cached copy"
            onClick={() => setConfirmSignOut(true)}
          />
        ) : null}

        <ActionRow
          icon={<Trash2 size={16} strokeWidth={1.9} />}
          title={isDemo ? 'Leave demo' : 'Delete everything'}
          detail={
            isDemo
              ? 'Clear the sample data'
              : cloud
                ? 'Removes every subject and record from your account'
                : 'Removes every subject and record from this device'
          }
          destructive
          onClick={() => setConfirmWipe(true)}
        />
      </div>

      <p className="mt-8 text-center font-mono text-[0.6rem] leading-relaxed tracking-[0.08em] text-ink-faint uppercase">
        Only present and absent count
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
            : `This permanently removes ${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'} and ${records.length} attendance ${records.length === 1 ? 'record' : 'records'}${cloud ? ' from your account and every device' : ''}. Export first if you want a copy.`
        }
        confirmLabel={isDemo ? 'Leave demo' : 'Delete everything'}
        requirePhrase={isDemo ? undefined : 'DELETE'}
        onCancel={() => setConfirmWipe(false)}
        onConfirm={async () => {
          await clearAllData()
          setConfirmWipe(false)
          toast.success(isDemo ? 'Demo cleared' : 'Deleted')
          navigate(isDemo ? '/auth' : '/onboarding', { replace: true })
        }}
      />
    </>
  )
}

function ActionRow({
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
    <DataRow onClick={onClick} className="py-4">
      <span className={cn('shrink-0', destructive ? 'text-danger' : 'text-ink-muted')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[0.85rem]', destructive && 'text-danger')}>{title}</span>
        <span className="label mt-1.5 block normal-case">{detail}</span>
      </span>
    </DataRow>
  )
}
