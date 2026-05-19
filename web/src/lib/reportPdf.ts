/**
 * lib/reportPdf.ts — Daily report HTML generator
 *
 * Produces a self-contained HTML string that represents a daily training report.
 * The output is:
 *   - Rendered inside an <iframe> in the ReportPreviewModal for in-browser preview
 *   - Used as the source markup for the client-side PDF download
 *   - Printable using the browser's native print dialog (window.print())
 *
 * There is no server-side PDF rendering — preview, print, and PDF download all
 * happen in the browser, which avoids Puppeteer/headless Chrome.
 *
 * The HTML includes inline <style> with @media print rules so the output
 * looks clean when printed or saved to PDF.
 *
 * All user-supplied strings are HTML-escaped via `esc()` to prevent XSS in the preview.
 */

import type { ReportWithNested } from './apiClient'
import type { ClassTrainer, ClassEnrollment, ClassDrill } from '../types'

/** Arguments passed to `generateReportHtml()`. */
export interface ReportPdfArgs {
  report: ReportWithNested
  className: string
  trainers: ClassTrainer[]   // Full trainer list for the class (used to resolve trainer names from IDs)
  enrollments: ClassEnrollment[]  // Enrolled students (used to resolve student names from enrollment IDs)
  drills: ClassDrill[]       // Active drills/tests for the class (used for drill times page)
}

/**
 * Escapes a string for safe insertion into HTML content.
 * Returns an em-dash ('—') for null/undefined values, which reads
 * more naturally than "null" or "undefined" in a formatted report.
 */
function esc(v: string | null | undefined): string {
  if (v == null) return '—'
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Generates a complete, standalone HTML document for a daily report.
 *
 * The trainer_ids array in the report contains `class_trainers.id` values;
 * this function resolves them to display names by looking up in the `trainers` array.
 * If a trainer ID cannot be resolved (e.g. was removed after the report was saved),
 * the raw ID is used as a fallback.
 *
 * Similarly, progress rows reference `class_enrollments.id`; these are resolved
 * to student names via the `enrollments` array.
 */
export function generateReportHtml({ report, className, trainers, enrollments, drills }: ReportPdfArgs): string {
  // Resolve trainer IDs to display names; fall back to ID if not found
  const trainerNames = report.trainer_ids.length
    ? report.trainer_ids.map(id => trainers.find(t => t.id === id)?.trainer_name ?? id).map(esc).join(', ')
    : '—'

  const fmt = esc
  // Format nullable numbers as strings; show em-dash if null/undefined
  const fmtNum = (v: number | null | undefined) => (v != null ? String(v) : '—')

  const timelineRows = report.timeline.length
    ? report.timeline
        .map(
          item => `
        <tr>
          <td>${fmt(item.start_time)}${item.start_time && item.end_time ? ' – ' : ''}${item.end_time ?? ''}</td>
          <td>${fmt(item.activity)}</td>
          <td>${fmt(item.homework_handouts_tests)}</td>
          <td>${fmt(item.category)}</td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="4" class="empty">No timeline entries</td></tr>'

  const progressRows = report.progress.length
    ? report.progress
        .map(row => {
          const enr = enrollments.find(e => e.id === row.enrollment_id)
          const attendanceLabel = !row.attendance ? 'Absent' : row.late ? 'Late' : '✓'
          return `
        <tr>
          <td>${enr?.student_name ?? 'Unknown'}</td>
          <td class="center">${attendanceLabel}</td>
          <td class="center">${fmt(row.gk_rating)}</td>
          <td class="center">${fmt(row.dex_rating)}</td>
          <td class="center">${fmt(row.hom_rating)}</td>
          <td class="center">${row.coming_back_next_day ? '✓' : '✗'}</td>
          <td class="center">${row.homework_completed ? '✓' : '✗'}</td>
          <td>${fmt(row.progress_text)}</td>
        </tr>`
        })
        .join('')
    : '<tr><td colspan="8" class="empty">No trainee progress entries</td></tr>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Daily Report – ${esc(className)} – ${esc(report.report_date)}</title>
  <style>
    .report-export-root, .report-export-root *::before, .report-export-root *::after, .report-export-root * { box-sizing: border-box; margin: 0; padding: 0; }
    .report-export-root { width: 8.5in; min-height: 11in; margin: 0 auto; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report-document { width: 100%; min-height: 11in; padding: 32px 40px; background: #fff; overflow: visible; }
    .report-document h1 { font-size: 18px; font-weight: 700; color: #081C30; }
    .report-document h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #134270; margin-bottom: 6px; margin-top: 20px; border-bottom: 1.5px solid #134270; padding-bottom: 3px; }
    .report-document .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #081C30; padding-bottom: 12px; margin-bottom: 16px; }
    .report-document .header-left .subtitle { font-size: 12px; color: #475569; margin-top: 2px; }
    .report-document .header-right { text-align: right; font-size: 11px; color: #64748b; }
    .report-document .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 4px; }
    .report-document .meta-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; }
    .report-document .meta-item .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.07em; color: #94a3b8; margin-bottom: 2px; }
    .report-document .meta-item .value { font-size: 12px; font-weight: 600; color: #0f172a; }
    .report-document .trainers { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 6px 10px; margin-bottom: 4px; }
    .report-document .trainers .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.07em; color: #3b82f6; font-weight: 600; }
    .report-document .trainers .value { font-size: 11px; color: #1e3a5f; margin-top: 2px; }
    .report-document table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 4px; }
    .report-document thead tr { background: #134270; color: #fff; }
    .report-document thead th { padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; overflow-wrap: anywhere; }
    .report-document tbody tr:nth-child(even) { background: #f8fafc; }
    .report-document tbody td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; overflow-wrap: anywhere; }
    .report-document td.center { text-align: center; }
    .report-document td.empty { text-align: center; color: #94a3b8; padding: 12px; font-style: italic; }
    .report-document footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
    .report-document .page-break { break-before: page; page-break-before: always; margin-top: 32px; }
    .report-document .drill-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #081C30; padding-bottom: 8px; margin-bottom: 16px; }
    .report-document .drill-header h1 { font-size: 16px; }
    .report-document .drill-header .subtitle { font-size: 11px; color: #475569; margin-top: 2px; }
    .report-document .par-met { background: #dcfce7; }
    .report-document .par-missed { background: #fef9c3; }
    @media screen and (max-width: 860px) {
      .report-export-root { margin: 0; }
    }
    @media print {
      body { background: #fff !important; padding: 0 !important; }
      .report-export-root { width: auto; min-height: 0; margin: 0; }
      .report-document { width: auto; min-height: 0; margin: 0; padding: 16px 20px; }
      @page { margin: 12mm 14mm; }
      .report-document .page-break { page-break-before: always; margin-top: 0; }
    }
  </style>
</head>
<body style="margin:0;background:#e2e8f0;padding:24px 0;">
  <div class="report-export-root">
  <main class="report-document">
  <div class="header">
    <div class="header-left">
      <h1>${esc(className)} — Daily Report</h1>
      <div class="subtitle">${esc(report.report_date)}${report.group_label ? ' · Group ' + esc(report.group_label) : ''}${report.session_label ? ' · ' + esc(report.session_label) : ''}</div>
    </div>
    <div class="header-right">
      <div>Generated ${new Date().toLocaleDateString('en-CA')}</div>
      <div>Gateway Casinos Training Tool</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><div class="label">Game</div><div class="value">${fmt(report.game)}</div></div>
    <div class="meta-item"><div class="label">Class time</div><div class="value">${report.class_start_time ?? ''}${report.class_start_time && report.class_end_time ? ' – ' : ''}${report.class_end_time ?? ''}${!report.class_start_time && !report.class_end_time ? '—' : ''}</div></div>
    <div class="meta-item"><div class="label">M&amp;G confirmed / attended</div><div class="value">${fmtNum(report.mg_confirmed)} / ${fmtNum(report.mg_attended)}</div></div>
    <div class="meta-item"><div class="label">Current trainees</div><div class="value">${fmtNum(report.current_trainees)}</div></div>
    <div class="meta-item"><div class="label">Licenses received</div><div class="value">${fmtNum(report.licenses_received)}</div></div>
    <div class="meta-item"><div class="label">Hours to date</div><div class="value">${report.override_hours_to_date != null ? report.override_hours_to_date : '—'}</div></div>
    <div class="meta-item"><div class="label">Total paid hours</div><div class="value">${report.override_paid_hours_total != null ? report.override_paid_hours_total : '—'}</div></div>
    <div class="meta-item"><div class="label">Live training hours</div><div class="value">${report.override_live_hours_total != null ? report.override_live_hours_total : '—'}</div></div>
  </div>

  <div class="trainers">
    <div class="label">Trainers</div>
    <div class="value">${trainerNames}</div>
  </div>

  <h2>Training Timeline</h2>
  <table>
    <thead>
      <tr>
        <th style="width:14%">Time</th>
        <th style="width:30%">Activity</th>
        <th style="width:30%">Homework / Handouts / Tests</th>
        <th style="width:26%">Category</th>
      </tr>
    </thead>
    <tbody>${timelineRows}</tbody>
  </table>

  <h2>Trainee Progress</h2>
  <table>
    <thead>
      <tr>
        <th style="width:16%">Trainee</th>
        <th style="width:7%">Attend.</th>
        <th style="width:6%">GK</th>
        <th style="width:6%">Dex</th>
        <th style="width:6%">HoM</th>
        <th style="width:8%">Coming back</th>
        <th style="width:7%">HW done</th>
        <th>Progress notes</th>
      </tr>
    </thead>
    <tbody>${progressRows}</tbody>
  </table>

  <footer>
    <span>${esc(className)} — ${esc(report.report_date)}</span>
    <span>Gateway Casinos &amp; Entertainment (Unofficial)</span>
  </footer>

${report.drill_times.length > 0 ? (() => {
  // Build the drill times page — only shown when there are recorded times
  const activeDrills = drills.filter(d => d.active && report.drill_times.some(dt => dt.drill_id === d.id))
  // Get unique student IDs from drill_times
  const studentIds = [...new Set(report.drill_times.map(dt => dt.enrollment_id))]
  const drillColHeaders = activeDrills.map(d =>
    `<th>${esc(d.name)}<br/><span style="font-weight:400;font-size:9px;color:#94a3b8">${d.type === 'drill' ? `Time (s)${d.par_time_seconds ? ' · par ' + d.par_time_seconds : ''}` : `Score${d.target_score ? ' · target ' + d.target_score : ''}`}</span></th>`
  ).join('')

  const drillBodyRows = studentIds.map(enrollmentId => {
    const enr = enrollments.find(e => e.id === enrollmentId)
    const cells = activeDrills.map(drill => {
      const dt = report.drill_times.find(r => r.enrollment_id === enrollmentId && r.drill_id === drill.id)
      if (!dt) return '<td class="center">—</td>'
      const value = drill.type === 'drill' ? dt.time_seconds : dt.score
      if (value == null) return '<td class="center">—</td>'
      // Highlight: green if met par/target, yellow if missed
      let cls = 'center'
      if (drill.type === 'drill' && drill.par_time_seconds != null) {
        cls += value <= drill.par_time_seconds ? ' par-met' : ' par-missed'
      } else if (drill.type === 'test' && drill.target_score != null) {
        cls += value >= drill.target_score ? ' par-met' : ' par-missed'
      }
      return `<td class="${cls}">${value}</td>`
    }).join('')
    return `<tr><td>${enr?.student_name ?? 'Unknown'}</td>${cells}</tr>`
  }).join('')

  return `
  <div class="page-break">
    <div class="drill-header">
      <div>
        <h1>${esc(className)} — Drill &amp; Test Results</h1>
        <div class="subtitle">${esc(report.report_date)}${report.group_label ? ' · Group ' + esc(report.group_label) : ''}${report.session_label ? ' · ' + esc(report.session_label) : ''}</div>
      </div>
      <div style="text-align:right;font-size:10px;color:#64748b">
        <div>Generated ${new Date().toLocaleDateString('en-CA')}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:18%">Trainee</th>
          ${drillColHeaders}
        </tr>
      </thead>
      <tbody>${drillBodyRows.length ? drillBodyRows : '<tr><td colspan="' + (activeDrills.length + 1) + '" class="empty">No drill time entries</td></tr>'}</tbody>
    </table>

    <div style="margin-top:12px;font-size:9px;color:#94a3b8">
      <span style="display:inline-block;width:12px;height:12px;background:#dcfce7;border:1px solid #bbf7d0;border-radius:3px;vertical-align:middle;margin-right:3px"></span> Met par/target &nbsp;&nbsp;
      <span style="display:inline-block;width:12px;height:12px;background:#fef9c3;border:1px solid #fde68a;border-radius:3px;vertical-align:middle;margin-right:3px"></span> Did not meet par/target
    </div>

    <footer style="margin-top:16px">
      <span>${esc(className)} — ${esc(report.report_date)} — Drill &amp; Test Results</span>
      <span>Gateway Casinos &amp; Entertainment (Unofficial)</span>
    </footer>
  </div>`
})() : ''}
  </main>
  </div>
</body>
</html>`
}
