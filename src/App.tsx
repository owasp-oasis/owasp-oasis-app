import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import Nav from './components/Nav'
import Footer from './components/Footer'
import PreviewBanner from './components/PreviewBanner'
import OnboardingModal from './components/OnboardingModal/OnboardingModal'
import Home from './pages/Home'
import About from './pages/About'
import Overview from './pages/Overview'
import Leaderboards from './pages/Leaderboards'
import Support from './pages/Support'
import Sponsors from './pages/Sponsors'
import BrandGuide from './pages/BrandGuide'
import News from './pages/News'

export default function App() {
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  return (
    <AuthProvider>
      <BrowserRouter>
        <PreviewBanner />
        <Nav onOpenOnboarding={() => setOnboardingOpen(true)} />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/about" element={<About />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/workspace" element={<Navigate to="/workspace/pull-requests" replace />} />
            <Route path="/workspace/projects" element={<Leaderboards activeTab="projects" />} />
            <Route path="/workspace/pull-requests" element={<Leaderboards activeTab="prs" />} />
            <Route path="/workspace/contributors" element={<Leaderboards activeTab="contributors" />} />
            <Route path="/workspace/maintainers" element={<Leaderboards activeTab="maintainers" />} />
            {/* Intentionally unlisted: available by direct link, but omitted from Workspace navigation. */}
            <Route path="/workspace/tools" element={<Leaderboards activeTab="tools" />} />
            <Route path="/support" element={<Support />} />
            <Route path="/sponsors" element={<Sponsors />} />
            <Route path="/brand" element={<BrandGuide />} />
          {/* Intentionally unlisted: not in nav until launch day Aug 26 */}
          <Route path="/news" element={<News />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
        <OnboardingModal isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
      </BrowserRouter>
    </AuthProvider>
  )
}
