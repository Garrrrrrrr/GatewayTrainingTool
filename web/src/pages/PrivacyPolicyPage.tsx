import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const sections = [
  {
    title: 'Information We Collect',
    body: [
      'Account information, including your email address, authentication identity, role, name, phone number, province, and account status.',
      'Training records, including class assignments, trainer assignments, schedules, attendance, drill times, trainee progress, daily reports, competency notes, uploaded class documents, and trainer hours.',
      'Operational records, including role requests, feedback messages, audit history, timestamps, and the user account associated with changes made in the application.',
      'Technical information needed to operate the service, including session tokens, security logs, browser requests, device and network metadata, and error information.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'To authenticate users, manage access by role, and keep coordinators, trainers, and students connected to the correct training records.',
      'To operate training workflows such as class management, scheduling, daily reporting, student progress tracking, document access, trainer hours, and payroll review support.',
      'To maintain security, investigate issues, prevent unauthorized access, preserve auditability, and improve the reliability of the application.',
      'To respond to feedback, support requests, account questions, and administrative review requests.',
    ],
  },
  {
    title: 'Authentication and Service Providers',
    body: [
      'Training Tool uses Supabase for authentication, database storage, and file storage. If you sign in with Google, Google and Supabase process the sign-in request and provide basic account identity information needed to create or access your account.',
      'The application may be hosted through infrastructure providers such as Vercel. These providers process technical request data necessary to deliver the application, protect the service, and troubleshoot errors.',
      'We do not sell personal information, use training records for advertising, or share personal information with third-party marketers.',
    ],
  },
  {
    title: 'Access and Sharing',
    body: [
      'Access is limited by account role. Coordinators can view and manage broader class and reporting information. Trainers can access records connected to their assigned training work. Students can access their own relevant class and progress information.',
      'Information may be shared internally with authorized training, coordination, administrative, payroll, support, or compliance personnel when needed for legitimate training operations.',
      'Information may be disclosed if required by law, to protect the security of the application, or to investigate misuse of the service.',
    ],
  },
  {
    title: 'Retention',
    body: [
      'Training records, audit logs, and related account information are retained for as long as needed for training administration, accountability, legal, payroll, compliance, troubleshooting, and recordkeeping purposes.',
      'Some records may remain after an account is deactivated when they are required to preserve class history, report integrity, audit history, or business records.',
    ],
  },
  {
    title: 'Security',
    body: [
      'Training Tool uses authenticated access, role-based authorization, transport security, provider-managed authentication, and audit logging to help protect information.',
      'No system can guarantee absolute security. Users should keep their login credentials private, use trusted devices, and report suspected unauthorized access to their training coordinator or application administrator.',
    ],
  },
  {
    title: 'Your Choices',
    body: [
      'You can review and update editable profile information from Settings after signing in.',
      'To request access, correction, deletion, export, or deactivation of information that is not editable in the app, contact your training coordinator or application administrator.',
      'Some requests may be limited when information must be retained for training, audit, payroll, legal, security, or administrative purposes.',
    ],
  },
]

export function PrivacyPolicyPage() {
  useDocumentTitle('Privacy Policy')

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-tt-darkest dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8 sm:px-8 sm:py-12">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 dark:border-white/[0.08] sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              to="/login"
              className="text-xs font-semibold uppercase tracking-wider text-tt-blue hover:text-tt-blue-hover dark:text-sky-300 dark:hover:text-sky-200"
            >
              Training Tool
            </Link>
            <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 dark:text-white sm:text-4xl">
              Privacy Policy
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              This policy explains how Training Tool collects, uses, stores, and shares information for the internal training management application.
            </p>
          </div>
          <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-white/[0.08] dark:bg-tt-surface">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Last updated</p>
            <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">May 25, 2026</p>
          </div>
        </header>

        <section className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-tt-surface">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Scope</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
            Training Tool is intended for authorized coordinators, trainers, students, and administrative users. The application is not intended for public consumer use or for children outside an authorized training program.
          </p>
        </section>

        <div className="space-y-4">
          {sections.map(section => (
            <section
              key={section.title}
              className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-tt-surface"
            >
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">{section.title}</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                {section.body.map(item => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-tt-blue" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-tt-surface">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">Policy Changes</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
            This policy may be updated as the application, service providers, or legal requirements change. Material updates will be reflected by changing the last updated date on this page.
          </p>
        </section>
      </div>
    </main>
  )
}
