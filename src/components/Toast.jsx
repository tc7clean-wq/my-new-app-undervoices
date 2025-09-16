import React, { useEffect } from 'react'
import { useApp } from '../context/AppContext'

const Toast = () => {
  const { notifications, dismissNotification } = useApp()

  if (notifications.length === 0) {
    return null
  }

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <ToastItem
          key={notification.id}
          notification={notification}
          onDismiss={dismissNotification}
        />
      ))}
    </div>
  )
}

const ToastItem = ({ notification, onDismiss }) => {
  const { id, type, title, message, duration } = notification

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(id)
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [id, duration, onDismiss])

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50 dark:bg-green-900',
          border: 'border-green-200 dark:border-green-700',
          icon: '✅',
          iconColor: 'text-green-600 dark:text-green-400'
        }
      case 'error':
        return {
          bg: 'bg-red-50 dark:bg-red-900',
          border: 'border-red-200 dark:border-red-700',
          icon: '❌',
          iconColor: 'text-red-600 dark:text-red-400'
        }
      case 'warning':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900',
          border: 'border-yellow-200 dark:border-yellow-700',
          icon: '⚠️',
          iconColor: 'text-yellow-600 dark:text-yellow-400'
        }
      case 'info':
      default:
        return {
          bg: 'bg-blue-50 dark:bg-blue-900',
          border: 'border-blue-200 dark:border-blue-700',
          icon: 'ℹ️',
          iconColor: 'text-blue-600 dark:text-blue-400'
        }
    }
  }

  const styles = getTypeStyles()

  return (
    <div
      className={`
        max-w-sm w-full ${styles.bg} border ${styles.border} rounded-lg shadow-lg
        transform transition-all duration-300 ease-in-out animate-slide-up
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className={`flex-shrink-0 ${styles.iconColor} text-lg mr-3 mt-0.5`}>
            {styles.icon}
          </div>

          <div className="flex-1 min-w-0">
            {title && (
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                {title}
              </h4>
            )}
            {message && (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {message}
              </p>
            )}
          </div>

          <button
            onClick={() => onDismiss(id)}
            className="ml-3 flex-shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 rounded-md p-1"
            aria-label="Dismiss notification"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar for timed notifications */}
        {duration > 0 && (
          <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full transition-all ease-linear ${
                type === 'success' ? 'bg-green-500' :
                type === 'error' ? 'bg-red-500' :
                type === 'warning' ? 'bg-yellow-500' :
                'bg-blue-500'
              }`}
              style={{
                width: '100%',
                animation: `shrink ${duration}ms linear forwards`
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Add CSS animation for progress bar
const style = document.createElement('style')
style.textContent = `
  @keyframes shrink {
    from { width: 100%; }
    to { width: 0%; }
  }
`
document.head.appendChild(style)

export default Toast