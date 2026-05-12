/**
 * server/src/routes/index.ts — Main API router
 *
 * Assembles all sub-routers and applies middleware in the correct order.
 * This router is mounted at `/api` in index.ts, so all paths here are
 * relative to `/api` (e.g. the classes router handles `/api/classes`).
 *
 * Middleware order matters:
 *   1. requireAuth  — Applied first to ALL routes (including profiles).
 *      No unauthenticated request reaches any handler.
 *
 *   2. profilesRouter — Mounted BEFORE requireCoordinator because all
 *      authenticated users (trainers, trainees) need to read their own
 *      profile (GET /profiles/me). The profiles router itself only exposes
 *      safe, role-appropriate data.
 *
 *   3. requireCoordinator — Applied to all subsequent routers.
 *      Trainers and trainees get 403 for any class management endpoint.
 *
 *   4. All other routers — Class management (CRUD for classes, drills,
 *      trainers, enrollments, schedule, reports, and hours).
 *
 * The `as Router` type casts are necessary because Express's middleware
 * type for async functions differs from the Router type in its type
 * definitions; the cast is safe at runtime.
 */

import { Router } from 'express'
import { requireAuth, requireCoordinator } from '../middleware/auth'
import { classesRouter } from './classes'
import { drillsRouter } from './drills'
import { trainersRouter } from './trainers'
import { enrollmentsRouter } from './enrollments'
import { scheduleRouter } from './schedule'
import { reportsRouter } from './reports'
import { hoursRouter } from './hours'
import { payrollRouter } from './payroll'
import { studentProgressRouter } from './studentProgress'
import { selfServiceRouter } from './selfService'
import { roleRequestsRouter } from './roleRequests'
import { profilesRouter } from './profiles'
import { dashboardRouter } from './dashboard'
import { searchRouter } from './search'
import { auditRouter } from './audit'
import { feedbackRouter } from './feedback'
import { legacyImportsRouter } from './legacyImports'
import { systemHealthRouter } from './systemHealth'
import { classDocumentsRouter } from './classDocuments'

export const router = Router()

// All routes require a valid JWT — no anonymous access
router.use(requireAuth as Router)

// Profiles are accessible to all authenticated users (GET /profiles/me, GET /profiles)
router.use(profilesRouter)

// Self-service routes are accessible to all authenticated users (trainers and trainees)
router.use(selfServiceRouter)
router.use(searchRouter)

// Everything below this line requires coordinator role
router.use(requireCoordinator as Router)
router.use(dashboardRouter)
router.use(classesRouter)
router.use(drillsRouter)
router.use(trainersRouter)
router.use(enrollmentsRouter)
router.use(scheduleRouter)
router.use(reportsRouter)
router.use(hoursRouter)
router.use(payrollRouter)
router.use(studentProgressRouter)
router.use(roleRequestsRouter)
router.use(auditRouter)
router.use(feedbackRouter)
router.use(legacyImportsRouter)
router.use(systemHealthRouter)
router.use(classDocumentsRouter)
