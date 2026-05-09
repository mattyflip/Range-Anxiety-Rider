import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../firebase'
import { signOut } from 'firebase/auth'
import heroLogo from '../assets/logo-no-bg.png'

interface NavBarProps {
  user: any;
  isPro: boolean;
  onShowAuth: () => void;
  onShowInstall: () => void;
}

const NavBar: React.FC<NavBarProps> = ({ user, isPro, onShowAuth, onShowInstall }) => {
  const navigate = useNavigate();

  const handleSignOut = () => {
    signOut(auth);
    navigate('/');
  };

  return (
    <header style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '1rem 2rem', 
      background: '#121212', 
      borderBottom: '1px solid #333',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      <div className="logo-container" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', textDecoration: 'none', color: 'white' }}>
          <img src={heroLogo} alt="Logo" style={{ height: '2.5rem', width: 'auto' }} />
          <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>Range Anxiety</span>
        </Link>
      </div>

      <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        <Link to="/" style={{ color: '#888', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>Map</Link>
        <Link to="/feed" style={{ color: '#888', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>Feed</Link>
        {user && (
          <Link to={`/profile/${user.displayName || user.uid}`} style={{ color: '#888', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>Profile</Link>
        )}
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
            cursor: 'pointer'
          }}
        >
          Get App
        </button>
        <button 
          onClick={() => user ? handleSignOut() : onShowAuth()} 
          style={{ 
            background: 'rgba(255,255,255,0.1)', 
            color: 'white', 
            border: 'none', 
            borderRadius: '20px', 
            padding: '0.4rem 1rem', 
            fontSize: '0.8rem', 
            cursor: 'pointer' 
          }}
        >
          {user ? `Sign Out (${isPro ? 'PRO' : 'Free'})` : 'Sign In'}
        </button>
      </div>
    </header>
  )
}

export default NavBar
