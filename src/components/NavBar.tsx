import React from 'react'
import { Link } from 'react-router-dom'

interface NavBarProps {
  user: any;
  onShowInstall: () => void;
}

const NavBar: React.FC<NavBarProps> = ({ user, onShowInstall }) => {
  return (
    <header style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '0.8rem 1.5rem', 
      background: '#121212', 
      borderBottom: '1px solid #333',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      height: '4.5rem'
    }}>
      <div className="logo-container" style={{ display: 'flex', alignItems: 'center' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/app-icon.png" alt="Logo" style={{ height: '2.5rem', width: 'auto' }} />
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center' }}>
        <nav style={{ display: 'flex', gap: '1.2rem', alignItems: 'center' }}>
          <Link to="/" style={{ color: '#888', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase' }}>Map</Link>
          <Link to="/how-it-works" style={{ color: '#888', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase' }}>Info</Link>
          <Link to="/feed" style={{ color: '#888', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase' }}>Feed</Link>
          <Link to="/forum" style={{ color: '#888', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase' }}>Forum</Link>
          <Link to={user ? `/profile/${user.displayName || user.uid}` : '/profile/me'} style={{ color: '#888', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase' }}>Profile</Link>
        </nav>

        <div className="nav-actions" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <button 
            onClick={onShowInstall}
            style={{ 
              background: 'linear-gradient(45deg, #ff6600, #ff9900)', 
              color: 'white', 
              border: 'none', 
              borderRadius: '20px', 
              padding: '0.4rem 1rem', 
              fontSize: '0.75rem', 
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(255,102,0,0.3)'
            }}
          >
            App
          </button>
        </div>
      </div>
    </header>
  )
}

export default NavBar
