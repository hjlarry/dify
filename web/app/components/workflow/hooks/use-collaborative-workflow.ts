import type { Edge, Node } from '../types'
import { useCallback, useEffect, useMemo } from 'react'
import { useStoreApi } from 'reactflow'
import { collaborationManager } from '../collaboration/core/collaboration-manager'

const sanitizeNodeForBroadcast = (node: Node): Node => {
  if (!node.data)
    return node

  if (!Object.prototype.hasOwnProperty.call(node.data, 'selected'))
    return node

  const sanitizedData = { ...node.data }
  delete (sanitizedData as Record<string, unknown>).selected

  return {
    ...node,
    data: sanitizedData,
  }
}

const sanitizeEdgeForBroadcast = (edge: Edge): Edge => {
  if (!edge.data)
    return edge

  if (!Object.prototype.hasOwnProperty.call(edge.data, '_connectedNodeIsSelected'))
    return edge

  const sanitizedData = { ...edge.data }
  delete (sanitizedData as Record<string, unknown>)._connectedNodeIsSelected

  return {
    ...edge,
    data: sanitizedData,
  }
}

export const useCollaborativeWorkflow = () => {
  const store = useStoreApi()
  const { setNodes: collabSetNodes, setEdges: collabSetEdges } = collaborationManager

  useEffect(() => {
    collaborationManager.setReactFlowStore(store)
    return () => {
      collaborationManager.setReactFlowStore(null)
    }
  }, [store])

  useEffect(() => {
    const seedIfLeader = () => {
      if (!collaborationManager.getIsLeader())
        return
      const state = store.getState()
      collaborationManager.seedGraph(
        state.getNodes().map(sanitizeNodeForBroadcast),
        state.edges.map(sanitizeEdgeForBroadcast),
      )
    }

    seedIfLeader()
    const unsubscribe = collaborationManager.onLeaderChange((isLeader) => {
      if (isLeader)
        seedIfLeader()
    })
    return () => unsubscribe()
  }, [store])

  const setNodes = useCallback((newNodes: Node[], shouldBroadcast: boolean = true) => {
    const { getNodes, setNodes: reactFlowSetNodes } = store.getState()
    if (collaborationManager.shouldBlockLocalEdits())
      return
    if (shouldBroadcast) {
      const oldNodes = getNodes()
      collabSetNodes(
        oldNodes.map(sanitizeNodeForBroadcast),
        newNodes.map(sanitizeNodeForBroadcast),
      )
    }
    reactFlowSetNodes(newNodes)
  }, [store, collabSetNodes])

  const setEdges = useCallback((newEdges: Edge[], shouldBroadcast: boolean = true) => {
    const { edges, setEdges: reactFlowSetEdges } = store.getState()
    if (collaborationManager.shouldBlockLocalEdits())
      return
    if (shouldBroadcast) {
      collabSetEdges(
        edges.map(sanitizeEdgeForBroadcast),
        newEdges.map(sanitizeEdgeForBroadcast),
      )
    }

    reactFlowSetEdges(newEdges)
  }, [store, collabSetEdges])

  const collaborativeStore = useCallback(() => {
    const state = store.getState()
    return {

      nodes: state.getNodes(),
      edges: state.edges,

      setNodes,
      setEdges,

    }
  }, [store, setNodes, setEdges])

  return useMemo(() => ({
    getState: collaborativeStore,
    setNodes,
    setEdges,
  }), [collaborativeStore, setNodes, setEdges])
}
