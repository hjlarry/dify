import type { Dayjs } from 'dayjs'
import type { I18nKeysByPrefix } from '@/types/i18n'
import dayjs from 'dayjs'
import quarterOfYear from 'dayjs/plugin/quarterOfYear'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(quarterOfYear)
dayjs.extend(utc)
dayjs.extend(timezone)

export type LogCustomDateRange = { start: string; end: string }

export function customLogDateRange(range: LogCustomDateRange, timezone: string) {
  return {
    start: dayjs.tz(range.start, timezone).startOf('day'),
    end: dayjs.tz(range.end, timezone).endOf('day'),
  }
}

export const CLOUD_SANDBOX_TIME_PERIOD_KEYS = new Set(['1', '2', '3'])
export const CLOUD_SANDBOX_CLEARED_TIME_PERIOD = '1'

const CLOUD_SANDBOX_LONGEST_TIME_PERIOD = '3'
const CLOUD_SANDBOX_LONGEST_TIME_PERIOD_OPTION = {
  value: 30,
  name: 'last30days',
} as const

export type CloudSandboxPlanState = 'pending' | 'sandbox' | 'unrestricted'

export function isLogTimePeriodRestricted(planState: CloudSandboxPlanState) {
  return planState !== 'unrestricted'
}

export function resolveLogTimePeriod(period: string, planState: CloudSandboxPlanState) {
  if (!isLogTimePeriodRestricted(planState) || CLOUD_SANDBOX_TIME_PERIOD_KEYS.has(period))
    return period

  return CLOUD_SANDBOX_CLEARED_TIME_PERIOD
}

export function resolveLogTimePeriodOption<T extends { value: number; name: string }>(
  period: string,
  option: T,
  planState: CloudSandboxPlanState,
) {
  if (isLogTimePeriodRestricted(planState) && period === CLOUD_SANDBOX_LONGEST_TIME_PERIOD)
    return CLOUD_SANDBOX_LONGEST_TIME_PERIOD_OPTION

  return option
}

// Count the days when the value is read, so a page left open past midnight still uses the current date.
// Round the result, because a daylight saving change makes some days 23 or 25 hours long.
const daysSince = (getStart: (today: Dayjs) => Dayjs) => {
  const today = dayjs().startOf('day')
  return Math.round(today.diff(getStart(today).startOf('day'), 'day', true))
}

type TimePeriodName = I18nKeysByPrefix<'appLog', 'filter.period.'>

type LogTimePeriod = { value: number; name: TimePeriodName; start?: (today: Dayjs) => Dayjs }

const calendarPeriod = (name: TimePeriodName, start: NonNullable<LogTimePeriod['start']>) => ({
  get value() {
    return daysSince(start)
  },
  name,
  start,
})

export const TIME_PERIOD_MAPPING: Record<string, LogTimePeriod> = {
  1: { value: 0, name: 'today' },
  2: { value: 7, name: 'last7days' },
  3: { value: 28, name: 'last4weeks' },
  4: calendarPeriod('last3months', (today) => today.subtract(3, 'month')),
  5: calendarPeriod('last12months', (today) => today.subtract(12, 'month')),
  6: calendarPeriod('monthToDate', (today) => today.startOf('month')),
  7: calendarPeriod('quarterToDate', (today) => today.startOf('quarter')),
  8: calendarPeriod('yearToDate', (today) => today.startOf('year')),
  9: { value: -1, name: 'allTime' },
}

export function logDateRange(
  period: string,
  planState: CloudSandboxPlanState,
  timezone: string,
  customRange?: LogCustomDateRange,
) {
  const effectivePeriod = resolveLogTimePeriod(period, planState)
  if (effectivePeriod === '9') return null
  if (effectivePeriod === 'custom' && customRange) return customLogDateRange(customRange, timezone)
  const today = dayjs().tz(timezone)
  const preset = effectivePeriod === 'custom' ? '2' : effectivePeriod
  const option: LogTimePeriod = resolveLogTimePeriodOption(
    preset,
    TIME_PERIOD_MAPPING[preset]!,
    planState,
  )
  return {
    start: (option.start?.(today) ?? today.subtract(option.value, 'day')).startOf('day'),
    end: today.endOf('day'),
  }
}
