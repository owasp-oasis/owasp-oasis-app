import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Nav from './components/Nav'
import Footer from './components/Footer'
import PreviewBanner from './components/PreviewBanner'
import Home from './pages/Home'
import About from './pages/About'
import Overview from './pages/Overview'
import Leaderboards from './pages/Leaderboards'
import Support from './pages/Support'
import Sponsors from './pages/Sponsors'
import BrandGuide from './pages/BrandGuide'

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <PreviewBanner />
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/about" element={<About />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
          <Route path="/support" element={<Support />} />
          <Route path="/sponsors" element={<Sponsors />} />
          <Route path="/brand" element={<BrandGuide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
    </AuthProvider>
  )
}
