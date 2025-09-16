import React, { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { AppProvider } from './context/AppContext'
import { OfflineProvider } from './context/OfflineContext'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import Navigation from './components/Navigation'
import Toast from './components/Toast'

// Lazy load components for better performance
const Home = lazy(() => import('./pages/Home'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ArticleEditor = lazy(() => import('./pages/ArticleEditor'))
const ArticleView = lazy(() => import('./pages/ArticleView'))
const StoryboardEditor = lazy(() => import('./pages/StoryboardEditor'))
const StoryboardView = lazy(() => import('./pages/StoryboardView'))
const Profile = lazy(() => import('./pages/Profile'))
const Settings = lazy(() => import('./pages/Settings'))
const Search = lazy(() => import('./pages/Search'))

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('accessToken')

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <OfflineProvider>
          <AuthProvider>
            <AppProvider>
              <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors duration-300">
                {/* Skip to main content for accessibility */}
                <a
                  href="#main-content"
                  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary-600 text-white p-2 rounded-md z-50"
                >
                  Skip to main content
                </a>

                <Navigation />

                <main
                  id="main-content"
                  className="relative min-h-screen pt-16"
                  role="main"
                >
                  <Suspense fallback={
                    <div className="flex items-center justify-center min-h-screen">
                      <LoadingSpinner size="large" />
                    </div>
                  }>
                    <Routes>
                      {/* Public Routes */}
                      <Route path="/" element={<Home />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/register" element={<Register />} />
                      <Route path="/search" element={<Search />} />
                      <Route path="/article/:id" element={<ArticleView />} />
                      <Route path="/storyboard/:id" element={<StoryboardView />} />
                      <Route path="/profile/:username" element={<Profile />} />

                      {/* Protected Routes */}
                      <Route path="/dashboard" element={
                        <ProtectedRoute>
                          <Dashboard />
                        </ProtectedRoute>
                      } />
                      <Route path="/article/new" element={
                        <ProtectedRoute>
                          <ArticleEditor />
                        </ProtectedRoute>
                      } />
                      <Route path="/article/:id/edit" element={
                        <ProtectedRoute>
                          <ArticleEditor />
                        </ProtectedRoute>
                      } />
                      <Route path="/storyboard/new" element={
                        <ProtectedRoute>
                          <StoryboardEditor />
                        </ProtectedRoute>
                      } />
                      <Route path="/storyboard/:id/edit" element={
                        <ProtectedRoute>
                          <StoryboardEditor />
                        </ProtectedRoute>
                      } />
                      <Route path="/settings" element={
                        <ProtectedRoute>
                          <Settings />
                        </ProtectedRoute>
                      } />

                      {/* 404 Route */}
                      <Route path="*" element={
                        <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                          <div className="max-w-md">
                            <div className="text-6xl mb-4" role="img" aria-label="Not found">📰</div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                              Story Not Found
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                              The page you're looking for doesn't exist or has been moved.
                            </p>
                            <button
                              onClick={() => window.history.back()}
                              className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                            >
                              Go Back
                            </button>
                          </div>
                        </div>
                      } />
                    </Routes>
                  </Suspense>
                </main>

                {/* Global Toast Notifications */}
                <Toast />
              </div>
            </AppProvider>
          </AuthProvider>
        </OfflineProvider>
      </Router>
    </ErrorBoundary>
  )
}

export default App