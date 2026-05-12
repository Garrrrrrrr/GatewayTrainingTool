import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCopiedReportDraft } from '../src/lib/reportDrafts'
import type { ReportWithNested } from '../src/lib/apiClient'

const sourceReport: ReportWithNested = {
  id: 'report-1',
  class_id: 'class-1',
  report_date: '2026-05-11',
  group_label: 'A',
  game: 'Blackjack',
  session_label: 'Day 2 AM',
  class_start_time: '09:00',
  class_end_time: '13:00',
  mg_confirmed: 12,
  mg_attended: 11,
  current_trainees: 10,
  licenses_received: 9,
  override_hours_to_date: 20,
  override_paid_hours_total: 18,
  override_live_hours_total: 2,
  coordinator_notes: 'Needs coordinator review',
  created_at: '2026-05-11T15:00:00.000Z',
  trainer_ids: ['trainer-1', 'trainer-2'],
  timeline: [{
    id: 'timeline-1',
    report_id: 'report-1',
    start_time: '09:00',
    end_time: '10:00',
    activity: 'Opening review',
    homework_handouts_tests: 'Handout A',
    category: 'Lecture',
    position: 0,
    created_at: '2026-05-11T15:00:00.000Z',
  }],
  progress: [{
    id: 'progress-1',
    report_id: 'report-1',
    enrollment_id: 'enrollment-1',
    progress_text: 'Strong mechanics',
    gk_rating: 'ME',
    dex_rating: 'EE',
    hom_rating: 'ME',
    coming_back_next_day: true,
    homework_completed: true,
    attendance: true,
    late: false,
    created_at: '2026-05-11T15:00:00.000Z',
  }],
  drill_times: [{
    id: 'drill-time-1',
    report_id: 'report-1',
    enrollment_id: 'enrollment-1',
    drill_id: 'drill-1',
    time_seconds: 42,
    score: null,
    created_at: '2026-05-11T15:00:00.000Z',
  }],
}

test('buildCopiedReportDraft copies reusable report structure only', () => {
  const draft = buildCopiedReportDraft(sourceReport, {
    reportDate: '2026-05-12',
    groupLabel: 'B',
    classStartTime: '10:00',
    classEndTime: '14:00',
  })

  assert.equal(draft.report_date, '2026-05-12')
  assert.equal(draft.group_label, 'B')
  assert.equal(draft.game, 'Blackjack')
  assert.equal(draft.session_label, 'Day 2 AM')
  assert.equal(draft.class_start_time, '10:00')
  assert.equal(draft.class_end_time, '14:00')
  assert.deepEqual(draft.trainer_ids, ['trainer-1', 'trainer-2'])
  assert.deepEqual(draft.timeline, [{
    start_time: '09:00',
    end_time: '10:00',
    activity: 'Opening review',
    homework_handouts_tests: 'Handout A',
    category: 'Lecture',
  }])
  assert.deepEqual(draft.progress, [])
  assert.deepEqual(draft.drill_times, [])
  assert.equal('coordinator_notes' in draft, false)
  assert.equal('mg_confirmed' in draft, false)
})

