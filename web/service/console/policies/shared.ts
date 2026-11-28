import type { ConversationLogExportStatusResponse } from '@dify/contracts/api/console/apps/types.gen'
import type { RouterUtils } from '@orpc/tanstack-query'
import type { MutationFunctionContext, Query, QueryClient, QueryKey } from '@tanstack/react-query'
import type { ConsoleClient } from '../index'

// Fetches `invalidateQueries` would not restart: a first load (it joins that
// request) or an unobserved query (it is only marked stale, and the read in
// flight still lands).
const isUnrestartedFetch = (query: Query) =>
  query.state.fetchStatus === 'fetching' && (query.state.data === undefined || !query.isActive())

function invalidateEach(client: QueryClient, queryKeys: QueryKey[]) {
  return Promise.all(queryKeys.map((queryKey) => client.invalidateQueries({ queryKey })))
}

/**
 * Marks the queries stale and refetches the active ones with a request that starts
 * after the write. `invalidateQueries` alone joins a first load already in flight
 * (TanStack Query only restarts a fetch for a query that has data) and leaves an
 * unobserved query's read running, so a pre-write response would land and clear
 * the stale flag. Those fetches are cancelled first. Observed queries with data
 * are restarted by `invalidateQueries` itself, so nothing on screen reverts to
 * earlier data. Without such a fetch the invalidation starts right away, as before.
 */
export function invalidateQueryKeys(client: QueryClient, queryKeys: QueryKey[]) {
  const cache = client.getQueryCache()
  const hasUnrestartedFetch = queryKeys.some(
    (queryKey) => cache.findAll({ queryKey, predicate: isUnrestartedFetch }).length > 0,
  )
  if (!hasUnrestartedFetch) return invalidateEach(client, queryKeys)
  return Promise.all(
    queryKeys.map((queryKey) => client.cancelQueries({ queryKey, predicate: isUnrestartedFetch })),
  ).then(() => invalidateEach(client, queryKeys))
}

export function logExportMutationPolicies<Scope>(
  latestKey: (params: Scope) => QueryKey,
  statusKey: (params: Scope & { task_id: string }) => QueryKey,
) {
  type ExportInput = { params: Scope }
  type TaskInput = { params: Scope & { task_id: string } }
  // Each write owns a small set of export keys; other queries in the domain stay fresh.
  const meta = { invalidate: false } as const

  return {
    post: {
      mutationOptions: {
        meta,
        onSuccess: async (
          _created: unknown,
          { params }: ExportInput,
          _result: unknown,
          { client }: MutationFunctionContext,
        ) => {
          const filters = { queryKey: latestKey(params), exact: true }
          // Progress opens from the response, and the next open of Filters reads latest.
          // Stop any earlier request so it cannot clear the stale flag.
          await client.cancelQueries(filters)
          return client.invalidateQueries({ ...filters, refetchType: 'none' })
        },
        onError: (
          _error: unknown,
          { params }: ExportInput,
          _result: unknown,
          { client }: MutationFunctionContext,
        ) => {
          // The task may have been saved even if its create response was lost.
          return invalidateQueryKeys(client, [latestKey(params)])
        },
      },
    },
    byTaskId: {
      cancel: {
        post: {
          mutationOptions: {
            meta,
            onSettled: async (
              canceled: ConversationLogExportStatusResponse | undefined,
              _error: unknown,
              { params }: TaskInput,
              _result: unknown,
              { client }: MutationFunctionContext,
            ) => {
              const taskKey = statusKey(params)
              const latest = latestKey(params)
              if (!canceled) return invalidateQueryKeys(client, [taskKey, latest])

              await client.cancelQueries({ queryKey: taskKey, exact: true })
              client.setQueryData(taskKey, canceled)
              return invalidateQueryKeys(client, [latest])
            },
          },
        },
      },
      put: {
        mutationOptions: {
          meta,
          // A lost response can also leave the desired preference in place.
          onSettled: (
            _data: unknown,
            _error: unknown,
            { params }: TaskInput,
            _result: unknown,
            { client }: MutationFunctionContext,
          ) => invalidateQueryKeys(client, [statusKey(params)]),
        },
      },
    },
  }
}

export async function refreshAgentTagCatalogs(
  query: RouterUtils<ConsoleClient>,
  client: QueryClient,
) {
  return invalidateQueryKeys(client, [
    query.tags.get.queryKey({ input: { query: { type: 'agent' } } }),
  ])
}

export function invalidateHumanInputContactQueries(
  query: RouterUtils<ConsoleClient>,
  client: QueryClient,
) {
  return invalidateQueryKeys(client, [
    query.workspaces.current.humanInput.v2.contacts.key(),
    query.workspaces.current.humanInput.v2.contactOptions.key(),
    query.workspaces.current.humanInput.v2.imIdentities.key(),
    query.workspaces.current.humanInput.v2.organizationCandidates.key(),
  ])
}

/**
 * Adds a created key to its cached key lists, then refreshes them in the background.
 * Create dialogs show the key's one-time secret as soon as the create resolves, so
 * they must not wait for the list refetch; writing the key keeps the list current.
 */
export async function addCreatedKeyToLists<TKey extends { id: string }>(
  client: QueryClient,
  listKey: QueryKey,
  created: TKey,
) {
  // A list read that started before the create must not land over the new key.
  if (client.isFetching({ queryKey: listKey })) await client.cancelQueries({ queryKey: listKey })
  client.setQueriesData<{ data: TKey[] }>({ queryKey: listKey }, (list) =>
    list && !list.data.some((key) => key.id === created.id)
      ? { ...list, data: [...list.data, created] }
      : list,
  )
  void invalidateQueryKeys(client, [listKey])
}
