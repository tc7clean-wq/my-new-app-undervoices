import { useState, useEffect, useRef, useCallback } from 'react'

export const useGestures = (options = {}) => {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onPinchStart,
    onPinchMove,
    onPinchEnd,
    onTap,
    onDoubleTap,
    onLongPress,
    threshold = 50,
    velocityThreshold = 0.3,
    longPressDelay = 500
  } = options

  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)
  const [isPressed, setIsPressed] = useState(false)
  const [isPinching, setIsPinching] = useState(false)
  const [pinchDistance, setPinchDistance] = useState(0)
  const [tapCount, setTapCount] = useState(0)

  const longPressTimer = useRef(null)
  const doubleTapTimer = useRef(null)
  const startTime = useRef(null)

  const getDistance = useCallback((touch1, touch2) => {
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
      Math.pow(touch2.clientY - touch1.clientY, 2)
    )
  }, [])

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0]
    setTouchStart({ x: touch.clientX, y: touch.clientY })
    setTouchEnd(null)
    setIsPressed(true)
    startTime.current = Date.now()

    if (e.touches.length === 2) {
      // Pinch gesture start
      const distance = getDistance(e.touches[0], e.touches[1])
      setPinchDistance(distance)
      setIsPinching(true)
      onPinchStart?.(distance)
    } else {
      // Long press detection
      longPressTimer.current = setTimeout(() => {
        onLongPress?.(touch)
        setIsPressed(false)
      }, longPressDelay)
    }
  }, [getDistance, onPinchStart, onLongPress, longPressDelay])

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && isPinching) {
      const distance = getDistance(e.touches[0], e.touches[1])
      const scale = distance / pinchDistance
      onPinchMove?.(scale, distance)
      setPinchDistance(distance)
    } else {
      const touch = e.touches[0]
      setTouchEnd({ x: touch.clientX, y: touch.clientY })

      // Cancel long press if finger moves too much
      if (longPressTimer.current && touchStart) {
        const moveDistance = Math.sqrt(
          Math.pow(touch.clientX - touchStart.x, 2) +
          Math.pow(touch.clientY - touchStart.y, 2)
        )
        if (moveDistance > 10) {
          clearTimeout(longPressTimer.current)
          longPressTimer.current = null
        }
      }
    }
  }, [isPinching, pinchDistance, getDistance, onPinchMove, touchStart])

  const handleTouchEnd = useCallback((e) => {
    const endTime = Date.now()
    const touchDuration = endTime - (startTime.current || endTime)

    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }

    if (isPinching) {
      setIsPinching(false)
      onPinchEnd?.()
      return
    }

    setIsPressed(false)

    if (!touchStart || !touchEnd) {
      // Tap gesture
      if (touchDuration < 300) {
        setTapCount(prev => prev + 1)

        if (doubleTapTimer.current) {
          clearTimeout(doubleTapTimer.current)
        }

        doubleTapTimer.current = setTimeout(() => {
          if (tapCount === 0) {
            onTap?.(touchStart)
          } else if (tapCount === 1) {
            onDoubleTap?.(touchStart)
          }
          setTapCount(0)
        }, 300)
      }
      return
    }

    const distanceX = touchEnd.x - touchStart.x
    const distanceY = touchEnd.y - touchStart.y
    const absDistanceX = Math.abs(distanceX)
    const absDistanceY = Math.abs(distanceY)
    const velocity = Math.sqrt(distanceX * distanceX + distanceY * distanceY) / touchDuration

    // Check if gesture meets threshold requirements
    if (Math.max(absDistanceX, absDistanceY) < threshold || velocity < velocityThreshold) {
      return
    }

    // Determine swipe direction
    if (absDistanceX > absDistanceY) {
      // Horizontal swipe
      if (distanceX > 0) {
        onSwipeRight?.(distanceX, velocity)
      } else {
        onSwipeLeft?.(Math.abs(distanceX), velocity)
      }
    } else {
      // Vertical swipe
      if (distanceY > 0) {
        onSwipeDown?.(distanceY, velocity)
      } else {
        onSwipeUp?.(Math.abs(distanceY), velocity)
      }
    }
  }, [
    touchStart,
    touchEnd,
    isPinching,
    threshold,
    velocityThreshold,
    tapCount,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onPinchEnd,
    onTap,
    onDoubleTap
  ])

  const bindGestures = useCallback(() => ({
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    style: { touchAction: 'none' }
  }), [handleTouchStart, handleTouchMove, handleTouchEnd])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
      }
      if (doubleTapTimer.current) {
        clearTimeout(doubleTapTimer.current)
      }
    }
  }, [])

  return {
    bindGestures,
    isPressed,
    isPinching,
    touchStart,
    touchEnd
  }
}

export const useSwipe = (onSwipeLeft, onSwipeRight, threshold = 50) => {
  return useGestures({
    onSwipeLeft,
    onSwipeRight,
    threshold
  })
}

export const usePinch = (onPinchStart, onPinchMove, onPinchEnd) => {
  return useGestures({
    onPinchStart,
    onPinchMove,
    onPinchEnd
  })
}

export const useTap = (onTap, onDoubleTap) => {
  return useGestures({
    onTap,
    onDoubleTap
  })
}

export default useGestures