import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { auth } from './firebase'
import { onAuthStateChanged, type User } from 'firebase/auth'
import MapHome from './pages/MapHome'
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

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={{ background: '#121212', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6600' }}>Loading...</div>

  if (!user) {
    // Redirect to home if not logged in
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <>{children}</>
}

// Redirect authenticated users away from landing page
const AuthRedirect = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          setRole(snap.data().role);
        }
      }
      setLoading(false)
    })
  }, [])

  if (loading) return null

  if (user) {
    return <Navigate to={role === 'fleet' ? "/fleet" : "/map"} replace />
  }

  return <>{children}</>
}

// Role-Based Route Component
const RoleRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole: string }) => {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          setRole(snap.data().role);
        }
      }
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={{ background: '#121212', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6600' }}>Verifying Role...</div>

  if (!user) return <Navigate to="/" replace />
  
  if (role !== requiredRole && user.email !== 'mattyfliptv@gmail.com') {
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
        
        <Route path="/about" element={<About />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App
