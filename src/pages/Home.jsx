import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useGestures } from '../hooks/useGestures'
import { useApp } from '../context/AppContext'
import { useVoiceHints } from '../hooks/useVoiceHints'
import LoadingSpinner from '../components/LoadingSpinner'

const Home = () => {
  const [articles, setArticles] = useState([])
  const [storyboards, setStoryboards] = useState([])
  const [profiles, setProfiles] = useState([])
  const [currentSection, setCurrentSection] = useState('articles')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const { get } = useApi()
  const { showNotification, userPreferences } = useApp()
  const { announceHints } = useVoiceHints()
  const navigate = useNavigate()

  // Fetch initial data
  useEffect(() => {
    fetchHomeData()
  }, [])

  // Voice hints for homepage
  useEffect(() => {
    if (userPreferences.enableVoiceHints && userPreferences.showTutorials) {
      setTimeout(() => {
        announceHints('homepage')
      }, 2000)
    }
  }, [announceHints, userPreferences])

  const fetchHomeData = async () => {
    try {
      setLoading(true)

      const [articlesRes, storyboardsRes] = await Promise.all([
        get('/articles?limit=6&sortBy=published_at&order=desc'),
        get('/storyboards/public?limit=4')
      ])

      setArticles(articlesRes.articles || [])
      setStoryboards(storyboardsRes.storyboards || [])

      // Mock profiles data for demo
      setProfiles([
        { id: '1', username: 'investigator_sarah', displayName: 'Sarah Chen', isVerified: true, bio: 'Investigative journalist focusing on corporate accountability' },
        { id: '2', username: 'truth_seeker_mike', displayName: 'Mike Rodriguez', isVerified: false, bio: 'Independent reporter covering environmental issues' },
        { id: '3', username: 'anon_whistleblower', displayName: 'Anonymous Source', isVerified: false, bio: 'Exposing corruption from the inside' }
      ])

    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Failed to load content',
        message: error.message || 'Unable to fetch homepage data'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  // Gesture handling for carousel navigation
  const { bindGestures } = useGestures({
    onSwipeLeft: () => {
      const sections = ['articles', 'storyboards', 'profiles']
      const currentIndex = sections.indexOf(currentSection)
      const nextIndex = (currentIndex + 1) % sections.length
      setCurrentSection(sections[nextIndex])
    },
    onSwipeRight: () => {
      const sections = ['articles', 'storyboards', 'profiles']
      const currentIndex = sections.indexOf(currentSection)
      const prevIndex = (currentIndex - 1 + sections.length) % sections.length
      setCurrentSection(sections[prevIndex])
    }
  })

  const SectionButton = ({ section, label, count, active, onClick }) => (
    <button
      onClick={onClick}
      className={`
        px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
        ${active
          ? 'bg-primary-600 text-white shadow-sm'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
        }
      `}
      aria-pressed={active}
    >
      {label} <span className="text-xs opacity-75">({count})</span>
    </button>
  )

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
          <span className="flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {storyboard.profiles?.username || 'Anonymous'}
          </span>
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
          <div className="w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center text-white font-medium text-lg mr-3">
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" text="Loading stories..." />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-4">
              Underground Voices
            </h1>
            <p className="text-xl md:text-2xl text-primary-100 mb-8">
              Unbiased journalism. Collaborative storytelling. Truth through connection.
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
              <div className="flex bg-white rounded-lg overflow-hidden shadow-lg">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for articles, topics, or connect the dots..."
                  className="flex-1 px-6 py-4 text-gray-900 placeholder-gray-500 focus:outline-none"
                  aria-label="Search stories and topics"
                />
                <button
                  type="submit"
                  className="px-6 py-4 bg-primary-600 hover:bg-primary-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  aria-label="Submit search"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Section Navigation */}
        <div className="flex justify-center mb-8 swipe-hint" {...bindGestures()}>
          <div className="flex space-x-2 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm">
            <SectionButton
              section="articles"
              label="Latest Stories"
              count={articles.length}
              active={currentSection === 'articles'}
              onClick={() => setCurrentSection('articles')}
            />
            <SectionButton
              section="storyboards"
              label="Story Maps"
              count={storyboards.length}
              active={currentSection === 'storyboards'}
              onClick={() => setCurrentSection('storyboards')}
            />
            <SectionButton
              section="profiles"
              label="Journalists"
              count={profiles.length}
              active={currentSection === 'profiles'}
              onClick={() => setCurrentSection('profiles')}
            />
          </div>
        </div>

        {/* Swipe hint for mobile */}
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6 sm:hidden">
          <span className="inline-flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
            </svg>
            Swipe to navigate sections
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </span>
        </div>

        {/* Content Grid */}
        <div className="animate-fade-in">
          {currentSection === 'articles' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}

          {currentSection === 'storyboards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {storyboards.map((storyboard) => (
                <StoryboardCard key={storyboard.id} storyboard={storyboard} />
              ))}
            </div>
          )}

          {currentSection === 'profiles' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {profiles.map((profile) => (
                <ProfileCard key={profile.id} profile={profile} />
              ))}
            </div>
          )}
        </div>

        {/* Call to Action */}
        <div className="mt-16 text-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Join the Underground
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Start sharing your stories and connecting the dots between events that matter.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/register"
                className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Get Started
              </Link>
              <Link
                to="/article/new"
                className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Write a Story
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home