import type { ConversationLogExportLatestResponse } from '@dify/contracts/api/console/apps/types.gen'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { MutationObserver, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vite-plus/test'
import { createDeferred } from '@/test/deferred'
import { createTestQueryClient } from '@/test/query-client'
import { consoleQuery } from '../index'
import { createMutationInvalidation } from '../mutation-invalidation'

const request = vi.hoisted(() => vi.fn<() => Promise<Response>>())
// boundary: Run the generated mutation and its cache policy with a scripted HTTP response.
vi.mock('@/service/base', () => ({ request }))

const conversation = consoleQuery.apps.byAppId.conversationLogExports
const workflow = consoleQuery.apps.byAppId.workflowLogExports
const agent = consoleQuery.agent.byAgentId.logExports
const appParams = { app_id: 'app-1' }
const taskParams = { ...appParams, task_id: 'task-1' }
const pending = { task_id: taskParams.task_id, status: 'pending' } as const
const workflowLatest = workflow.latest.get.queryKey({ input: { params: appParams } })
const workflowStatus = workflow.byTaskId.get.queryKey({ input: { params: taskParams } })

beforeEach(() => {
  request.mockReset()
})

afterEach(() => vi.restoreAllMocks())

function createClient() {
  const client = createTestQueryClient(undefined, { invalidation: createMutationInvalidation() })
  onTestFinished(() => client.clear())
  return client
}

function watch<T>(client: QueryClient, queryKey: QueryKey, queryFn: () => Promise<T>) {
  const observer = new QueryObserver(client, { queryKey, queryFn })
  onTestFinished(observer.subscribe(() => undefined))
  return observer
}

it('marks only the created Workflow export’s latest cache stale without reloading it', async () => {
  const client = createClient()
  const otherLatest = workflow.latest.get.queryKey({ input: { params: { app_id: 'app-2' } } })
  const conversationLatest = conversation.latest.get.queryKey({ input: { params: appParams } })
  const empty = { task: null }
  for (const key of [workflowLatest, otherLatest, conversationLatest])
    client.setQueryData(key, empty)
  const reload = vi.fn(async () => empty)
  watch(client, workflowLatest, reload)
  request.mockResolvedValue(Response.json(pending, { status: 202 }))

  await new MutationObserver(client, workflow.post.mutationOptions()).mutate({
    params: appParams,
    body: {},
  })

  expect(reload).not.toHaveBeenCalled()
  expect(client.getQueryState(workflowLatest)?.isInvalidated).toBe(true)
  expect(client.getQueryState(otherLatest)?.isInvalidated).toBe(false)
  expect(client.getQueryState(conversationLatest)?.isInvalidated).toBe(false)
})

it('waits for a fresh Conversation latest read when the create response is lost', async () => {
  const client = createClient()
  const latest = conversation.latest.get.queryKey({ input: { params: appParams } })
  const otherLatest = conversation.latest.get.queryKey({ input: { params: { app_id: 'app-2' } } })
  client.setQueryData(otherLatest, { task: null })
  const firstRead = createDeferred<ConversationLogExportLatestResponse>()
  const reconciliation = createDeferred<ConversationLogExportLatestResponse>()
  const readLatest = vi.fn(() => reconciliation.promise).mockReturnValueOnce(firstRead.promise)
  const latestObserver = watch(client, latest, readLatest)
  expect(readLatest).toHaveBeenCalledTimes(1)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  request.mockRejectedValue(new TypeError('Connection lost'))
  const create = new MutationObserver(client, conversation.post.mutationOptions())
  const rejected = expect(create.mutate({ params: appParams, body: {} })).rejects.toThrow(
    'Connection lost',
  )

  await vi.waitFor(() => expect(readLatest).toHaveBeenCalledTimes(2))
  expect(create.getCurrentResult().isPending).toBe(true)
  reconciliation.resolve({
    task: {
      ...pending,
      filters: {
        account_ids: [],
        annotation_status: 'all',
        end: null,
        end_user_ids: [],
        keyword: null,
        sort_by: '-updated_at',
        start: null,
      },
    },
  })
  firstRead.resolve({ task: null })
  await rejected

  expect(latestObserver.getCurrentResult().data?.task?.task_id).toBe(pending.task_id)
  expect(client.getQueryState(otherLatest)?.isInvalidated).toBe(false)
})

it('commits a canceled Workflow status ahead of an older read and invalidates its latest', async () => {
  const client = createClient()
  const otherStatus = workflow.byTaskId.get.queryKey({
    input: { params: { ...taskParams, task_id: 'task-2' } },
  })
  client.setQueryData(workflowLatest, { task: null })
  client.setQueryData(workflowStatus, pending)
  client.setQueryData(otherStatus, { ...pending, task_id: 'task-2' })
  const oldStatus = createDeferred<typeof pending>()
  const statusObserver = watch(client, workflowStatus, () => oldStatus.promise)
  const statusRead = statusObserver.refetch()
  const canceled = { ...pending, status: 'canceled' }
  request.mockResolvedValue(Response.json(canceled))

  await new MutationObserver(client, workflow.byTaskId.cancel.post.mutationOptions()).mutate({
    params: taskParams,
  })
  oldStatus.resolve(pending)
  await statusRead

  expect(client.getQueryData(workflowStatus)).toEqual(canceled)
  expect(client.getQueryState(workflowLatest)?.isInvalidated).toBe(true)
  expect(client.getQueryState(otherStatus)?.isInvalidated).toBe(false)
})

it('reconciles both Workflow export caches after a failed cancellation', async () => {
  const client = createClient()
  client.setQueryData(workflowLatest, { task: null })
  client.setQueryData(workflowStatus, pending)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  request.mockRejectedValue(new TypeError('Connection lost'))

  await expect(
    new MutationObserver(client, workflow.byTaskId.cancel.post.mutationOptions()).mutate({
      params: taskParams,
    }),
  ).rejects.toThrow('Connection lost')

  expect(client.getQueryState(workflowStatus)?.isInvalidated).toBe(true)
  expect(client.getQueryState(workflowLatest)?.isInvalidated).toBe(true)
})

it.each(['success', 'lost response'] as const)(
  'reconciles only the Agent export status after email preference %s',
  async (outcome) => {
    const client = createClient()
    const params = { agent_id: 'agent-1', task_id: 'task-1' }
    const status = agent.byTaskId.get.queryKey({ input: { params } })
    const latest = agent.latest.get.queryKey({ input: { params: { agent_id: params.agent_id } } })
    const otherStatus = agent.byTaskId.get.queryKey({
      input: { params: { ...params, agent_id: 'agent-2' } },
    })
    client.setQueryData(status, pending)
    client.setQueryData(latest, { task: null })
    client.setQueryData(otherStatus, pending)
    const updateEmail = new MutationObserver(client, agent.byTaskId.put.mutationOptions())
    if (outcome === 'success') {
      request.mockResolvedValue(Response.json({ email_notification: 'waiting' }))
      await updateEmail.mutate({ params, body: { enabled: true } })
    } else {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      request.mockRejectedValue(new TypeError('Connection lost'))
      await expect(updateEmail.mutate({ params, body: { enabled: true } })).rejects.toThrow(
        'Connection lost',
      )
    }

    expect(client.getQueryState(status)?.isInvalidated).toBe(true)
    expect(client.getQueryState(latest)?.isInvalidated).toBe(false)
    expect(client.getQueryState(otherStatus)?.isInvalidated).toBe(false)
  },
)
