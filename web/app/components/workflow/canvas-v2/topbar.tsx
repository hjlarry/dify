'use client'

import type { AppInfoModalType } from '@/app/components/app-sidebar/app-info/use-app-info-actions'
import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@langgenius/dify-ui/dropdown-menu'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import AppInfoModals from '@/app/components/app-sidebar/app-info/app-info-modals'
import { useAppInfoActions } from '@/app/components/app-sidebar/app-info/use-app-info-actions'
import { useStore as useAppStore } from '@/app/components/app/store'
import AccountDropdown from '@/app/components/header/account-dropdown'
import { useInputFieldPanel } from '@/app/components/rag-pipeline/hooks'
import FeaturesTrigger from '@/app/components/workflow-app/components/workflow-header/features-trigger'
import RunAndHistory from '@/app/components/workflow/header/run-and-history'
import ScrollToSelectedNodeButton from '@/app/components/workflow/header/scroll-to-selected-node-button'
import {
  useDSL,
  useIsChatMode,
  useNodesReadOnly,
} from '@/app/components/workflow/hooks'
import { useStore } from '@/app/components/workflow/store'
import { useFormatTimeFromNow } from '@/hooks/use-format-time-from-now'
import useTheme from '@/hooks/use-theme'
import useTimestamp from '@/hooks/use-timestamp'
import Link from '@/next/link'
import { useRouter } from '@/next/navigation'
import { AppModeEnum } from '@/types/app'

const CanvasStatus = memo(() => {
  const { t } = useTranslation()
  const { formatTime } = useTimestamp()
  const { formatTimeFromNow } = useFormatTimeFromNow()
  const draftUpdatedAt = useStore(state => state.draftUpdatedAt)
  const publishedAt = useStore(state => state.publishedAt)
  const isSyncingWorkflowDraft = useStore(s => s.isSyncingWorkflowDraft)

  const statusItems = useMemo(() => {
    const items: Array<{ id: string, label: string }> = []

    if (draftUpdatedAt)
      items.push({ id: 'draft', label: `${t('common.autoSaved', { ns: 'workflow' })} ${formatTime(draftUpdatedAt / 1000, 'HH:mm:ss')}` })

    items.push({
      id: 'published',
      label: publishedAt
        ? `${t('common.published', { ns: 'workflow' })} ${formatTimeFromNow(publishedAt)}`
        : t('common.unpublished', { ns: 'workflow' }),
    })

    if (isSyncingWorkflowDraft)
      items.push({ id: 'syncing', label: t('common.syncingData', { ns: 'workflow' }) })

    return items
  }, [draftUpdatedAt, formatTime, formatTimeFromNow, isSyncingWorkflowDraft, publishedAt, t])

  return (
    <div className="flex min-w-0 items-center system-xs-regular whitespace-nowrap text-text-tertiary">
      {statusItems.map((item, index) => (
        <span key={item.id} className="flex min-w-0 items-center">
          {index > 0 && <span className="mx-1 shrink-0">&middot;</span>}
          <span className="truncate">{item.label}</span>
        </span>
      ))}
    </div>
  )
})

CanvasStatus.displayName = 'CanvasStatus'

const WorkflowCanvasV2Breadcrumb = memo(() => {
  const { t } = useTranslation()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const appDetail = useAppStore(state => state.appDetail)

  const appId = appDetail?.id
  const appName = appDetail?.name || t('menus.appDetail', { ns: 'common' })
  const canvasLabel = t('canvasV2.topbar.canvas', { ns: 'workflow' })

  const pageItems = useMemo(() => {
    if (!appId)
      return []

    return [
      {
        id: 'canvas',
        label: canvasLabel,
        href: `/app/${appId}/workflow`,
        iconClassName: 'i-ri-flow-chart',
        active: true,
      },
      {
        id: 'overview',
        label: t('appMenus.overview', { ns: 'common' }),
        href: `/app/${appId}/overview`,
        iconClassName: 'i-ri-dashboard-2-line',
        active: false,
      },
      {
        id: 'logs',
        label: appDetail?.mode !== AppModeEnum.WORKFLOW
          ? t('appMenus.logAndAnn', { ns: 'common' })
          : t('appMenus.logs', { ns: 'common' }),
        href: `/app/${appId}/logs`,
        iconClassName: 'i-ri-file-list-3-line',
        active: false,
      },
      {
        id: 'api-access',
        label: t('appMenus.apiAccess', { ns: 'common' }),
        href: `/app/${appId}/develop`,
        iconClassName: 'i-ri-terminal-box-line',
        active: false,
      },
    ]
  }, [appDetail?.mode, appId, canvasLabel, t])

  const handleNavigate = useCallback((href: string) => {
    setOpen(false)
    router.push(href)
  }, [router])

  return (
    <div className="flex min-w-0 items-center gap-1 system-sm-semibold">
      <Link
        href="/apps"
        className="flex shrink-0 items-center gap-1 rounded-md px-1 text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary"
      >
        <span
          aria-hidden
          data-testid="workflow-canvas-v2-studio-icon"
          className="i-ri-robot-2-line h-4 w-4"
        />
        {t('menus.apps', { ns: 'common' })}
      </Link>
      <span className="shrink-0 text-text-quaternary">/</span>
      <span
        className="max-w-[220px] truncate px-1 text-text-secondary"
        title={appName}
      >
        {appName}
      </span>
      <span className="shrink-0 text-text-quaternary">/</span>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          data-testid="workflow-canvas-v2-page-menu-trigger"
          className={cn(
            'flex h-7 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-text-primary hover:bg-state-base-hover',
            open && 'bg-state-base-hover',
          )}
        >
          <span>{canvasLabel}</span>
          <span aria-hidden className="i-ri-arrow-down-s-line h-4 w-4 text-text-tertiary" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          placement="bottom-start"
          sideOffset={8}
          popupClassName="min-w-[220px]"
        >
          {pageItems.map(item => (
            <DropdownMenuItem
              key={item.id}
              disabled={item.active}
              className={cn('gap-x-2 px-2', item.active && 'text-text-accent-light-mode-only')}
              onClick={() => handleNavigate(item.href)}
            >
              <span aria-hidden className={cn('h-4 w-4 text-text-tertiary', item.iconClassName)} />
              <span className="system-md-regular text-text-secondary">{item.label}</span>
              {item.active && <span aria-hidden className="ml-auto i-ri-check-line h-4 w-4 text-text-accent-light-mode-only" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})

WorkflowCanvasV2Breadcrumb.displayName = 'WorkflowCanvasV2Breadcrumb'

const WorkflowCanvasV2MoreMenu = memo(() => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const isChatMode = useIsChatMode()
  const { nodesReadOnly, getNodesReadOnly } = useNodesReadOnly()
  const showFeaturesPanel = useStore(s => s.showFeaturesPanel)
  const setShowFeaturesPanel = useStore(s => s.setShowFeaturesPanel)
  const isRestoring = useStore(s => s.isRestoring)
  const setShowImportDSLModal = useStore(s => s.setShowImportDSLModal)
  const setShowChatVariablePanel = useStore(s => s.setShowChatVariablePanel)
  const setShowEnvPanel = useStore(s => s.setShowEnvPanel)
  const setShowGlobalVariablePanel = useStore(s => s.setShowGlobalVariablePanel)
  const setShowDebugAndPreviewPanel = useStore(s => s.setShowDebugAndPreviewPanel)
  const { closeAllInputFieldPanels } = useInputFieldPanel()
  const { exportCheck } = useDSL()
  const {
    appDetail,
    activeModal,
    openModal,
    closeModal,
    secretEnvList,
    setSecretEnvList,
    onEdit,
    onCopy,
    onExport,
    exportCheck: appInfoExportCheck,
    handleConfirmExport,
    onConfirmDelete,
  } = useAppInfoActions({})

  const handleOpenAppModal = useCallback((modal: Exclude<AppInfoModalType, null>) => {
    openModal(modal)
    setOpen(false)
  }, [openModal])

  const handleImportDSL = useCallback(() => {
    setShowImportDSLModal(true)
    setOpen(false)
  }, [setShowImportDSLModal])

  const handleExportDSL = useCallback(() => {
    void exportCheck?.()
    setOpen(false)
  }, [exportCheck])

  const handleShowFeatures = useCallback(() => {
    if (getNodesReadOnly() && !isRestoring)
      return
    setShowFeaturesPanel(!showFeaturesPanel)
    setOpen(false)
  }, [getNodesReadOnly, isRestoring, setShowFeaturesPanel, showFeaturesPanel])

  const handleShowChatVariables = useCallback(() => {
    setShowChatVariablePanel(true)
    setShowEnvPanel(false)
    setShowGlobalVariablePanel(false)
    setShowDebugAndPreviewPanel(false)
    setOpen(false)
  }, [setShowChatVariablePanel, setShowDebugAndPreviewPanel, setShowEnvPanel, setShowGlobalVariablePanel])

  const handleShowEnvironmentVariables = useCallback(() => {
    setShowEnvPanel(true)
    setShowChatVariablePanel(false)
    setShowGlobalVariablePanel(false)
    setShowDebugAndPreviewPanel(false)
    closeAllInputFieldPanels()
    setOpen(false)
  }, [closeAllInputFieldPanels, setShowChatVariablePanel, setShowDebugAndPreviewPanel, setShowEnvPanel, setShowGlobalVariablePanel])

  const handleShowSystemVariables = useCallback(() => {
    setShowGlobalVariablePanel(true)
    setShowChatVariablePanel(false)
    setShowEnvPanel(false)
    setShowDebugAndPreviewPanel(false)
    closeAllInputFieldPanels()
    setOpen(false)
  }, [closeAllInputFieldPanels, setShowChatVariablePanel, setShowDebugAndPreviewPanel, setShowEnvPanel, setShowGlobalVariablePanel])

  const workflowItems = useMemo(() => [
    ...(isChatMode
      ? [
          {
            id: 'features',
            icon: <span aria-hidden className="i-ri-apps-2-add-line h-4 w-4 text-text-tertiary" />,
            label: t('common.features', { ns: 'workflow' }),
            disabled: nodesReadOnly && !isRestoring,
            onClick: handleShowFeatures,
          },
          {
            id: 'conversation-variables',
            icon: <span aria-hidden className="i-custom-vender-line-others-bubble-x h-4 w-4 text-text-tertiary" />,
            label: t('chatVariable.panelTitle', { ns: 'workflow' }),
            disabled: nodesReadOnly,
            onClick: handleShowChatVariables,
          },
        ]
      : []),
    {
      id: 'environment-variables',
      icon: <span aria-hidden className="i-custom-vender-line-others-env h-4 w-4 text-text-tertiary" />,
      label: t('env.envPanelTitle', { ns: 'workflow' }),
      disabled: nodesReadOnly,
      onClick: handleShowEnvironmentVariables,
    },
    {
      id: 'system-variables',
      icon: <span aria-hidden className="i-custom-vender-line-others-global-variable h-4 w-4 text-text-tertiary" />,
      label: t('globalVar.title', { ns: 'workflow' }),
      disabled: nodesReadOnly,
      onClick: handleShowSystemVariables,
    },
  ], [handleShowChatVariables, handleShowEnvironmentVariables, handleShowFeatures, handleShowSystemVariables, isChatMode, isRestoring, nodesReadOnly, t])

  const appItems = useMemo(() => [
    {
      id: 'edit-info',
      icon: <span aria-hidden className="i-ri-edit-line h-4 w-4 text-text-tertiary" />,
      label: t('editApp', { ns: 'app' }),
      onClick: () => handleOpenAppModal('edit'),
    },
    {
      id: 'duplicate',
      icon: <span aria-hidden className="i-ri-file-copy-2-line h-4 w-4 text-text-tertiary" />,
      label: t('duplicate', { ns: 'app' }),
      onClick: () => handleOpenAppModal('duplicate'),
    },
    {
      id: 'import-dsl',
      icon: <span aria-hidden className="i-ri-file-upload-line h-4 w-4 text-text-tertiary" />,
      label: t('common.importDSL', { ns: 'workflow' }),
      onClick: handleImportDSL,
    },
    {
      id: 'export-dsl',
      icon: <span aria-hidden className="i-ri-file-download-line h-4 w-4 text-text-tertiary" />,
      label: t('export', { ns: 'app' }),
      onClick: handleExportDSL,
    },
  ], [handleExportDSL, handleImportDSL, handleOpenAppModal, t])

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={(
            <Button
              aria-label={t('operation.more', { ns: 'common' })}
              data-testid="workflow-canvas-v2-more-menu-trigger"
              className={cn(
                'rounded-lg border border-transparent p-2',
                theme === 'dark' && 'border-black/5 bg-white/10 backdrop-blur-xs',
              )}
            />
          )}
        >
          <span aria-hidden className="i-ri-more-line h-4 w-4 text-components-button-secondary-text" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          placement="bottom-end"
          sideOffset={6}
          popupClassName="min-w-[180px]"
        >
          {workflowItems.map(item => (
            <DropdownMenuItem
              key={item.id}
              disabled={item.disabled}
              className="gap-x-2 px-2"
              onClick={item.onClick}
            >
              {item.icon}
              <span className="system-md-regular text-text-secondary">{item.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {appItems.map(item => (
            <DropdownMenuItem
              key={item.id}
              className="gap-x-2 px-2"
              onClick={item.onClick}
            >
              {item.icon}
              <span className="system-md-regular text-text-secondary">{item.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {appDetail && (
        <AppInfoModals
          appDetail={appDetail}
          activeModal={activeModal}
          closeModal={closeModal}
          secretEnvList={secretEnvList}
          setSecretEnvList={setSecretEnvList}
          onEdit={onEdit}
          onCopy={onCopy}
          onExport={onExport}
          exportCheck={appInfoExportCheck}
          handleConfirmExport={handleConfirmExport}
          onConfirmDelete={onConfirmDelete}
        />
      )}
    </>
  )
})

WorkflowCanvasV2MoreMenu.displayName = 'WorkflowCanvasV2MoreMenu'

const WorkflowCanvasV2Topbar = () => {
  const isChatMode = useIsChatMode()
  const {
    appDetail,
    setCurrentLogItem,
    setShowMessageLogModal,
  } = useAppStore(useShallow(state => ({
    appDetail: state.appDetail,
    setCurrentLogItem: state.setCurrentLogItem,
    setShowMessageLogModal: state.setShowMessageLogModal,
  })))

  const handleClearLogAndMessageModal = useCallback(() => {
    setCurrentLogItem()
    setShowMessageLogModal(false)
  }, [setCurrentLogItem, setShowMessageLogModal])

  const viewHistoryProps = useMemo(() => {
    if (!appDetail)
      return undefined

    return {
      onClearLogAndMessageModal: handleClearLogAndMessageModal,
      historyUrl: isChatMode ? `/apps/${appDetail.id}/advanced-chat/workflow-runs` : `/apps/${appDetail.id}/workflow-runs`,
    }
  }, [appDetail, handleClearLogAndMessageModal, isChatMode])

  return (
    <div
      data-testid="workflow-canvas-v2-topbar"
      className="absolute top-0 right-0 left-0 z-30 flex h-[72px] items-center justify-between border-b border-divider-subtle bg-background-default px-7"
    >
      <div className="min-w-0">
        <WorkflowCanvasV2Breadcrumb />
        <CanvasStatus />
      </div>

      <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2">
        <ScrollToSelectedNodeButton />
      </div>

      <div className="ml-6 flex shrink-0 items-center gap-2">
        <RunAndHistory
          showRunButton={!isChatMode}
          showPreviewButton={isChatMode}
          viewHistoryProps={viewHistoryProps}
        />
        <FeaturesTrigger showFeaturesButton={false} />
        <WorkflowCanvasV2MoreMenu />
        <div className="mx-1 h-5 w-px bg-divider-subtle" />
        <div data-testid="workflow-canvas-v2-account-controls">
          <AccountDropdown />
        </div>
      </div>
    </div>
  )
}

export default memo(WorkflowCanvasV2Topbar)
