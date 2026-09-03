import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import NewsLaunch from './pages/NewsLaunch'
import SyncStatus, { SyncRunDetail } from './pages/SyncStatus'
import FixCostCalculator from './pages/FixCostCalculator'
import Admin from './pages/Admin'

function AppShell() {
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const location = useLocation()
  const isStandalone = location.pathname === '/calculator'

  return (
    <>
      {!isStandalone && <PreviewBanner />}
      {!isStandalone && <Nav onOpenOnboarding={() => setOnboardingOpen(true)} />}
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
          {/* Intentionally unlisted: linked from the Workspace sync chip. */}
          <Route path="/workspace/status" element={<SyncStatus />} />
          <Route path="/workspace/status/runs/:runId" element={<SyncRunDetail />} />
          {/* Listed only for authenticated administrators in the account menu. */}
          <Route path="/admin" element={<Admin />} />
          <Route path="/support" element={<Support />} />
          <Route path="/sponsors" element={<Sponsors />} />
          <Route path="/brand" element={<BrandGuide />} />
          {/* Intentionally standalone: direct URL only, omitted from nav and homepage links. */}
          <Route path="/calculator" element={<FixCostCalculator />} />
          <Route path="/news" element={<News />} />
          <Route path="/news/launch" element={<NewsLaunch />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isStandalone && <Footer />}
      {!isStandalone && <OnboardingModal isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} />}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}
