import React, { createContext, useContext, useReducer, useEffect } from 'react'

const AppContext = createContext()

const initialState = {
  theme: 'system',
  isDark: false,
  sidebarOpen: false,
  notifications: [],
  loading: false,
  error: null,
  searchQuery: '',
  filters: {
    category: 'all',
    tags: [],
    sortBy: 'created_at',
    sortOrder: 'desc'
  },
  userPreferences: {
    language: 'en',
    autoSave: true,
    showTutorials: true,
    enableVoiceHints: false,
    highContrast: false,
    reducedMotion: false
  }
}

const appReducer = (state, action) => {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, theme: action.payload }
    case 'TOGGLE_DARK_MODE':
      return { ...state, isDark: !state.isDark }
    case 'SET_DARK_MODE':
      return { ...state, isDark: action.payload }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen }
    case 'SET_SIDEBAR':
      return { ...state, sidebarOpen: action.payload }
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [...state.notifications, action.payload]
      }
    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload)
      }
    case 'CLEAR_NOTIFICATIONS':
      return { ...state, notifications: [] }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload }
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } }
    case 'RESET_FILTERS':
      return { ...state, filters: initialState.filters }
    case 'UPDATE_PREFERENCES':
      return {
        ...state,
        userPreferences: { ...state.userPreferences, ...action.payload }
      }
    case 'RESET_PREFERENCES':
      return { ...state, userPreferences: initialState.userPreferences }
    default:
      return state
  }
}

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState)

  // Initialize theme and preferences from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    const savedPreferences = localStorage.getItem('userPreferences')

    if (savedTheme) {
      setTheme(savedTheme)
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setDarkMode(prefersDark)
    }

    if (savedPreferences) {
      try {
        const preferences = JSON.parse(savedPreferences)
        dispatch({ type: 'UPDATE_PREFERENCES', payload: preferences })
      } catch (error) {
        console.error('Error parsing saved preferences:', error)
      }
    }

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      dispatch({
        type: 'UPDATE_PREFERENCES',
        payload: { reducedMotion: true }
      })
    }

    // Check for high contrast preference
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches
    if (prefersHighContrast) {
      dispatch({
        type: 'UPDATE_PREFERENCES',
        payload: { highContrast: true }
      })
    }
  }, [])

  // Save theme changes to localStorage and apply
  useEffect(() => {
    if (state.theme !== 'system') {
      localStorage.setItem('theme', state.theme)
    } else {
      localStorage.removeItem('theme')
    }

    // Apply theme
    const isDark = state.theme === 'dark' ||
      (state.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    dispatch({ type: 'SET_DARK_MODE', payload: isDark })
  }, [state.theme])

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('userPreferences', JSON.stringify(state.userPreferences))
  }, [state.userPreferences])

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e) => {
      if (state.theme === 'system') {
        dispatch({ type: 'SET_DARK_MODE', payload: e.matches })
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [state.theme])

  const setTheme = (theme) => {
    dispatch({ type: 'SET_THEME', payload: theme })
  }

  const toggleDarkMode = () => {
    const newTheme = state.isDark ? 'light' : 'dark'
    setTheme(newTheme)
  }

  const setDarkMode = (isDark) => {
    dispatch({ type: 'SET_DARK_MODE', payload: isDark })
  }

  const toggleSidebar = () => {
    dispatch({ type: 'TOGGLE_SIDEBAR' })
  }

  const setSidebar = (open) => {
    dispatch({ type: 'SET_SIDEBAR', payload: open })
  }

  const showNotification = (notification) => {
    const id = Date.now() + Math.random()
    const notificationWithId = {
      id,
      type: 'info',
      duration: 5000,
      ...notification
    }

    dispatch({ type: 'ADD_NOTIFICATION', payload: notificationWithId })

    // Auto-remove notification after duration
    if (notificationWithId.duration > 0) {
      setTimeout(() => {
        dismissNotification(id)
      }, notificationWithId.duration)
    }

    return id
  }

  const dismissNotification = (id) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id })
  }

  const clearNotifications = () => {
    dispatch({ type: 'CLEAR_NOTIFICATIONS' })
  }

  const setLoading = (loading) => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }

  const setError = (error) => {
    dispatch({ type: 'SET_ERROR', payload: error })
    if (error) {
      showNotification({
        type: 'error',
        title: 'Error',
        message: typeof error === 'string' ? error : error.message,
        duration: 7000
      })
    }
  }

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
  }

  const setSearchQuery = (query) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query })
  }

  const setFilters = (filters) => {
    dispatch({ type: 'SET_FILTERS', payload: filters })
  }

  const resetFilters = () => {
    dispatch({ type: 'RESET_FILTERS' })
  }

  const updatePreferences = (preferences) => {
    dispatch({ type: 'UPDATE_PREFERENCES', payload: preferences })
  }

  const resetPreferences = () => {
    dispatch({ type: 'RESET_PREFERENCES' })
  }

  // Accessibility helpers
  const announceToScreenReader = (message) => {
    const announcement = document.createElement('div')
    announcement.setAttribute('aria-live', 'polite')
    announcement.setAttribute('aria-atomic', 'true')
    announcement.className = 'sr-only'
    announcement.textContent = message

    document.body.appendChild(announcement)

    setTimeout(() => {
      document.body.removeChild(announcement)
    }, 1000)
  }

  const playNotificationSound = () => {
    if (state.userPreferences.enableSounds) {
      // Create a subtle notification sound
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1)

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
    }
  }

  const value = {
    ...state,
    setTheme,
    toggleDarkMode,
    setDarkMode,
    toggleSidebar,
    setSidebar,
    showNotification,
    dismissNotification,
    clearNotifications,
    setLoading,
    setError,
    clearError,
    setSearchQuery,
    setFilters,
    resetFilters,
    updatePreferences,
    resetPreferences,
    announceToScreenReader,
    playNotificationSound
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}