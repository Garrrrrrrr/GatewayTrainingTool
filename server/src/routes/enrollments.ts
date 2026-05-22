/**
 * server/src/routes/enrollments.ts — Student enrollment CRUD routes
 *
 * All routes require: authentication (via requireAuth in routes/index.ts)
 *                     + coordinator role (via requireCoordinator in routes/index.ts)
 *
 * Routes:
 *   GET    /classes/:classId/enrollments            — List enrollments (optionally filtered by status)
 *   POST   /classes/:classId/enrollments            — Enroll a student in a class
 *   PUT    /classes/:classId/enrollments/:id        — Update enrollment status or group label
 *   DELETE /classes/:classId/enrollments/:id        — Remove an enrollment from a class
 *
 * Enrollment statuses: 'enrolled' | 'dropped' | 'failed'
 * The GET route accepts an optional `?status=` query param to filter by status.
 * For example, GET /classes/:classId/enrollments?status=enrolled returns only
 * active enrollees (used when building the progress table in reports).
 *
 * IDOR protection: the classId URL parameter is matched in all write queries
 * so coordinators cannot modify enrollments belonging to a different class.
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { manualStudentEmail, normalizeStudentEmail, normalizeStudentName } from '../lib/manualStudents'
import {
  enrollmentBatchBodySchema,
  enrollmentBodySchema,
  enrollmentUpdateBodySchema,
  validateBody,
} from '../lib/validation'

export const enrollmentsRouter = Router()

/**
 * GET /classes/:classId/enrollments?status=<status>
 * Auth: coordinator
 * Returns all enrollments for the specified class, sorted newest first.
 * Optional `?status=` query param filters by enrollment status
 * (e.g. `?status=enrolled` returns only active enrollees).
 * If no status param is given, all enrollments regardless of status are returned.
 */
enrollmentsRouter.get('/classes/:classId/enrollments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let query = supabase
      .from('class_enrollments')
      .select('*')
      .eq('class_id', req.params.classId)
      .order('created_at', { ascending: false })

    if (req.query.status) {
      query = query.eq('status', req.query.status as string)
    }

    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /classes/:classId/enrollments/batch
 * Auth: coordinator
 * Bulk-enroll students by email. Resolves emails to profile names, skips duplicates.
 */
enrollmentsRouter.post('/classes/:classId/enrollments/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validateBody(enrollmentBatchBodySchema, req, res)
    if (!body) return
    const { students } = body

    const classId = req.params.classId as string
    const emails = students.map(s => s.email.trim().toLowerCase())

    // Resolve emails to profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('email', emails)

    const profileMap = new Map<string, { full_name: string; email: string }>()
    for (const p of profiles ?? []) {
      profileMap.set(p.email.toLowerCase(), p)
    }

    // Check existing enrollments
    const { data: existing } = await supabase
      .from('class_enrollments')
      .select('student_email')
      .eq('class_id', classId)
      .in('student_email', emails)

    const existingEmails = new Set((existing ?? []).map((e: { student_email: string }) => e.student_email.toLowerCase()))

    const toInsert: { class_id: string; student_name: string; student_email: string; status: string; group_label: string | null }[] = []
    const skipped: string[] = []
    const notFound: string[] = []

    for (const s of students) {
      const email = s.email.trim().toLowerCase()
      if (existingEmails.has(email)) { skipped.push(email); continue }
      const profile = profileMap.get(email)
      if (!profile) { notFound.push(email); continue }
      toInsert.push({
        class_id: classId,
        student_name: profile.full_name || email,
        student_email: email,
        status: 'enrolled',
        group_label: s.group_label?.trim() || null,
      })
    }

    if (toInsert.length > 0) {
      const { data, error } = await supabase.from('class_enrollments').insert(toInsert).select()
      if (error) throw error
      for (const row of data ?? []) {
        await logAudit({
          userId: req.userId!,
          action: 'CREATE',
          tableName: 'class_enrollments',
          recordId: row.id,
          after: row as Record<string, unknown>,
          metadata: { class_id: classId, batch: true, student_email: row.student_email },
          ipAddress: req.ip,
        })
      }
    }

    res.status(201).json({ inserted: toInsert.length, skipped: skipped.length, not_found: notFound })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /classes/:classId/enrollments
 * Auth: coordinator
 * Enrolls a student in a class. `group_label` is optional and used to assign
 * a student to a specific training group (e.g. "Group A").
 * Returns 201 with the created enrollment record.
 */
enrollmentsRouter.post('/classes/:classId/enrollments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validateBody(enrollmentBodySchema, req, res)
    if (!body) return
    const classId = req.params.classId as string
    const studentName = normalizeStudentName(body.student_name)
    const studentEmail = normalizeStudentEmail(body.student_email) ?? manualStudentEmail(classId, studentName)

    const { data: existing, error: existingError } = await supabase
      .from('class_enrollments')
      .select('id')
      .eq('class_id', classId)
      .eq('student_email', studentEmail)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      res.status(409).json({ error: 'Student is already enrolled in this class' })
      return
    }

    const { status, group_label } = body
    const { data, error } = await supabase
      .from('class_enrollments')
      .insert({
        class_id: classId,
        student_name: studentName,
        student_email: studentEmail,
        status,
        group_label: group_label ?? null,
      })
      .select()
      .single()
    if (error) throw error
    await logAudit({
      userId: req.userId!,
      action: 'CREATE',
      tableName: 'class_enrollments',
      recordId: (data as { id: string }).id,
      after: data as Record<string, unknown>,
      metadata: { class_id: classId, student_email: studentEmail, status },
      ipAddress: req.ip,
    })
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

/**
 * PUT /classes/:classId/enrollments/:id
 * Auth: coordinator
 * Updates enrollment status (e.g. 'enrolled' → 'dropped') or the group label.
 * Note: student_name and student_email are snapshot fields set on creation and
 * are intentionally not updatable here — the snapshot captures who enrolled.
 * Both enrollment UUID and classId are matched in the query (IDOR protection).
 * Returns 404 if either doesn't match. Supabase error code PGRST116 = "no rows found".
 */
enrollmentsRouter.put('/classes/:classId/enrollments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validateBody(enrollmentUpdateBodySchema, req, res)
    if (!body) return
    const { status, group_label } = body
    const { data: before, error: beforeError } = await supabase
      .from('class_enrollments')
      .select('*')
      .eq('id', req.params.id)
      .eq('class_id', req.params.classId)
      .single()
    if (beforeError || !before) {
      res.status(404).json({ error: 'Enrollment not found' })
      return
    }
    const { data, error } = await supabase
      .from('class_enrollments')
      .update({ status, group_label: group_label ?? null })
      .eq('id', req.params.id)
      .eq('class_id', req.params.classId)
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: 'Enrollment not found' })
        return
      }
      throw error
    }
    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      tableName: 'class_enrollments',
      recordId: req.params.id as string,
      before: before as Record<string, unknown>,
      after: data as Record<string, unknown>,
      metadata: { class_id: req.params.classId, status },
      ipAddress: req.ip,
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /classes/:classId/enrollments/:id
 * Auth: coordinator
 * Permanently removes an enrollment. Pre-fetches using both id and class_id to
 * return a proper 404 (Supabase delete doesn't error on missing rows). The
 * classId match also prevents cross-class deletion (IDOR protection).
 * Returns 204 No Content on success.
 */
enrollmentsRouter.delete('/classes/:classId/enrollments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('class_enrollments')
      .select('*')
      .eq('id', req.params.id)
      .eq('class_id', req.params.classId)
      .single()
    if (fetchError || !existing) {
      res.status(404).json({ error: 'Enrollment not found' })
      return
    }
    await logAudit({
      userId: req.userId!,
      action: 'DELETE',
      tableName: 'class_enrollments',
      recordId: req.params.id as string,
      before: existing as Record<string, unknown>,
      metadata: { class_id: req.params.classId },
      ipAddress: req.ip,
    })
    const { error } = await supabase.from('class_enrollments').delete().eq('id', req.params.id)
    if (error) throw error
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
