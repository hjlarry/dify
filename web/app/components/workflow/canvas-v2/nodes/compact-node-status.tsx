import type { FC } from 'react'
import { cn } from '@langgenius/dify-ui/cn'
import {
  NodeRunningStatus,
} from '../../types'

type CompactNodeStatusIconProps = {
  className?: string
  status: NodeRunningStatus
}

const CompactNodeStatusIcon: FC<CompactNodeStatusIconProps> = ({
  className,
  status,
}) => {
  if (
    status === NodeRunningStatus.Running
    || status === NodeRunningStatus.Listening
    || status === NodeRunningStatus.Retry
  ) {
    return (
      <span
        data-testid={`workflow-canvas-v2-node-status-${status}`}
        className={cn('i-ri-loader-2-line h-3.5 w-3.5 shrink-0 animate-spin text-text-accent', className)}
      />
    )
  }

  if (status === NodeRunningStatus.Waiting) {
    return (
      <span
        data-testid={`workflow-canvas-v2-node-status-${status}`}
        className={cn('i-ri-time-line h-3.5 w-3.5 shrink-0 text-text-tertiary', className)}
      />
    )
  }

  if (status === NodeRunningStatus.Succeeded) {
    return (
      <span
        data-testid={`workflow-canvas-v2-node-status-${status}`}
        className={cn('i-ri-checkbox-circle-fill h-3.5 w-3.5 shrink-0 text-text-success', className)}
      />
    )
  }

  if (status === NodeRunningStatus.Failed) {
    return (
      <span
        data-testid={`workflow-canvas-v2-node-status-${status}`}
        className={cn('i-ri-error-warning-fill h-3.5 w-3.5 shrink-0 text-text-destructive', className)}
      />
    )
  }

  if (status === NodeRunningStatus.Exception) {
    return (
      <span
        data-testid={`workflow-canvas-v2-node-status-${status}`}
        className={cn('i-ri-alert-fill h-3.5 w-3.5 shrink-0 text-text-warning-secondary', className)}
      />
    )
  }

  if (status === NodeRunningStatus.Stopped) {
    return (
      <span
        data-testid={`workflow-canvas-v2-node-status-${status}`}
        className={cn('i-ri-stop-circle-fill h-3.5 w-3.5 shrink-0 text-text-warning-secondary', className)}
      />
    )
  }

  if (status === NodeRunningStatus.Paused) {
    return (
      <span
        data-testid={`workflow-canvas-v2-node-status-${status}`}
        className={cn('i-ri-pause-circle-fill h-3.5 w-3.5 shrink-0 text-text-warning-secondary', className)}
      />
    )
  }

  return null
}

export default CompactNodeStatusIcon
