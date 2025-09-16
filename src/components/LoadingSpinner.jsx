import React from 'react'

const LoadingSpinner = ({
  size = 'medium',
  color = 'primary',
  className = '',
  text = null,
  fullScreen = false
}) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12',
    xl: 'w-16 h-16'
  }

  const colorClasses = {
    primary: 'border-primary-500',
    white: 'border-white',
    gray: 'border-gray-500'
  }

  const spinnerElement = (
    <div
      className={`
        inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent
        ${sizeClasses[size]} ${colorClasses[color]} ${className}
      `}
      role="status"
      aria-label={text || 'Loading'}
    >
      <span className="sr-only">{text || 'Loading...'}</span>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 flex items-center justify-center z-50">
        <div className="text-center">
          {spinnerElement}
          {text && (
            <p className="mt-4 text-gray-600 dark:text-gray-400">{text}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center">
      {spinnerElement}
      {text && (
        <span className="ml-3 text-gray-600 dark:text-gray-400">{text}</span>
      )}
    </div>
  )
}

export default LoadingSpinner