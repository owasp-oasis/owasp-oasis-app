import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPageView } from '../analytics'

export default function AnalyticsTracker() {
  const location = useLocation()
  const firstView = useRef(true)

  useEffect(() => {
    trackPageView(location.pathname, firstView.current)
    firstView.current = false
  }, [location.pathname])

  return null
}
