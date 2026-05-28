import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { STUDENT_SELF_SERVICE_ENABLED } from '../lib/features'

export function StudentRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth()
  if (!STUDENT_SELF_SERVICE_ENABLED) return <Navigate to="/dashboard" replace />
  if (role !== 'trainee') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
