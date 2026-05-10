import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import MapHome from './pages/MapHome'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Feed from './pages/Feed'
import ForumHub from './pages/ForumHub'
import CommunityView from './pages/CommunityView'
import ThreadView from './pages/ThreadView'
import About from './pages/About'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MapHome />} />
        <Route path="/how-it-works" element={<About />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/profile/:username" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/forum" element={<ForumHub />} />
        <Route path="/forum/c/:communityId" element={<CommunityView />} />
        <Route path="/forum/c/:communityId/t/:threadId" element={<ThreadView />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App
