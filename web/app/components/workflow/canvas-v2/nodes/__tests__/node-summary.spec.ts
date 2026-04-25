import type { CommonNodeType } from '../../../types'
import {
  BlockEnum,
  VarType,
} from '../../../types'
import { getCanvasV2NodeSummary } from '../node-summary'

const t = (key: string) => key

const getSectionValues = (data: CommonNodeType) => {
  return getCanvasV2NodeSummary(data, t)
    .flatMap(section => section.items)
    .map(item => [item.label, item.value].filter(Boolean).join(': '))
}

describe('getCanvasV2NodeSummary', () => {
  // Summary builder restores old node-card configuration content as hover/select details.
  describe('Rendering', () => {
    it('should extract model, prompt, context, and vision details for llm nodes', () => {
      const values = getSectionValues({
        desc: 'Generate a final response',
        model: {
          completion_params: {},
          mode: 'chat',
          name: 'gpt-4o',
          provider: 'openai',
        },
        prompt_template: [
          {
            role: 'system',
            text: 'Be concise',
          },
        ],
        context: {
          enabled: true,
          variable_selector: ['knowledge', 'text'],
        },
        structured_output_enabled: true,
        title: 'LLM',
        type: BlockEnum.LLM,
        vision: {
          enabled: true,
        },
      } as CommonNodeType)

      expect(values).toContain('Generate a final response')
      expect(values).toContain('canvasV2.summary.model: openai / gpt-4o')
      expect(values).toContain('canvasV2.summary.prompt: system: Be concise')
      expect(values).toContain('canvasV2.summary.context: knowledge.text')
      expect(values).toContain('canvasV2.summary.vision: canvasV2.summary.enabled')
      expect(values).toContain('canvasV2.summary.structuredOutput: canvasV2.summary.enabled')
    })

    it('should extract request summaries for http nodes', () => {
      const values = getSectionValues({
        authorization: {
          type: 'api-key',
        },
        body: {
          type: 'json',
        },
        desc: '',
        headers: 'Authorization: Bearer {{token}}',
        method: 'post',
        params: 'q={{query}}',
        title: 'HTTP',
        type: BlockEnum.HttpRequest,
        url: 'https://api.example.com/search',
      } as CommonNodeType)

      expect(values).toContain('canvasV2.summary.method: post')
      expect(values).toContain('canvasV2.summary.url: https://api.example.com/search')
      expect(values).toContain('canvasV2.summary.headers: Authorization: Bearer {{token}}')
      expect(values).toContain('canvasV2.summary.params: q={{query}}')
      expect(values).toContain('canvasV2.summary.body: json')
      expect(values).toContain('canvasV2.summary.authorization: api-key')
    })

    it('should extract branch conditions for if else nodes', () => {
      const values = getSectionValues({
        cases: [
          {
            case_id: 'case-1',
            conditions: [
              {
                comparison_operator: '=',
                id: 'condition-1',
                value: 'paid',
                variable_selector: ['start', 'plan'],
                varType: VarType.string,
              },
            ],
            logical_operator: 'and',
          },
          {
            case_id: 'case-2',
            conditions: [],
            logical_operator: 'or',
          },
        ],
        desc: '',
        title: 'Route',
        type: BlockEnum.IfElse,
      } as CommonNodeType)

      expect(values).toContain('IF: start.plan = paid')
      expect(values).toContain('ELIF: canvasV2.summary.notSet')
      expect(values).toContain('ELSE: canvasV2.summary.defaultBranch')
    })

    it('should extract tool configuration and redact secret fields', () => {
      const values = getSectionValues({
        desc: '',
        paramSchemas: [
          {
            name: 'api_key',
            type: 'secret-input',
          },
        ],
        provider_name: 'Search Provider',
        title: 'Search',
        tool_configurations: {
          api_key: {
            value: 'sk-secret',
          },
          region: {
            value: 'us',
          },
        },
        tool_label: 'Search Web',
        tool_name: 'search',
        tool_parameters: {
          query: {
            value: ['start', 'query'],
          },
        },
        type: BlockEnum.Tool,
      } as CommonNodeType)

      expect(values).toContain('canvasV2.summary.provider: Search Provider')
      expect(values).toContain('canvasV2.summary.tool: Search Web')
      expect(values).toContain('api_key: ********')
      expect(values).toContain('region: us')
      expect(values).toContain('query: start.query')
    })

    it('should extract variable aggregator groups', () => {
      const values = getSectionValues({
        advanced_settings: {
          group_enabled: true,
          groups: [
            {
              groupId: 'group-1',
              group_name: 'Documents',
              output_type: 'array[string]',
              variables: [['start', 'files']],
            },
          ],
        },
        desc: '',
        title: 'Aggregator',
        type: BlockEnum.VariableAggregator,
      } as CommonNodeType)

      expect(values).toContain('Documents: start.files')
    })

    it('should extract knowledge base index and retrieval summaries', () => {
      const values = getSectionValues({
        chunk_structure: 'text_model',
        desc: '',
        embedding_model: 'text-embedding-3-large',
        embedding_model_provider: 'openai',
        index_chunk_variable_selector: ['start', 'file'],
        indexing_technique: 'high_quality',
        retrieval_model: {
          reranking_enable: true,
          reranking_model: {
            reranking_model_name: 'rerank',
            reranking_provider_name: 'cohere',
          },
          score_threshold: 0.6,
          score_threshold_enabled: true,
          search_method: 'hybrid_search',
          top_k: 5,
        },
        title: 'Knowledge Base',
        type: BlockEnum.KnowledgeBase,
      } as CommonNodeType)

      expect(values).toContain('canvasV2.summary.input: start.file')
      expect(values).toContain('canvasV2.summary.chunkStructure: text_model')
      expect(values).toContain('canvasV2.summary.indexMethod: high_quality')
      expect(values).toContain('canvasV2.summary.embedding: openai / text-embedding-3-large')
      expect(values).toContain('canvasV2.summary.method: hybrid_search')
      expect(values).toContain('top_k: 5')
      expect(values).toContain('score_threshold: 0.6')
      expect(values).toContain('canvasV2.summary.reranking: canvasV2.summary.enabled')
      expect(values).toContain('canvasV2.summary.model: cohere / rerank')
    })

    it('should extract data source configuration and redact secret fields', () => {
      const values = getSectionValues({
        datasource_configurations: {
          api_token: {
            value: 'secret-token',
          },
          folder: {
            value: '/docs',
          },
        },
        datasource_label: 'Google Drive',
        datasource_name: 'google_drive',
        datasource_parameters: {
          path: {
            value: ['start', 'path'],
          },
        },
        desc: '',
        fileExtensions: ['pdf', 'md'],
        provider_name: 'Drive Provider',
        title: 'Data Source',
        type: BlockEnum.DataSource,
      } as CommonNodeType)

      expect(values).toContain('canvasV2.summary.provider: Drive Provider')
      expect(values).toContain('canvasV2.summary.dataSource: Google Drive')
      expect(values).toContain('canvasV2.summary.fileExtensions: pdf, md')
      expect(values).toContain('api_token: ********')
      expect(values).toContain('folder: /docs')
      expect(values).toContain('path: start.path')
    })
  })
})
