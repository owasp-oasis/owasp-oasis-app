import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import Nav from './components/Nav'
import { MyTeamsProvider } from './context/MyTeamsContext'
import TeamInvitationNotice from './components/TeamInvitationNotice'
import Footer from './components/Footer'
import PreviewBanner from './components/PreviewBanner'
import OnboardingModal from './components/OnboardingModal/OnboardingModal'
import Home from './pages/Home'
import About from './pages/About'
import Overview from './pages/Overview'
import Workspace from './pages/Workspace'
import { WorkspaceProvider } from './context/WorkspaceContext'
import WorkspaceLayout from './pages/workspace/WorkspaceLayout'
import Support from './pages/Support'
import Sponsors from './pages/Sponsors'
import BrandGuide from './pages/BrandGuide'
import News from './pages/News'
import NewsLaunch from './pages/NewsLaunch'
import SyncStatus, { SyncRunDetail } from './pages/SyncStatus'
import FixCostCalculator from './pages/FixCostCalculator'
import Admin from './pages/Admin'
import AdminAnalytics from './pages/AdminAnalytics'
import AnalyticsTracker from './components/AnalyticsTracker'

function LegacyWorkspaceLink({ path }: { path: string }) {
  const { search, hash } = useLocation()
  return <Navigate to={path + search + hash} replace />
}

function LegacySyncRunLink() {
  const { pathname, search, hash } = useLocation()
  return <Navigate to={pathname.replace('/workspace/status/runs/', '/workspace/sync/runs/') + search + hash} replace />
}

function AppShell() {
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const location = useLocation()
  const isStandalone = location.pathname === '/calculator'
  const isWorkspace = location.pathname.startsWith('/workspace')

  return (
    <>
      <AnalyticsTracker />
      {!isStandalone && <PreviewBanner />}
      {!isStandalone && <Nav onOpenOnboarding={() => setOnboardingOpen(true)} />}
      <main id="main-content" tabIndex={-1}>
        <TeamInvitationNotice />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/about" element={<About />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/dashboard" element={<LegacyWorkspaceLink path="/workspace" />} />
          <Route path="/workspace" element={<Workspace activeTab="queue" />} />
          <Route path="/workspace/projects" element={<Workspace activeTab="projects" />} />
          <Route path="/workspace/pull-requests" element={<LegacyWorkspaceLink path="/workspace/fixes" />} />
          <Route path="/workspace/fixes" element={<Workspace activeTab="prs" />} />
          <Route path="/workspace/fixes/:repo/:number" element={<Workspace activeTab="prs" />} />
          <Route path="/workspace/preferences" element={<Workspace activeTab="preferences" />} />
          <Route path="/workspace/contributors" element={<LegacyWorkspaceLink path="/workspace/validators" />} />
          <Route path="/workspace/validators" element={<Workspace activeTab="contributors" />} />
          <Route path="/workspace/maintainers" element={<Workspace activeTab="maintainers" />} />
          <Route path="/workspace/teams" element={<Workspace activeTab="teams" />} />
          {/* Intentionally unlisted: available by direct link, but omitted from Workspace navigation. */}
          <Route path="/workspace/tools" element={<LegacyWorkspaceLink path="/workspace/fix-automation" />} />
          <Route path="/workspace/fix-automation" element={<Workspace activeTab="tools" />} />
          {/* Intentionally unlisted: linked from the Workspace sync chip. */}
          <Route path="/workspace/status" element={<LegacyWorkspaceLink path="/workspace/sync" />} />
          <Route path="/workspace/sync" element={<WorkspaceLayout title="Sync status"><SyncStatus /></WorkspaceLayout>} />
          <Route path="/workspace/status/runs/:runId" element={<LegacySyncRunLink />} />
          <Route path="/workspace/sync/runs/:runId" element={<WorkspaceLayout title="Sync run"><SyncRunDetail /></WorkspaceLayout>} />
          {/* Listed only for authenticated administrators in the account menu. */}
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
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
      {!isStandalone && !isWorkspace && <Footer />}
      {!isStandalone && <OnboardingModal isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} />}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter><MyTeamsProvider><WorkspaceProvider>
        <AppShell />
      </WorkspaceProvider></MyTeamsProvider></BrowserRouter>
    </AuthProvider>
  )
}
