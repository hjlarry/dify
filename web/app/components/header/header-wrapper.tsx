'use client'
import { cn } from '@langgenius/dify-ui/cn'
import * as React from 'react'
import { useState } from 'react'
import { useEventEmitterContextContext } from '@/context/event-emitter'
import { usePathname } from '@/next/navigation'
import { useNewWorkflowCanvasEnabled } from '../workflow/canvas-v2/hooks'
import s from './index.module.css'

type HeaderWrapperProps = {
  children: React.ReactNode
}

type WorkflowCanvasMaximizeEvent = {
  type?: string
  payload?: boolean
}

const readWorkflowCanvasMaximize = () => {
  try {
    return localStorage.getItem('workflow-canvas-maximize') === 'true'
  }
  catch {
    return false
  }
}

const isWorkflowCanvasMaximizeEvent = (value: unknown): value is WorkflowCanvasMaximizeEvent => {
  return typeof value === 'object'
    && value !== null
    && 'type' in value
    && value.type === 'workflow-canvas-maximize'
}

const HeaderWrapper = ({
  children,
}: HeaderWrapperProps) => {
  const pathname = usePathname()
  const isBordered = ['/apps', '/datasets/create', '/tools'].includes(pathname)
  // Check if the current path is a workflow canvas & fullscreen
  const inWorkflowCanvas = pathname.endsWith('/workflow')
  const isPipelineCanvas = pathname.endsWith('/pipeline')
  const newWorkflowCanvasEnabled = useNewWorkflowCanvasEnabled()
  const [hideHeader, setHideHeader] = useState(readWorkflowCanvasMaximize)
  const { eventEmitter } = useEventEmitterContextContext()

  eventEmitter?.useSubscription((v: unknown) => {
    if (isWorkflowCanvasMaximizeEvent(v))
      setHideHeader(!!v.payload)
  })

  const shouldHideHeader = (hideHeader && (inWorkflowCanvas || isPipelineCanvas))
    || (newWorkflowCanvasEnabled && inWorkflowCanvas)

  return (
    <div className={cn('sticky top-0 right-0 left-0 z-30 flex min-h-[56px] shrink-0 grow-0 basis-auto flex-col', s.header, isBordered ? 'border-b border-divider-regular' : '', shouldHideHeader && 'hidden')}>
      {children}
    </div>
  )
}
export default HeaderWrapper
