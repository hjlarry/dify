import type {
  CommonNodeType,
  ValueSelector,
} from '../../types'
import {
  BlockEnum,
} from '../../types'

export type CanvasV2NodeSummaryItem = {
  label?: string
  value: string
}

export type CanvasV2NodeSummarySection = {
  title: string
  items: CanvasV2NodeSummaryItem[]
}

type TranslationFn = (key: string, options?: { ns: string }) => string
type DataRecord = CommonNodeType & Record<string, unknown>

const SECRET_VALUE = '********'

const tSummary = (t: TranslationFn, key: string) => {
  return t(`canvasV2.summary.${key}`, { ns: 'workflow' })
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isValueSelector = (value: unknown): value is ValueSelector => {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

const normalizeText = (value: unknown): string => {
  if (value === null || value === undefined)
    return ''

  if (typeof value === 'string')
    return value.trim()

  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)

  if (isValueSelector(value))
    return value.join('.')

  if (Array.isArray(value))
    return value.map(normalizeText).filter(Boolean).join(', ')

  if (isRecord(value)) {
    const nestedValue = value.value ?? value.model ?? value.name ?? value.label ?? value.title
    if (nestedValue !== undefined)
      return normalizeText(nestedValue)

    try {
      return JSON.stringify(value)
    }
    catch {
      return ''
    }
  }

  return ''
}

const isSecretKey = (key: string) => {
  return /secret|password|token|api[_-]?key/i.test(key)
}

const isSecretSchema = (schema: unknown) => {
  return isRecord(schema) && schema.type === 'secret-input'
}

const getConfigDisplayValue = (key: string, value: unknown, schema?: unknown) => {
  if (isSecretKey(key) || isSecretSchema(schema))
    return SECRET_VALUE

  if (isRecord(value) && value.type === 'model-selector')
    return normalizeText(value.model)

  return normalizeText(value)
}

const pushItem = (items: CanvasV2NodeSummaryItem[], label: string | undefined, value: unknown) => {
  const text = normalizeText(value)
  if (!text)
    return

  items.push({
    ...(label && { label }),
    value: text,
  })
}

const pushSection = (
  sections: CanvasV2NodeSummarySection[],
  title: string,
  items: CanvasV2NodeSummaryItem[],
) => {
  if (!items.length)
    return

  sections.push({
    title,
    items,
  })
}

const getModelValue = (model: unknown) => {
  if (!isRecord(model))
    return ''

  const provider = normalizeText(model.provider)
  const name = normalizeText(model.name ?? model.model ?? model.modelId)

  return [provider, name].filter(Boolean).join(' / ')
}

const getPromptValue = (prompt: unknown) => {
  if (Array.isArray(prompt)) {
    return prompt
      .map((item) => {
        if (!isRecord(item))
          return normalizeText(item)

        const role = normalizeText(item.role)
        const text = normalizeText(item.text ?? item.jinja2_text)
        return [role, text].filter(Boolean).join(': ')
      })
      .filter(Boolean)
      .join('\n')
  }

  if (isRecord(prompt))
    return normalizeText(prompt.text ?? prompt.jinja2_text)

  return normalizeText(prompt)
}

const getNamedItems = (
  value: unknown,
  fallbackLabel: string,
  options?: {
    requiredLabel?: string
  },
) => {
  if (!Array.isArray(value))
    return []

  return value.reduce<CanvasV2NodeSummaryItem[]>((items, item, index) => {
    if (!isRecord(item)) {
      pushItem(items, `${fallbackLabel} ${index + 1}`, item)
      return items
    }

    const label = normalizeText(item.variable ?? item.name ?? item.title ?? item.id) || `${fallbackLabel} ${index + 1}`
    const valueText = [
      normalizeText(item.type ?? item.value_type ?? item.output_type),
      item.required === true ? options?.requiredLabel : '',
    ].filter(Boolean).join(' · ')

    pushItem(items, label, valueText || item.value_selector || item.selector || item.value)
    return items
  }, [])
}

const getRecordItems = (
  record: unknown,
  options?: {
    schemas?: unknown
  },
) => {
  if (!isRecord(record))
    return []

  const schemas = Array.isArray(options?.schemas) ? options.schemas : []

  return Object.entries(record).reduce<CanvasV2NodeSummaryItem[]>((items, [key, value]) => {
    const schema = schemas.find(schema => isRecord(schema) && schema.name === key)
    const displayValue = getConfigDisplayValue(key, value, schema)
    pushItem(items, key, displayValue)
    return items
  }, [])
}

const getVariableSelectorItems = (
  value: unknown,
  fallbackLabel: string,
) => {
  if (!Array.isArray(value))
    return []

  return value.reduce<CanvasV2NodeSummaryItem[]>((items, item, index) => {
    if (isValueSelector(item))
      pushItem(items, `${fallbackLabel} ${index + 1}`, item)
    else if (isRecord(item))
      pushItem(items, normalizeText(item.variable ?? item.name) || `${fallbackLabel} ${index + 1}`, item.value_selector ?? item.selector ?? item.variable_selector)

    return items
  }, [])
}

const getConditionValue = (condition: unknown, t: TranslationFn) => {
  if (!isRecord(condition))
    return normalizeText(condition)

  const selector = normalizeText(condition.variable_selector)
  const operator = normalizeText(condition.comparison_operator)
  const value = normalizeText(condition.value)

  if (!selector && !operator && !value)
    return tSummary(t, 'notSet')

  return [selector, operator, value].filter(Boolean).join(' ')
}

const appendModelSection = (
  sections: CanvasV2NodeSummarySection[],
  record: DataRecord,
  t: TranslationFn,
) => {
  const items: CanvasV2NodeSummaryItem[] = []
  pushItem(items, tSummary(t, 'model'), getModelValue(record.model))
  pushSection(sections, tSummary(t, 'model'), items)
}

const appendDescriptionSection = (
  sections: CanvasV2NodeSummarySection[],
  record: DataRecord,
  t: TranslationFn,
) => {
  if (record.type === BlockEnum.Iteration || record.type === BlockEnum.Loop)
    return

  const items: CanvasV2NodeSummaryItem[] = []
  pushItem(items, undefined, record.desc)
  pushSection(sections, tSummary(t, 'description'), items)
}

const appendLlmSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  appendModelSection(sections, record, t)

  const promptItems: CanvasV2NodeSummaryItem[] = []
  pushItem(promptItems, tSummary(t, 'prompt'), getPromptValue(record.prompt_template))
  pushItem(promptItems, tSummary(t, 'context'), isRecord(record.context) && record.context.enabled ? record.context.variable_selector : '')
  pushItem(promptItems, tSummary(t, 'vision'), isRecord(record.vision) && record.vision.enabled ? tSummary(t, 'enabled') : '')
  pushItem(promptItems, tSummary(t, 'structuredOutput'), record.structured_output_enabled ? tSummary(t, 'enabled') : '')
  pushSection(sections, tSummary(t, 'configuration'), promptItems)
}

const appendHttpSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const items: CanvasV2NodeSummaryItem[] = []
  pushItem(items, tSummary(t, 'method'), record.method)
  pushItem(items, tSummary(t, 'url'), record.url)
  pushItem(items, tSummary(t, 'headers'), record.headers)
  pushItem(items, tSummary(t, 'params'), record.params)
  if (isRecord(record.body))
    pushItem(items, tSummary(t, 'body'), record.body.type)
  if (isRecord(record.authorization))
    pushItem(items, tSummary(t, 'authorization'), record.authorization.type)
  pushSection(sections, tSummary(t, 'request'), items)
}

const appendToolSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const toolItems: CanvasV2NodeSummaryItem[] = []
  pushItem(toolItems, tSummary(t, 'provider'), record.provider_name)
  pushItem(toolItems, tSummary(t, 'tool'), record.tool_label ?? record.tool_name)
  pushItem(toolItems, tSummary(t, 'description'), record.tool_description)
  pushSection(sections, tSummary(t, 'tool'), toolItems)

  pushSection(sections, tSummary(t, 'configuration'), getRecordItems(record.tool_configurations, { schemas: record.paramSchemas }))
  pushSection(sections, tSummary(t, 'parameters'), getRecordItems(record.tool_parameters))
}

const appendIfElseSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  if (!Array.isArray(record.cases))
    return

  const items = record.cases.reduce<CanvasV2NodeSummaryItem[]>((result, caseItem, index) => {
    if (!isRecord(caseItem))
      return result

    const conditions = Array.isArray(caseItem.conditions) ? caseItem.conditions : []
    const label = index === 0 ? 'IF' : 'ELIF'
    const value = conditions.length
      ? conditions.map(condition => getConditionValue(condition, t)).join(` ${normalizeText(caseItem.logical_operator).toUpperCase()} `)
      : tSummary(t, 'notSet')

    pushItem(result, label, value)
    return result
  }, [])

  pushItem(items, 'ELSE', tSummary(t, 'defaultBranch'))
  pushSection(sections, tSummary(t, 'conditions'), items)
}

const appendQuestionClassifierSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  appendModelSection(sections, record, t)

  const queryItems: CanvasV2NodeSummaryItem[] = []
  pushItem(queryItems, tSummary(t, 'query'), record.query_variable_selector)
  pushItem(queryItems, tSummary(t, 'instruction'), record.instruction)
  pushSection(sections, tSummary(t, 'configuration'), queryItems)

  const classItems = Array.isArray(record.classes)
    ? record.classes.reduce<CanvasV2NodeSummaryItem[]>((items, item, index) => {
        if (isRecord(item))
          pushItem(items, `${tSummary(t, 'class')} ${index + 1}`, item.name)
        return items
      }, [])
    : []
  pushSection(sections, tSummary(t, 'classes'), classItems)
}

const appendHumanInputSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const deliveryItems = Array.isArray(record.delivery_methods)
    ? record.delivery_methods.reduce<CanvasV2NodeSummaryItem[]>((items, method) => {
        if (isRecord(method) && method.enabled !== false)
          pushItem(items, tSummary(t, 'method'), method.type)
        return items
      }, [])
    : []
  pushSection(sections, tSummary(t, 'deliveryMethods'), deliveryItems)

  const actionItems = Array.isArray(record.user_actions)
    ? record.user_actions.reduce<CanvasV2NodeSummaryItem[]>((items, action) => {
        if (isRecord(action))
          pushItem(items, normalizeText(action.id), action.title ?? action.id)
        return items
      }, [])
    : []
  pushSection(sections, tSummary(t, 'actions'), actionItems)

  const formItems = getNamedItems(record.inputs, tSummary(t, 'input'), {
    requiredLabel: tSummary(t, 'required'),
  })
  pushItem(formItems, tSummary(t, 'timeout'), [record.timeout, record.timeout_unit].filter(Boolean).join(' '))
  pushSection(sections, tSummary(t, 'form'), formItems)
}

const appendKnowledgeSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const datasetItems = Array.isArray(record._datasets) && record._datasets.length
    ? record._datasets.reduce<CanvasV2NodeSummaryItem[]>((items, dataset, index) => {
        if (isRecord(dataset))
          pushItem(items, `${tSummary(t, 'dataset')} ${index + 1}`, dataset.name ?? dataset.id)
        return items
      }, [])
    : Array.isArray(record.dataset_ids)
      ? record.dataset_ids.reduce<CanvasV2NodeSummaryItem[]>((items, datasetId, index) => {
          pushItem(items, `${tSummary(t, 'dataset')} ${index + 1}`, datasetId)
          return items
        }, [])
      : []
  pushSection(sections, tSummary(t, 'datasets'), datasetItems)

  const configItems: CanvasV2NodeSummaryItem[] = []
  pushItem(configItems, tSummary(t, 'query'), record.query_variable_selector)
  pushItem(configItems, tSummary(t, 'retrieval'), record.retrieval_mode)
  if (isRecord(record.multiple_retrieval_config)) {
    pushItem(configItems, 'top_k', record.multiple_retrieval_config.top_k)
    pushItem(configItems, 'score_threshold', record.multiple_retrieval_config.score_threshold)
  }
  pushSection(sections, tSummary(t, 'configuration'), configItems)
}

const appendKnowledgeBaseSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const inputItems: CanvasV2NodeSummaryItem[] = []
  pushItem(inputItems, tSummary(t, 'input'), record.index_chunk_variable_selector)
  pushItem(inputItems, tSummary(t, 'chunkStructure'), record.chunk_structure)
  pushSection(sections, tSummary(t, 'input'), inputItems)

  const indexItems: CanvasV2NodeSummaryItem[] = []
  pushItem(indexItems, tSummary(t, 'indexMethod'), record.indexing_technique)
  pushItem(indexItems, tSummary(t, 'embedding'), [record.embedding_model_provider, record.embedding_model].filter(Boolean).join(' / '))
  pushSection(sections, tSummary(t, 'index'), indexItems)

  if (isRecord(record.retrieval_model)) {
    const retrievalItems: CanvasV2NodeSummaryItem[] = []
    pushItem(retrievalItems, tSummary(t, 'method'), record.retrieval_model.search_method)
    pushItem(retrievalItems, 'top_k', record.retrieval_model.top_k)
    pushItem(retrievalItems, 'score_threshold', record.retrieval_model.score_threshold_enabled ? record.retrieval_model.score_threshold : '')
    pushItem(retrievalItems, tSummary(t, 'reranking'), record.retrieval_model.reranking_enable ? tSummary(t, 'enabled') : '')
    if (isRecord(record.retrieval_model.reranking_model)) {
      pushItem(
        retrievalItems,
        tSummary(t, 'model'),
        [
          normalizeText(record.retrieval_model.reranking_model.reranking_provider_name),
          normalizeText(record.retrieval_model.reranking_model.reranking_model_name),
        ].filter(Boolean).join(' / '),
      )
    }
    pushSection(sections, tSummary(t, 'retrieval'), retrievalItems)
  }
}

const appendStartSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  pushSection(sections, tSummary(t, 'variables'), getNamedItems(record.variables, tSummary(t, 'variable'), {
    requiredLabel: tSummary(t, 'required'),
  }))
}

const appendAnswerSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const items: CanvasV2NodeSummaryItem[] = []
  pushItem(items, tSummary(t, 'answer'), record.answer)
  pushSection(sections, tSummary(t, 'answer'), items)
}

const appendOutputSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  pushSection(sections, tSummary(t, 'outputs'), getVariableSelectorItems(record.outputs, tSummary(t, 'output')))
}

const appendVariableSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  if (isRecord(record.advanced_settings) && record.advanced_settings.group_enabled && Array.isArray(record.advanced_settings.groups)) {
    const groupItems = record.advanced_settings.groups.reduce<CanvasV2NodeSummaryItem[]>((items, group) => {
      if (isRecord(group))
        pushItem(items, normalizeText(group.group_name), group.variables)
      return items
    }, [])
    pushSection(sections, tSummary(t, 'groups'), groupItems)
    return
  }

  pushSection(sections, tSummary(t, 'variables'), getVariableSelectorItems(record.variables, tSummary(t, 'variable')))
}

const appendAssignerSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  if (Array.isArray(record.items)) {
    const items = record.items.reduce<CanvasV2NodeSummaryItem[]>((result, item) => {
      if (isRecord(item))
        pushItem(result, normalizeText(item.operation) || tSummary(t, 'operation'), item.variable_selector)
      return result
    }, [])
    pushSection(sections, tSummary(t, 'operations'), items)
    return
  }

  const items: CanvasV2NodeSummaryItem[] = []
  pushItem(items, normalizeText(record.write_mode) || tSummary(t, 'operation'), record.assigned_variable_selector)
  pushSection(sections, tSummary(t, 'operations'), items)
}

const appendListFilterSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const items: CanvasV2NodeSummaryItem[] = []
  pushItem(items, tSummary(t, 'input'), record.variable)
  if (isRecord(record.filter_by) && record.filter_by.enabled)
    pushItem(items, tSummary(t, 'filter'), Array.isArray(record.filter_by.conditions) ? record.filter_by.conditions.map(condition => getConditionValue(condition, t)).join(', ') : '')
  if (isRecord(record.extract_by) && record.extract_by.enabled)
    pushItem(items, tSummary(t, 'extract'), record.extract_by.serial)
  if (isRecord(record.order_by) && record.order_by.enabled)
    pushItem(items, tSummary(t, 'order'), [normalizeText(record.order_by.key), normalizeText(record.order_by.value)].filter(Boolean).join(' '))
  if (isRecord(record.limit) && record.limit.enabled)
    pushItem(items, tSummary(t, 'limit'), record.limit.size)
  pushSection(sections, tSummary(t, 'configuration'), items)
}

const appendParameterExtractorSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  appendModelSection(sections, record, t)

  const items: CanvasV2NodeSummaryItem[] = []
  pushItem(items, tSummary(t, 'query'), record.query)
  pushItem(items, tSummary(t, 'reasoningMode'), record.reasoning_mode)
  pushItem(items, tSummary(t, 'instruction'), record.instruction)
  pushSection(sections, tSummary(t, 'configuration'), items)
  pushSection(sections, tSummary(t, 'parameters'), getNamedItems(record.parameters, tSummary(t, 'parameter'), {
    requiredLabel: tSummary(t, 'required'),
  }))
}

const appendAgentSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const strategyItems: CanvasV2NodeSummaryItem[] = []
  pushItem(strategyItems, tSummary(t, 'strategy'), record.agent_strategy_label ?? record.agent_strategy_name)
  pushItem(strategyItems, tSummary(t, 'provider'), record.agent_strategy_provider_name)
  pushSection(sections, tSummary(t, 'agent'), strategyItems)
  pushSection(sections, tSummary(t, 'parameters'), getRecordItems(record.agent_parameters))
}

const appendDataSourceSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const dataSourceItems: CanvasV2NodeSummaryItem[] = []
  pushItem(dataSourceItems, tSummary(t, 'provider'), record.provider_name)
  pushItem(dataSourceItems, tSummary(t, 'dataSource'), record.datasource_label ?? record.datasource_name)
  pushItem(dataSourceItems, tSummary(t, 'fileExtensions'), Array.isArray(record.fileExtensions) ? record.fileExtensions.join(', ') : record.fileExtensions)
  pushSection(sections, tSummary(t, 'dataSource'), dataSourceItems)

  pushSection(sections, tSummary(t, 'configuration'), getRecordItems(record.datasource_configurations))
  pushSection(sections, tSummary(t, 'parameters'), getRecordItems(record.datasource_parameters))
}

const appendTriggerSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const items: CanvasV2NodeSummaryItem[] = []

  if (record.type === BlockEnum.TriggerWebhook) {
    pushItem(items, tSummary(t, 'method'), record.method)
    pushItem(items, tSummary(t, 'url'), record.webhook_url)
    pushItem(items, tSummary(t, 'contentType'), record.content_type)
    pushItem(items, tSummary(t, 'asyncMode'), typeof record.async_mode === 'boolean' ? (record.async_mode ? tSummary(t, 'enabled') : tSummary(t, 'disabled')) : '')
  }

  if (record.type === BlockEnum.TriggerSchedule) {
    pushItem(items, tSummary(t, 'mode'), record.mode)
    pushItem(items, tSummary(t, 'frequency'), record.frequency)
    pushItem(items, tSummary(t, 'cron'), record.cron_expression)
    pushItem(items, tSummary(t, 'timezone'), record.timezone)
  }

  if (record.type === BlockEnum.TriggerPlugin) {
    pushItem(items, tSummary(t, 'event'), record.event_label ?? record.event_name)
    pushItem(items, tSummary(t, 'provider'), record.provider_name)
  }

  pushSection(sections, tSummary(t, 'trigger'), items)

  if (record.type === BlockEnum.TriggerPlugin)
    pushSection(sections, tSummary(t, 'configuration'), getRecordItems(record.config ?? record.event_configurations))
}

const appendContainerSummary = (sections: CanvasV2NodeSummarySection[], record: DataRecord, t: TranslationFn) => {
  const items: CanvasV2NodeSummaryItem[] = []
  pushItem(items, tSummary(t, 'children'), record._collapsedChildrenCount)
  pushItem(items, tSummary(t, 'iteration'), record._iterationLength)
  pushItem(items, tSummary(t, 'loop'), record._loopLength)
  pushSection(sections, tSummary(t, 'container'), items)
}

export const getCanvasV2NodeSummary = (data: CommonNodeType, t: TranslationFn) => {
  const record = data as DataRecord
  const sections: CanvasV2NodeSummarySection[] = []

  appendDescriptionSection(sections, record, t)

  switch (data.type) {
    case BlockEnum.Start:
      appendStartSummary(sections, record, t)
      break
    case BlockEnum.Answer:
      appendAnswerSummary(sections, record, t)
      break
    case BlockEnum.End:
      appendOutputSummary(sections, record, t)
      break
    case BlockEnum.LLM:
      appendLlmSummary(sections, record, t)
      break
    case BlockEnum.KnowledgeRetrieval:
      appendKnowledgeSummary(sections, record, t)
      break
    case BlockEnum.KnowledgeBase:
      appendKnowledgeBaseSummary(sections, record, t)
      break
    case BlockEnum.IfElse:
      appendIfElseSummary(sections, record, t)
      break
    case BlockEnum.QuestionClassifier:
      appendQuestionClassifierSummary(sections, record, t)
      break
    case BlockEnum.HttpRequest:
      appendHttpSummary(sections, record, t)
      break
    case BlockEnum.Tool:
      appendToolSummary(sections, record, t)
      break
    case BlockEnum.ParameterExtractor:
      appendParameterExtractorSummary(sections, record, t)
      break
    case BlockEnum.VariableAssigner:
    case BlockEnum.VariableAggregator:
      appendVariableSummary(sections, record, t)
      break
    case BlockEnum.Assigner:
      appendAssignerSummary(sections, record, t)
      break
    case BlockEnum.ListFilter:
      appendListFilterSummary(sections, record, t)
      break
    case BlockEnum.DocExtractor:
      pushSection(sections, tSummary(t, 'input'), getVariableSelectorItems([record.variable_selector], tSummary(t, 'input')))
      break
    case BlockEnum.HumanInput:
      appendHumanInputSummary(sections, record, t)
      break
    case BlockEnum.Agent:
      appendAgentSummary(sections, record, t)
      break
    case BlockEnum.DataSource:
    case BlockEnum.DataSourceEmpty:
      appendDataSourceSummary(sections, record, t)
      break
    case BlockEnum.TriggerWebhook:
    case BlockEnum.TriggerSchedule:
    case BlockEnum.TriggerPlugin:
      appendTriggerSummary(sections, record, t)
      break
    case BlockEnum.Iteration:
    case BlockEnum.Loop:
      appendContainerSummary(sections, record, t)
      break
    default:
      break
  }

  return sections
}
