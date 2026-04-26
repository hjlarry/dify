'use client'

import type { AppInfoModalType } from '@/app/components/app-sidebar/app-info/use-app-info-actions'
import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@langgenius/dify-ui/dropdown-menu'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import AppInfoModals from '@/app/components/app-sidebar/app-info/app-info-modals'
import { useAppInfoActions } from '@/app/components/app-sidebar/app-info/use-app-info-actions'
import { useStore as useAppStore } from '@/app/components/app/store'
import AccountDropdown from '@/app/components/header/account-dropdown'
import ChatVariableTrigger from '@/app/components/workflow-app/components/workflow-header/chat-variable-trigger'
import FeaturesTrigger from '@/app/components/workflow-app/components/workflow-header/features-trigger'
import EnvButton from '@/app/components/workflow/header/env-button'
import GlobalVariableButton from '@/app/components/workflow/header/global-variable-button'
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

const WorkflowCanvasV2MoreMenu = memo(() => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const setShowImportDSLModal = useStore(s => s.setShowImportDSLModal)
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

  const menuItems = useMemo(() => [
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
          {menuItems.map(item => (
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
  const { t } = useTranslation()
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
  const { nodesReadOnly } = useNodesReadOnly()

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

  const appName = appDetail?.name || t('menus.appDetail', { ns: 'common' })

  return (
    <div
      data-testid="workflow-canvas-v2-topbar"
      className="absolute top-0 right-0 left-0 z-30 flex h-[72px] items-center justify-between border-b border-divider-subtle bg-background-default px-7"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1 system-sm-semibold text-text-primary">
          <span className="max-w-[260px] truncate">{appName}</span>
          <span className="shrink-0 text-text-tertiary">/</span>
          <span className="shrink-0">{t('appMenus.promptEng', { ns: 'common' })}</span>
        </div>
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
        <div className="shrink-0 cursor-pointer rounded-lg border-[0.5px] border-components-button-secondary-border bg-components-button-secondary-bg shadow-xs backdrop-blur-[10px]">
          <ChatVariableTrigger />
          <EnvButton disabled={nodesReadOnly} />
          <GlobalVariableButton disabled={nodesReadOnly} />
        </div>
        <FeaturesTrigger />
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
