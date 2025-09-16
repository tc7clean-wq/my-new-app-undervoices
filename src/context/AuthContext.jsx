import React, { createContext, useContext, useReducer, useEffect } from 'react'
import { useApi } from '../hooks/useApi'

const AuthContext = createContext()

const initialState = {
  user: null,
  isAuthenticated: false,
  loading: true,
  error: null
}

const authReducer = (state, action) => {
  switch (action.type) {
    case 'AUTH_START':
      return { ...state, loading: true, error: null }
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        loading: false,
        error: null
      }
    case 'AUTH_FAILURE':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        loading: false,
        error: action.payload
      }
    case 'AUTH_LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        loading: false,
        error: null
      }
    case 'UPDATE_USER':
      return {
        ...state,
        user: { ...state.user, ...action.payload }
      }
    default:
      return state
  }
}

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState)
  const { request } = useApi()

  // Check authentication status on app load
  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    const token = localStorage.getItem('accessToken')

    if (!token) {
      dispatch({ type: 'AUTH_FAILURE', payload: 'No token found' })
      return
    }

    try {
      const response = await request('/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.success) {
        dispatch({ type: 'AUTH_SUCCESS', payload: { user: response.user } })
      } else {
        throw new Error('Invalid token')
      }
    } catch (error) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      dispatch({ type: 'AUTH_FAILURE', payload: error.message })
    }
  }

  const login = async (credentials, rememberMe = false) => {
    dispatch({ type: 'AUTH_START' })

    try {
      const response = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ ...credentials, rememberMe })
      })

      if (response.success) {
        localStorage.setItem('accessToken', response.accessToken)
        localStorage.setItem('refreshToken', response.refreshToken)

        dispatch({ type: 'AUTH_SUCCESS', payload: { user: response.user } })
        return { success: true }
      } else {
        throw new Error(response.message || 'Login failed')
      }
    } catch (error) {
      dispatch({ type: 'AUTH_FAILURE', payload: error.message })
      return { success: false, error: error.message }
    }
  }

  const register = async (userData) => {
    dispatch({ type: 'AUTH_START' })

    try {
      const response = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData)
      })

      if (response.success) {
        localStorage.setItem('accessToken', response.accessToken)
        localStorage.setItem('refreshToken', response.refreshToken)

        dispatch({ type: 'AUTH_SUCCESS', payload: { user: response.user } })
        return { success: true }
      } else {
        throw new Error(response.message || 'Registration failed')
      }
    } catch (error) {
      dispatch({ type: 'AUTH_FAILURE', payload: error.message })
      return { success: false, error: error.message }
    }
  }

  const logout = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (token) {
        await request('/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      dispatch({ type: 'AUTH_LOGOUT' })
    }
  }

  const updateProfile = async (profileData) => {
    try {
      const token = localStorage.getItem('accessToken')
      const response = await request(`/profiles/${state.user.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      })

      if (response.success) {
        dispatch({ type: 'UPDATE_USER', payload: response.profile })
        return { success: true }
      } else {
        throw new Error(response.message || 'Profile update failed')
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  const toggleAnonymousMode = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      const response = await request(`/profiles/${state.user.id}/toggle-anonymous`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.success) {
        dispatch({
          type: 'UPDATE_USER',
          payload: { isAnonymous: response.isAnonymous }
        })
        return { success: true, isAnonymous: response.isAnonymous }
      } else {
        throw new Error(response.message || 'Failed to toggle anonymous mode')
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  const refreshToken = async () => {
    const refreshToken = localStorage.getItem('refreshToken')

    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    try {
      const response = await request('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      })

      if (response.success) {
        localStorage.setItem('accessToken', response.accessToken)
        localStorage.setItem('refreshToken', response.refreshToken)
        return response.accessToken
      } else {
        throw new Error('Token refresh failed')
      }
    } catch (error) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      dispatch({ type: 'AUTH_LOGOUT' })
      throw error
    }
  }

  const value = {
    ...state,
    login,
    register,
    logout,
    updateProfile,
    toggleAnonymousMode,
    refreshToken,
    checkAuthStatus
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}