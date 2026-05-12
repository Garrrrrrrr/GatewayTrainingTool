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
    trainer_ids: [...source.trainer_ids],
    timeline: source.timeline.map(item => ({
      start_time: item.start_time,
      end_time: item.end_time,
      activity: item.activity,
      homework_handouts_tests: item.homework_handouts_tests,
      category: item.category,
    })),
    progress: [],
    drill_times: [],
  }
}

