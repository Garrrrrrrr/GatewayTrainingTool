/**
 * server/src/routes/schedule.ts — Class schedule slot CRUD routes
 *
 * All routes require: authentication (via requireAuth in routes/index.ts)
 *                     + coordinator role (via requireCoordinator in routes/index.ts)
 *
 * Routes:
 *   GET    /schedule                              — List upcoming slots across ALL classes (global view)
 *   GET    /classes/:classId/schedule             — List all slots for a specific class
 *   POST   /classes/:classId/schedule             — Add a new schedule slot to a class
 *   PUT    /classes/:classId/schedule/:id         — Update a schedule slot
 *   DELETE /classes/:classId/schedule/:id         — Delete a schedule slot
 *
 * The global GET /schedule route is used by the dashboard to show upcoming training
 * sessions across all classes in one place. It includes a joined `classes` object
 * (id, name, site) for display purposes and is limited to the next 200 upcoming slots.
 *
 * Schedule slots can optionally reference a trainer (trainer_id) and a group label
 * to filter which group of trainees the slot applies to.
 *
 * IDOR protection: the classId URL parameter is matched in all write queries
 * so coordinators cannot modify slots belonging to a different class.
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { scheduleBatchBodySchema, scheduleBodySchema, validateBody } from '../lib/validation'

export const scheduleRouter = Router()

/** Columns that can be used in the sort_by query param. */
const SORTABLE_COLUMNS = new Set(['slot_date', 'start_time'])

function uniqueTrainerIds(trainer_ids: string[] | undefined, trainer_id?: string | null): string[] {
  const ids = trainer_ids && trainer_ids.length > 0 ? trainer_ids : trainer_id ? [trainer_id] : []
  return [...new Set(ids.filter(Boolean))]
}

/**
 * GET /schedule
 * Auth: coordinator
 *
 * Returns schedule slots across all classes with server-side filtering,
 * sorting, and pagination. The response includes a total count for pagination.
 *
 * Query params:
 *   province   — filter by class province (BC|AB|ON)
 *   site       — filter by class site (exact match)
 *   class_id   — filter to a single class
 *   archived   — 'true' to include archived classes, default 'false' (active only)
 *   game_type  — filter by class game_type
 *   date_from  — slots on or after this date (YYYY-MM-DD), defaults to today
 *   date_to    — slots on or before this date (YYYY-MM-DD)
 *   group_label — filter by group label
 *   search     — free-text search on class name and notes
 *   sort_by    — column to sort by (slot_date|start_time)
 *   sort_dir   — 'asc' or 'desc' (default 'asc')
 *   page       — 0-indexed page number (default 0)
 *   limit      — rows per page, 1-200 (default 50)
 */
scheduleRouter.get('/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      province,
      site,
      class_id,
      archived,
      game_type,
      date_from,
      date_to,
      group_label,
      search,
      sort_by,
      sort_dir,
      page: pageStr,
      limit: limitStr,
    } = req.query as Record<string, string | undefined>

    // Pagination
    const limit = Math.min(Math.max(Number(limitStr) || 50, 1), 200)
    const page = Math.max(Number(pageStr) || 0, 0)
    const offset = page * limit

    // Sorting — whitelist columns to prevent injection
    const sortColumn = SORTABLE_COLUMNS.has(sort_by ?? '') ? sort_by! : 'slot_date'
    const ascending = sort_dir !== 'desc'

    // Build query with inner join so filters on classes.* actually exclude rows
    const query = supabase
      .from('class_schedule_slots')
      .select('*, classes!inner(id, name, site, province, game_type, archived), class_trainers(id, trainer_name, role)', { count: 'exact' })

    // --- Filters on the joined classes table ---
    if (province) query.eq('classes.province', province)
    if (site) query.eq('classes.site', site)
    if (game_type) query.eq('classes.game_type', game_type)
    // When archived is 'true', include ALL classes (active + archived).
    // When absent or 'false', restrict to active classes only.
    if (archived !== 'true') query.eq('classes.archived', false)

    // --- Filters on the schedule table ---
    if (class_id) query.eq('class_id', class_id)
    if (group_label) query.eq('group_label', group_label)

    // Date range — default date_from to today if not provided
    const today = new Date().toISOString().split('T')[0]
    query.gte('slot_date', date_from || today)
    if (date_to) query.lte('slot_date', date_to)

    // Free-text search on schedule notes
    if (search) {
      const pattern = `%${search}%`
      query.or(`notes.ilike.${pattern}`)
    }

    // Sorting and pagination
    query.order(sortColumn, { ascending })
    if (sortColumn !== 'start_time') query.order('start_time', { ascending: true })
    query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw error

    // If searching by class name, do client-side filter since
    // Supabase .or() doesn't reliably support ilike on joined columns
    let filtered = data ?? []
    if (search) {
      const lower = search.toLowerCase()
      filtered = filtered.filter(
        (r: Record<string, unknown>) => {
          const classes = r.classes as { name: string } | null
          const notes = r.notes as string | null
          return (
            classes?.name?.toLowerCase().includes(lower) ||
            notes?.toLowerCase().includes(lower)
          )
        },
      )
    }

    res.json({
      data: filtered,
      total: count ?? 0,
      page,
      limit,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /classes/:classId/schedule
 * Auth: coordinator
 * Returns all schedule slots for a specific class (past and future), sorted by
 * date and start_time ascending. Used to display the full schedule in ClassScheduleSection.
 */
scheduleRouter.get('/classes/:classId/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from('class_schedule_slots')
      .select('*')
      .eq('class_id', req.params.classId)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true })
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /classes/:classId/schedule/batch
 * Auth: coordinator
 * Creates recurring schedule slots by generating dates from a date range + day-of-week mask.
 * Skips duplicates (same class_id + slot_date + start_time + end_time).
 */
scheduleRouter.post('/classes/:classId/schedule/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validateBody(scheduleBatchBodySchema, req, res)
    if (!body) return
    const { days_of_week, start_time, end_time, trainer_id, trainer_ids, group_label, date_from, date_to } = body

    const classId = req.params.classId as string
    const daySet = new Set<number>(days_of_week)
    const slotTrainerIds = uniqueTrainerIds(trainer_ids, trainer_id)
    const slots: { class_id: string; slot_date: string; start_time: string; end_time: string; trainer_id: string | null; trainer_ids: string[]; group_label: string | null }[] = []
    const cursor = new Date(date_from + 'T12:00:00')
    const endDate = new Date(date_to + 'T12:00:00')

    while (cursor <= endDate) {
      if (daySet.has(cursor.getDay())) {
        slots.push({
          class_id: classId,
          slot_date: cursor.toISOString().slice(0, 10),
          start_time,
          end_time,
          trainer_id: slotTrainerIds[0] ?? null,
          trainer_ids: slotTrainerIds,
          group_label: group_label || null,
        })
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    if (slots.length === 0) {
      res.status(200).json({ inserted: 0 })
      return
    }

    // Fetch existing to skip duplicates
    const { data: existing } = await supabase
      .from('class_schedule_slots')
      .select('slot_date, start_time, end_time')
      .eq('class_id', classId)
      .gte('slot_date', date_from)
      .lte('slot_date', date_to)

    const existingKeys = new Set(
      (existing ?? []).map((e: { slot_date: string; start_time: string; end_time: string }) =>
        `${e.slot_date}|${e.start_time}|${e.end_time}`,
      ),
    )

    const toInsert = slots.filter(s => !existingKeys.has(`${s.slot_date}|${s.start_time}|${s.end_time}`))

    if (toInsert.length === 0) {
      res.status(200).json({ inserted: 0 })
      return
    }

    const { data, error } = await supabase.from('class_schedule_slots').insert(toInsert).select()
    if (error) throw error
    for (const row of data ?? []) {
      await logAudit({
        userId: req.userId!,
        action: 'CREATE',
        tableName: 'class_schedule_slots',
        recordId: row.id,
        after: row as Record<string, unknown>,
        metadata: { class_id: classId, batch: true, slot_date: row.slot_date },
        ipAddress: req.ip,
      })
    }

    res.status(201).json({ inserted: toInsert.length })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /classes/:classId/schedule
 * Auth: coordinator
 * Creates a new schedule slot for the class. `trainer_id`, `notes`, and
 * `group_label` are optional. Returns 201 with the created slot record.
 */
scheduleRouter.post('/classes/:classId/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validateBody(scheduleBodySchema, req, res)
    if (!body) return
    const { slot_date, start_time, end_time, notes, trainer_id, trainer_ids, group_label } = body
    const slotTrainerIds = uniqueTrainerIds(trainer_ids, trainer_id)
    const { data, error } = await supabase
      .from('class_schedule_slots')
      .insert({
        class_id: req.params.classId,
        slot_date,
        start_time,
        end_time,
        notes: notes ?? null,
        trainer_id: slotTrainerIds[0] ?? null,
        trainer_ids: slotTrainerIds,
        group_label: group_label ?? null,
      })
      .select()
      .single()
    if (error) throw error
    await logAudit({
      userId: req.userId!,
      action: 'CREATE',
      tableName: 'class_schedule_slots',
      recordId: (data as { id: string }).id,
      after: data as Record<string, unknown>,
      metadata: { class_id: req.params.classId, slot_date },
      ipAddress: req.ip,
    })
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

/**
 * PUT /classes/:classId/schedule/:id
 * Auth: coordinator
 * Updates a schedule slot's fields. Both the slot UUID and classId are matched in
 * the query (IDOR protection). Returns 404 if either doesn't match.
 * Supabase error code PGRST116 = "no rows found".
 */
scheduleRouter.put('/classes/:classId/schedule/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validateBody(scheduleBodySchema, req, res)
    if (!body) return
    const { slot_date, start_time, end_time, notes, trainer_id, trainer_ids, group_label } = body
    const slotTrainerIds = uniqueTrainerIds(trainer_ids, trainer_id)
    const { data: before, error: beforeError } = await supabase
      .from('class_schedule_slots')
      .select('*')
      .eq('id', req.params.id)
      .eq('class_id', req.params.classId)
      .single()
    if (beforeError || !before) {
      res.status(404).json({ error: 'Schedule slot not found' })
      return
    }
    const { data, error } = await supabase
      .from('class_schedule_slots')
      .update({
        slot_date,
        start_time,
        end_time,
        notes: notes ?? null,
        trainer_id: slotTrainerIds[0] ?? null,
        trainer_ids: slotTrainerIds,
        group_label: group_label ?? null,
      })
      .eq('id', req.params.id)
      .eq('class_id', req.params.classId)
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: 'Schedule slot not found' })
        return
      }
      throw error
    }
    await logAudit({
      userId: req.userId!,
      action: 'UPDATE',
      tableName: 'class_schedule_slots',
      recordId: req.params.id as string,
      before: before as Record<string, unknown>,
      after: data as Record<string, unknown>,
      metadata: { class_id: req.params.classId, slot_date },
      ipAddress: req.ip,
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /classes/:classId/schedule/:id
 * Auth: coordinator
 * Permanently deletes a schedule slot. Pre-fetches using both id and class_id to
 * return a proper 404 (Supabase delete doesn't error on missing rows). The
 * classId match also prevents cross-class deletion (IDOR protection).
 * Returns 204 No Content on success.
 */
scheduleRouter.delete('/classes/:classId/schedule/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('class_schedule_slots')
      .select('*')
      .eq('id', req.params.id)
      .eq('class_id', req.params.classId)
      .single()
    if (fetchError || !existing) {
      res.status(404).json({ error: 'Schedule slot not found' })
      return
    }
    await logAudit({
      userId: req.userId!,
      action: 'DELETE',
      tableName: 'class_schedule_slots',
      recordId: req.params.id as string,
      before: existing as Record<string, unknown>,
      metadata: { class_id: req.params.classId },
      ipAddress: req.ip,
    })
    const { error } = await supabase.from('class_schedule_slots').delete().eq('id', req.params.id)
    if (error) throw error
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
