export type AttendanceStatus = 'present' | 'absent' | 'cancelled' | 'holiday'
export type SubjectType = 'lecture' | 'lab' | 'tutorial'

export interface Profile {
  id: string
  branch: string
  semester: number
  defaultTargetPercentage: number
  fullName?: string
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

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  cancelled: 'Cancelled',
  holiday: 'Holiday'
}

export const SUBJECT_COLORS = ['#6D5EF7', '#0F766E', '#C2410C', '#2563EB', '#BE185D', '#4D7C0F', '#7C3AED', '#B45309']
