import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import MapHome from './pages/MapHome'
import Profile from './pages/Profile'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MapHome />} />
        {/* Placeholder routes for Phase 3 */}
        <Route path="/feed" element={<div style={{ color: 'white', padding: '2rem' }}>Activity Feed (Coming Soon)</div>} />
        <Route path="/profile/:username" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App
