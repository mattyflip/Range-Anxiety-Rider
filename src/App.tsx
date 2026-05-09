import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import MapHome from './pages/MapHome'
import Profile from './pages/Profile'
import Feed from './pages/Feed'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MapHome />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/profile/:username" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App
