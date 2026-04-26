import type {
  Edge,
  Node,
} from '../types'
import type { ContainerSubgraphGraphChange } from './container-subgraph-node'
import {
  AddBlockButton,
  SubgraphConnection,
  SubgraphNodeCard,
} from './container-subgraph-node'
import { findEdgeBetween } from './container-subgraph-utils'

type SubgraphLinearFlowProps = {
  internalEdges: Edge[]
  onGraphChange: ContainerSubgraphGraphChange
  onSelect: (nodeId: string) => void
  subgraphNodes: Node[]
}

export const SubgraphLinearFlow = ({
  internalEdges,
  onGraphChange,
  onSelect,
  subgraphNodes,
}: SubgraphLinearFlowProps) => {
  return (
    <div
      data-testid="workflow-canvas-v2-container-subgraph-linear-layout"
      className="flex min-h-full min-w-max items-center p-8"
    >
      {subgraphNodes.map((node, index) => {
        const nextNode = subgraphNodes[index + 1]
        const edge = nextNode ? findEdgeBetween(internalEdges, node, nextNode) : undefined

        return (
          <div key={node.id} className="flex items-center">
            <SubgraphNodeCard
              edge={edge}
              nextNode={nextNode}
              node={node}
              onGraphChange={onGraphChange}
              onSelect={onSelect}
            />
            {nextNode
              ? <SubgraphConnection />
              : (
                  <AddBlockButton
                    sourceNode={node}
                    onGraphChange={onGraphChange}
                    variant="terminal"
                  />
                )}
          </div>
        )
      })}
    </div>
  )
}
