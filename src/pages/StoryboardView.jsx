import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useApi } from '../hooks/useApi'
import { useVoiceHints } from '../hooks/useVoiceHints'
import StoryboardCanvas from '../components/StoryboardCanvas'
import LoadingSpinner from '../components/LoadingSpinner'

const StoryboardView = () => {
  const { id } = useParams()
  const [storyboard, setStoryboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [showNodeDetails, setShowNodeDetails] = useState(false)

  const { user, isAuthenticated } = useAuth()
  const { showNotification, userPreferences } = useApp()
  const { get, post } = useApi()
  const { speak } = useVoiceHints()

  useEffect(() => {
    loadStoryboard()
  }, [id])

  const loadStoryboard = async () => {
    try {
      setLoading(true)
      const response = await get(`/storyboards/${id}`)

      if (response.success) {
        setStoryboard(response.storyboard)
        
        // Increment view count
        await post(`/storyboards/${id}/view`, {})
      } else {
        throw new Error(response.message || 'Failed to load storyboard')
      }
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Load Failed',
        message: error.message || 'Failed to load storyboard'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleShare = async () => {
    try {
      setSharing(true)

      if (navigator.share) {
        await navigator.share({
          title: storyboard.title,
          text: storyboard.description,
          url: window.location.href
        })
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(window.location.href)
        showNotification({
          type: 'success',
          title: 'Link Copied',
          message: 'Storyboard link copied to clipboard'
        })
      }

      // Increment share count
      await post(`/storyboards/${id}/share`, {})
    } catch (error) {
      if (error.name !== 'AbortError') {
        showNotification({
          type: 'error',
          title: 'Share Failed',
          message: 'Failed to share storyboard'
        })
      }
    } finally {
      setSharing(false)
    }
  }

  const handleBookmark = async () => {
    try {
      if (bookmarked) {
        await post(`/storyboards/${id}/unbookmark`, {})
        setBookmarked(false)
        showNotification({
          type: 'success',
          title: 'Bookmark Removed',
          message: 'Storyboard removed from bookmarks'
        })
      } else {
        await post(`/storyboards/${id}/bookmark`, {})
        setBookmarked(true)
        showNotification({
          type: 'success',
          title: 'Bookmarked',
          message: 'Storyboard added to bookmarks'
        })
      }
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Bookmark Failed',
        message: 'Failed to update bookmark'
      })
    }
  }

  const handleNodeSelect = (nodeData) => {
    setSelectedNode(nodeData)
    setShowNodeDetails(true)
  }

  const handleNodeDoubleClick = (nodeData) => {
    setSelectedNode(nodeData)
    setShowNodeDetails(true)
  }

  const handleReadAloud = () => {
    if (userPreferences.enableVoiceHints && storyboard) {
      const text = `${storyboard.title}. ${storyboard.description}. This storyboard contains ${storyboard.nodes?.length || 0} nodes and ${storyboard.edges?.length || 0} connections.`
      speak(text)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" text="Loading storyboard..." />
      </div>
    )
  }

  if (!storyboard) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4" role="img" aria-label="Not found">🗺️</div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Storyboard Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            The storyboard you're looking for doesn't exist or has been removed.
          </p>
          <Link
            to="/"
            className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200"
          >
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <Link
              to="/"
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back to Home</span>
            </Link>

            <div className="flex items-center space-x-4">
              {/* Read Aloud */}
              {userPreferences.enableVoiceHints && (
                <button
                  onClick={handleReadAloud}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Read aloud"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </button>
              )}

              {/* Bookmark */}
              {isAuthenticated && (
                <button
                  onClick={handleBookmark}
                  className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    bookmarked 
                      ? 'text-yellow-500' 
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                  aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
                >
                  <svg className="w-5 h-5" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
              )}

              {/* Share */}
              <button
                onClick={handleShare}
                disabled={sharing}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                aria-label="Share storyboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Storyboard Meta */}
          <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white font-medium text-sm">
                {storyboard.author?.displayName?.[0] || 'A'}
              </div>
              <span>{storyboard.author?.displayName || 'Anonymous'}</span>
            </div>
            <span>•</span>
            <span>{new Date(storyboard.updated_at).toLocaleDateString()}</span>
            <span>•</span>
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>{storyboard.view_count || 0} views</span>
            </div>
            <span>•</span>
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              <span>{storyboard.share_count || 0} shares</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4 leading-tight">
            {storyboard.title}
          </h1>

          {/* Description */}
          {storyboard.description && (
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
              {storyboard.description}
            </p>
          )}

          {/* Stats */}
          <div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>{storyboard.nodes?.length || 0} nodes</span>
            </div>
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span>{storyboard.edges?.length || 0} connections</span>
            </div>
            {storyboard.isPublic && (
              <div className="flex items-center space-x-1 text-green-600 dark:text-green-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>Public</span>
              </div>
            )}
            {storyboard.isCollaborative && (
              <div className="flex items-center space-x-1 text-blue-600 dark:text-blue-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Collaborative</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <StoryboardCanvas
            nodes={storyboard.nodes || []}
            edges={storyboard.edges || []}
            onNodeSelect={handleNodeSelect}
            onNodeDoubleClick={handleNodeDoubleClick}
            readonly={true}
            height="600px"
            className="w-full"
          />
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
          <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-2">How to Navigate</h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• Click on nodes to view details</li>
            <li>• Double-click nodes for more information</li>
            <li>• Use mouse wheel or pinch to zoom</li>
            <li>• Drag to pan around the canvas</li>
            <li>• Use touch gestures on mobile devices</li>
          </ul>
        </div>

        {/* Author Info */}
        {storyboard.author && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">About the Creator</h3>
            <div className="flex items-start space-x-4">
              <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center text-white font-medium text-xl">
                {storyboard.author.displayName?.[0] || 'A'}
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                  {storyboard.author.displayName}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  @{storyboard.author.username}
                </p>
                {storyboard.author.bio && (
                  <p className="text-gray-700 dark:text-gray-300">
                    {storyboard.author.bio}
                  </p>
                )}
                <div className="mt-4">
                  <Link
                    to={`/profile/${storyboard.author.username}`}
                    className="text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                  >
                    View Profile →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Node Details Modal */}
      {showNodeDetails && selectedNode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Node Details</h3>
              <button
                onClick={() => setShowNodeDetails(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Label
                </label>
                <p className="text-sm text-gray-900 dark:text-white">{selectedNode.label}</p>
              </div>

              {selectedNode.description && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedNode.description}</p>
                </div>
              )}

              {selectedNode.url && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Source URL
                  </label>
                  <a
                    href={selectedNode.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 break-all"
                  >
                    {selectedNode.url}
                  </a>
                </div>
              )}

              {selectedNode.tags && selectedNode.tags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 text-xs bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded-md"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowNodeDetails(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg font-medium transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StoryboardView
