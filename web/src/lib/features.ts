export const STUDENT_SELF_SERVICE_ENABLED =
  ((import.meta.env.VITE_ENABLE_STUDENT_SELF_SERVICE as string | undefined) ?? 'false').toLowerCase() === 'true'
