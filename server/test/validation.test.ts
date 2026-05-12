import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dateSchema,
  enrollmentBodySchema,
  hoursBodySchema,
  reportBodySchema,
} from '../src/lib/validation'

test('enrollment validation accepts current production statuses only', () => {
  assert.equal(enrollmentBodySchema.safeParse({
    student_name: 'Jane Doe',
    student_email: 'jane@example.com',
    status: 'enrolled',
  }).success, true)

  assert.equal(enrollmentBodySchema.safeParse({
    student_name: 'Jane Doe',
    student_email: 'jane@example.com',
    status: 'waitlist',
  }).success, false)
})

test('hours validation protects payroll quantities', () => {
  assert.equal(hoursBodySchema.safeParse({
    log_date: '2026-04-25',
    person_type: 'trainer',
    trainer_id: '00000000-0000-4000-8000-000000000001',
    hours: 8,
  }).success, true)

  assert.equal(hoursBodySchema.safeParse({
    log_date: '2026-04-25',
    person_type: 'trainer',
    hours: 25,
  }).success, false)
})

test('report validation rejects invalid ratings and date formats', () => {
  assert.equal(reportBodySchema.safeParse({
    report_date: '2026-04-25',
    trainer_ids: [],
    timeline: [],
    progress: [{
      enrollment_id: '00000000-0000-4000-8000-000000000002',
      gk_rating: 'ME',
    }],
    drill_times: [],
  }).success, true)

  assert.equal(reportBodySchema.safeParse({
    report_date: '04/25/2026',
    progress: [{
      enrollment_id: '00000000-0000-4000-8000-000000000002',
      gk_rating: 'PASS',
    }],
  }).success, false)
})

test('date validation accepts ISO dates only', () => {
  assert.equal(dateSchema.safeParse('2026-05-12').success, true)
  assert.equal(dateSchema.safeParse('05/12/2026').success, false)
})
