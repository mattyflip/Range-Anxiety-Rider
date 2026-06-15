import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { db, auth } from '../../firebase'
import { signOut } from 'firebase/auth'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'
import styles from './NavBar.module.css';

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
          <Link to="/about" className={styles.navLink}>About</Link>
          <button 
            onClick={onShowAuth}
            className={styles.primaryButton}
          >
            Login
          </button>
        </>
      );
    }

    if (isFleet) {
      return (
        <>
          <Link to="/fleet" className={location.pathname === '/fleet' ? styles.navLinkActive : styles.navLink}>Fleet Hub</Link>
          <Link to="/map" className={location.pathname === '/map' ? styles.navLinkActive : styles.navLink}>Fleet Map</Link>
          <Link to="/shop-profile" className={location.pathname === '/shop-profile' ? styles.navLinkActive : styles.navLink}>Shop Profile</Link>
          <Link to="/about" className={location.pathname === '/about' ? styles.navLinkActive : styles.navLink}>About</Link>
        </>
      );
    }

    return (
      <>
        <Link to="/map" className={location.pathname === '/map' ? styles.navLinkActive : styles.navLink}>Trip Map</Link>
        <Link to="/rent" className={location.pathname === '/rent' ? styles.navLinkActive : styles.navLink}>Rent</Link>
        <Link to="/rentals" className={location.pathname === '/rentals' ? styles.navLinkActive : styles.navLink}>My Rentals</Link>
        <Link to="/feed" className={location.pathname === '/feed' ? styles.navLinkActive : styles.navLink}>Community</Link>
        <Link to="/forum" className={location.pathname.startsWith('/forum') ? styles.navLinkActive : styles.navLink}>Forum</Link>
        <Link to="/faq" className={location.pathname === '/faq' ? styles.navLinkActive : styles.navLink}>FAQ</Link>
        <Link to="/about" className={location.pathname === '/about' ? styles.navLinkActive : styles.navLink}>About</Link>
        <Link to={`/profile/${userData?.username || 'me'}`} className={location.pathname.startsWith('/profile') ? styles.navLinkActive : styles.navLink}>Profile</Link>
      </>
    );
  };

  return (
    <header className={styles.header}>
      <div className={`logo-container ${styles.logoContainer}`}>
        <Link to={user ? (isFleet ? "/fleet" : "/map") : "/"} className={styles.logoLink}>
          <img src="/logo.png" alt="Logo" className={styles.logoImage} />
          <span className={`desktop-only ${styles.logoText}`}>RANGE ANXIETY</span>
        </Link>
      </div>

      <div className={styles.navGroup}>
        {/* Desktop Navigation */}
        <nav className="desktop-only nav-links">
          {renderNavLinks()}
          
          {isAdmin && (
            <div className={styles.adminGroup}>
              <Link to="/admin/analytics" className={location.pathname === '/admin/analytics' ? styles.navLinkActive : styles.navLink}>Command Center</Link>
              <Link to="/admin/library" className={location.pathname === '/admin/library' ? styles.navLinkActive : styles.navLink}>Catalog</Link>
              <button onClick={toggleRole} className={styles.switchRoleBtn}>
                Switch to {userData?.role === 'fleet' ? 'Rider' : 'Manager'}
              </button>
            </div>
          )}

          {user && (
            <button onClick={handleLogout} className={styles.logoutBtn}>Log Out</button>
          )}

          <button onClick={onShowInstall} className={styles.primaryButton}>
            {Capacitor.getPlatform() === 'android' ? 'Create Account' : 'Get App'}
          </button>
        </nav>

        {/* Notifications (Always visible if user) */}
        {user && (
          <button 
            onClick={() => navigate('/notifications')}
            className={`${styles.notificationBtn} ${unreadCount > 0 ? styles.notificationBtnActive : ''}`}
          >
            🔔
            {unreadCount > 0 && (
              <span className={styles.notificationBadge}>{unreadCount}</span>
            )}
          </button>
        )}

        {/* Mobile Hamburger Button */}
        <button 
          className={`mobile-only ${styles.mobileHamburger}`} 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
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
              <Link to="/admin/analytics" className={styles.mobileNavLink}>Command Center</Link>
              <Link to="/admin/library" className={styles.mobileNavLink}>Catalog</Link>
              <button onClick={toggleRole} className={styles.mobileSwitchRoleBtn}>
                Switch to {userData?.role === 'fleet' ? 'Rider' : 'Manager'}
              </button>
            </>
          )}

          {user && (
            <button onClick={handleLogout} className={styles.mobileLogoutBtn}>Log Out</button>
          )}

          <button onClick={onShowInstall} className={styles.mobilePrimaryBtn}>
            {Capacitor.getPlatform() === 'android' ? 'Create Account' : 'Get The App'}
          </button>
        </div>
      )}
    </header>
  )
}

export default NavBar
