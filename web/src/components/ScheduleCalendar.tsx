/**
 * components/ScheduleCalendar.tsx — Monthly calendar view for schedule slots
 *
 * Renders a monthly grid where each day cell shows sessions as colored pills.
 * The initial month is auto-detected from the earliest slot in the data.
 * Users can navigate between months and years using chevron buttons.
 * Sessions are color-coded by province and clickable to navigate to the class.
 */

import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ScheduleRow } from '../lib/apiClient'
import type { Province } from '../types'
import { formatTime, classSlug } from '../lib/utils'

interface ScheduleCalendarProps {
  slots: ScheduleRow[]
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PROVINCE_BADGE: Record<Province, string> = {
  BC: 'bg-emerald-100 text-emerald-700',
  AB: 'bg-amber-100 text-amber-700',
  ON: 'bg-blue-100 text-blue-700',
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Generates all Date objects for a calendar grid, including padding days from adjacent months. */
function getCalendarDays(year: number, month: number): Date[] {
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: Date[] = []

  // Padding days from previous month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i))
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d))
  }

  // Padding days from next month to fill the last row
  let nextDay = 1
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, nextDay++))
  }

  return days
}

/** Chevron icon pointing left or right. */
function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {direction === 'left'
        ? <path d="M15 18l-6-6 6-6" />
        : <path d="M9 18l6-6-6-6" />
      }
    </svg>
  )
}

/** Double chevron icon for year navigation. */
function DoubleChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {direction === 'left' ? (
        <>
          <path d="M18 18l-6-6 6-6" />
          <path d="M12 18l-6-6 6-6" />
        </>
      ) : (
        <>
          <path d="M6 18l6-6-6-6" />
          <path d="M12 18l6-6-6-6" />
        </>
      )}
    </svg>
  )
}

export function ScheduleCalendar({ slots }: ScheduleCalendarProps) {
  const navigate = useNavigate()
  const today = toISODate(new Date())

  /** Determine initial month from earliest slot, fallback to current month. */
  const initialMonth = useMemo(() => {
    if (slots.length === 0) {
      const now = new Date()
      return { year: now.getFullYear(), month: now.getMonth() }
    }
    const sorted = [...slots].sort((a, b) => a.slot_date.localeCompare(b.slot_date))
    const earliest = new Date(sorted[0].slot_date + 'T00:00:00')
    return { year: earliest.getFullYear(), month: earliest.getMonth() }
  }, [slots])

  const [displayYear, setDisplayYear] = useState(initialMonth.year)
  const [displayMonth, setDisplayMonth] = useState(initialMonth.month)

  // Sync to data when slots change (e.g. filter applied)
  useEffect(() => {
    setDisplayYear(initialMonth.year)
    setDisplayMonth(initialMonth.month)
  }, [initialMonth.year, initialMonth.month])

  /** Group slots by date for O(1) lookup per calendar cell. */
  const slotsByDate = useMemo(() => {
    const map: Record<string, ScheduleRow[]> = {}
    for (const slot of slots) {
      const key = slot.slot_date
      if (!map[key]) map[key] = []
      map[key].push(slot)
    }
    return map
  }, [slots])

  const calendarDays = useMemo(
    () => getCalendarDays(displayYear, displayMonth),
    [displayYear, displayMonth],
  )

  const monthLabel = new Date(displayYear, displayMonth, 1)
    .toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })

  // ── Navigation helpers ──

  function goToPrevMonth() {
    if (displayMonth === 0) {
      setDisplayMonth(11)
      setDisplayYear(y => y - 1)
    } else {
      setDisplayMonth(m => m - 1)
    }
  }

  function goToNextMonth() {
    if (displayMonth === 11) {
      setDisplayMonth(0)
      setDisplayYear(y => y + 1)
    } else {
      setDisplayMonth(m => m + 1)
    }
  }

  function goToPrevYear() {
    setDisplayYear(y => y - 1)
  }

  function goToNextYear() {
    setDisplayYear(y => y + 1)
  }

  function goToToday() {
    const now = new Date()
    setDisplayYear(now.getFullYear())
    setDisplayMonth(now.getMonth())
  }

  const btnClass = 'p-1 rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-700 dark:text-slate-300 transition-colors'

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-tt-surface overflow-hidden">
      {/* Navigation header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 dark:border-white/[0.06]">
        {/* Left: prev year / prev month */}
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={goToPrevYear} className={btnClass} title="Previous year">
            <DoubleChevronIcon direction="left" />
          </button>
          <button type="button" onClick={goToPrevMonth} className={btnClass} title="Previous month">
            <ChevronIcon direction="left" />
          </button>
        </div>

        {/* Center: month label + today button */}
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{monthLabel}</h3>
          <button
            type="button"
            onClick={goToToday}
            className="rounded-md border border-slate-300 dark:border-slate-200 dark:border-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            Today
          </button>
        </div>

        {/* Right: next month / next year */}
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={goToNextMonth} className={btnClass} title="Next month">
            <ChevronIcon direction="right" />
          </button>
          <button type="button" onClick={goToNextYear} className={btnClass} title="Next year">
            <DoubleChevronIcon direction="right" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-slate-200 dark:border-white/[0.06]">
        {WEEKDAYS.map(day => (
          <div key={day} className="py-2 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid — gap-px + bg-slate-200 creates gridlines */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-white/[0.06]">
        {calendarDays.map((day, index) => {
          const dateStr = toISODate(day)
          const isCurrentMonth = day.getMonth() === displayMonth
          const isToday = dateStr === today
          const daySlots = slotsByDate[dateStr] || []

          return (
            <div
              key={index}
              className={`min-h-[90px] p-1.5 transition-colors ${isCurrentMonth ? 'bg-white dark:bg-tt-surface' : 'bg-slate-50 dark:bg-tt-darkest'}`}
            >
              {/* Day number */}
              <div className="flex items-start justify-between mb-1">
                <span
                  className={`
                    inline-flex items-center justify-center text-xs leading-none
                    ${isToday
                      ? 'w-6 h-6 rounded-full bg-tt-blue text-white font-bold'
                      : isCurrentMonth
                        ? 'text-slate-700 dark:text-slate-300 font-medium'
                        : 'text-slate-400 dark:text-slate-600'
                    }
                  `}
                >
                  {day.getDate()}
                </span>
                {daySlots.length > 1 && isCurrentMonth && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{daySlots.length}</span>
                )}
              </div>

              {/* Session pills (max 3 visible) */}
              <div className="space-y-0.5">
                {daySlots.slice(0, 3).map(slot => {
                  const province = slot.classes.province as Province
                  return (
                    <div
                      key={slot.id}
                      onClick={() => navigate(`/classes/${classSlug(slot.classes.name)}`)}
                      className={`rounded px-1.5 py-0.5 text-[10px] leading-tight truncate cursor-pointer transition-colors hover:opacity-80 ${PROVINCE_BADGE[province] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                      title={`${slot.classes.name} — ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}${slot.class_trainers?.trainer_name ? ` — ${slot.class_trainers.trainer_name}` : ''}`}
                    >
                      <span className="font-semibold">{formatTime(slot.start_time)}</span>
                      {' '}{slot.classes.name}
                    </div>
                  )
                })}
                {daySlots.length > 3 && (
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 pl-1">+{daySlots.length - 3} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
