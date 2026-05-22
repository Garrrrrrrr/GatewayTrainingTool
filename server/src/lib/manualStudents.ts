const MANUAL_STUDENT_EMAIL_DOMAIN = 'trainingtool.local'

export function normalizeStudentName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeStudentEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized || null
}

export function manualStudentEmail(classId: string, studentName: string): string {
  const slug = normalizeStudentName(studentName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80) || 'student'

  return `manual+${slug}.${classId.slice(0, 8)}@${MANUAL_STUDENT_EMAIL_DOMAIN}`
}

export function manualTrainerEmail(classId: string, trainerName: string): string {
  const slug = normalizeStudentName(trainerName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80) || 'trainer'

  return `manual.trainer+${slug}.${classId.slice(0, 8)}@${MANUAL_STUDENT_EMAIL_DOMAIN}`
}

export function isManualStudentEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${MANUAL_STUDENT_EMAIL_DOMAIN}`)
}
