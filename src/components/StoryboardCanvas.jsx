import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useGestures } from '../hooks/useGestures'
import { useApp } from '../context/AppContext'
import { useOffline } from '../context/OfflineContext'

const StoryboardCanvas = ({
  nodes = [],
  edges = [],
  onNodesChange,
  onEdgesChange,
  readonly = false,
  onNodeSelect,
  onNodeDoubleClick,
  onEdgeSelect,
  onBackgroundClick,
  className = '',
  height = '600px'
}) => {
  const canvasRef = useRef(null)
  const cyRef = useRef(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [zoomLevel, setZoomLevel] = useState(1)

  const { isDark, showNotification } = useApp()
  const { isOnline } = useOffline()

  // Initialize Cytoscape instance
  useEffect(() => {
    if (!canvasRef.current || cyRef.current) return

    // Ensure Cytoscape is loaded
    if (typeof cytoscape === 'undefined') {
      console.error('Cytoscape.js not loaded')
      return
    }

    try {
      cyRef.current = cytoscape({
        container: canvasRef.current,
        elements: [...nodes, ...edges],
        style: getCytoscapeStyles(isDark),
        layout: {
          name: 'cose',
          animate: true,
          animationDuration: 1000,
          animationEasing: 'ease-out',
          nodeRepulsion: 8000,
          nodeOverlap: 20,
          idealEdgeLength: 100,
          edgeElasticity: 100,
          nestingFactor: 5,
          gravity: 80,
          numIter: 1000,
          initialTemp: 200,
          coolingFactor: 0.95,
          minTemp: 1.0
        },
        zoom: 1,
        pan: { x: 0, y: 0 },
        minZoom: 0.1,
        maxZoom: 3,
        zoomingEnabled: true,
        userZoomingEnabled: !readonly,
        panningEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: !readonly,
        selectionType: 'single',
        touchTapThreshold: 8,
        desktopTapThreshold: 4,
        autolock: readonly,
        autoungrabify: readonly
      })

      // Event handlers
      setupEventHandlers()

      // Auto-layout on initial load
      if (nodes.length > 0) {
        setTimeout(() => {
          cyRef.current?.fit(null, 50)
        }, 100)
      }

    } catch (error) {
      console.error('Error initializing Cytoscape:', error)
      showNotification({
        type: 'error',
        title: 'Canvas Error',
        message: 'Failed to initialize storyboard canvas'
      })
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy()
        cyRef.current = null
      }
    }
  }, [])

  // Update elements when props change
  useEffect(() => {
    if (!cyRef.current) return

    try {
      // Remove all elements
      cyRef.current.elements().remove()

      // Add new elements
      cyRef.current.add([...nodes, ...edges])

      // Re-run layout if elements changed significantly
      if (nodes.length > 0) {
        cyRef.current.layout({ name: 'cose', animate: false }).run()
      }
    } catch (error) {
      console.error('Error updating canvas elements:', error)
    }
  }, [nodes, edges])

  // Update styles when theme changes
  useEffect(() => {
    if (!cyRef.current) return

    cyRef.current.style(getCytoscapeStyles(isDark))
  }, [isDark])

  const setupEventHandlers = () => {
    if (!cyRef.current) return

    // Node selection
    cyRef.current.on('tap', 'node', (event) => {
      const node = event.target
      setSelectedNode(node.id())
      setSelectedEdge(null)
      onNodeSelect?.(node.data())

      // Add selection visual feedback
      cyRef.current.nodes().removeClass('selected')
      node.addClass('selected')
    })

    // Node double-click
    cyRef.current.on('doubleTap', 'node', (event) => {
      const node = event.target
      onNodeDoubleClick?.(node.data(), event.position || event.cyPosition)
    })

    // Edge selection
    cyRef.current.on('tap', 'edge', (event) => {
      const edge = event.target
      setSelectedEdge(edge.id())
      setSelectedNode(null)
      onEdgeSelect?.(edge.data())

      // Add selection visual feedback
      cyRef.current.edges().removeClass('selected')
      edge.addClass('selected')
    })

    // Background click
    cyRef.current.on('tap', (event) => {
      if (event.target === cyRef.current) {
        setSelectedNode(null)
        setSelectedEdge(null)
        cyRef.current.elements().removeClass('selected')
        onBackgroundClick?.(event.position || event.cyPosition)
      }
    })

    // Context menu (right-click)
    cyRef.current.on('cxttap', (event) => {
      if (readonly) return

      event.preventDefault()
      const position = event.position || event.cyPosition
      setContextMenuPos({
        x: position.x + canvasRef.current.offsetLeft,
        y: position.y + canvasRef.current.offsetTop
      })
      setShowContextMenu(true)
    })

    // Drag events
    cyRef.current.on('dragstart', 'node', () => {
      setIsDragging(true)
    })

    cyRef.current.on('dragfree', 'node', (event) => {
      setIsDragging(false)
      if (!readonly) {
        // Update node position
        const node = event.target
        const position = node.position()
        const updatedNodes = nodes.map(n =>
          n.data.id === node.id() ? { ...n, position } : n
        )
        onNodesChange?.(updatedNodes)
      }
    })

    // Zoom events
    cyRef.current.on('zoom', () => {
      setZoomLevel(cyRef.current.zoom())
    })

    // Viewport events for performance
    cyRef.current.on('viewport', () => {
      if (showContextMenu) {
        setShowContextMenu(false)
      }
    })
  }

  // Touch and gesture handling
  const { bindGestures } = useGestures({
    onPinchStart: () => {
      if (cyRef.current) {
        cyRef.current.userZoomingEnabled(true)
      }
    },
    onPinchMove: (scale) => {
      if (cyRef.current && !readonly) {
        const currentZoom = cyRef.current.zoom()
        const newZoom = Math.max(0.1, Math.min(3, currentZoom * scale))
        cyRef.current.zoom(newZoom)
      }
    },
    onDoubleTap: (position) => {
      if (cyRef.current) {
        cyRef.current.fit(null, 50)
      }
    },
    onLongPress: (position) => {
      if (!readonly) {
        setContextMenuPos({ x: position.x, y: position.y })
        setShowContextMenu(true)
      }
    }
  })

  const addNode = useCallback((position, data = {}) => {
    if (readonly) return

    const nodeId = `node-${Date.now()}`
    const newNode = {
      data: {
        id: nodeId,
        label: data.label || 'New Node',
        type: data.type || 'default',
        ...data
      },
      position: position || { x: 100, y: 100 }
    }

    const updatedNodes = [...nodes, newNode]
    onNodesChange?.(updatedNodes)

    // Add visual feedback
    setTimeout(() => {
      if (cyRef.current) {
        const addedNode = cyRef.current.getElementById(nodeId)
        addedNode.addClass('newly-added')
        setTimeout(() => {
          addedNode.removeClass('newly-added')
        }, 1000)
      }
    }, 100)

    return nodeId
  }, [nodes, onNodesChange, readonly])

  const addEdge = useCallback((sourceId, targetId, data = {}) => {
    if (readonly || !sourceId || !targetId) return

    // Check if edge already exists
    const existingEdge = edges.find(e =>
      (e.data.source === sourceId && e.data.target === targetId) ||
      (e.data.source === targetId && e.data.target === sourceId)
    )

    if (existingEdge) {
      showNotification({
        type: 'warning',
        title: 'Connection exists',
        message: 'These nodes are already connected'
      })
      return
    }

    const edgeId = `edge-${Date.now()}`
    const newEdge = {
      data: {
        id: edgeId,
        source: sourceId,
        target: targetId,
        label: data.label || '',
        type: data.type || 'default',
        ...data
      }
    }

    const updatedEdges = [...edges, newEdge]
    onEdgesChange?.(updatedEdges)

    // Add visual feedback
    setTimeout(() => {
      if (cyRef.current) {
        const addedEdge = cyRef.current.getElementById(edgeId)
        addedEdge.addClass('newly-added')
        setTimeout(() => {
          addedEdge.removeClass('newly-added')
        }, 1000)
      }
    }, 100)

    return edgeId
  }, [edges, onEdgesChange, readonly, showNotification])

  const deleteSelected = useCallback(() => {
    if (readonly) return

    if (selectedNode) {
      const updatedNodes = nodes.filter(n => n.data.id !== selectedNode)
      const updatedEdges = edges.filter(e =>
        e.data.source !== selectedNode && e.data.target !== selectedNode
      )
      onNodesChange?.(updatedNodes)
      onEdgesChange?.(updatedEdges)
      setSelectedNode(null)
    } else if (selectedEdge) {
      const updatedEdges = edges.filter(e => e.data.id !== selectedEdge)
      onEdgesChange?.(updatedEdges)
      setSelectedEdge(null)
    }
  }, [selectedNode, selectedEdge, nodes, edges, onNodesChange, onEdgesChange, readonly])

  const centerCanvas = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.fit(null, 50)
    }
  }, [])

  const zoomIn = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.2)
    }
  }, [])

  const zoomOut = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8)
    }
  }, [])

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {/* Canvas */}
      <div
        ref={canvasRef}
        className="w-full h-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
        {...bindGestures()}
        role="img"
        aria-label="Interactive storyboard canvas"
      />

      {/* Controls */}
      {!readonly && (
        <div className="absolute top-4 right-4 flex flex-col space-y-2">
          <button
            onClick={zoomIn}
            className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Zoom in"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <button
            onClick={zoomOut}
            className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Zoom out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
            </svg>
          </button>

          <button
            onClick={centerCanvas}
            className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Center view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>

          {(selectedNode || selectedEdge) && (
            <button
              onClick={deleteSelected}
              className="p-2 bg-red-500 text-white rounded-md shadow-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label="Delete selected"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Status Info */}
      <div className="absolute bottom-4 left-4 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
        Zoom: {Math.round(zoomLevel * 100)}% | Nodes: {nodes.length} | Edges: {edges.length}
        {!isOnline && <span className="text-orange-500 ml-2">Offline</span>}
      </div>

      {/* Context Menu */}
      {showContextMenu && !readonly && (
        <div
          className="absolute bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button
            onClick={() => {
              addNode(contextMenuPos)
              setShowContextMenu(false)
            }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Add Node
          </button>
          {selectedNode && (
            <button
              onClick={() => {
                deleteSelected()
                setShowContextMenu(false)
              }}
              className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Delete Node
            </button>
          )}
        </div>
      )}

      {/* Overlay for closing context menu */}
      {showContextMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowContextMenu(false)}
        />
      )}
    </div>
  )
}

// Cytoscape styles
const getCytoscapeStyles = (isDark) => [
  {
    selector: 'node',
    style: {
      'background-color': isDark ? '#4F46E5' : '#3B82F6',
      'label': 'data(label)',
      'color': isDark ? '#FFFFFF' : '#1F2937',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '12px',
      'font-weight': '500',
      'width': '60px',
      'height': '60px',
      'border-width': '2px',
      'border-color': isDark ? '#6366F1' : '#2563EB',
      'text-outline-width': '2px',
      'text-outline-color': isDark ? '#1F2937' : '#FFFFFF',
      'transition-property': 'background-color, border-color, width, height',
      'transition-duration': '0.3s'
    }
  },
  {
    selector: 'node:selected, node.selected',
    style: {
      'border-color': '#F59E0B',
      'border-width': '3px',
      'background-color': isDark ? '#F59E0B' : '#FBBF24'
    }
  },
  {
    selector: 'node:hover',
    style: {
      'width': '70px',
      'height': '70px',
      'border-width': '3px'
    }
  },
  {
    selector: 'node.newly-added',
    style: {
      'background-color': '#10B981',
      'border-color': '#059669',
      'width': '80px',
      'height': '80px'
    }
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 1.5,
      'line-color': isDark ? '#6B7280' : '#9CA3AF',
      'target-arrow-color': isDark ? '#6B7280' : '#9CA3AF',
      'width': '2px',
      'label': 'data(label)',
      'font-size': '10px',
      'text-rotation': 'autorotate',
      'text-margin-y': '-10px',
      'color': isDark ? '#D1D5DB' : '#374151',
      'transition-property': 'line-color, target-arrow-color, width',
      'transition-duration': '0.3s'
    }
  },
  {
    selector: 'edge:selected, edge.selected',
    style: {
      'line-color': '#F59E0B',
      'target-arrow-color': '#F59E0B',
      'width': '3px'
    }
  },
  {
    selector: 'edge:hover',
    style: {
      'width': '4px',
      'line-color': isDark ? '#4F46E5' : '#3B82F6',
      'target-arrow-color': isDark ? '#4F46E5' : '#3B82F6'
    }
  },
  {
    selector: 'edge.newly-added',
    style: {
      'line-color': '#10B981',
      'target-arrow-color': '#10B981',
      'width': '4px'
    }
  }
]

export default StoryboardCanvas