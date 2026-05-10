import React from 'react'
import { Link } from 'react-router-dom'

interface NavBarProps {
  user: any;
  onShowInstall: () => void;
  onShowAuth: () => void;
}

const NavBar: React.FC<NavBarProps> = ({ user, onShowInstall, onShowAuth }) => {
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

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', minWidth: 0 }}>
        <nav style={{ 
          display: 'flex', 
          gap: '1rem', 
          alignItems: 'center',
          overflowX: 'auto',
          paddingBottom: '4px',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none'
        }}>
          <Link to="/" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Map</Link>
          <Link to="/how-it-works" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Info</Link>
          <Link to="/feed" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Feed</Link>
          <Link to="/forum" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Forum</Link>
          <Link to={user ? `/profile/${user.displayName || user.uid}` : '/profile/me'} style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Profile</Link>
          
          {!user && (
            <button 
              onClick={onShowAuth}
              style={{ 
                background: 'linear-gradient(45deg, #ff6600, #ff9900)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '20px', 
                padding: '0.3rem 1rem', 
                fontSize: '0.7rem', 
                fontWeight: 'bold',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 10px rgba(255,102,0,0.3)'
              }}
            >
              Login
            </button>
          )}

          {/* Moved App Install button into the scrolling nav for mobile compatibility */}
          <button 
            onClick={onShowInstall}
            style={{ 
              background: user ? 'linear-gradient(45deg, #ff6600, #ff9900)' : '#333', 
              color: 'white', 
              border: 'none', 
              borderRadius: '20px', 
              padding: '0.3rem 0.8rem', 
              fontSize: '0.7rem', 
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: user ? '0 4px 10px rgba(255,102,0,0.3)' : 'none'
            }}
          >
            App
          </button>
        </nav>
      </div>
    </header>
  )
}

export default NavBar
