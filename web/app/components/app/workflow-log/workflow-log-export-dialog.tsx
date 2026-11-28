import type { WorkflowLogFilterOptions, WorkflowLogQuery } from './log-filters'
import type { LogIdentity } from '@/features/logs/filters/log-identity'
import type { CloudSandboxPlanState } from '@/features/logs/filters/log-time-range'
import { skipToken } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { API_PREFIX } from '@/config'
import { LogExportDialog } from '@/features/log-export/dialog'
import { useLogExport } from '@/features/log-export/use-log-export'
import { LogFilterSelect } from '@/features/logs/filters/log-filter-select'
import { logIdentityLabels } from '@/features/logs/filters/log-identity'
import { LogIdentityField } from '@/features/logs/filters/log-identity-picker'
import { LogTimeRangePicker } from '@/features/logs/filters/log-time-range-picker'
import { consoleClient, consoleQuery } from '@/service/console'
import { toWorkflowLogFilters } from './log-filters'

const exportsApi = consoleQuery.apps.byAppId.workflowLogExports

export function WorkflowLogExportDialog({
  appId,
  appName,
  currentQueryParams,
  filterOptions,
  identityOptions,
  planState,
  timezone,
}: {
  appId: string
  appName: string
  currentQueryParams: WorkflowLogQuery
  filterOptions: WorkflowLogFilterOptions
  identityOptions: LogIdentity[]
  planState: CloudSandboxPlanState
  timezone: string
}) {
  const { t } = useTranslation(['appLog'])
  const [selection, setSelection] = useState(currentQueryParams)
  const { period, customRange, status, identities } = selection
  const params = { app_id: appId }
  const query = toWorkflowLogFilters(
    { period, customRange, status, identities },
    planState,
    timezone,
  )
  const { create, latest, preview, dialogState, progressState, onViewProgress } = useLogExport({
    enabled: planState === 'unrestricted',
    latestOptions: exportsApi.latest.get.queryOptions({ input: { params } }),
    previewOptions: exportsApi.preview.get.queryOptions({ input: { params, query } }),
    createOptions: exportsApi.post.mutationOptions(),
    statusOptions: (taskId) =>
      exportsApi.byTaskId.get.queryOptions({
        input: taskId ? { params: { ...params, task_id: taskId } } : skipToken,
      }),
    cancelExport: (taskId) =>
      consoleClient.apps.byAppId.workflowLogExports.byTaskId.cancel.post({
        params: { ...params, task_id: taskId },
      }),
    updateEmailNotification: (taskId, enabled) =>
      consoleClient.apps.byAppId.workflowLogExports.byTaskId.put({
        params: { ...params, task_id: taskId },
        body: { enabled },
      }),
  })
  const fileUrl = (taskId: string) =>
    `${API_PREFIX}/apps/${appId}/workflow-log-exports/${taskId}/file`
  const task = latest?.task
  const disabled = dialogState.phase !== 'selecting'
  const latestStatus = task?.filters.status

  return (
    <LogExportDialog
      {...dialogState}
      appName={appName}
      planState={planState}
      timezone={timezone}
      onOpenChange={(next) => {
        if (next) setSelection(currentQueryParams)
        dialogState.onOpenChange(next)
      }}
      progress={progressState && { ...progressState, fileUrl: fileUrl(progressState.taskId) }}
      counts={preview?.row_count != null ? { rows: preview.row_count } : undefined}
      previewDescription={t(($) => $['export.previewWorkflowDescription'], { ns: 'appLog' })}
      lastExport={
        task && {
          status: task.status,
          fileUrl: fileUrl(task.task_id),
          expiresAt: task.expires_at,
          onViewProgress,
          start: task.filters.created_at__after,
          end: task.filters.created_at__before,
          keyword: task.filters.keyword,
          statusLabel: latestStatus
            ? t(($) => $[`status.${latestStatus}`], { ns: 'appLog' })
            : undefined,
          identities: logIdentityLabels(task.filters, task.identity_labels ?? []),
        }
      }
      onExport={() =>
        create({
          params,
          body: {
            ...query,
            estimated_rows: preview?.row_count ?? undefined,
            identity_labels: identities?.length ? identities : undefined,
          },
        })
      }
    >
      <LogTimeRangePicker
        value={selection}
        options={filterOptions.periods}
        timezone={timezone}
        onChange={({ period, customRange }) =>
          setSelection((previous) => ({ ...previous, period, customRange }))
        }
        disabled={disabled}
      />
      <LogFilterSelect
        label={t(($) => $['table.header.status'], { ns: 'appLog' })}
        value={status ?? 'all'}
        options={filterOptions.statuses}
        onChange={(status) => setSelection((previous) => ({ ...previous, status }))}
        disabled={disabled}
      />
      <LogIdentityField
        appId={appId}
        options={identityOptions}
        value={identities ?? []}
        onChange={(identities) => setSelection((previous) => ({ ...previous, identities }))}
        disabled={disabled}
        workflow
        showLabel
      />
    </LogExportDialog>
  )
}
