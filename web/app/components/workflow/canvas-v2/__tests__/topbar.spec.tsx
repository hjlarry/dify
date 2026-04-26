import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as React from 'react'
import WorkflowCanvasV2Topbar from '../topbar'

const mockSetCurrentLogItem = vi.hoisted(() => vi.fn())
const mockSetShowMessageLogModal = vi.hoisted(() => vi.fn())
const mockSetShowImportDSLModal = vi.hoisted(() => vi.fn())
const mockWorkflowExportCheck = vi.hoisted(() => vi.fn())
const mockOpenModal = vi.hoisted(() => vi.fn())
const mockCloseModal = vi.hoisted(() => vi.fn())
const mockSetSecretEnvList = vi.hoisted(() => vi.fn())
const mockOnEdit = vi.hoisted(() => vi.fn())
const mockOnCopy = vi.hoisted(() => vi.fn())
const mockOnExport = vi.hoisted(() => vi.fn())
const mockAppInfoExportCheck = vi.hoisted(() => vi.fn())
const mockHandleConfirmExport = vi.hoisted(() => vi.fn())
const mockOnConfirmDelete = vi.hoisted(() => vi.fn())
const mockRouterPush = vi.hoisted(() => vi.fn())
const mockCloseAllInputFieldPanels = vi.hoisted(() => vi.fn())
const mockSetShowFeaturesPanel = vi.hoisted(() => vi.fn())
const mockSetShowChatVariablePanel = vi.hoisted(() => vi.fn())
const mockSetShowEnvPanel = vi.hoisted(() => vi.fn())
const mockSetShowGlobalVariablePanel = vi.hoisted(() => vi.fn())
const mockSetShowDebugAndPreviewPanel = vi.hoisted(() => vi.fn())
const mockUseIsChatMode = vi.hoisted(() => vi.fn(() => false))
const mockGetNodesReadOnly = vi.hoisted(() => vi.fn(() => false))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/app/components/app/store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    appDetail: {
      id: 'app-1',
      name: 'Canvas App',
      mode: 'workflow',
    },
    setCurrentLogItem: mockSetCurrentLogItem,
    setShowMessageLogModal: mockSetShowMessageLogModal,
  }),
}))

vi.mock('@/app/components/app-sidebar/app-info/use-app-info-actions', () => ({
  useAppInfoActions: () => ({
    appDetail: {
      id: 'app-1',
      name: 'Canvas App',
      mode: 'workflow',
    },
    activeModal: null,
    openModal: mockOpenModal,
    closeModal: mockCloseModal,
    secretEnvList: [],
    setSecretEnvList: mockSetSecretEnvList,
    onEdit: mockOnEdit,
    onCopy: mockOnCopy,
    onExport: mockOnExport,
    exportCheck: mockAppInfoExportCheck,
    handleConfirmExport: mockHandleConfirmExport,
    onConfirmDelete: mockOnConfirmDelete,
  }),
}))

vi.mock('@/app/components/app-sidebar/app-info/app-info-modals', () => ({
  default: () => <div data-testid="app-info-modals" />,
}))

vi.mock('@langgenius/dify-ui/dropdown-menu', () => {
  const DropdownMenuContext = React.createContext<{ isOpen: boolean, setOpen: (open: boolean) => void } | null>(null)

  const useDropdownMenuContext = () => {
    const context = React.use(DropdownMenuContext)
    if (!context)
      throw new Error('DropdownMenu components must be wrapped in DropdownMenu')
    return context
  }

  return {
    DropdownMenu: ({ children, open, onOpenChange }: { children: React.ReactNode, open: boolean, onOpenChange?: (open: boolean) => void }) => (
      <DropdownMenuContext value={{ isOpen: open, setOpen: onOpenChange ?? vi.fn() }}>
        <div data-testid="dropdown-menu" data-open={open}>{children}</div>
      </DropdownMenuContext>
    ),
    DropdownMenuTrigger: ({
      children,
      onClick,
      render,
      ...props
    }: {
      children: React.ReactNode
      onClick?: React.MouseEventHandler<HTMLElement>
      render?: React.ReactElement<Partial<Record<'data-testid', string>>>
    } & Partial<Record<'data-testid', string>>) => {
      const { isOpen, setOpen } = useDropdownMenuContext()
      const handleClick = (e: React.MouseEvent<HTMLElement>) => {
        onClick?.(e)
        setOpen(!isOpen)
      }
      const testId = props['data-testid'] || render?.props['data-testid'] || 'dropdown-trigger'

      return <button data-testid={testId} onClick={handleClick}>{children}</button>
    },
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => {
      const { isOpen } = useDropdownMenuContext()
      if (!isOpen)
        return null

      return <div data-testid="more-menu-content">{children}</div>
    },
    DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode, onClick?: React.MouseEventHandler<HTMLButtonElement> }) => {
      const { setOpen } = useDropdownMenuContext()
      return (
        <button
          type="button"
          data-testid="more-menu-item"
          onClick={(e) => {
            onClick?.(e)
            setOpen(false)
          }}
        >
          {children}
        </button>
      )
    },
    DropdownMenuSeparator: () => <hr data-testid="more-menu-separator" />,
  }
})

vi.mock('@/next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}))

vi.mock('@/app/components/header/account-dropdown', () => ({
  default: () => <div data-testid="account-dropdown" />,
}))

vi.mock('@/hooks/use-format-time-from-now', () => ({
  useFormatTimeFromNow: () => ({
    formatTimeFromNow: () => '3 days ago',
  }),
}))

vi.mock('@/hooks/use-timestamp', () => ({
  default: () => ({
    formatTime: () => '23:20:12',
  }),
}))

vi.mock('@/hooks/use-theme', () => ({
  default: () => ({
    theme: 'light',
  }),
}))

vi.mock('@/app/components/workflow-app/components/workflow-header/features-trigger', () => ({
  default: ({ showFeaturesButton }: { showFeaturesButton?: boolean }) => (
    <div data-testid="features-trigger" data-show-features-button={String(showFeaturesButton)} />
  ),
}))

vi.mock('@/app/components/workflow/header/run-and-history', () => ({
  default: () => <div data-testid="run-and-history" />,
}))

vi.mock('@/app/components/workflow/header/scroll-to-selected-node-button', () => ({
  default: () => <div data-testid="scroll-to-selected-node" />,
}))

vi.mock('@/app/components/workflow/hooks', () => ({
  useDSL: () => ({
    exportCheck: mockWorkflowExportCheck,
  }),
  useIsChatMode: () => mockUseIsChatMode(),
  useNodesReadOnly: () => ({
    nodesReadOnly: false,
    getNodesReadOnly: mockGetNodesReadOnly,
  }),
}))

vi.mock('@/app/components/rag-pipeline/hooks', () => ({
  useInputFieldPanel: () => ({
    closeAllInputFieldPanels: mockCloseAllInputFieldPanels,
  }),
}))

vi.mock('@/app/components/workflow/store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    draftUpdatedAt: 1000,
    publishedAt: 2000,
    isSyncingWorkflowDraft: false,
    isRestoring: false,
    showFeaturesPanel: false,
    setShowFeaturesPanel: mockSetShowFeaturesPanel,
    setShowImportDSLModal: mockSetShowImportDSLModal,
    setShowChatVariablePanel: mockSetShowChatVariablePanel,
    setShowEnvPanel: mockSetShowEnvPanel,
    setShowGlobalVariablePanel: mockSetShowGlobalVariablePanel,
    setShowDebugAndPreviewPanel: mockSetShowDebugAndPreviewPanel,
  }),
}))

describe('WorkflowCanvasV2Topbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseIsChatMode.mockReturnValue(false)
    mockGetNodesReadOnly.mockReturnValue(false)
  })

  it('should render workflow actions, more menu, and account avatar', () => {
    render(<WorkflowCanvasV2Topbar />)

    expect(screen.getByTestId('workflow-canvas-v2-topbar')).toBeInTheDocument()
    expect(screen.getByTestId('run-and-history')).toBeInTheDocument()
    expect(screen.getByTestId('features-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('features-trigger')).toHaveAttribute('data-show-features-button', 'false')
    expect(screen.getByTestId('workflow-canvas-v2-more-menu-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('workflow-canvas-v2-account-controls')).toBeInTheDocument()
    expect(screen.getByTestId('account-dropdown')).toBeInTheDocument()
    expect(screen.getByTestId('app-info-modals')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-variable-trigger')).not.toBeInTheDocument()
    expect(screen.queryByTestId('env-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('global-variable-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('online-users')).not.toBeInTheDocument()
    expect(screen.queryByTestId('version-history')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'userProfile.settings' })).not.toBeInTheDocument()
  })

  it('should render breadcrumb navigation and switch pages from the canvas menu', async () => {
    const user = userEvent.setup()

    render(<WorkflowCanvasV2Topbar />)

    expect(screen.getByRole('link', { name: 'menus.apps' })).toHaveAttribute('href', '/apps')
    expect(screen.getByTestId('workflow-canvas-v2-studio-icon')).toBeInTheDocument()
    expect(screen.getByText('Canvas App')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Canvas App' })).not.toBeInTheDocument()
    expect(screen.getByTestId('workflow-canvas-v2-page-menu-trigger')).toHaveTextContent('canvasV2.topbar.canvas')

    await user.click(screen.getByTestId('workflow-canvas-v2-page-menu-trigger'))
    expect(screen.getAllByText('canvasV2.topbar.canvas')).toHaveLength(2)
    expect(screen.getByText('appMenus.overview')).toBeInTheDocument()
    expect(screen.getByText('appMenus.logs')).toBeInTheDocument()
    expect(screen.getByText('appMenus.apiAccess')).toBeInTheDocument()

    await user.click(screen.getByText('appMenus.overview'))
    expect(mockRouterPush).toHaveBeenCalledWith('/app/app-1/overview')
  })

  it('should route more menu actions to existing app and DSL handlers', async () => {
    const user = userEvent.setup()

    render(<WorkflowCanvasV2Topbar />)

    await user.click(screen.getByTestId('workflow-canvas-v2-more-menu-trigger'))

    expect(screen.getByText('env.envPanelTitle')).toBeInTheDocument()
    expect(screen.getByText('globalVar.title')).toBeInTheDocument()
    expect(screen.getByTestId('more-menu-separator')).toBeInTheDocument()
    expect(screen.getByText('editApp')).toBeInTheDocument()
    expect(screen.getByText('duplicate')).toBeInTheDocument()
    expect(screen.getByText('common.importDSL')).toBeInTheDocument()
    expect(screen.getByText('export')).toBeInTheDocument()

    await user.click(screen.getByText('editApp'))
    expect(mockOpenModal).toHaveBeenCalledWith('edit')

    await user.click(screen.getByTestId('workflow-canvas-v2-more-menu-trigger'))
    await user.click(screen.getByText('duplicate'))
    expect(mockOpenModal).toHaveBeenCalledWith('duplicate')

    await user.click(screen.getByTestId('workflow-canvas-v2-more-menu-trigger'))
    await user.click(screen.getByText('common.importDSL'))
    expect(mockSetShowImportDSLModal).toHaveBeenCalledWith(true)

    await user.click(screen.getByTestId('workflow-canvas-v2-more-menu-trigger'))
    await user.click(screen.getByText('export'))
    expect(mockWorkflowExportCheck).toHaveBeenCalledTimes(1)
  })

  it('should open workflow panels from the more menu', async () => {
    const user = userEvent.setup()
    mockUseIsChatMode.mockReturnValue(true)

    render(<WorkflowCanvasV2Topbar />)

    await user.click(screen.getByTestId('workflow-canvas-v2-more-menu-trigger'))
    expect(screen.getByText('common.features')).toBeInTheDocument()
    expect(screen.getByText('chatVariable.panelTitle')).toBeInTheDocument()

    await user.click(screen.getByText('common.features'))
    expect(mockSetShowFeaturesPanel).toHaveBeenCalledWith(true)

    await user.click(screen.getByTestId('workflow-canvas-v2-more-menu-trigger'))
    await user.click(screen.getByText('chatVariable.panelTitle'))
    expect(mockSetShowChatVariablePanel).toHaveBeenCalledWith(true)
    expect(mockSetShowDebugAndPreviewPanel).toHaveBeenCalledWith(false)

    await user.click(screen.getByTestId('workflow-canvas-v2-more-menu-trigger'))
    await user.click(screen.getByText('env.envPanelTitle'))
    expect(mockSetShowEnvPanel).toHaveBeenCalledWith(true)
    expect(mockCloseAllInputFieldPanels).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('workflow-canvas-v2-more-menu-trigger'))
    await user.click(screen.getByText('globalVar.title'))
    expect(mockSetShowGlobalVariablePanel).toHaveBeenCalledWith(true)
    expect(mockCloseAllInputFieldPanels).toHaveBeenCalledTimes(2)
  })
})
