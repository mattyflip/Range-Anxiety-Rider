import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { db, auth } from '../../firebase'
import { signOut } from 'firebase/auth'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'

import { useUserData } from '../../hooks/useUserData'
import type { User } from 'firebase/auth'

interface NavBarProps {
  user: User | null;
  onShowInstall: () => void;
  onShowAuth: () => void;
}

const NavBar: React.FC<NavBarProps> = ({ user: providedUser, onShowInstall, onShowAuth }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, userData } = useUserData(providedUser);

  const [prevPath, setPrevPath] = useState(location.pathname);
  if (location.pathname !== prevPath) {
    setPrevPath(location.pathname);
    setIsMenuOpen(false);
  }

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, `users/${user.uid}/notifications`),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
    }, (err) => {
      console.error("NavBar notifications listener failed", err);
    });

    return () => unsubscribe();
  }, [user]);

  const isAdmin = userData?.isAdmin || false;

  const toggleRole = async () => {
    if (!user || !isAdmin) return;
    const newRole = userData?.role === 'fleet' ? 'rider' : 'fleet';
    await updateDoc(doc(db, "users", user.uid), { role: newRole });
    navigate(newRole === 'fleet' ? '/fleet' : '/map');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const isFleet = userData?.role === 'fleet';

  const renderNavLinks = () => {
    if (!user) {
      return (
        <>
          <Link to="/about" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>About</Link>
          <button 
            onClick={onShowAuth}
            style={{ 
              background: 'linear-gradient(45deg, #ff6600, #ff9900)', color: 'white', border: 'none', 
              borderRadius: '20px', padding: '0.3rem 1rem', fontSize: '0.7rem', fontWeight: 'bold', 
              cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(255,102,0,0.3)'
            }}
          >
            Login
          </button>
        </>
      );
    }

    if (isFleet) {
      return (
        <>
          <Link to="/fleet" style={{ color: location.pathname === '/fleet' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Fleet Hub</Link>
          <Link to="/map" style={{ color: location.pathname === '/map' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Fleet Map</Link>
          <Link to="/shop-profile" style={{ color: location.pathname === '/shop-profile' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Shop Profile</Link>
          <Link to="/about" style={{ color: location.pathname === '/about' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>About</Link>
        </>
      );
    }

    return (
      <>
        <Link to="/map" style={{ color: location.pathname === '/map' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Trip Map</Link>
        <Link to="/rent" style={{ color: location.pathname === '/rent' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Rent</Link>
        <Link to="/rentals" style={{ color: location.pathname === '/rentals' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>My Rentals</Link>
        <Link to="/feed" style={{ color: location.pathname === '/feed' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Community</Link>
        <Link to="/forum" style={{ color: location.pathname.startsWith('/forum') ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Forum</Link>
        <Link to="/faq" style={{ color: location.pathname === '/faq' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>FAQ</Link>
        <Link to="/about" style={{ color: location.pathname === '/about' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>About</Link>
        <Link to={`/profile/${userData?.username || 'me'}`} style={{ color: location.pathname.startsWith('/profile') ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Profile</Link>
      </>
    );
  };

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
        <Link to={user ? (isFleet ? "/fleet" : "/map") : "/"} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/app-icon.png" alt="Logo" style={{ height: '2.5rem', width: 'auto' }} />
          <span style={{ color: 'white', fontWeight: 900, fontSize: '1rem', letterSpacing: '-0.5px' }} className="desktop-only">RANGE ANXIETY</span>
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center' }}>
        {/* Desktop Navigation */}
        <nav className="desktop-only nav-links">
          {renderNavLinks()}
          
          {isAdmin && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <Link to="/admin/library" style={{ color: location.pathname === '/admin/library' ? '#ff6600' : '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Catalog</Link>
              <button onClick={toggleRole} style={{ background: 'rgba(255,102,0,0.1)', border: '1px solid #ff6600', color: '#ff6600', borderRadius: '20px', padding: '0.3rem 0.8rem', fontSize: '0.65rem', fontWeight: 'bold', cursor: 'pointer' }}>
                Switch to {userData?.role === 'fleet' ? 'Rider' : 'Manager'}
              </button>
            </div>
          )}

          {user && (
            <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #444', color: '#888', borderRadius: '20px', padding: '0.3rem 0.8rem', fontSize: '0.65rem', fontWeight: 'bold', cursor: 'pointer' }}>Log Out</button>
          )}

          <button onClick={onShowInstall} style={{ background: 'linear-gradient(45deg, #ff6600, #ff9900)', color: 'white', border: 'none', borderRadius: '20px', padding: '0.3rem 1rem', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(255,102,0,0.3)' }}>Get App</button>
        </nav>

        {/* Notifications (Always visible if user) */}
        {user && (
          <button 
            onClick={() => navigate('/notifications')}
            style={{ background: 'none', border: 'none', color: unreadCount > 0 ? '#ff6600' : '#888', fontSize: '1.2rem', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center' }}
          >
            🔔
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ff0000', color: 'white', fontSize: '0.6rem', padding: '2px 5px', borderRadius: '10px', fontWeight: 'bold', boxShadow: '0 0 5px rgba(255,0,0,0.5)' }}>{unreadCount}</span>
            )}
          </button>
        )}

        {/* Mobile Hamburger Button */}
        <button 
          className="mobile-only" 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          style={{ background: 'none', border: 'none', color: '#ff6600', fontSize: '1.8rem', cursor: 'pointer', padding: '0.5rem' }}
        >
          {isMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {isMenuOpen && (
        <div className="mobile-nav-dropdown mobile-only">
          {renderNavLinks()}
          
          {isAdmin && (
            <>
              <Link to="/admin/library" style={{ color: '#888', textDecoration: 'none', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase' }}>Catalog</Link>
              <button onClick={toggleRole} style={{ width: '100%', background: 'rgba(255,102,0,0.1)', border: '1px solid #ff6600', color: '#ff6600', borderRadius: '12px', padding: '0.8rem', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer' }}>
                Switch to {userData?.role === 'fleet' ? 'Rider' : 'Manager'}
              </button>
            </>
          )}

          {user && (
            <button onClick={handleLogout} style={{ width: '100%', background: 'none', border: '1px solid #444', color: '#888', borderRadius: '12px', padding: '0.8rem', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer' }}>Log Out</button>
          )}

          <button onClick={onShowInstall} style={{ width: '100%', background: 'linear-gradient(45deg, #ff6600, #ff9900)', color: 'white', border: 'none', borderRadius: '12px', padding: '1rem', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>Get The App</button>
        </div>
      )}
    </header>
  )
}

export default NavBar
