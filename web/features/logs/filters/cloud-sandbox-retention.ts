'use client'

import type { CloudSandboxPlanState } from './log-time-range'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { systemFeaturesQueryOptions } from '@/features/system-features/client'
import { consoleQuery } from '@/service/console'

export function useCloudSandboxPlanStatus(): CloudSandboxPlanState {
  const { data: deploymentEdition } = useSuspenseQuery({
    ...systemFeaturesQueryOptions(),
    select: ({ deployment_edition }) => deployment_edition,
  })
  const { data: plan } = useQuery(
    consoleQuery.features.get.queryOptions({
      enabled: deploymentEdition === 'CLOUD',
      select: (features) => features.billing.subscription.plan,
    }),
  )

  if (deploymentEdition !== 'CLOUD') return 'unrestricted'
  if (!plan) return 'pending'

  return plan === 'sandbox' ? 'sandbox' : 'unrestricted'
}
