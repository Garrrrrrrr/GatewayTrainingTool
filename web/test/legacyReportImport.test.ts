import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { parseLegacyWorkbook } from '../src/lib/legacyReportImport'
import type { ClassTrainer } from '../src/types'

const trainers: ClassTrainer[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    class_id: '22222222-2222-4222-8222-222222222222',
    trainer_name: 'Karen Jones',
    trainer_email: 'karen.jones@example.com',
    role: 'primary',
    created_at: '2026-04-01T00:00:00.000Z',
  },
]

function worksheet(rows: string[][]) {
  return XLSX.utils.aoa_to_sheet(rows)
}

function workbookFile(name: string): File {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, worksheet([
    ['Legacy Daily Report'],
    ['Date: April 12, 2026'],
    ['Class C - 9:30-14:30'],
    ['Trainer(s): Karen Jones'],
    ['Group C'],
    [],
    ['Time', 'Activity', 'Drills/Handouts/Tests'],
    ['9:30-10:30', 'Game intro', 'Handout A'],
    ['10:30-11:00', 'Dexterity drill', 'Chip handling drill'],
    [],
    ['Trainee', 'Progress Comments'],
    ['Jane Smith', 'Strong game knowledge, needs more speed.'],
    ['Sam Lee', 'Good mechanics and asked useful questions.'],
  ]), 'Day Four')

  XLSX.utils.book_append_sheet(wb, worksheet([
    ['Legacy Daily Report'],
    ['Class C - 9:30-14:30'],
    ['Trainer(s): Karen Jones'],
    ['Group C'],
    [],
    ['Time', 'Activity', 'Drills/Handouts/Tests'],
    ['9:30-10:30', 'Game review', 'Test prep'],
    [],
    ['Trainee', 'Progress Comments'],
    ['Jane Smith', 'Improved on payouts.'],
  ]), 'Day Five')

  XLSX.utils.book_append_sheet(wb, worksheet([
    ['Date', 'Trainer', 'Hours', 'Paid', 'Live', 'Notes'],
    ['April 12, 2026', 'Karen Jones', '5', 'Yes', 'No', 'Imported payroll'],
  ]), 'Payroll Hours')

  XLSX.utils.book_append_sheet(wb, worksheet([
    ['This checklist should not become a daily report'],
    ['Item', 'Complete'],
  ]), 'CHECKLIST')

  XLSX.utils.book_append_sheet(wb, worksheet([
    ['Rating legend'],
    ['EE', 'Exceeds expectations'],
  ]), 'PROGRESS LEGEND')

  XLSX.utils.book_append_sheet(wb, worksheet([
    ['Time', 'Activity', 'Drills/Handouts/Tests'],
    ['9:30-10:30', 'Generic activity', 'Generic handout'],
  ]), 'Activity Only')

  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return {
    name,
    arrayBuffer: async () => bytes,
  } as File
}

test('parseLegacyWorkbook imports report sheets and routes excluded/payroll sheets', async () => {
  const result = await parseLegacyWorkbook({
    file: workbookFile('DR for Site A Ext. Disc 1-3 group C.xlsx'),
    trainers,
    defaultGame: 'Blackjack',
    classStartDate: '2026-04-09',
  })

  assert.equal(result.reports.length, 2)
  assert.deepEqual(result.excludedSheets.map(sheet => sheet.sheetName).sort(), ['Activity Only', 'CHECKLIST', 'PROGRESS LEGEND'])
  assert.match(result.excludedSheets.find(sheet => sheet.sheetName === 'Activity Only')?.reason ?? '', /meet and greet/)
  assert.equal(result.payrollRows.length, 1)
  assert.equal(result.payrollRows[0].log_date, '2026-04-12')
  assert.equal(result.payrollRows[0].trainer_id, trainers[0].id)
  assert.equal(result.payrollRows[0].hours, 5)
  assert.equal(result.payrollRows[0].paid, true)
  assert.equal(result.payrollRows[0].live_training, false)

  const dayFour = result.reports.find(report => report.sheetName === 'Day Four')
  assert.ok(dayFour)
  assert.equal(dayFour.body.report_date, '2026-04-12')
  assert.equal(dayFour.body.group_label, 'C')
  assert.equal(dayFour.body.game, 'Blackjack')
  assert.equal(dayFour.body.class_start_time, '09:30')
  assert.equal(dayFour.body.class_end_time, '14:30')
  assert.deepEqual(dayFour.body.trainer_ids, [trainers[0].id])
  assert.deepEqual(dayFour.studentNames, ['Jane Smith', 'Sam Lee'])
  assert.equal(dayFour.progressEntries.length, 2)
  assert.match(dayFour.progressEntries[0].progressText, /Strong game knowledge/)
  assert.equal(dayFour.body.timeline.length, 2)
  assert.equal(dayFour.body.timeline[1].category, 'Drill/Test')

  const dayFive = result.reports.find(report => report.sheetName === 'Day Five')
  assert.ok(dayFive)
  assert.equal(dayFive.body.report_date, '2026-04-13')
  assert.ok(dayFive.warnings.some(warning => warning.includes('Date inferred')))
  assert.equal(dayFive.progressEntries[0].studentName, 'Jane Smith')
})
