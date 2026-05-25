/**
 * App.tsx — Root application component
 *
 * Route structure:
 *   /login                  — Public login page
 *   /privacy                — Public privacy policy
 *   /                       — Protected shell
 *     /dashboard            — Role-aware dashboard
 *     /classes              — Class management (coordinator only)
 *     /classes/:className   — Class detail (coordinator only)
 *     /students             — Trainee roster (coordinator only)
 *     /trainers             — Trainer roster (coordinator only)
 *     /reports              — Reports (coordinator or trainer, role-aware)
 *     /schedule             — Schedule (coordinator or trainer, role-aware)
 *     /settings             — Settings (all roles — role-aware content)
 *     /my-classes           — Trainer's assigned classes (trainer only)
 *     /my-classes/:classId  — Trainer class detail (trainer only)
 *     /hours                — Personal hours (trainer only)
 *     /my-class/:classId    — Student class detail (student only)
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ClassesProvider } from './contexts/ClassesContext'
import { CoordinatorRoute } from './layouts/CoordinatorRoute'
import { TrainerRoute } from './layouts/TrainerRoute'
import { ConditionalTrainerProvider } from './contexts/TrainerContext'
import { ProtectedLayout } from './layouts/ProtectedLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoginView } from './pages/LoginView'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { DashboardView } from './pages/DashboardView'
import { ClassesPage } from './pages/ClassesPage'
import { ClassDetailView } from './pages/ClassDetailView'
import { RosterPage } from './pages/RosterPage'
import { ReportsPage } from './pages/ReportsPage'
import { SchedulePage } from './pages/SchedulePage'
import { SettingsContent } from './pages/SettingsContent'
import { StudentProgressPage } from './pages/StudentProgressPage'
import { MyClassesPage } from './pages/MyClassesPage'
import { TrainerClassDetailPage } from './pages/TrainerClassDetailPage'
import { TrainerReportsPage } from './pages/TrainerReportsPage'
import { TrainerSchedulePage } from './pages/TrainerSchedulePage'
import { TrainerHoursPage } from './pages/TrainerHoursPage'
import { StudentRoute } from './layouts/StudentRoute'
import { StudentClassDetailPage } from './pages/StudentClassDetailPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { SystemHealthPage } from './pages/SystemHealthPage'

/** Renders role-specific content for shared paths (/reports, /schedule). */
function RoleAwareRoute({ coordinator, trainer }: { coordinator: React.ReactNode; trainer: React.ReactNode }) {
  const { role } = useAuth()
  if (role === 'coordinator') return <>{coordinator}</>
  if (role === 'trainer') return <>{trainer}</>
  return <Navigate to="/dashboard" replace />
}

function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public — accessible without authentication */}
          <Route path="/login" element={<LoginView />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />

          {/* Protected shell */}
          <Route path="/" element={<ClassesProvider><ConditionalTrainerProvider><ProtectedLayout /></ConditionalTrainerProvider></ClassesProvider>}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* Role-aware dashboard */}
            <Route path="dashboard" element={<DashboardView />} />

            {/* Coordinator-only routes */}
            <Route path="classes" element={<CoordinatorRoute><ClassesPage /></CoordinatorRoute>} />
            <Route path="classes/:className" element={<CoordinatorRoute><ClassDetailView /></CoordinatorRoute>} />
            <Route path="classes/:className/reports/:reportId" element={<CoordinatorRoute><ClassDetailView /></CoordinatorRoute>} />
            <Route path="students/progress/:email" element={<CoordinatorRoute><StudentProgressPage /></CoordinatorRoute>} />
            <Route path="students" element={<CoordinatorRoute><RosterPage role="trainee" title="Students" subtitle="All registered trainees" /></CoordinatorRoute>} />
            <Route path="trainers" element={<CoordinatorRoute><RosterPage role="trainer" title="Trainers" subtitle="All registered trainers" /></CoordinatorRoute>} />
            <Route path="audit" element={<CoordinatorRoute><AuditLogPage /></CoordinatorRoute>} />
            <Route path="system-health" element={<CoordinatorRoute><SystemHealthPage /></CoordinatorRoute>} />

            {/* Settings — all roles (content is role-aware inside SettingsContent) */}
            <Route path="settings" element={<SettingsContent />} />

            {/* Shared paths — role-aware (coordinator vs trainer) */}
            <Route path="reports" element={
              <RoleAwareRoute
                coordinator={<CoordinatorRoute><ReportsPage /></CoordinatorRoute>}
                trainer={<TrainerRoute><TrainerReportsPage /></TrainerRoute>}
              />
            } />
            <Route path="schedule" element={
              <RoleAwareRoute
                coordinator={<CoordinatorRoute><SchedulePage /></CoordinatorRoute>}
                trainer={<TrainerRoute><TrainerSchedulePage /></TrainerRoute>}
              />
            } />

            {/* Trainer-only routes */}
            <Route path="my-classes" element={<TrainerRoute><MyClassesPage /></TrainerRoute>} />
            <Route path="my-classes/:classId" element={<TrainerRoute><TrainerClassDetailPage /></TrainerRoute>} />
            <Route path="hours" element={<TrainerRoute><TrainerHoursPage /></TrainerRoute>} />

            {/* Student-only routes */}
            <Route path="my-class/:classId" element={<StudentRoute><StudentClassDetailPage /></StudentRoute>} />

            {/* Legacy redirect — old student settings path */}
            <Route path="my-settings" element={<Navigate to="/settings" replace />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
