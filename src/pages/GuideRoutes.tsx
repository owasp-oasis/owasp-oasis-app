import { Route } from 'react-router-dom'
import { createElement } from 'react'
import QuickStart from './QuickStart'
import ReviewerGuide from './ReviewerGuide'

export const guideRoutes = [
  createElement(Route, { key: 'quick-start', path: '/quick-start', element: createElement(QuickStart) }),
  createElement(Route, { key: 'reviewer-guide', path: '/reviewer-guide', element: createElement(ReviewerGuide) }),
]
