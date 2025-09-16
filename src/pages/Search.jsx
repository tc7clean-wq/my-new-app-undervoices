import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useApp } from '../context/AppContext'
import { useGestures } from '../hooks/useGestures'
import { useVoiceHints } from '../hooks/useVoiceHints'
import LoadingSpinner from '../components/LoadingSpinner'

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [results, setResults] = useState({
    articles: [],
    storyboards: [],
    profiles: []
  })
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [filters, setFilters] = useState({
    category: 'all',
    sortBy: 'relevance',
    dateRange: 'all',
    tags: []
  })

  const { get } = useApi()
  const { showNotification, userPreferences } = useApp()
  const { announceHints } = useVoiceHints()

  // Voice hints for search
  useEffect(() => {
    if (userPreferences.enableVoiceHints && userPreferences.showTutorials) {
      setTimeout(() => {
        announceHints('search')
      }, 2000)
    }
  }, [announceHints, userPreferences])

  // Perform search when query changes
  useEffect(() => {
    if (query.trim()) {
      performSearch()
    }
  }, [query])

  // Perform search when filters change
  useEffect(() => {
    if (query.trim()) {
      performSearch()
    }
  }, [filters])

  const performSearch = async () => {
    if (!query.trim()) return

    try {
      setLoading(true)

      const searchQuery = {
        q: query,
        ...filters
      }

      const [articlesRes, storyboardsRes, profilesRes] = await Promise.all([
        get(`/search/articles?${new URLSearchParams(searchQuery)}`),
        get(`/search/storyboards?${new URLSearchParams(searchQuery)}`),
        get(`/search/profiles?${new URLSearchParams(searchQuery)}`)
      ])

      setResults({
        articles: articlesRes.articles || [],
        storyboards: storyboardsRes.storyboards || [],
        profiles: profilesRes.profiles || []
      })

    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Search Failed',
        message: error.message || 'Unable to perform search'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (query.trim()) {
      setSearchParams({ q: query.trim() })
      performSearch()
    }
  }

  const handleQueryChange = (newQuery) => {
    setQuery(newQuery)
    setSearchParams({ q: newQuery.trim() })
  }

  // Gesture handling for tab navigation
  const { bindGestures } = useGestures({
    onSwipeLeft: () => {
      const tabs = ['all', 'articles', 'storyboards', 'profiles']
      const currentIndex = tabs.indexOf(activeTab)
      const nextIndex = (currentIndex + 1) % tabs.length
      setActiveTab(tabs[nextIndex])
    },
    onSwipeRight: () => {
      const tabs = ['all', 'articles', 'storyboards', 'profiles']
      const currentIndex = tabs.indexOf(activeTab)
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
      setActiveTab(tabs[prevIndex])
    }
  })

  const getTotalResults = () => {
    return results.articles.length + results.storyboards.length + results.profiles.length
  }

  const getTabResults = (tab) => {
    switch (tab) {
      case 'articles':
        return results.articles
      case 'storyboards':
        return results.storyboards
      case 'profiles':
        return results.profiles
      default:
        return [...results.articles, ...results.storyboards, ...results.profiles]
    }
  }

  const ArticleCard = ({ article }) => (
    <Link
      to={`/article/${article.id}`}
      className="block bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 group"
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-200 line-clamp-2">
              {article.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-3">
              {article.summary}
            </p>
          </div>
          {article.verification_status === 'verified' && (
            <div className="ml-3 text-green-500" title="Verified article">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {article.view_count || 0}
            </span>
            <span className="flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              {article.share_count || 0}
            </span>
          </div>
          <span>
            {new Date(article.published_at || article.created_at).toLocaleDateString()}
          </span>
        </div>

        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {article.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 text-xs bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded-md"
              >
                #{tag}
              </span>
            ))}
            {article.tags.length > 3 && (
              <span className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                +{article.tags.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )

  const StoryboardCard = ({ storyboard }) => (
    <Link
      to={`/storyboard/${storyboard.id}`}
      className="block bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 group"
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-200">
              {storyboard.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {storyboard.description}
            </p>
          </div>
          <div className="ml-3 text-primary-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <span>Nodes: {storyboard.nodes?.length || 0}</span>
            <span>Connections: {storyboard.edges?.length || 0}</span>
          </div>
          <span>
            {new Date(storyboard.updated_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Link>
  )

  const ProfileCard = ({ profile }) => (
    <Link
      to={`/profile/${profile.username}`}
      className="block bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 group"
    >
      <div className="p-6">
        <div className="flex items-center mb-3">
          <div className="w-12 h-12 bg-primary-500 rounded-full flex items-center justify-center text-white font-medium text-lg mr-4">
            {profile.displayName[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-200">
                {profile.displayName}
              </h3>
              {profile.isVerified && (
                <svg className="w-4 h-4 ml-1 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">@{profile.username}</p>
          </div>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {profile.bio}
        </p>
      </div>
    </Link>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
            Search Underground Voices
          </h1>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="max-w-2xl">
            <div className="flex bg-white dark:bg-gray-700 rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-600">
              <input
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search for articles, storyboards, journalists..."
                className="flex-1 px-6 py-4 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none bg-transparent"
                aria-label="Search query"
              />
              <button
                type="submit"
                className="px-6 py-4 bg-primary-600 hover:bg-primary-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                aria-label="Submit search"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </form>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap gap-4">
            <select
              value={filters.category}
              onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              <option value="politics">Politics</option>
              <option value="environment">Environment</option>
              <option value="technology">Technology</option>
              <option value="health">Health</option>
              <option value="economy">Economy</option>
            </select>

            <select
              value={filters.sortBy}
              onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="relevance">Relevance</option>
              <option value="date">Date</option>
              <option value="views">Views</option>
              <option value="shares">Shares</option>
            </select>

            <select
              value={filters.dateRange}
              onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All Time</option>
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Results Summary */}
        {query && (
          <div className="mb-6">
            <p className="text-gray-600 dark:text-gray-400">
              Found {getTotalResults()} results for "{query}"
            </p>
          </div>
        )}

        {/* Tab Navigation */}
        {query && (
          <div className="mb-8" {...bindGestures()}>
            <div className="flex space-x-1 bg-white dark:bg-gray-800 p-1 rounded-lg shadow-sm">
              {[
                { id: 'all', label: 'All', count: getTotalResults() },
                { id: 'articles', label: 'Articles', count: results.articles.length },
                { id: 'storyboards', label: 'Storyboards', count: results.storyboards.length },
                { id: 'profiles', label: 'Journalists', count: results.profiles.length }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-md font-medium text-sm transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-xs opacity-75">({tab.count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="large" text="Searching..." />
          </div>
        )}

        {/* Results */}
        {!loading && query && (
          <div className="animate-fade-in">
            {getTabResults(activeTab).length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No results found</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Try adjusting your search terms or filters
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {getTabResults(activeTab).map((item, index) => {
                  if (activeTab === 'articles' || (activeTab === 'all' && item.title && item.summary)) {
                    return <ArticleCard key={`article-${item.id}`} article={item} />
                  } else if (activeTab === 'storyboards' || (activeTab === 'all' && item.nodes)) {
                    return <StoryboardCard key={`storyboard-${item.id}`} storyboard={item} />
                  } else if (activeTab === 'profiles' || (activeTab === 'all' && item.username)) {
                    return <ProfileCard key={`profile-${item.id}`} profile={item} />
                  }
                  return null
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!query && (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Start your search</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Enter a search term to find articles, storyboards, and journalists
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Search
