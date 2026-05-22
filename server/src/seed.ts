/**
 * server/src/seed.ts — Database seed script
 *
 * Populates the database with realistic test data for development:
 *   - 3 coordinator profiles (existing auth users needed)
 *   - 6 trainer profiles
 *   - 12 student profiles
 *   - 4 classes across different provinces/sites/game types
 *   - Trainers, enrollments, schedule slots, drills, reports, and logged hours for each class
 *
 * Usage:
 *   npx tsx server/src/seed.ts
 *   npx tsx server/src/seed.ts --reset
 *
 * The script uses the Supabase service role client (bypasses RLS).
 * It creates or reuses Supabase Auth users, then upserts matching profiles.
 * Seed users share SEED_USER_PASSWORD, defaulting to TrainingTool123!.
 *
 * The script is idempotent-ish by default: it checks for existing classes by name
 * and skips if they already exist. Run it with --reset to delete app data first.
 */

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in server/.env')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const shouldReset = process.argv.includes('--reset')
const seedUserPassword = process.env.SEED_USER_PASSWORD ?? 'TrainingTool123!'

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomDate(start: Date, end: Date): string {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
  return d.toISOString().split('T')[0]
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── Seed data ──────────────────────────────────────────────────────────────

type SeedProfile = {
  id?: string
  email: string
  full_name: string
  role: 'coordinator' | 'trainer' | 'trainee'
  province: 'BC' | 'AB' | 'ON' | null
}

const coordinatorProfiles: SeedProfile[] = [
  { email: 'coordinator@trainingtool.local', full_name: 'Casey Coordinator', role: 'coordinator', province: 'BC' },
]

const trainerProfiles: SeedProfile[] = [
  { email: 'sarah.chen@trainingtool.local', full_name: 'Sarah Chen', role: 'trainer', province: 'BC' },
  { email: 'mike.johnson@trainingtool.local', full_name: 'Mike Johnson', role: 'trainer', province: 'BC' },
  { email: 'lisa.wong@trainingtool.local', full_name: 'Lisa Wong', role: 'trainer', province: 'AB' },
  { email: 'james.patel@trainingtool.local', full_name: 'James Patel', role: 'trainer', province: 'AB' },
  { email: 'maria.garcia@trainingtool.local', full_name: 'Maria Garcia', role: 'trainer', province: 'ON' },
  { email: 'david.kim@trainingtool.local', full_name: 'David Kim', role: 'trainer', province: 'ON' },
]

const studentNames = [
  'Alex Thompson', 'Jordan Rivera', 'Casey Mitchell', 'Morgan Davis',
  'Taylor Brooks', 'Riley Campbell', 'Jamie Foster', 'Quinn Sullivan',
  'Avery Hughes', 'Drew Patterson', 'Skyler Reed', 'Peyton Clarke',
  'Sam Nguyen', 'Ash Kowalski', 'River Simmons', 'Blake Harrison',
]

const studentProfiles: SeedProfile[] = studentNames.map((name, index) => ({
  email: name.toLowerCase().replace(/ /g, '.') + '@example.com',
  full_name: name,
  role: 'trainee',
  province: (['BC', 'AB', 'ON'] as const)[index % 3],
}))

const classes = [
  {
    name: 'BJ MAR 01',
    site: 'Training Site West',
    province: 'BC' as const,
    game_type: 'Blackjack',
    start_date: '2026-03-02',
    end_date: '2026-04-10',
    description: 'Blackjack dealer training — March cohort at Training Site West Casino',
  },
  {
    name: 'PG MAR 01',
    site: 'Training Site West',
    province: 'BC' as const,
    game_type: 'Poker',
    start_date: '2026-03-09',
    end_date: '2026-04-17',
    description: 'Poker dealer training — March cohort',
  },
  {
    name: 'BJ MAR AB',
    site: 'Training Site North',
    province: 'AB' as const,
    game_type: 'Blackjack',
    start_date: '2026-03-05',
    end_date: '2026-04-13',
    description: 'Blackjack training at Training Site North',
  },
  {
    name: 'ROU APR 01',
    site: 'Playtime',
    province: 'ON' as const,
    game_type: 'Roulette',
    start_date: '2026-04-01',
    end_date: '2026-05-08',
    description: 'Roulette dealer training — April session',
  },
  {
    name: 'BJ MAY 01',
    site: 'Training Site West',
    province: 'BC' as const,
    game_type: 'Blackjack',
    start_date: '2026-05-18',
    end_date: '2026-06-26',
    description: 'Current Blackjack dealer training cohort with upcoming scheduled sessions',
  },
]

const drillTemplates: Record<string, { name: string; type: 'drill' | 'test'; par_time_seconds: number | null; target_score: number | null }[]> = {
  Blackjack: [
    { name: 'Card Pickup', type: 'drill', par_time_seconds: 45, target_score: null },
    { name: 'Chip Cut', type: 'drill', par_time_seconds: 30, target_score: null },
    { name: 'Payout Speed', type: 'drill', par_time_seconds: 60, target_score: null },
    { name: 'Game Knowledge Test', type: 'test', par_time_seconds: null, target_score: 80 },
    { name: 'Procedure Test', type: 'test', par_time_seconds: null, target_score: 75 },
  ],
  Poker: [
    { name: 'Shuffle & Deal', type: 'drill', par_time_seconds: 90, target_score: null },
    { name: 'Pot Calculation', type: 'drill', par_time_seconds: 20, target_score: null },
    { name: 'Chip Push', type: 'drill', par_time_seconds: 15, target_score: null },
    { name: 'Rules & Procedures Test', type: 'test', par_time_seconds: null, target_score: 85 },
  ],
  Roulette: [
    { name: 'Wheel Spin', type: 'drill', par_time_seconds: 10, target_score: null },
    { name: 'Marker Place', type: 'drill', par_time_seconds: 5, target_score: null },
    { name: 'Payout Calculation', type: 'drill', par_time_seconds: 40, target_score: null },
    { name: 'Clearing Speed', type: 'drill', par_time_seconds: 50, target_score: null },
    { name: 'Game Knowledge Test', type: 'test', par_time_seconds: null, target_score: 80 },
  ],
}

const timelineTemplates = [
  { start_time: '09:00', end_time: '09:30', activity: 'Morning briefing & review', category: 'Lecture' },
  { start_time: '09:30', end_time: '10:30', activity: 'Dexterity drills', category: 'Dexterity' },
  { start_time: '10:30', end_time: '10:45', activity: 'Break', category: null },
  { start_time: '10:45', end_time: '12:00', activity: 'Game simulation practice', category: 'Game simulation' },
  { start_time: '12:00', end_time: '12:30', activity: 'Lunch', category: null },
  { start_time: '12:30', end_time: '14:00', activity: 'Live floor observation', category: 'Live floor' },
  { start_time: '14:00', end_time: '15:00', activity: 'Homework review & wrap-up', category: 'Lecture' },
]

// ─── Main seed function ─────────────────────────────────────────────────────

async function findAuthUserByEmail(email: string) {
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`)
    }

    const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (user) return user
    if (data.users.length < perPage) return null
    page++
  }
}

async function ensureAuthUser(profile: SeedProfile) {
  const existing = await findAuthUserByEmail(profile.email)
  if (existing) return existing.id

  const { data, error } = await supabase.auth.admin.createUser({
    email: profile.email,
    password: seedUserPassword,
    email_confirm: true,
    user_metadata: { full_name: profile.full_name },
  })

  if (error || !data.user) {
    throw new Error(`Failed to create auth user ${profile.email}: ${error?.message ?? 'no user returned'}`)
  }

  return data.user.id
}

async function ensureProfile(profile: SeedProfile) {
  const authUserId = await ensureAuthUser(profile)
  const [firstName, ...lastNameParts] = profile.full_name.split(' ')
  profile.id = authUserId

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: authUserId,
      email: profile.email,
      full_name: profile.full_name,
      first_name: firstName,
      last_name: lastNameParts.join(' ') || null,
      role: profile.role,
      province: profile.province,
      role_selected: true,
    }, { onConflict: 'id' })

  if (error) {
    throw new Error(`Failed to upsert profile ${profile.email}: ${error.message}`)
  }

  console.log(`  Seeded profile: ${profile.full_name} (${profile.email}, ${profile.role})`)
}

async function clearTable(table: string, deleteColumn = 'id') {
  const { count, error } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .not(deleteColumn, 'is', null)

  if (error) {
    throw new Error(`Failed to clear ${table}: ${error.message}`)
  }

  console.log(`  Cleared ${table}${typeof count === 'number' ? ` (${count} rows)` : ''}`)
}

async function resetDatabase() {
  console.log('Resetting database...\n')

  const tables: Array<{ name: string; deleteColumn?: string }> = [
    { name: 'class_daily_report_drill_times' },
    { name: 'class_daily_report_trainee_progress' },
    { name: 'class_daily_report_timeline_items' },
    { name: 'class_daily_report_trainers', deleteColumn: 'report_id' },
    { name: 'class_logged_hours' },
    { name: 'class_schedule_slots' },
    { name: 'class_documents' },
    { name: 'legacy_import_batches' },
    { name: 'class_daily_reports' },
    { name: 'class_drills' },
    { name: 'class_trainers' },
    { name: 'class_enrollments' },
    { name: 'classes' },
    { name: 'app_feedback' },
    { name: 'audit_logs' },
    { name: 'role_requests' },
    { name: 'profiles' },
  ]

  for (const table of tables) {
    await clearTable(table.name, table.deleteColumn)
  }

  console.log('\nDatabase reset complete.\n')
}

async function seed() {
  if (shouldReset) {
    await resetDatabase()
  }

  console.log('Starting seed...\n')

  // 1. Upsert auth-backed profiles for login and self-service flows.
  for (const p of [...coordinatorProfiles, ...trainerProfiles, ...studentProfiles]) {
    await ensureProfile(p)
  }

  // 2. Create classes
  for (const cls of classes) {
    // Check if class already exists
    const { data: existingClass } = await supabase
      .from('classes')
      .select('id')
      .eq('name', cls.name)
      .limit(1)
    if (existingClass && existingClass.length > 0) {
      console.log(`\nClass "${cls.name}" already exists — skipping`)
      continue
    }

    // Insert class
    const { data: classRow, error: classError } = await supabase
      .from('classes')
      .insert({
        name: cls.name,
        site: cls.site,
        province: cls.province,
        game_type: cls.game_type,
        start_date: cls.start_date,
        end_date: cls.end_date,
        description: cls.description,
      })
      .select()
      .single()
    if (classError) {
      console.error(`Failed to create class ${cls.name}:`, classError.message)
      continue
    }
    const classId = classRow.id
    console.log(`\nCreated class: ${cls.name} (${classId})`)

    // 3. Assign trainers (2 per class based on province)
    const provinceTrainers = trainerProfiles.filter(t => t.province === cls.province)
    const assignedTrainers: { id: string; trainer_name: string; trainer_email: string; role: string }[] = []
    for (let i = 0; i < Math.min(2, provinceTrainers.length); i++) {
      const t = provinceTrainers[i]
      const role = i === 0 ? 'primary' : 'assistant'
      const { data: trainerRow, error: trainerError } = await supabase
        .from('class_trainers')
        .insert({
          class_id: classId,
          trainer_name: t.full_name,
          trainer_email: t.email,
          role,
        })
        .select()
        .single()
      if (trainerError) {
        console.error(`  Failed to assign trainer ${t.full_name}:`, trainerError.message)
      } else {
        assignedTrainers.push(trainerRow as typeof assignedTrainers[number])
        console.log(`  Assigned trainer: ${t.full_name} (${role})`)
      }
    }

    // 4. Enroll students (4 per class)
    const shuffled = [...studentNames].sort(() => Math.random() - 0.5)
    const classStudents = shuffled.slice(0, 4)
    const enrollmentIds: string[] = []
    for (let i = 0; i < classStudents.length; i++) {
      const name = classStudents[i]
      const email = name.toLowerCase().replace(/ /g, '.') + '@example.com'
      const group = i < 2 ? 'A' : 'B'
      const { data: enrollRow, error: enrollError } = await supabase
        .from('class_enrollments')
        .insert({
          class_id: classId,
          student_name: name,
          student_email: email,
          status: 'enrolled',
          group_label: group,
        })
        .select()
        .single()
      if (enrollError) {
        console.error(`  Failed to enroll ${name}:`, enrollError.message)
      } else {
        enrollmentIds.push((enrollRow as { id: string }).id)
        console.log(`  Enrolled student: ${name} (Group ${group})`)
      }
    }

    // 5. Create schedule slots (weekdays for 3 weeks from start_date)
    const startDate = new Date(cls.start_date)
    let slotCount = 0
    for (let week = 0; week < 3; week++) {
      for (let day = 0; day < 5; day++) {
        const d = new Date(startDate)
        d.setDate(d.getDate() + week * 7 + day)
        // skip weekends
        if (d.getDay() === 0 || d.getDay() === 6) continue
        const slotDate = d.toISOString().split('T')[0]
        const trainerId = assignedTrainers.length > 0 ? assignedTrainers[slotCount % assignedTrainers.length].id : null
        const { error: slotError } = await supabase
          .from('class_schedule_slots')
          .insert({
            class_id: classId,
            slot_date: slotDate,
            start_time: '09:00',
            end_time: '15:00',
            notes: `Day ${slotCount + 1} training session`,
            trainer_id: trainerId,
            group_label: slotCount % 2 === 0 ? 'A' : 'B',
          })
        if (slotError) {
          console.error(`  Failed to create slot for ${slotDate}:`, slotError.message)
        } else {
          slotCount++
        }
      }
    }
    console.log(`  Created ${slotCount} schedule slots`)

    // 6. Create drills
    const gameType = cls.game_type ?? 'Blackjack'
    const drills = drillTemplates[gameType] ?? drillTemplates['Blackjack']
    const drillIds: string[] = []
    for (const drill of drills) {
      const { data: drillRow, error: drillError } = await supabase
        .from('class_drills')
        .insert({
          class_id: classId,
          name: drill.name,
          type: drill.type,
          par_time_seconds: drill.par_time_seconds,
          target_score: drill.target_score,
          active: true,
        })
        .select()
        .single()
      if (drillError) {
        console.error(`  Failed to create drill ${drill.name}:`, drillError.message)
      } else {
        drillIds.push((drillRow as { id: string }).id)
      }
    }
    console.log(`  Created ${drillIds.length} drills`)

    // 7. Create daily reports (for past class days only)
    const today = new Date()
    const reportDates: string[] = []
    for (let day = 0; day < 15; day++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + day)
      if (d.getDay() === 0 || d.getDay() === 6) continue
      if (d > today) break
      reportDates.push(d.toISOString().split('T')[0])
    }

    for (let ri = 0; ri < reportDates.length; ri++) {
      const reportDate = reportDates[ri]
      const { data: reportRow, error: reportError } = await supabase
        .from('class_daily_reports')
        .insert({
          class_id: classId,
          report_date: reportDate,
          group_label: ri % 2 === 0 ? 'A' : 'B',
          game: cls.game_type,
          session_label: `Day ${ri + 1}`,
          class_start_time: '09:00',
          class_end_time: '15:00',
          current_trainees: classStudents.length,
        })
        .select()
        .single()

      if (reportError) {
        console.error(`  Failed to create report for ${reportDate}:`, reportError.message)
        continue
      }

      const reportId = (reportRow as { id: string }).id

      // Link trainers to report
      if (assignedTrainers.length > 0) {
        await supabase
          .from('class_daily_report_trainers')
          .insert(assignedTrainers.map(t => ({ report_id: reportId, trainer_id: t.id })))
      }

      // Add timeline items
      await supabase.from('class_daily_report_timeline_items').insert(
        timelineTemplates.map((item, idx) => ({
          report_id: reportId,
          start_time: item.start_time,
          end_time: item.end_time,
          activity: item.activity,
          category: item.category,
          homework_handouts_tests: null,
          position: idx,
        })),
      )

      // Add trainee progress for each enrolled student
      const ratings: ('EE' | 'ME' | 'AD' | 'NI')[] = ['EE', 'ME', 'AD', 'NI']
      if (enrollmentIds.length > 0) {
        await supabase.from('class_daily_report_trainee_progress').insert(
          enrollmentIds.map(eid => ({
            report_id: reportId,
            enrollment_id: eid,
            progress_text: randomItem(['Good progress', 'Needs more practice', 'Improving steadily', 'Excellent work today']),
            gk_rating: randomItem(ratings),
            dex_rating: randomItem(ratings),
            hom_rating: randomItem(ratings),
            coming_back_next_day: true,
            homework_completed: Math.random() > 0.2,
          })),
        )
      }

      // Add drill times for each student for each drill
      if (enrollmentIds.length > 0 && drillIds.length > 0) {
        const drillTimeRows = []
        for (const eid of enrollmentIds) {
          for (const did of drillIds) {
            drillTimeRows.push({
              report_id: reportId,
              enrollment_id: eid,
              drill_id: did,
              time_seconds: Math.floor(Math.random() * 60) + 10,
              score: Math.floor(Math.random() * 30) + 70,
            })
          }
        }
        const { error: dtError } = await supabase.from('class_daily_report_drill_times').insert(drillTimeRows)
        if (dtError) console.error(`  Failed to insert drill times for ${reportDate}:`, dtError.message)
      }
    }
    console.log(`  Created ${reportDates.length} daily reports with timeline, progress, and drill times`)

    // 8. Log hours for trainers and students
    let hoursCount = 0
    for (const reportDate of reportDates) {
      // Trainer hours
      for (const t of assignedTrainers) {
        const { error } = await supabase.from('class_logged_hours').insert({
          class_id: classId,
          log_date: reportDate,
          person_type: 'trainer',
          trainer_id: t.id,
          enrollment_id: null,
          hours: 6,
          paid: true,
          live_training: Math.random() > 0.5,
          notes: null,
        })
        if (!error) hoursCount++
      }

      // Student hours
      for (const eid of enrollmentIds) {
        const { error } = await supabase.from('class_logged_hours').insert({
          class_id: classId,
          log_date: reportDate,
          person_type: 'student',
          trainer_id: null,
          enrollment_id: eid,
          hours: 6,
          paid: true,
          live_training: Math.random() > 0.5,
          notes: null,
        })
        if (!error) hoursCount++
      }
    }
    console.log(`  Logged ${hoursCount} hour records`)
  }

  console.log('\nSeed complete!')
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
