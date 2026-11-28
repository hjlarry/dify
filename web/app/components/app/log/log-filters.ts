import type {
  Conversation,
  ConversationWithSummary,
  GetAppsByAppIdChatConversationsData,
} from '@dify/contracts/api/console/apps/types.gen'
import type { LogIdentity } from '@/features/logs/filters/log-identity'
import type {
  CloudSandboxPlanState,
  LogCustomDateRange,
} from '@/features/logs/filters/log-time-range'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { identityKey, logIdentityFilters } from '@/features/logs/filters/log-identity'
import { logDateRange } from '@/features/logs/filters/log-time-range'
import { useLogTimeFilterOptions } from '@/features/logs/filters/log-time-range-options'
import { consoleQuery } from '@/service/console'

type ConversationsQuery = NonNullable<GetAppsByAppIdChatConversationsData['query']>

export type QueryParam = {
  period: string
  customRange?: LogCustomDateRange
  annotation_status?: ConversationsQuery['annotation_status']
  keyword?: string
  sort_by?: ConversationsQuery['sort_by']
  identities?: LogIdentity[]
}

export function useLogFilterOptions(appId: string, planState: CloudSandboxPlanState) {
  const { t } = useTranslation(['appLog'])
  const time = useLogTimeFilterOptions(planState)
  const { data } = useQuery(
    consoleQuery.apps.byAppId.annotations.count.get.queryOptions({
      input: appId ? { params: { app_id: appId } } : skipToken,
    }),
  )
  const annotations = [
    { value: 'all', label: t(($) => $['filter.annotation.all'], { ns: 'appLog' }) },
    {
      value: 'annotated',
      label: t(($) => $['filter.annotation.annotated'], { ns: 'appLog', count: data?.count ?? 0 }),
    },
    {
      value: 'not_annotated',
      label: t(($) => $['filter.annotation.not_annotated'], { ns: 'appLog' }),
    },
  ] satisfies { value: NonNullable<QueryParam['annotation_status']>; label: string }[]

  return {
    ...time,
    annotations,
    hasAnnotationCount: Boolean(data),
  }
}

export type LogFilterOptions = ReturnType<typeof useLogFilterOptions>

export function getLogIdentities(logs: (Conversation | ConversationWithSummary)[]): LogIdentity[] {
  const identities = new Map<string, LogIdentity>()
  for (const log of logs) {
    const identity =
      log.from_source === 'api' && log.from_end_user_id
        ? {
            id: log.from_end_user_id,
            label: log.from_end_user_session_id || log.from_end_user_id,
            source: 'end-user' as const,
          }
        : log.from_source === 'console' && log.from_account_id
          ? {
              id: log.from_account_id,
              label: log.from_account_name || log.from_account_id,
              source: 'account' as const,
            }
          : undefined
    if (identity) identities.set(identityKey(identity), identity)
  }
  return [...identities.values()]
}

export function toLogFilters(
  { period, customRange, identities, ...filters }: QueryParam,
  planState: CloudSandboxPlanState,
  timezone: string,
) {
  const range = logDateRange(period, planState, timezone, customRange)
  return {
    ...filters,
    ...logIdentityFilters(identities),
    ...(range && {
      start: range.start.format('YYYY-MM-DD HH:mm'),
      end: range.end.format('YYYY-MM-DD HH:mm'),
    }),
  }
}
