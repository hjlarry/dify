import type { FC } from 'react'
import type { CommonNodeType } from '../../types'
import { cn } from '@langgenius/dify-ui/cn'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getCanvasV2NodeSummary } from './node-summary'

type NodeSummaryPreviewProps = {
  data: CommonNodeType
  open: boolean
}

const NodeSummaryPreview: FC<NodeSummaryPreviewProps> = ({
  data,
  open,
}) => {
  const { t } = useTranslation()
  const sections = useMemo(() => {
    if (!open)
      return []

    return getCanvasV2NodeSummary(data, t)
  }, [data, open, t])

  if (!open || !sections.length)
    return null

  return (
    <div
      data-testid="workflow-canvas-v2-node-summary"
      className={cn(
        'pointer-events-auto absolute top-full left-0 z-30 mt-1 max-h-[320px] w-[280px] overflow-y-auto rounded-lg border border-workflow-block-border bg-workflow-block-bg p-2 shadow-lg',
      )}
    >
      <div className="flex flex-col gap-2">
        {sections.map(section => (
          <div key={section.title} className="flex flex-col gap-1">
            <div className="system-2xs-semibold-uppercase text-text-tertiary">
              {section.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map(item => (
                <div
                  key={`${section.title}-${item.label ?? ''}-${item.value}`}
                  className="rounded-md bg-workflow-block-parma-bg px-1.5 py-1"
                >
                  {item.label && (
                    <div
                      title={item.label}
                      className="mb-0.5 truncate system-2xs-medium-uppercase text-text-quaternary"
                    >
                      {item.label}
                    </div>
                  )}
                  <div
                    title={item.value}
                    className="line-clamp-3 system-xs-regular wrap-break-word whitespace-pre-wrap text-text-secondary"
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(NodeSummaryPreview)
