import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useOffline } from '../context/OfflineContext'
import { useApi } from '../hooks/useApi'
import StoryboardCanvas from '../components/StoryboardCanvas'
import LoadingSpinner from '../components/LoadingSpinner'

const StoryboardEditor = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id

  const [storyboard, setStoryboard] = useState({
    title: '',
    description: '',
    nodes: [],
    edges: [],
    isPublic: false,
    isCollaborative: true,
    tags: []
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEditing)
  const [showNodeEditor, setShowNodeEditor] = useState(false)
  const [selectedNodeData, setSelectedNodeData] = useState(null)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)
  const [lastSaved, setLastSaved] = useState(null)

  const { user } = useAuth()
  const { showNotification } = useApp()
  const { saveOffline, isOnline } = useOffline()
  const { get, post, put } = useApi()

  // Load existing storyboard
  useEffect(() => {
    if (isEditing) {
      loadStoryboard()
    }
  }, [id, isEditing])

  // Auto-save functionality
  useEffect(() => {
    if (!autoSaveEnabled || !storyboard.title) return

    const timer = setTimeout(() => {
      if (isOnline) {
        handleSave(true)
      } else {
        saveOffline('storyboard', storyboard, { action: isEditing ? 'update' : 'create' })
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [storyboard, autoSaveEnabled, isOnline])

  const loadStoryboard = async () => {
    try {
      setLoading(true)
      const response = await get(`/storyboards/${id}`)

      if (response.success) {
        setStoryboard(response.storyboard)
      } else {
        throw new Error(response.message || 'Failed to load storyboard')
      }
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Load Failed',
        message: error.message || 'Failed to load storyboard'
      })
      navigate('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (isAutoSave = false) => {
    try {
      setSaving(true)

      const saveData = {
        ...storyboard,
        id: isEditing ? id : undefined
      }

      let response
      if (isEditing) {
        response = await put(`/storyboards/${id}`, saveData)
      } else {
        response = await post('/storyboards', saveData)
      }

      if (response.success) {
        setLastSaved(new Date())

        if (!isAutoSave) {
          showNotification({
            type: 'success',
            title: 'Saved',
            message: 'Storyboard saved successfully'
          })
        }

        if (!isEditing && response.storyboard?.id) {
          navigate(`/storyboard/${response.storyboard.id}/edit`, { replace: true })
        }
      } else {
        throw new Error(response.message || 'Failed to save')
      }
    } catch (error) {
      if (!isOnline) {
        saveOffline('storyboard', storyboard, { action: isEditing ? 'update' : 'create' })
        showNotification({
          type: 'info',
          title: 'Saved Offline',
          message: 'Changes saved locally and will sync when online'
        })
      } else {
        showNotification({
          type: 'error',
          title: 'Save Failed',
          message: error.message || 'Failed to save storyboard'
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleNodesChange = useCallback((newNodes) => {
    setStoryboard(prev => ({
      ...prev,
      nodes: newNodes
    }))
  }, [])

  const handleEdgesChange = useCallback((newEdges) => {
    setStoryboard(prev => ({
      ...prev,
      edges: newEdges
    }))
  }, [])

  const handleNodeSelect = useCallback((nodeData) => {
    setSelectedNodeData(nodeData)
  }, [])

  const handleNodeDoubleClick = useCallback((nodeData) => {
    setSelectedNodeData(nodeData)
    setShowNodeEditor(true)
  }, [])

  const handleNodeEdit = (updatedNodeData) => {
    const updatedNodes = storyboard.nodes.map(node =>
      node.data.id === updatedNodeData.id
        ? { ...node, data: updatedNodeData }
        : node
    )
    setStoryboard(prev => ({ ...prev, nodes: updatedNodes }))
    setShowNodeEditor(false)
  }

  const handleAddNode = (position) => {
    const nodeId = `node-${Date.now()}`
    const newNode = {
      data: {
        id: nodeId,
        label: 'New Connection',
        type: 'default',
        description: '',
        url: '',
        tags: []
      },
      position: position || { x: 200, y: 200 }
    }

    setStoryboard(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }))

    // Open editor for new node
    setSelectedNodeData(newNode.data)
    setShowNodeEditor(true)
  }

  const suggestConnections = useCallback(() => {
    // AI-powered connection suggestions based on node content
    // This is a simplified version - in production you'd use more sophisticated NLP
    const suggestions = []

    storyboard.nodes.forEach((node1, i) => {
      storyboard.nodes.forEach((node2, j) => {
        if (i >= j) return // Avoid duplicates and self-connections

        // Check if connection already exists
        const existingEdge = storyboard.edges.find(edge =>
          (edge.data.source === node1.data.id && edge.data.target === node2.data.id) ||
          (edge.data.source === node2.data.id && edge.data.target === node1.data.id)
        )

        if (existingEdge) return

        // Simple keyword matching for suggestions
        const keywords1 = extractKeywords(node1.data.label + ' ' + node1.data.description)
        const keywords2 = extractKeywords(node2.data.label + ' ' + node2.data.description)

        const commonKeywords = keywords1.filter(k => keywords2.includes(k))

        if (commonKeywords.length > 0) {
          suggestions.push({
            source: node1.data.id,
            target: node2.data.id,
            reason: `Common themes: ${commonKeywords.join(', ')}`,
            confidence: commonKeywords.length / Math.max(keywords1.length, keywords2.length)
          })
        }
      })
    })

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5)
  }, [storyboard.nodes, storyboard.edges])

  const extractKeywords = (text) => {
    if (!text) return []

    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being']

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.includes(word))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" text="Loading storyboard..." />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Back to dashboard"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {isEditing ? 'Edit Storyboard' : 'New Storyboard'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Connect the dots between events, people, and places
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Auto-save toggle */}
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={autoSaveEnabled}
                  onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Auto-save</span>
              </label>

              {/* Save status */}
              {lastSaved && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}

              {/* Save button */}
              <button
                onClick={() => handleSave()}
                disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 flex items-center space-x-2"
              >
                {saving && <div className="spinner" />}
                <span>{saving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Basic Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Details</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={storyboard.title}
                    onChange={(e) => setStoryboard(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter storyboard title"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={storyboard.description}
                    onChange={(e) => setStoryboard(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this storyboard explores"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={storyboard.isPublic}
                      onChange={(e) => setStoryboard(prev => ({ ...prev, isPublic: e.target.checked }))}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Make public</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={storyboard.isCollaborative}
                      onChange={(e) => setStoryboard(prev => ({ ...prev, isCollaborative: e.target.checked }))}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Allow collaboration</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Tools */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Tools</h3>

              <div className="space-y-3">
                <button
                  onClick={() => handleAddNode()}
                  className="w-full bg-primary-100 hover:bg-primary-200 dark:bg-primary-900 dark:hover:bg-primary-800 text-primary-700 dark:text-primary-300 px-4 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Add Node
                </button>

                <button
                  onClick={() => {
                    const suggestions = suggestConnections()
                    console.log('Connection suggestions:', suggestions)
                    showNotification({
                      type: 'info',
                      title: 'AI Suggestions',
                      message: `Found ${suggestions.length} potential connections`
                    })
                  }}
                  className="w-full bg-green-100 hover:bg-green-200 dark:bg-green-900 dark:hover:bg-green-800 text-green-700 dark:text-green-300 px-4 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Suggest Connections
                </button>
              </div>
            </div>

            {/* Selected Node Info */}
            {selectedNodeData && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Selected Node</h3>

                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Label:</span>
                    <p className="text-sm text-gray-900 dark:text-white">{selectedNodeData.label}</p>
                  </div>

                  {selectedNodeData.description && (
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Description:</span>
                      <p className="text-sm text-gray-900 dark:text-white">{selectedNodeData.description}</p>
                    </div>
                  )}

                  <button
                    onClick={() => setShowNodeEditor(true)}
                    className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Edit Node
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="lg:col-span-3">
            <StoryboardCanvas
              nodes={storyboard.nodes}
              edges={storyboard.edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onNodeSelect={handleNodeSelect}
              onNodeDoubleClick={handleNodeDoubleClick}
              height="calc(100vh - 200px)"
              className="rounded-lg shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Node Editor Modal */}
      {showNodeEditor && selectedNodeData && (
        <NodeEditorModal
          nodeData={selectedNodeData}
          onSave={handleNodeEdit}
          onClose={() => setShowNodeEditor(false)}
        />
      )}
    </div>
  )
}

// Node Editor Modal Component
const NodeEditorModal = ({ nodeData, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    id: nodeData.id,
    label: nodeData.label || '',
    description: nodeData.description || '',
    url: nodeData.url || '',
    tags: nodeData.tags?.join(', ') || '',
    type: nodeData.type || 'default'
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...formData,
      tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Edit Node</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Label
            </label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Source URL
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default StoryboardEditor