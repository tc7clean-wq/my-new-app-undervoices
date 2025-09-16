import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useOffline } from '../context/OfflineContext'
import { useApi } from '../hooks/useApi'
import { useVoiceHints } from '../hooks/useVoiceHints'
import LoadingSpinner from '../components/LoadingSpinner'

const ArticleEditor = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id

  const [article, setArticle] = useState({
    title: '',
    summary: '',
    content: '',
    tags: [],
    isPublic: false,
    allowComments: true,
    verification_status: 'draft'
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEditing)
  const [showPreview, setShowPreview] = useState(false)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)
  const [lastSaved, setLastSaved] = useState(null)
  const [wordCount, setWordCount] = useState(0)
  const [readingTime, setReadingTime] = useState(0)

  const { user } = useAuth()
  const { showNotification, userPreferences } = useApp()
  const { saveOffline, isOnline } = useOffline()
  const { get, post, put } = useApi()
  const { announceHints } = useVoiceHints()

  // Load existing article
  useEffect(() => {
    if (isEditing) {
      loadArticle()
    }
  }, [id, isEditing])

  // Voice hints for article editor
  useEffect(() => {
    if (userPreferences.enableVoiceHints && userPreferences.showTutorials) {
      setTimeout(() => {
        announceHints('article-editor')
      }, 2000)
    }
  }, [announceHints, userPreferences])

  // Auto-save functionality
  useEffect(() => {
    if (!autoSaveEnabled || !article.title) return

    const timer = setTimeout(() => {
      if (isOnline) {
        handleSave(true)
      } else {
        saveOffline('article', article, { action: isEditing ? 'update' : 'create' })
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [article, autoSaveEnabled, isOnline])

  // Word count and reading time calculation
  useEffect(() => {
    const words = article.content.trim().split(/\s+/).filter(word => word.length > 0).length
    setWordCount(words)
    setReadingTime(Math.ceil(words / 200)) // Average reading speed: 200 words per minute
  }, [article.content])

  const loadArticle = async () => {
    try {
      setLoading(true)
      const response = await get(`/articles/${id}`)

      if (response.success) {
        setArticle(response.article)
      } else {
        throw new Error(response.message || 'Failed to load article')
      }
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Load Failed',
        message: error.message || 'Failed to load article'
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
        ...article,
        id: isEditing ? id : undefined
      }

      let response
      if (isEditing) {
        response = await put(`/articles/${id}`, saveData)
      } else {
        response = await post('/articles', saveData)
      }

      if (response.success) {
        setLastSaved(new Date())

        if (!isAutoSave) {
          showNotification({
            type: 'success',
            title: 'Saved',
            message: 'Article saved successfully'
          })
        }

        if (!isEditing && response.article?.id) {
          navigate(`/article/${response.article.id}/edit`, { replace: true })
        }
      } else {
        throw new Error(response.message || 'Failed to save')
      }
    } catch (error) {
      if (!isOnline) {
        saveOffline('article', article, { action: isEditing ? 'update' : 'create' })
        showNotification({
          type: 'info',
          title: 'Saved Offline',
          message: 'Changes saved locally and will sync when online'
        })
      } else {
        showNotification({
          type: 'error',
          title: 'Save Failed',
          message: error.message || 'Failed to save article'
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    try {
      setSaving(true)

      const publishData = {
        ...article,
        verification_status: 'published',
        published_at: new Date().toISOString()
      }

      let response
      if (isEditing) {
        response = await put(`/articles/${id}`, publishData)
      } else {
        response = await post('/articles', publishData)
      }

      if (response.success) {
        showNotification({
          type: 'success',
          title: 'Published!',
          message: 'Your article is now live and visible to readers'
        })
        navigate(`/article/${response.article.id}`)
      } else {
        throw new Error(response.message || 'Failed to publish')
      }
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Publish Failed',
        message: error.message || 'Failed to publish article'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (field, value) => {
    setArticle(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleTagsChange = (tagsString) => {
    const tags = tagsString.split(',').map(tag => tag.trim()).filter(Boolean)
    handleChange('tags', tags)
  }

  const formatContent = (content) => {
    // Simple markdown-like formatting for preview
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" text="Loading article..." />
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
                  {isEditing ? 'Edit Article' : 'Write New Article'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Share your story with the world
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

              {/* Preview toggle */}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>{showPreview ? 'Edit' : 'Preview'}</span>
              </button>

              {/* Save button */}
              <button
                onClick={() => handleSave()}
                disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 flex items-center space-x-2"
              >
                {saving && <div className="spinner" />}
                <span>{saving ? 'Saving...' : 'Save'}</span>
              </button>

              {/* Publish button */}
              <button
                onClick={handlePublish}
                disabled={saving || !article.title || !article.content}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span>Publish</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Article Stats */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Article Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Words:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{wordCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Reading time:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{readingTime} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
                  <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                    article.verification_status === 'published'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  }`}>
                    {article.verification_status}
                  </span>
                </div>
              </div>
            </div>

            {/* Article Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={article.isPublic}
                      onChange={(e) => handleChange('isPublic', e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Make public</span>
                  </label>
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={article.allowComments}
                      onChange={(e) => handleChange('allowComments', e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Allow comments</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Writing Tips */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
              <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-4">Writing Tips</h3>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
                <li>• Use a compelling headline</li>
                <li>• Write a clear summary</li>
                <li>• Add relevant tags</li>
                <li>• Use **bold** and *italic* for emphasis</li>
                <li>• Break up long paragraphs</li>
                <li>• Include sources and evidence</li>
              </ul>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {showPreview ? (
              /* Preview Mode */
              <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                  {article.title || 'Untitled Article'}
                </h1>
                
                {article.summary && (
                  <p className="text-lg text-gray-600 dark:text-gray-400 mb-6 italic">
                    {article.summary}
                  </p>
                )}

                <div 
                  className="prose dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: formatContent(article.content) }}
                />

                {article.tags.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex flex-wrap gap-2">
                      {article.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded-full text-sm"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Edit Mode */
              <div className="space-y-6">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={article.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder="Enter a compelling headline..."
                    className="w-full px-4 py-3 text-2xl font-bold border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Summary */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Summary
                  </label>
                  <textarea
                    value={article.summary}
                    onChange={(e) => handleChange('summary', e.target.value)}
                    placeholder="Write a brief summary of your article..."
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Content */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Content *
                  </label>
                  <textarea
                    value={article.content}
                    onChange={(e) => handleChange('content', e.target.value)}
                    placeholder="Write your article here... Use **bold** and *italic* for formatting."
                    rows={20}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={article.tags.join(', ')}
                    onChange={(e) => handleTagsChange(e.target.value)}
                    placeholder="Enter tags separated by commas..."
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ArticleEditor
