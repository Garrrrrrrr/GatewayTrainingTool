import type { Request, Response } from 'express'
import { z } from 'zod'

export const idParamSchema = z.string().uuid()
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
export const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Expected HH:MM')
export const provinceSchema = z.enum(['BC', 'AB', 'ON'])
export const enrollmentStatusSchema = z.enum(['enrolled', 'dropped', 'failed'])
export const trainerRoleSchema = z.enum(['primary', 'assistant'])
export const drillTypeSchema = z.enum(['drill', 'test'])
export const dailyRatingSchema = z.enum(['EE', 'ME', 'AD', 'NI'])

export const nullableString = z.string().trim().max(2000).nullable().optional()
export const optionalUuid = z.string().uuid().nullable().optional()

export function validateBody<T>(schema: z.ZodType<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
    return null
  }
  return result.data
}

export const classBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  site: z.string().trim().min(1).max(80),
  province: provinceSchema,
  game_type: z.string().trim().max(120).nullable().optional(),
  start_date: dateSchema,
  end_date: dateSchema,
  description: z.string().trim().max(4000).nullable().optional(),
  archived: z.boolean().optional(),
})
export const classUpdateBodySchema = classBodySchema.partial().refine(
  value => Object.keys(value).length > 0,
  'At least one class field is required',
)

export const drillBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: drillTypeSchema,
  par_time_seconds: z.number().min(0).max(86400).nullable().optional(),
  target_score: z.number().min(0).max(100000).nullable().optional(),
  active: z.boolean().optional(),
})
export const drillUpdateBodySchema = drillBodySchema.partial().refine(
  value => Object.keys(value).length > 0,
  'At least one drill field is required',
)

export const trainerBodySchema = z.object({
  trainer_name: z.string().trim().min(1).max(160),
  trainer_email: z.string().trim().email().max(254),
  role: trainerRoleSchema,
})

export const enrollmentBodySchema = z.object({
  student_name: z.string().trim().min(1).max(160),
  student_email: z.preprocess(
    value => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().email().max(254).optional(),
  ),
  status: enrollmentStatusSchema.default('enrolled'),
  group_label: z.string().trim().max(80).nullable().optional(),
})

export const enrollmentUpdateBodySchema = z.object({
  status: enrollmentStatusSchema,
  group_label: z.string().trim().max(80).nullable().optional(),
})

export const enrollmentBatchBodySchema = z.object({
  students: z.array(z.object({
    email: z.string().trim().email().max(254),
    group_label: z.string().trim().max(80).optional(),
  })).min(1).max(500),
})

export const scheduleBodySchema = z.object({
  slot_date: dateSchema,
  start_time: timeSchema,
  end_time: timeSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
  trainer_id: z.string().uuid().nullable().optional(),
  group_label: z.string().trim().max(80).nullable().optional(),
})

export const scheduleBatchBodySchema = z.object({
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start_time: timeSchema,
  end_time: timeSchema,
  trainer_id: z.string().uuid().nullable().optional(),
  group_label: z.string().trim().max(80).nullable().optional(),
  date_from: dateSchema,
  date_to: dateSchema,
})

export const hoursBodySchema = z.object({
  log_date: dateSchema,
  person_type: z.enum(['trainer', 'student']),
  trainer_id: z.string().uuid().nullable().optional(),
  enrollment_id: z.string().uuid().nullable().optional(),
  hours: z.number().min(0).max(24),
  paid: z.boolean().optional(),
  live_training: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const hoursBulkBodySchema = z.object({
  log_date: dateSchema,
  entries: z.array(z.object({
    enrollment_id: z.string().uuid(),
    hours: z.number().min(0).max(24),
    notes: z.string().trim().max(2000).optional(),
  })).min(1).max(500),
  paid: z.boolean().optional(),
  live_training: z.boolean().optional(),
})

export const reportTimelineItemSchema = z.object({
  start_time: timeSchema.nullable().optional(),
  end_time: timeSchema.nullable().optional(),
  activity: z.string().trim().max(500).nullable().optional(),
  homework_handouts_tests: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
})

export const reportProgressRowSchema = z.object({
  enrollment_id: z.string().uuid(),
  progress_text: z.string().trim().max(4000).nullable().optional(),
  gk_rating: dailyRatingSchema.nullable().optional(),
  dex_rating: dailyRatingSchema.nullable().optional(),
  hom_rating: dailyRatingSchema.nullable().optional(),
  coming_back_next_day: z.boolean().nullable().optional(),
  homework_completed: z.boolean().optional(),
  attendance: z.boolean().optional(),
  late: z.boolean().optional(),
})

export const reportDrillTimeSchema = z.object({
  enrollment_id: z.string().uuid(),
  drill_id: z.string().uuid(),
  time_seconds: z.number().min(0).max(86400).nullable().optional(),
  score: z.number().min(0).max(100000).nullable().optional(),
})

export const reportBodySchema = z.object({
  report_date: dateSchema,
  group_label: z.string().trim().max(80).nullable().optional(),
  game: z.string().trim().max(120).nullable().optional(),
  session_label: z.string().trim().max(160).nullable().optional(),
  class_start_time: timeSchema.nullable().optional(),
  class_end_time: timeSchema.nullable().optional(),
  mg_confirmed: z.number().int().min(0).max(10000).nullable().optional(),
  mg_attended: z.number().int().min(0).max(10000).nullable().optional(),
  current_trainees: z.number().int().min(0).max(10000).nullable().optional(),
  licenses_received: z.number().int().min(0).max(10000).nullable().optional(),
  override_hours_to_date: z.number().min(0).max(100000).nullable().optional(),
  override_paid_hours_total: z.number().min(0).max(100000).nullable().optional(),
  override_live_hours_total: z.number().min(0).max(100000).nullable().optional(),
  coordinator_notes: z.string().trim().max(4000).nullable().optional(),
  trainer_ids: z.array(z.string().uuid()).default([]),
  timeline: z.array(reportTimelineItemSchema).max(200).default([]),
  progress: z.array(reportProgressRowSchema).max(1000).default([]),
  drill_times: z.array(reportDrillTimeSchema).max(2000).default([]),
})

export const roleSelectionBodySchema = z.object({
  selected_role: z.enum(['trainee', 'trainer', 'coordinator']),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(40).optional(),
})

export const profileUpdateBodySchema = z.object({
  full_name: z.string().trim().max(200).optional(),
  first_name: z.string().trim().max(100).optional(),
  last_name: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  province: provinceSchema.optional(),
})

export const legacyStudentsBodySchema = z.object({
  students: z.array(z.string().trim().min(1).max(200)).min(1).max(1000),
})

export const legacyStudentMergeBodySchema = z.object({
  enrollment_ids: z.array(z.string().uuid()).min(1).max(100),
  target_email: z.string().trim().email().max(254),
  target_name: z.string().trim().min(1).max(160).optional(),
})

export const feedbackBodySchema = z.object({
  category: z.enum(['bug', 'feature', 'general']).default('general'),
  message: z.string().trim().min(10).max(2000),
  page: z.string().trim().max(160).optional(),
})

export const feedbackStatusBodySchema = z.object({
  status: z.enum(['new', 'reviewing', 'resolved', 'archived']),
})

export const legacyImportBatchBodySchema = z.object({
  import_id: z.string().trim().min(1).max(120),
  file_name: z.string().trim().max(260).nullable().optional(),
  report_count: z.number().int().min(0).max(10000).default(0),
  payroll_count: z.number().int().min(0).max(10000).default(0),
  enrollment_count: z.number().int().min(0).max(10000).default(0),
  progress_unmatched: z.number().int().min(0).max(10000).default(0),
  created_report_ids: z.array(z.string().uuid()).max(10000).default([]),
  created_hour_ids: z.array(z.string().uuid()).max(10000).default([]),
  created_enrollment_ids: z.array(z.string().uuid()).max(10000).default([]),
  skipped_reports: z.number().int().min(0).max(10000).default(0),
  skipped_payroll: z.number().int().min(0).max(10000).default(0),
  excluded_sheets: z.array(z.object({
    sheetName: z.string().trim().max(160),
    reason: z.string().trim().max(500),
  })).max(500).default([]),
  warnings: z.array(z.string().trim().max(1000)).max(1000).default([]),
  summary: z.record(z.string(), z.unknown()).default({}),
})

export const legacyImportReviewBodySchema = z.object({
  reports: z.array(z.object({
    sheet_name: z.string().trim().min(1).max(160),
    report_date: dateSchema,
    group_label: z.string().trim().max(80).nullable().optional(),
    session_label: z.string().trim().max(160).nullable().optional(),
    student_names: z.array(z.string().trim().min(1).max(200)).max(1000).default([]),
    progress_student_names: z.array(z.string().trim().min(1).max(200)).max(1000).default([]),
  })).max(500).default([]),
  payroll_rows: z.array(z.object({
    client_key: z.string().trim().min(1).max(260),
    log_date: dateSchema,
    trainer_id: z.string().uuid(),
    hours: z.number().min(0).max(24),
    paid: z.boolean(),
    live_training: z.boolean(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })).max(1000).default([]),
})

export const studentMyProgressBodySchema = z.object({
  gk_rating: dailyRatingSchema.nullable().optional(),
  dex_rating: dailyRatingSchema.nullable().optional(),
  hom_rating: dailyRatingSchema.nullable().optional(),
  drill_times: z.array(z.object({
    drill_id: z.string().uuid(),
    time_seconds: z.number().min(0).max(86400).nullable().optional(),
    score: z.number().min(0).max(100000).nullable().optional(),
  })).max(200).optional(),
})
