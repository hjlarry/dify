import type { GetAgentByAgentIdLogsData } from '@dify/contracts/api/console/agent/types.gen'
import type { LogIdentity } from '@/features/logs/filters/log-identity'
import type { LogCustomDateRange } from '@/features/logs/filters/log-time-range'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { logIdentityFilters } from '@/features/logs/filters/log-identity'
import { customLogDateRange } from '@/features/logs/filters/log-time-range'

dayjs.extend(utc)
dayjs.extend(timezone)

export const agentLogPeriods = ['last7days', 'last30days', 'allTime'] as const

type AgentLogFilterQuery = Pick<
  NonNullable<GetAgentByAgentIdLogsData['query']>,
  'account_ids' | 'end' | 'end_user_ids' | 'sources' | 'start'
>

export type SourceFilterValue = NonNullable<AgentLogFilterQuery['sources']>

export type AgentLogFilters = {
  period: (typeof agentLogPeriods)[number] | 'custom'
  customRange?: LogCustomDateRange
  sources: SourceFilterValue
  identities: LogIdentity[]
}

export const defaultAgentLogFilters: AgentLogFilters = {
  period: 'last7days',
  sources: [],
  identities: [],
}

export function toAgentLogQuery(
  { period, customRange, sources, identities }: AgentLogFilters,
  timezone: string,
): AgentLogFilterQuery {
  const now = dayjs().tz(timezone)
  const format = 'YYYY-MM-DD HH:mm'
  const range =
    period === 'custom' && customRange ? customLogDateRange(customRange, timezone) : undefined
  const start = range?.start ?? now.subtract(period === 'last30days' ? 30 : 7, 'day')
  // The Agent query uses an exclusive end, so include the whole selected day.
  const end = range ? range.end.add(1, 'millisecond').tz(timezone) : now.add(1, 'minute')
  return {
    ...(period !== 'allTime' && {
      start: start.format(format),
      end: end.format(format),
    }),
    ...(sources.length > 0 && { sources }),
    ...logIdentityFilters(identities),
  }
}
