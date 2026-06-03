import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useUserData } from './hooks/useUserData'
import FleetDashboard from './pages/FleetDashboard'
import Profile from './pages/Profile'
import ShopProfile from './pages/ShopProfile'
import Feed from './pages/Feed'
import ForumHub from './pages/ForumHub'
import CommunityView from './pages/CommunityView'
import ThreadView from './pages/ThreadView'
import About from './pages/About'
import Notifications from './pages/Notifications'
import FAQ from './pages/FAQ'
import ExploreMap from './pages/ExploreMap'
import Rent from './pages/Rent'
import MapHome from './pages/MapHome'
import MyRentals from './pages/MyRentals'
import AdminLibrary from './pages/AdminLibrary'

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useUserData()
  const location = useLocation()

  if (loading) return <div style={{ background: '#121212', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6600' }}>Loading...</div>

  if (!user) {
    // Redirect to home if not logged in
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <>{children}</>
}

// Redirect authenticated users away from landing page
const AuthRedirect = ({ children }: { children: React.ReactNode }) => {
  const { user, userData, loading } = useUserData()

  if (loading) return null

  if (user) {
    return <Navigate to={userData?.role === 'fleet' ? "/fleet" : "/map"} replace />
  }

  return <>{children}</>
}

// Role-Based Route Component
const RoleRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole: string }) => {
  const { user, userData, loading } = useUserData()

  if (loading) return <div style={{ background: '#121212', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6600' }}>Verifying Role...</div>

  if (!user) return <Navigate to="/" replace />
  
  const isAdmin = userData?.isAdmin || false;
  const role = userData?.role;

  if (role !== requiredRole && !isAdmin) {
    return <Navigate to="/map" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={
          <AuthRedirect>
            <About />
          </AuthRedirect>
        } />
        
        {/* Protected Feature Routes */}
        <Route path="/map" element={<ProtectedRoute><MapHome /></ProtectedRoute>} />
        <Route path="/rent" element={<ProtectedRoute><Rent /></ProtectedRoute>} />
        <Route path="/rentals" element={<ProtectedRoute><MyRentals /></ProtectedRoute>} />
        <Route path="/fleet" element={<RoleRoute requiredRole="fleet"><FleetDashboard /></RoleRoute>} />
        <Route path="/faq" element={<ProtectedRoute><FAQ /></ProtectedRoute>} />
        <Route path="/explore" element={<ProtectedRoute><ExploreMap /></ProtectedRoute>} />
        <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/profile/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/shop-profile" element={<RoleRoute requiredRole="fleet"><ShopProfile /></RoleRoute>} />
        <Route path="/forum" element={<ProtectedRoute><ForumHub /></ProtectedRoute>} />
        <Route path="/forum/c/:communityId" element={<ProtectedRoute><CommunityView /></ProtectedRoute>} />
        <Route path="/forum/c/:communityId/t/:threadId" element={<ProtectedRoute><ThreadView /></ProtectedRoute>} />
        <Route path="/admin/library" element={<ProtectedRoute><AdminLibrary /></ProtectedRoute>} />
        
        <Route path="/about" element={<About />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App
