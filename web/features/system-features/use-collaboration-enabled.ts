import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { consoleQuery } from '@/service/console'
import { systemFeaturesQueryOptions } from './client'

export const useWorkspaceCollaborationEnabled = () => {
  const { data: systemFeatures } = useSuspenseQuery(systemFeaturesQueryOptions())
  const needsPlan =
    systemFeatures.enable_collaboration_mode && systemFeatures.deployment_edition === 'CLOUD'
  const {
    data: plan,
    error,
    isFetching,
    refetch,
  } = useQuery({
    ...consoleQuery.features.get.queryOptions(),
    enabled: needsPlan,
    retry: false,
    select: (features) => features.billing.subscription.plan,
  })

  if (!systemFeatures.enable_collaboration_mode) return { status: 'ready' as const, enabled: false }
  if (!needsPlan) return { status: 'ready' as const, enabled: true }
  if (plan) return { status: 'ready' as const, enabled: plan === 'professional' || plan === 'team' }
  if (error && !isFetching) return { status: 'error' as const, retry: refetch }

  return { status: 'loading' as const }
}
