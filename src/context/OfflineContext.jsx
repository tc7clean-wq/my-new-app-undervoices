import React, { createContext, useContext, useReducer, useEffect } from 'react'
import { useApp } from './AppContext'

const OfflineContext = createContext()

const initialState = {
  isOnline: navigator.onLine,
  pendingSyncs: [],
  lastSync: null,
  syncInProgress: false
}

const offlineReducer = (state, action) => {
  switch (action.type) {
    case 'SET_ONLINE_STATUS':
      return { ...state, isOnline: action.payload }
    case 'ADD_PENDING_SYNC':
      return {
        ...state,
        pendingSyncs: [...state.pendingSyncs, action.payload]
      }
    case 'REMOVE_PENDING_SYNC':
      return {
        ...state,
        pendingSyncs: state.pendingSyncs.filter(sync => sync.id !== action.payload)
      }
    case 'CLEAR_PENDING_SYNCS':
      return { ...state, pendingSyncs: [] }
    case 'SET_SYNC_IN_PROGRESS':
      return { ...state, syncInProgress: action.payload }
    case 'SET_LAST_SYNC':
      return { ...state, lastSync: action.payload }
    default:
      return state
  }
}

export const OfflineProvider = ({ children }) => {
  const [state, dispatch] = useReducer(offlineReducer, initialState)
  const { showNotification } = useApp()

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      dispatch({ type: 'SET_ONLINE_STATUS', payload: true })
      showNotification({
        type: 'success',
        title: 'Back Online',
        message: 'Connection restored. Syncing pending changes...',
        duration: 3000
      })
      syncPendingData()
    }

    const handleOffline = () => {
      dispatch({ type: 'SET_ONLINE_STATUS', payload: false })
      showNotification({
        type: 'warning',
        title: 'Offline Mode',
        message: 'Working offline. Changes will sync when connection returns.',
        duration: 5000
      })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load pending syncs from localStorage on mount
  useEffect(() => {
    const savedSyncs = localStorage.getItem('pendingSyncs')
    if (savedSyncs) {
      try {
        const syncs = JSON.parse(savedSyncs)
        syncs.forEach(sync => {
          dispatch({ type: 'ADD_PENDING_SYNC', payload: sync })
        })
      } catch (error) {
        console.error('Error loading pending syncs:', error)
        localStorage.removeItem('pendingSyncs')
      }
    }

    const lastSync = localStorage.getItem('lastSync')
    if (lastSync) {
      dispatch({ type: 'SET_LAST_SYNC', payload: new Date(lastSync) })
    }
  }, [])

  // Save pending syncs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('pendingSyncs', JSON.stringify(state.pendingSyncs))
  }, [state.pendingSyncs])

  const saveOffline = (type, data, options = {}) => {
    const syncItem = {
      id: Date.now() + Math.random(),
      type, // 'article', 'storyboard', 'profile', etc.
      action: options.action || 'create', // 'create', 'update', 'delete'
      data,
      timestamp: new Date().toISOString(),
      retries: 0,
      maxRetries: options.maxRetries || 3
    }

    dispatch({ type: 'ADD_PENDING_SYNC', payload: syncItem })

    // Save to localStorage for persistence
    const key = `offline_${type}_${syncItem.id}`
    localStorage.setItem(key, JSON.stringify(syncItem))

    showNotification({
      type: 'info',
      title: 'Saved Offline',
      message: `${type} saved locally and will sync when online.`,
      duration: 3000
    })

    return syncItem.id
  }

  const loadOffline = (type, id) => {
    const key = id ? `offline_${type}_${id}` : `offline_${type}`
    const data = localStorage.getItem(key)

    if (data) {
      try {
        return JSON.parse(data)
      } catch (error) {
        console.error('Error loading offline data:', error)
        localStorage.removeItem(key)
      }
    }

    return null
  }

  const removeOffline = (type, id) => {
    const key = `offline_${type}_${id}`
    localStorage.removeItem(key)
  }

  const syncPendingData = async () => {
    if (state.syncInProgress || state.pendingSyncs.length === 0) {
      return
    }

    dispatch({ type: 'SET_SYNC_IN_PROGRESS', payload: true })

    const failedSyncs = []

    for (const syncItem of state.pendingSyncs) {
      try {
        await syncItem(syncItem)
        dispatch({ type: 'REMOVE_PENDING_SYNC', payload: syncItem.id })
        removeOffline(syncItem.type, syncItem.id)
      } catch (error) {
        console.error('Sync failed:', error)

        syncItem.retries++
        if (syncItem.retries >= syncItem.maxRetries) {
          failedSyncs.push(syncItem)
          dispatch({ type: 'REMOVE_PENDING_SYNC', payload: syncItem.id })
        }
      }
    }

    dispatch({ type: 'SET_SYNC_IN_PROGRESS', payload: false })
    dispatch({ type: 'SET_LAST_SYNC', payload: new Date() })
    localStorage.setItem('lastSync', new Date().toISOString())

    if (failedSyncs.length > 0) {
      showNotification({
        type: 'error',
        title: 'Sync Failed',
        message: `${failedSyncs.length} items failed to sync after multiple attempts.`,
        duration: 7000
      })
    } else if (state.pendingSyncs.length > 0) {
      showNotification({
        type: 'success',
        title: 'Sync Complete',
        message: 'All offline changes have been synced successfully.',
        duration: 3000
      })
    }
  }

  const syncSingleItem = async (syncItem) => {
    const { type, action, data } = syncItem

    const apiEndpoint = getApiEndpoint(type, action, data)
    const method = getHttpMethod(action)

    const token = localStorage.getItem('accessToken')
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }

    const response = await fetch(apiEndpoint, {
      method,
      headers,
      ...(method !== 'DELETE' && { body: JSON.stringify(data) })
    })

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.statusText}`)
    }

    return await response.json()
  }

  const getApiEndpoint = (type, action, data) => {
    const baseUrl = import.meta.env.VITE_API_URL || '/api'

    switch (type) {
      case 'article':
        if (action === 'create') return `${baseUrl}/articles`
        if (action === 'update') return `${baseUrl}/articles/${data.id}`
        if (action === 'delete') return `${baseUrl}/articles/${data.id}`
        break
      case 'storyboard':
        if (action === 'create') return `${baseUrl}/storyboards`
        if (action === 'update') return `${baseUrl}/storyboards/${data.id}`
        if (action === 'delete') return `${baseUrl}/storyboards/${data.id}`
        break
      case 'profile':
        return `${baseUrl}/profiles/${data.id}`
      default:
        throw new Error(`Unknown sync type: ${type}`)
    }
  }

  const getHttpMethod = (action) => {
    switch (action) {
      case 'create': return 'POST'
      case 'update': return 'PUT'
      case 'delete': return 'DELETE'
      default: return 'POST'
    }
  }

  const clearAllOfflineData = () => {
    // Clear pending syncs
    dispatch({ type: 'CLEAR_PENDING_SYNCS' })

    // Clear localStorage
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith('offline_')) {
        localStorage.removeItem(key)
      }
    })

    showNotification({
      type: 'info',
      title: 'Offline Data Cleared',
      message: 'All offline data has been cleared.',
      duration: 3000
    })
  }

  const value = {
    ...state,
    saveOffline,
    loadOffline,
    removeOffline,
    syncPendingData,
    clearAllOfflineData
  }

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  )
}

export const useOffline = () => {
  const context = useContext(OfflineContext)
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider')
  }
  return context
}