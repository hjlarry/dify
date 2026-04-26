import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEventListener, useKeyPress } from 'ahooks'
import { useCallback, useEffect } from 'react'
import { useReactFlow } from 'reactflow'
import { ZEN_TOGGLE_EVENT } from '@/app/components/goto-anything/actions/commands/zen'
import { collaborationManager } from '../collaboration/core/collaboration-manager'
import {
  useEdgesInteractions,
  useNodesInteractions,
  useNodesSyncDraft,
  useWorkflowCanvasMaximize,
  useWorkflowMoveMode,
} from '../hooks'
import { useWorkflowStore } from '../store'
import {
  getKeyboardKeyCodeBySystem,
  isEventTargetInputArea,
} from '../utils'
import { useWorkflowHistoryStore } from '../workflow-history-store'

type CanvasV2ShortcutsOptions = {
  handleLayout: () => void | Promise<void>
  onGraphChange: () => void
}

type MaybePromise = void | Promise<void>

const isPromiseLike = (value: MaybePromise): value is Promise<void> => {
  return typeof value === 'object' && value !== null && typeof value.then === 'function'
}

const preventBrowserWorkflowShortcut = (event: KeyboardEvent | ReactKeyboardEvent) => {
  const key = event.key.toLowerCase()
  if ((key === 'd' || key === 'z' || key === 'y' || key === 's') && (event.ctrlKey || event.metaKey))
    event.preventDefault()
}

export const useCanvasV2Shortcuts = ({
  handleLayout,
  onGraphChange,
}: CanvasV2ShortcutsOptions) => {
  const {
    handleNodesCopy,
    handleNodesPaste,
    handleNodesDelete,
    handleHistoryBack,
    handleHistoryForward,
    dimOtherNodes,
    undimAllNodes,
  } = useNodesInteractions()
  const { shortcutsEnabled: workflowHistoryShortcutsEnabled } = useWorkflowHistoryStore()
  const { handleSyncWorkflowDraft } = useNodesSyncDraft()
  const { handleEdgeDelete } = useEdgesInteractions()
  const workflowStore = useWorkflowStore()
  const {
    handleModeHand,
    handleModePointer,
    handleModeComment,
    isCommentModeAvailable,
  } = useWorkflowMoveMode()
  const { handleToggleMaximizeCanvas } = useWorkflowCanvasMaximize()
  const {
    zoomTo,
    getZoom,
    fitView,
    getNodes,
  } = useReactFlow()

  const constrainedZoomOut = useCallback(() => {
    const currentZoom = getZoom()
    const newZoom = Math.max(currentZoom - 0.1, 0.25)
    zoomTo(newZoom)
  }, [getZoom, zoomTo])

  const constrainedZoomIn = useCallback(() => {
    const currentZoom = getZoom()
    const newZoom = Math.min(currentZoom + 0.1, 2)
    zoomTo(newZoom)
  }, [getZoom, zoomTo])

  const shouldHandleShortcut = useCallback((event: KeyboardEvent) => {
    return !isEventTargetInputArea(event.target as HTMLElement)
  }, [])

  const shouldHandleCopy = useCallback(() => {
    if (getNodes().some(node => node.data._isBundled))
      return true

    const selection = document.getSelection()
    return !selection || selection.isCollapsed || !selection.rangeCount
  }, [getNodes])

  const runGraphMutation = useCallback((action: () => MaybePromise) => {
    const result = action()

    if (isPromiseLike(result)) {
      void result.finally(onGraphChange)
      return
    }

    onGraphChange()
  }, [onGraphChange])

  useKeyPress(['delete', 'backspace'], (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      runGraphMutation(() => {
        handleNodesDelete()
        handleEdgeDelete()
      })
    }
  })

  useKeyPress(`${getKeyboardKeyCodeBySystem('ctrl')}.c`, (event) => {
    const { showDebugAndPreviewPanel } = workflowStore.getState()
    if (shouldHandleShortcut(event) && shouldHandleCopy() && !showDebugAndPreviewPanel) {
      event.preventDefault()
      handleNodesCopy()
    }
  }, { exactMatch: true, useCapture: true })

  useKeyPress(`${getKeyboardKeyCodeBySystem('ctrl')}.v`, (event) => {
    const { showDebugAndPreviewPanel } = workflowStore.getState()
    if (shouldHandleShortcut(event) && !showDebugAndPreviewPanel) {
      event.preventDefault()
      runGraphMutation(handleNodesPaste)
    }
  }, { exactMatch: true, useCapture: true })

  useKeyPress(`${getKeyboardKeyCodeBySystem('ctrl')}.d`, (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      handleNodesCopy()
      runGraphMutation(handleNodesPaste)
    }
  }, { exactMatch: true, useCapture: true })

  useKeyPress(`${getKeyboardKeyCodeBySystem('alt')}.r`, (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      const testRunToggle = (window as Window & { _toggleTestRunDropdown?: () => void })._toggleTestRunDropdown
      testRunToggle?.()
    }
  }, { exactMatch: true, useCapture: true })

  useKeyPress(`${getKeyboardKeyCodeBySystem('ctrl')}.z`, (event) => {
    const { showDebugAndPreviewPanel } = workflowStore.getState()
    if (shouldHandleShortcut(event) && !showDebugAndPreviewPanel) {
      event.preventDefault()
      if (workflowHistoryShortcutsEnabled)
        runGraphMutation(handleHistoryBack)
    }
  }, { exactMatch: true, useCapture: true })

  useKeyPress(
    [`${getKeyboardKeyCodeBySystem('ctrl')}.y`, `${getKeyboardKeyCodeBySystem('ctrl')}.shift.z`],
    (event) => {
      if (shouldHandleShortcut(event)) {
        event.preventDefault()
        if (workflowHistoryShortcutsEnabled)
          runGraphMutation(handleHistoryForward)
      }
    },
    { exactMatch: true, useCapture: true },
  )

  useKeyPress('h', (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      runGraphMutation(handleModeHand)
    }
  }, {
    exactMatch: true,
    useCapture: true,
  })

  useKeyPress('v', (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      handleModePointer()
    }
  }, {
    exactMatch: true,
    useCapture: true,
  })

  useKeyPress('c', (event) => {
    if (shouldHandleShortcut(event) && isCommentModeAvailable) {
      event.preventDefault()
      runGraphMutation(handleModeComment)
    }
  }, {
    exactMatch: true,
    useCapture: true,
  })

  useKeyPress(`${getKeyboardKeyCodeBySystem('ctrl')}.o`, (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      void handleLayout()
    }
  }, { exactMatch: true, useCapture: true })

  useKeyPress('f', (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      handleToggleMaximizeCanvas()
    }
  }, {
    exactMatch: true,
    useCapture: true,
  })

  useKeyPress(`${getKeyboardKeyCodeBySystem('ctrl')}.1`, (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      fitView()
      handleSyncWorkflowDraft()
    }
  }, {
    exactMatch: true,
    useCapture: true,
  })

  useKeyPress('shift.1', (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      zoomTo(1)
      handleSyncWorkflowDraft()
    }
  }, {
    exactMatch: true,
    useCapture: true,
  })

  useKeyPress('shift.5', (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      zoomTo(0.5)
      handleSyncWorkflowDraft()
    }
  }, {
    exactMatch: true,
    useCapture: true,
  })

  useKeyPress(`${getKeyboardKeyCodeBySystem('ctrl')}.dash`, (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      constrainedZoomOut()
      handleSyncWorkflowDraft()
    }
  }, {
    exactMatch: true,
    useCapture: true,
  })

  useKeyPress(`${getKeyboardKeyCodeBySystem('ctrl')}.equalsign`, (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      constrainedZoomIn()
      handleSyncWorkflowDraft()
    }
  }, {
    exactMatch: true,
    useCapture: true,
  })

  useKeyPress(`${getKeyboardKeyCodeBySystem('ctrl')}.shift.l`, (event) => {
    if (shouldHandleShortcut(event)) {
      event.preventDefault()
      collaborationManager.downloadGraphImportLog()
    }
  }, { exactMatch: true, useCapture: true })

  useKeyPress(
    'shift',
    (event) => {
      if (shouldHandleShortcut(event))
        runGraphMutation(dimOtherNodes)
    },
    {
      exactMatch: true,
      useCapture: true,
      events: ['keydown'],
    },
  )

  useKeyPress(
    (event) => {
      return event.key === 'Shift'
    },
    (event) => {
      if (shouldHandleShortcut(event))
        runGraphMutation(undimAllNodes)
    },
    {
      exactMatch: true,
      useCapture: true,
      events: ['keyup'],
    },
  )

  useEventListener('keydown', preventBrowserWorkflowShortcut)

  useEffect(() => {
    const handleZenToggle = () => {
      handleToggleMaximizeCanvas()
    }

    window.addEventListener(ZEN_TOGGLE_EVENT, handleZenToggle)
    return () => {
      window.removeEventListener(ZEN_TOGGLE_EVENT, handleZenToggle)
    }
  }, [handleToggleMaximizeCanvas])
}
