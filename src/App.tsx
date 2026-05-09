import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import MapHome from './pages/MapHome'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MapHome />} />
        {/* Placeholder routes for Phase 2/3 */}
        <Route path="/feed" element={<div style={{ color: 'white', padding: '2rem' }}>Activity Feed (Coming Soon)</div>} />
        <Route path="/profile/:username" element={<div style={{ color: 'white', padding: '2rem' }}>User Profile (Coming Soon)</div>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App
