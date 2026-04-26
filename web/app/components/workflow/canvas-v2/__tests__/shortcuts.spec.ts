import { act, renderHook, waitFor } from '@testing-library/react'
import { ZEN_TOGGLE_EVENT } from '@/app/components/goto-anything/actions/commands/zen'
import { useCanvasV2Shortcuts } from '../shortcuts'

type KeyPressRegistration = {
  keyFilter: unknown
  handler: (event: KeyboardEvent) => void
  options?: {
    events?: string[]
  }
}

type EventListenerRegistration = {
  eventName: string
  handler: (event: KeyboardEvent) => void
}

type ReactFlowNodeMock = {
  id: string
  data: {
    _isBundled?: boolean
  }
}

const keyPressRegistrations = vi.hoisted<KeyPressRegistration[]>(() => [])
const eventListenerRegistrations = vi.hoisted<EventListenerRegistration[]>(() => [])
const mockZoomTo = vi.hoisted(() => vi.fn())
const mockGetZoom = vi.hoisted(() => vi.fn(() => 1))
const mockFitView = vi.hoisted(() => vi.fn())
const mockGetNodes = vi.hoisted(() => vi.fn<() => ReactFlowNodeMock[]>(() => []))
const mockHandleNodesDelete = vi.hoisted(() => vi.fn())
const mockHandleEdgeDelete = vi.hoisted(() => vi.fn())
const mockHandleNodesCopy = vi.hoisted(() => vi.fn())
const mockHandleNodesPaste = vi.hoisted(() => vi.fn<() => Promise<void>>(() => Promise.resolve()))
const mockHandleHistoryBack = vi.hoisted(() => vi.fn())
const mockHandleHistoryForward = vi.hoisted(() => vi.fn())
const mockDimOtherNodes = vi.hoisted(() => vi.fn())
const mockUndimAllNodes = vi.hoisted(() => vi.fn())
const mockHandleSyncWorkflowDraft = vi.hoisted(() => vi.fn())
const mockHandleModeHand = vi.hoisted(() => vi.fn())
const mockHandleModePointer = vi.hoisted(() => vi.fn())
const mockHandleModeComment = vi.hoisted(() => vi.fn())
const mockHandleToggleMaximizeCanvas = vi.hoisted(() => vi.fn())
const mockDownloadGraphImportLog = vi.hoisted(() => vi.fn())
let mockShowDebugAndPreviewPanel = false
let mockCommentModeAvailable = true

vi.mock('ahooks', () => ({
  useEventListener: (eventName: string, handler: (event: KeyboardEvent) => void) => {
    eventListenerRegistrations.push({ eventName, handler })
  },
  useKeyPress: (keyFilter: unknown, handler: (event: KeyboardEvent) => void, options?: { events?: string[] }) => {
    keyPressRegistrations.push({ keyFilter, handler, options })
  },
}))

vi.mock('reactflow', () => ({
  useReactFlow: () => ({
    zoomTo: mockZoomTo,
    getZoom: mockGetZoom,
    fitView: mockFitView,
    getNodes: mockGetNodes,
  }),
}))

vi.mock('../../hooks', () => ({
  useNodesInteractions: () => ({
    handleNodesCopy: mockHandleNodesCopy,
    handleNodesPaste: mockHandleNodesPaste,
    handleNodesDelete: mockHandleNodesDelete,
    handleHistoryBack: mockHandleHistoryBack,
    handleHistoryForward: mockHandleHistoryForward,
    dimOtherNodes: mockDimOtherNodes,
    undimAllNodes: mockUndimAllNodes,
  }),
  useEdgesInteractions: () => ({
    handleEdgeDelete: mockHandleEdgeDelete,
  }),
  useNodesSyncDraft: () => ({
    handleSyncWorkflowDraft: mockHandleSyncWorkflowDraft,
  }),
  useWorkflowCanvasMaximize: () => ({
    handleToggleMaximizeCanvas: mockHandleToggleMaximizeCanvas,
  }),
  useWorkflowMoveMode: () => ({
    handleModeHand: mockHandleModeHand,
    handleModePointer: mockHandleModePointer,
    handleModeComment: mockHandleModeComment,
    isCommentModeAvailable: mockCommentModeAvailable,
  }),
}))

vi.mock('../../workflow-history-store', () => ({
  useWorkflowHistoryStore: () => ({
    shortcutsEnabled: true,
  }),
}))

vi.mock('../../store', () => ({
  useWorkflowStore: () => ({
    getState: () => ({
      showDebugAndPreviewPanel: mockShowDebugAndPreviewPanel,
    }),
  }),
}))

vi.mock('../../collaboration/core/collaboration-manager', () => ({
  collaborationManager: {
    downloadGraphImportLog: mockDownloadGraphImportLog,
  },
}))

const createKeyboardEvent = ({
  ctrlKey = false,
  key = '',
  metaKey = false,
  target = document.body,
}: {
  ctrlKey?: boolean
  key?: string
  metaKey?: boolean
  target?: HTMLElement
} = {}) => ({
  ctrlKey,
  key,
  metaKey,
  preventDefault: vi.fn(),
  target,
}) as unknown as KeyboardEvent

const renderShortcuts = () => {
  const handleLayout = vi.fn()
  const onGraphChange = vi.fn()

  renderHook(() => useCanvasV2Shortcuts({
    handleLayout,
    onGraphChange,
  }))

  return {
    handleLayout,
    onGraphChange,
  }
}

const findRegistration = (matcher: (registration: KeyPressRegistration) => boolean) => {
  const registration = keyPressRegistrations.find(matcher)
  expect(registration).toBeDefined()
  return registration as KeyPressRegistration
}

const isSystemShortcut = (registration: KeyPressRegistration, key: string) => {
  return registration.keyFilter === `ctrl.${key}` || registration.keyFilter === `meta.${key}`
}

describe('useCanvasV2Shortcuts', () => {
  beforeEach(() => {
    keyPressRegistrations.length = 0
    eventListenerRegistrations.length = 0
    vi.clearAllMocks()
    mockGetZoom.mockReturnValue(1)
    mockGetNodes.mockReturnValue([])
    mockHandleNodesPaste.mockResolvedValue(undefined)
    mockShowDebugAndPreviewPanel = false
    mockCommentModeAvailable = true
    delete (window as Window & { _toggleTestRunDropdown?: () => void })._toggleTestRunDropdown
  })

  it('registers the legacy workflow shortcut map for canvas v2', () => {
    renderShortcuts()

    expect(keyPressRegistrations).toEqual(expect.arrayContaining([
      expect.objectContaining({ keyFilter: ['delete', 'backspace'] }),
      expect.objectContaining({ keyFilter: 'h' }),
      expect.objectContaining({ keyFilter: 'v' }),
      expect.objectContaining({ keyFilter: 'c' }),
      expect.objectContaining({ keyFilter: 'f' }),
      expect.objectContaining({ keyFilter: 'shift.1' }),
      expect.objectContaining({ keyFilter: 'shift.5' }),
      expect.objectContaining({ keyFilter: 'shift', options: expect.objectContaining({ events: ['keydown'] }) }),
    ]))
    expect(keyPressRegistrations.some(registration => isSystemShortcut(registration, 'c'))).toBe(true)
    expect(keyPressRegistrations.some(registration => isSystemShortcut(registration, 'v'))).toBe(true)
    expect(keyPressRegistrations.some(registration => isSystemShortcut(registration, 'd'))).toBe(true)
    expect(keyPressRegistrations.some(registration => isSystemShortcut(registration, 'z'))).toBe(true)
    expect(keyPressRegistrations.some(registration => isSystemShortcut(registration, 'o'))).toBe(true)
    expect(keyPressRegistrations.some(registration => isSystemShortcut(registration, '1'))).toBe(true)
    expect(keyPressRegistrations.some(registration => isSystemShortcut(registration, 'dash'))).toBe(true)
    expect(keyPressRegistrations.some(registration => isSystemShortcut(registration, 'equalsign'))).toBe(true)
    expect(keyPressRegistrations.some(registration => isSystemShortcut(registration, 'shift.l'))).toBe(true)
    expect(keyPressRegistrations.some(registration =>
      Array.isArray(registration.keyFilter)
      && registration.keyFilter.some(item => item === 'ctrl.y' || item === 'meta.y')
      && registration.keyFilter.some(item => item === 'ctrl.shift.z' || item === 'meta.shift.z'),
    )).toBe(true)
    expect(keyPressRegistrations.some(registration => typeof registration.keyFilter === 'function')).toBe(true)
    expect(eventListenerRegistrations).toEqual([
      expect.objectContaining({ eventName: 'keydown' }),
    ])
  })

  it('runs graph-mutating shortcuts and refreshes the v2 graph after each mutation', async () => {
    const { onGraphChange } = renderShortcuts()
    const deleteShortcut = findRegistration(registration =>
      Array.isArray(registration.keyFilter) && registration.keyFilter.includes('delete'),
    )
    const copyShortcut = findRegistration(registration => isSystemShortcut(registration, 'c'))
    const pasteShortcut = findRegistration(registration => isSystemShortcut(registration, 'v'))
    const duplicateShortcut = findRegistration(registration => isSystemShortcut(registration, 'd'))
    const undoShortcut = findRegistration(registration => isSystemShortcut(registration, 'z'))
    const redoShortcut = findRegistration(registration =>
      Array.isArray(registration.keyFilter)
      && registration.keyFilter.some(item => item === 'ctrl.y' || item === 'meta.y'),
    )

    deleteShortcut.handler(createKeyboardEvent())
    expect(mockHandleNodesDelete).toHaveBeenCalledTimes(1)
    expect(mockHandleEdgeDelete).toHaveBeenCalledTimes(1)
    expect(onGraphChange).toHaveBeenCalledTimes(1)

    copyShortcut.handler(createKeyboardEvent())
    expect(mockHandleNodesCopy).toHaveBeenCalledTimes(1)
    expect(onGraphChange).toHaveBeenCalledTimes(1)

    pasteShortcut.handler(createKeyboardEvent())
    await waitFor(() => {
      expect(mockHandleNodesPaste).toHaveBeenCalledTimes(1)
      expect(onGraphChange).toHaveBeenCalledTimes(2)
    })

    duplicateShortcut.handler(createKeyboardEvent())
    await waitFor(() => {
      expect(mockHandleNodesCopy).toHaveBeenCalledTimes(2)
      expect(mockHandleNodesPaste).toHaveBeenCalledTimes(2)
      expect(onGraphChange).toHaveBeenCalledTimes(3)
    })

    undoShortcut.handler(createKeyboardEvent())
    expect(mockHandleHistoryBack).toHaveBeenCalledTimes(1)
    expect(onGraphChange).toHaveBeenCalledTimes(4)

    redoShortcut.handler(createKeyboardEvent())
    expect(mockHandleHistoryForward).toHaveBeenCalledTimes(1)
    expect(onGraphChange).toHaveBeenCalledTimes(5)
  })

  it('ignores graph mutation shortcuts inside editable targets', () => {
    renderShortcuts()
    const input = document.createElement('input')
    const deleteShortcut = findRegistration(registration =>
      Array.isArray(registration.keyFilter) && registration.keyFilter.includes('delete'),
    )

    deleteShortcut.handler(createKeyboardEvent({ target: input }))

    expect(mockHandleNodesDelete).not.toHaveBeenCalled()
    expect(mockHandleEdgeDelete).not.toHaveBeenCalled()
  })

  it('runs layout, mode, zoom, test run, import log, dimming, and zen shortcuts', () => {
    const testRunToggle = vi.fn()
    const testRunWindow = window as Window & { _toggleTestRunDropdown?: () => void }
    testRunWindow._toggleTestRunDropdown = testRunToggle
    const { handleLayout, onGraphChange } = renderShortcuts()

    findRegistration(registration => isSystemShortcut(registration, 'o')).handler(createKeyboardEvent())
    expect(handleLayout).toHaveBeenCalledTimes(1)

    findRegistration(registration => registration.keyFilter === 'h').handler(createKeyboardEvent())
    expect(mockHandleModeHand).toHaveBeenCalledTimes(1)
    expect(onGraphChange).toHaveBeenCalledTimes(1)

    findRegistration(registration => registration.keyFilter === 'v').handler(createKeyboardEvent())
    expect(mockHandleModePointer).toHaveBeenCalledTimes(1)
    expect(onGraphChange).toHaveBeenCalledTimes(1)

    findRegistration(registration => registration.keyFilter === 'c').handler(createKeyboardEvent())
    expect(mockHandleModeComment).toHaveBeenCalledTimes(1)
    expect(onGraphChange).toHaveBeenCalledTimes(2)

    findRegistration(registration => registration.keyFilter === 'f').handler(createKeyboardEvent())
    expect(mockHandleToggleMaximizeCanvas).toHaveBeenCalledTimes(1)

    findRegistration(registration => isSystemShortcut(registration, '1')).handler(createKeyboardEvent())
    findRegistration(registration => registration.keyFilter === 'shift.1').handler(createKeyboardEvent())
    findRegistration(registration => registration.keyFilter === 'shift.5').handler(createKeyboardEvent())
    findRegistration(registration => isSystemShortcut(registration, 'dash')).handler(createKeyboardEvent())
    findRegistration(registration => isSystemShortcut(registration, 'equalsign')).handler(createKeyboardEvent())
    expect(mockFitView).toHaveBeenCalledTimes(1)
    expect(mockZoomTo).toHaveBeenNthCalledWith(1, 1)
    expect(mockZoomTo).toHaveBeenNthCalledWith(2, 0.5)
    expect(mockZoomTo).toHaveBeenNthCalledWith(3, 0.9)
    expect(mockZoomTo).toHaveBeenNthCalledWith(4, 1.1)
    expect(mockHandleSyncWorkflowDraft).toHaveBeenCalledTimes(5)

    findRegistration(registration => isSystemShortcut(registration, 'shift.l')).handler(createKeyboardEvent())
    expect(mockDownloadGraphImportLog).toHaveBeenCalledTimes(1)

    findRegistration(registration => registration.keyFilter === 'alt.r').handler(createKeyboardEvent())
    expect(testRunToggle).toHaveBeenCalledTimes(1)

    findRegistration(registration => registration.keyFilter === 'shift').handler(createKeyboardEvent())
    expect(mockDimOtherNodes).toHaveBeenCalledTimes(1)
    expect(onGraphChange).toHaveBeenCalledTimes(3)

    findRegistration(registration => typeof registration.keyFilter === 'function').handler(createKeyboardEvent({ key: 'Shift' }))
    expect(mockUndimAllNodes).toHaveBeenCalledTimes(1)
    expect(onGraphChange).toHaveBeenCalledTimes(4)

    act(() => {
      window.dispatchEvent(new Event(ZEN_TOGGLE_EVENT))
    })
    expect(mockHandleToggleMaximizeCanvas).toHaveBeenCalledTimes(2)
  })

  it('prevents browser shortcuts that conflict with workflow commands', () => {
    renderShortcuts()
    const keydownListener = eventListenerRegistrations.find(registration => registration.eventName === 'keydown')
    expect(keydownListener).toBeDefined()

    const event = createKeyboardEvent({ ctrlKey: true, key: 's' })
    keydownListener!.handler(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })
})
