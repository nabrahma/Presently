export type AttendanceStatus = 'present' | 'absent' | 'cancelled' | 'holiday'
export type SubjectType = 'lecture' | 'lab' | 'tutorial'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface Profile {
  id: string
  branch: string
  semester: number
  defaultTargetPercentage: number
  fullName?: string
  /**
   * The signup trigger creates a profile row with empty details, so the row
   * existing is not proof that setup finished. This flag is that proof.
   */
  onboarded: boolean
}

export interface ScheduleItem {
  weekday: number
  sessionsPerDay: number
}

export interface Subject {
  id: string
  name: string
  code?: string
  subjectType: SubjectType
  color: string
  targetPercentage: number
  isArchived: boolean
  schedule: ScheduleItem[]
  createdAt: string
}

export interface AttendanceRecord {
  id: string
  subjectId: string
  recordDate: string
  sessionIndex: number
  status: AttendanceStatus
  createdAt: string
  updatedAt: string
}

export interface AppData {
  profile: Profile | null
  subjects: Subject[]
  records: AttendanceRecord[]
}

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'absent', 'cancelled', 'holiday']

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  cancelled: 'Cancelled',
  holiday: 'Holiday'
}

/** Short forms for the compact daily control, kept unambiguous. */
export const STATUS_SHORT: Record<AttendanceStatus, string> = {
  present: 'P',
  absent: 'A',
  cancelled: 'C',
  holiday: 'H'
}

export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  lecture: 'Lecture',
  lab: 'Lab',
  tutorial: 'Tutorial'
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Subject colours are used as small identifying marks rather than fills, so the
 * set favours hues that stay distinguishable against both themes.
 */
export const SUBJECT_COLORS = [
  '#e2503a',
  '#e08a1e',
  '#c9a227',
  '#5c9e31',
  '#1f8a4c',
  '#0f9b8e',
  '#2b7fd4',
  '#4f5bd5',
  '#7c4dcc',
  '#b3439b',
  '#d43f6f',
  '#7a6a58'
]

export const BRANCHES = [
  'CSE',
  'ECE',
  'EEE',
  'Mechanical',
  'Civil',
  'Mathematics & Scientific Computing',
  'IPG-IT',
  'Other'
]

export const MIN_TARGET = 1
export const MAX_TARGET = 100
export const MIN_SEMESTER = 1
export const MAX_SEMESTER = 12
export const MAX_SESSIONS_PER_DAY = 8
export const MAX_SUBJECT_NAME_LENGTH = 80
export const MAX_SUBJECT_CODE_LENGTH = 16
