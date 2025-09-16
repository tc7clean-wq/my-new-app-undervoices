import { useState, useCallback } from 'react'
import axios from 'axios'
import CryptoJS from 'crypto-js'

// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'default-key-change-in-production'

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Version': '1.0.0',
    'X-Device-Type': /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
  }
})

// Request interceptor for adding auth tokens
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for handling token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refreshToken')
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken
          })

          const { accessToken, refreshToken: newRefreshToken } = response.data
          localStorage.setItem('accessToken', accessToken)
          localStorage.setItem('refreshToken', newRefreshToken)

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export const useApi = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const encryptData = useCallback((data) => {
    try {
      return CryptoJS.AES.encrypt(JSON.stringify(data), ENCRYPTION_KEY).toString()
    } catch (error) {
      console.error('Encryption error:', error)
      return data
    }
  }, [])

  const decryptData = useCallback((encryptedData) => {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY)
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8))
    } catch (error) {
      console.error('Decryption error:', error)
      return encryptedData
    }
  }, [])

  const request = useCallback(async (url, options = {}) => {
    setLoading(true)
    setError(null)

    try {
      const config = {
        url,
        method: options.method || 'GET',
        ...options
      }

      // Encrypt sensitive data if specified
      if (options.encrypt && config.data) {
        config.data = encryptData(config.data)
      }

      const response = await apiClient(config)

      // Decrypt response if specified
      let data = response.data
      if (options.decrypt && data) {
        data = decryptData(data)
      }

      return data
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'An error occurred'
      const errorCode = err.response?.status || 500

      const apiError = {
        message: errorMessage,
        code: errorCode,
        details: err.response?.data?.details || null
      }

      setError(apiError)
      throw apiError
    } finally {
      setLoading(false)
    }
  }, [encryptData, decryptData])

  const get = useCallback((url, options = {}) => {
    return request(url, { ...options, method: 'GET' })
  }, [request])

  const post = useCallback((url, data, options = {}) => {
    return request(url, { ...options, method: 'POST', data })
  }, [request])

  const put = useCallback((url, data, options = {}) => {
    return request(url, { ...options, method: 'PUT', data })
  }, [request])

  const del = useCallback((url, options = {}) => {
    return request(url, { ...options, method: 'DELETE' })
  }, [request])

  const patch = useCallback((url, data, options = {}) => {
    return request(url, { ...options, method: 'PATCH', data })
  }, [request])

  return {
    loading,
    error,
    request,
    get,
    post,
    put,
    delete: del,
    patch,
    encryptData,
    decryptData
  }
}

export default useApi