import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { useUserData } from './hooks/useUserData'
import { usePushNotifications } from './hooks/usePushNotifications'
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
import AdminAnalytics from './pages/AdminAnalytics'
import LoadingScreen from './shared/ui/LoadingScreen'

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useUserData()
  const location = useLocation()

  if (loading) return <LoadingScreen message="AUTHORIZING..." />

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

  if (loading) return <LoadingScreen message="VERIFYING ROLE..." />

  if (!user) return <Navigate to="/" replace />
  
  const isAdmin = userData?.isAdmin || false;
  const role = userData?.role;

  if (role !== requiredRole && !isAdmin) {
    return <Navigate to="/map" replace />
  }

  return <>{children}</>
}

// Admin-Only Route Component
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userData, loading } = useUserData()

  if (loading) return <LoadingScreen message="VERIFYING ADMIN..." />

  if (!user) return <Navigate to="/" replace />
  
  if (!userData?.isAdmin) {
    return <Navigate to="/map" replace />
  }

  return <>{children}</>
}

// Deep Link Handler Component
const DeepLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    CapacitorApp.addListener('appUrlOpen', (data: { url: string }) => {
      // Example: https://rangeanxiety.app/profile/username
      // The URL will be the full URL, we want the path.
      // Capacitor App Links on Android can sometimes be weird with protocols.
      try {
        const url = new URL(data.url);
        const path = url.pathname + url.search + url.hash;
        navigate(path);
      } catch (e) {
        // Fallback for custom schemes if URL parsing fails
        const slug = data.url.split('rangeanxiety.app').pop() || data.url.split('://').pop();
        if (slug && slug.startsWith('/')) {
          navigate(slug);
        }
      }
    });
  }, [navigate]);

  return null;
}

function App() {
  const { user } = useUserData();
  usePushNotifications(user);

  useEffect(() => {
    const initMobile = async () => {
      try {
        // Set status bar style to match dark theme
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#121212' });
        
        // Hide splash screen after a short delay to ensure app is ready
        setTimeout(async () => {
          await SplashScreen.hide();
        }, 1000);
      } catch (e) {
        console.warn('Mobile plugin init failed (probably on web):', e);
      }
    };
    initMobile();
  }, []);

  return (
    <Router>
      <DeepLinkHandler />
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
        <Route path="/admin/library" element={<AdminRoute><AdminLibrary /></AdminRoute>} />
        <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
        
        <Route path="/about" element={<About />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App
