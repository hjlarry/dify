import type {
  ConversationLogExportStatusResponse,
  LogExportEmailNotificationPayload,
  LogExportEmailNotificationResponse,
} from '@dify/contracts/api/console/apps/types.gen'
import type {
  DefaultError,
  MutationMeta,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query'
import { keepPreviousData, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/app/notifications'
import { systemFeaturesQueryOptions } from '@/features/system-features/client'

export type LogExportPhase = 'checking' | 'exporting' | 'retry-status' | 'selecting'
export type LogExportCancellation = {
  pending: boolean
  failed: boolean
  onCancel: () => void
}
export type LogExportEmailNotification = {
  state: NonNullable<ConversationLogExportStatusResponse['email_notification']>
  pending: boolean
  updateFailed: boolean
  onChange: (enabled: boolean) => void
}

function isActive(status: ConversationLogExportStatusResponse['status'] | undefined) {
  return status === 'pending' || status === 'processing'
}

type ExportMutationOptions<Data, Input> = (
  options: Pick<UseMutationOptions<Data, DefaultError, Input>, 'meta' | 'onSuccess'>,
) => UseMutationOptions<Data, DefaultError, Input>

export function useLogExport<
  Latest extends { task: ConversationLogExportStatusResponse | null },
  Preview,
  Created extends ConversationLogExportStatusResponse,
  Input,
  TaskParams extends { task_id: string },
>({
  enabled,
  latestOptions,
  previewOptions,
  createOptions,
  statusOptions,
  cancelOptions,
  emailOptions,
  taskParams,
}: {
  enabled: boolean
  latestOptions: UseQueryOptions<Latest>
  previewOptions: UseQueryOptions<Preview>
  createOptions: (options: {
    meta: MutationMeta
    onSuccess: (task: ConversationLogExportStatusResponse) => void
  }) => UseMutationOptions<Created, DefaultError, Input>
  statusOptions: (
    taskId: string | undefined,
  ) => UseQueryOptions<ConversationLogExportStatusResponse>
  cancelOptions: ExportMutationOptions<ConversationLogExportStatusResponse, { params: TaskParams }>
  emailOptions: ExportMutationOptions<
    LogExportEmailNotificationResponse,
    { params: TaskParams; body: LogExportEmailNotificationPayload }
  >
  taskParams: (taskId: string) => TaskParams
}) {
  const { t } = useTranslation(['appLog'])
  const { data: isEmailSetup } = useSuspenseQuery({
    ...systemFeaturesQueryOptions(),
    select: ({ is_email_setup }) => is_email_setup,
  })
  const [dialog, setDialog] = useState<'filters' | 'progress' | null>(null)
  const [progressTask, setProgressTask] = useState<ConversationLogExportStatusResponse>()
  const [taskIdAtSubmit, setTaskIdAtSubmit] = useState<string>()
  const openProgress = (task: ConversationLogExportStatusResponse) => {
    setProgressTask(task)
    setDialog('progress')
  }
  const progressOptions = statusOptions(progressTask?.task_id)
  const progress = useQuery({
    ...progressOptions,
    meta: { ...progressOptions.meta, errorToast: false },
    enabled: enabled && dialog === 'progress',
    placeholderData: progressTask,
    staleTime: 0,
    retry: 1,
    refetchInterval: ({ state }) =>
      state.status !== 'error' &&
      (isActive(state.data?.status) ||
        (state.data?.status === 'ready' && state.data.email_notification === 'waiting'))
        ? 1500
        : false,
  })
  const cancelMutation = useMutation(
    cancelOptions({
      meta: { errorToast: false },
      onSuccess: (_task, { params }) => {
        if (progressTask?.task_id === params.task_id)
          setDialog((current) => (current === 'progress' ? null : current))
        toast.success(t(($) => $['export.canceled'], { ns: 'appLog' }))
      },
    }),
  )
  const emailMutation = useMutation(emailOptions({ meta: { errorToast: false } }))
  const emailState = progress.data?.email_notification
  const emailStatusLoading = !progress.data || progress.isPlaceholderData
  const emailUpdate = emailMutation.variables
  const emailUpdateForTask =
    emailUpdate && emailUpdate.params.task_id === progressTask?.task_id
      ? emailUpdate.body
      : undefined
  // A failed response can still leave the requested preference in place. A ready
  // export that is still waiting can be queued by retrying the request.
  const emailUpdateFailed =
    emailMutation.isError &&
    emailUpdateForTask != null &&
    emailState !== 'queued' &&
    (emailUpdateForTask.enabled
      ? emailState === 'off' || progress.data?.status === 'ready'
      : emailState === 'waiting')
  const latest = useQuery({
    ...latestOptions,
    meta: { ...latestOptions.meta, errorToast: false },
    enabled: enabled && dialog === 'filters',
    staleTime: 0,
    retry: 1,
    refetchInterval: ({ state }) =>
      state.status !== 'error' && isActive(state.data?.task?.status) ? 1500 : false,
  })
  const { error, isPending, mutate, reset } = useMutation(
    createOptions({ meta: { errorToast: false }, onSuccess: openProgress }),
  )
  const latestData = latest.isError ? undefined : latest.data
  const task = latestData?.task
  const taskInProgress = isActive(task?.status)
  // An export can finish before the client learns that its create response was lost.
  const recoveredTask = task != null && (taskInProgress || task.task_id !== taskIdAtSubmit)
  useEffect(() => {
    if (error && recoveredTask) reset()
  }, [error, recoveredTask, reset])

  const phase: LogExportPhase =
    isPending || taskInProgress
      ? 'exporting'
      : latest.isPending || latest.fetchStatus !== 'idle'
        ? 'checking'
        : latest.isError
          ? 'retry-status'
          : 'selecting'
  const preview = useQuery({
    ...previewOptions,
    meta: { ...previewOptions.meta, errorToast: false },
    enabled: enabled && dialog === 'filters' && phase === 'selecting',
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })
  const cancelForTask = cancelMutation.variables?.params.task_id === progressTask?.task_id
  return {
    latest: latestData,
    preview: preview.isError ? undefined : preview.data,
    create: (input: Input) => {
      setTaskIdAtSubmit(task?.task_id)
      mutate(input)
    },
    onViewProgress: task && taskInProgress ? () => openProgress(task) : undefined,
    dialogState: {
      open: dialog === 'filters',
      onOpenChange: (open: boolean) => {
        if (open) reset()
        setDialog(open ? 'filters' : null)
      },
      phase,
      submitting: isPending,
      createFailed: error != null && !recoveredTask,
      pendingPreview:
        preview.isPending || preview.isPlaceholderData || preview.fetchStatus !== 'idle',
      onRetryStatus: () => {
        void latest.refetch()
      },
    },
    progressState: progressTask && {
      open: enabled && dialog === 'progress',
      taskId: progressTask.task_id,
      task: progress.data,
      statusError: progress.isError,
      cancellation:
        !progress.isError && progress.data?.status === 'pending'
          ? ({
              pending: cancelForTask && cancelMutation.isPending,
              failed: cancelForTask && cancelMutation.isError,
              onCancel: () => cancelMutation.mutate({ params: taskParams(progressTask.task_id) }),
            } satisfies LogExportCancellation)
          : undefined,
      emailNotification:
        isEmailSetup && (emailStatusLoading || emailState != null)
          ? ({
              state: emailState ?? 'off',
              pending: emailStatusLoading || (!!emailUpdateForTask && emailMutation.isPending),
              updateFailed: emailUpdateFailed,
              onChange: (enabled: boolean) =>
                emailMutation.mutate({
                  params: taskParams(progressTask.task_id),
                  body: { enabled },
                }),
            } satisfies LogExportEmailNotification)
          : undefined,
      onClose: () => setDialog(null),
      onRetry: () => {
        void progress.refetch()
      },
    },
  }
}
