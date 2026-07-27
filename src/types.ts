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

export const SUBJECT_COLORS = ['#22C55E', '#14B8A6', '#0EA5E9', '#3B82F6', '#8B5CF6', '#D946EF', '#F43F5E', '#F97316', '#F59E0B', '#84CC16', '#10B981', '#06B6D4', '#6366F1', '#EC4899', '#EF4444', '#A3A3A3']
