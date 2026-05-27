import type { ReportBody, ReportWithNested } from './apiClient'

export interface ReportCopyOptions {
  reportDate?: string
  groupLabel?: string | null
  classStartTime?: string | null
  classEndTime?: string | null
}

export function localIsoDate(date = new Date()): string {
  const local = new Date(date)
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset())
  return local.toISOString().slice(0, 10)
}

export function buildCopiedReportDraft(
  source: ReportWithNested,
  options: ReportCopyOptions = {},
): ReportBody {
  return {
    report_date: options.reportDate ?? localIsoDate(),
    group_label: options.groupLabel !== undefined ? options.groupLabel : source.group_label,
    game: source.game,
    session_label: source.session_label,
    class_start_time: options.classStartTime !== undefined ? options.classStartTime : source.class_start_time,
    class_end_time: options.classEndTime !== undefined ? options.classEndTime : source.class_end_time,
    mg_confirmed: source.mg_confirmed,
    mg_attended: source.mg_attended,
    current_trainees: source.current_trainees,
    licenses_received: source.licenses_received,
    override_hours_to_date: source.override_hours_to_date,
    override_paid_hours_total: source.override_paid_hours_total,
    override_live_hours_total: source.override_live_hours_total,
    coordinator_notes: source.coordinator_notes,
    trainer_ids: [...source.trainer_ids],
    timeline: source.timeline.map(item => ({
      start_time: item.start_time,
      end_time: item.end_time,
      activity: item.activity,
      homework_handouts_tests: item.homework_handouts_tests,
      category: item.category,
    })),
    progress: source.progress.map(row => ({
      enrollment_id: row.enrollment_id,
      progress_text: row.progress_text,
      gk_rating: row.gk_rating,
      dex_rating: row.dex_rating,
      hom_rating: row.hom_rating,
      coming_back_next_day: row.coming_back_next_day,
      homework_completed: row.homework_completed,
      attendance: row.attendance,
      late: row.late,
    })),
    drill_times: source.drill_times.map(row => ({
      enrollment_id: row.enrollment_id,
      drill_id: row.drill_id,
      time_seconds: row.time_seconds,
      score: row.score,
    })),
  }
}
