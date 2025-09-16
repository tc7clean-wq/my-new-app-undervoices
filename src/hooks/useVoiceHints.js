import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../context/AppContext'

export const useVoiceHints = () => {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [confidence, setConfidence] = useState(0)

  const { userPreferences, announceToScreenReader } = useApp()
  const recognitionRef = useRef(null)

  // Check if Speech Recognition is supported
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    setIsSupported(!!SpeechRecognition)

    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition()

      // Configure speech recognition
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = userPreferences.language || 'en-US'
      recognitionRef.current.maxAlternatives = 1

      // Event handlers
      recognitionRef.current.onstart = () => {
        setIsListening(true)
        announceToScreenReader('Voice input started')
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
        announceToScreenReader('Voice input ended')
      }

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            finalTranscript += result[0].transcript
            setConfidence(result[0].confidence)
          } else {
            interimTranscript += result[0].transcript
          }
        }

        setTranscript(finalTranscript || interimTranscript)
      }

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)

        let errorMessage = 'Voice input error'
        switch (event.error) {
          case 'no-speech':
            errorMessage = 'No speech detected'
            break
          case 'audio-capture':
            errorMessage = 'Microphone access denied'
            break
          case 'not-allowed':
            errorMessage = 'Speech recognition not allowed'
            break
          case 'network':
            errorMessage = 'Network error during speech recognition'
            break
          default:
            errorMessage = `Speech recognition error: ${event.error}`
        }

        announceToScreenReader(errorMessage)
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [userPreferences.language, announceToScreenReader])

  const startListening = useCallback(() => {
    if (!isSupported || !userPreferences.enableVoiceHints) {
      return false
    }

    try {
      if (recognitionRef.current && !isListening) {
        recognitionRef.current.start()
        return true
      }
    } catch (error) {
      console.error('Error starting speech recognition:', error)
      announceToScreenReader('Failed to start voice input')
    }

    return false
  }, [isSupported, userPreferences.enableVoiceHints, isListening, announceToScreenReader])

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
  }, [isListening])

  const speak = useCallback((text, options = {}) => {
    if (!('speechSynthesis' in window) || !userPreferences.enableVoiceHints) {
      return
    }

    // Cancel any ongoing speech
    speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)

    // Configure voice
    utterance.lang = options.lang || userPreferences.language || 'en-US'
    utterance.rate = options.rate || 1
    utterance.pitch = options.pitch || 1
    utterance.volume = options.volume || 0.8

    // Get appropriate voice
    const voices = speechSynthesis.getVoices()
    const voice = voices.find(v => v.lang.startsWith(utterance.lang)) || voices[0]
    if (voice) {
      utterance.voice = voice
    }

    speechSynthesis.speak(utterance)
  }, [userPreferences.enableVoiceHints, userPreferences.language])

  // Voice commands mapping
  const processVoiceCommand = useCallback((command) => {
    const cleanCommand = command.toLowerCase().trim()

    // Navigation commands
    if (cleanCommand.includes('go to') || cleanCommand.includes('navigate to')) {
      if (cleanCommand.includes('home') || cleanCommand.includes('homepage')) {
        return { action: 'navigate', target: '/' }
      }
      if (cleanCommand.includes('dashboard')) {
        return { action: 'navigate', target: '/dashboard' }
      }
      if (cleanCommand.includes('settings')) {
        return { action: 'navigate', target: '/settings' }
      }
      if (cleanCommand.includes('search')) {
        return { action: 'navigate', target: '/search' }
      }
    }

    // Content commands
    if (cleanCommand.includes('create') || cleanCommand.includes('new')) {
      if (cleanCommand.includes('article') || cleanCommand.includes('story')) {
        return { action: 'create', target: 'article' }
      }
      if (cleanCommand.includes('storyboard') || cleanCommand.includes('map')) {
        return { action: 'create', target: 'storyboard' }
      }
    }

    // Search commands
    if (cleanCommand.includes('search for')) {
      const searchTerm = cleanCommand.replace(/.*search for\s+/, '')
      return { action: 'search', query: searchTerm }
    }

    // Theme commands
    if (cleanCommand.includes('dark mode') || cleanCommand.includes('dark theme')) {
      return { action: 'theme', target: 'dark' }
    }
    if (cleanCommand.includes('light mode') || cleanCommand.includes('light theme')) {
      return { action: 'theme', target: 'light' }
    }

    // Help commands
    if (cleanCommand.includes('help') || cleanCommand.includes('what can')) {
      return { action: 'help' }
    }

    return { action: 'unknown', command: cleanCommand }
  }, [])

  const getVoiceHints = useCallback((context) => {
    const hints = []

    switch (context) {
      case 'homepage':
        hints.push('Say "search for" followed by a topic to search articles')
        hints.push('Say "create new article" to start writing')
        hints.push('Say "go to dashboard" to access your content')
        break

      case 'dashboard':
        hints.push('Say "create new article" to write a story')
        hints.push('Say "create new storyboard" to map connections')
        hints.push('Say "go to settings" to change preferences')
        break

      case 'article-editor':
        hints.push('Say "save article" to save your work')
        hints.push('Say "preview" to see how it looks')
        hints.push('Say "publish" to make it live')
        break

      case 'storyboard':
        hints.push('Say "add node" to create a new connection point')
        hints.push('Say "connect nodes" to link ideas')
        hints.push('Say "save storyboard" to save your map')
        break

      default:
        hints.push('Say "help" to learn about voice commands')
        hints.push('Say "go to" followed by a page name to navigate')
        hints.push('Say "dark mode" or "light mode" to change theme')
    }

    return hints
  }, [])

  const announceHints = useCallback((context) => {
    const hints = getVoiceHints(context)
    const hintText = `Voice commands available: ${hints.join('. ')}`
    speak(hintText, { rate: 0.9 })
  }, [getVoiceHints, speak])

  return {
    isSupported,
    isListening,
    transcript,
    confidence,
    startListening,
    stopListening,
    speak,
    processVoiceCommand,
    getVoiceHints,
    announceHints
  }
}

export default useVoiceHints