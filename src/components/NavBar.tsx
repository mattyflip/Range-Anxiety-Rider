import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db, auth } from '../firebase'
import { signOut } from 'firebase/auth'
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore'

interface NavBarProps {
  user: any;
  onShowInstall: () => void;
  onShowAuth: () => void;
}

const NavBar: React.FC<NavBarProps> = ({ user, onShowInstall, onShowAuth }) => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then(snap => {
      if (snap.exists()) setUserData(snap.data());
    }).catch(e => console.error("NavBar user fetch failed", e));

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

  const isSuperAdmin = user?.email?.toLowerCase() === 'mattyfliptv@gmail.com';

  const toggleRole = async () => {
    if (!user || !isSuperAdmin) return;
    const newRole = userData?.role === 'fleet' ? 'rider' : 'fleet';
    await updateDoc(doc(db, "users", user.uid), { role: newRole });
    setUserData({ ...userData, role: newRole });
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

  const isFleetMode = userData?.role === 'fleet' || isSuperAdmin;

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
        <Link to={user ? (userData?.role === 'fleet' ? "/fleet" : "/map") : "/"} style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/app-icon.png" alt="Logo" style={{ height: '2.5rem', width: 'auto' }} />
          <span style={{ display: 'none' }}>v1.0.0-final-sync</span>
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', minWidth: 0 }}>
        <nav 
          className="nav-scroll-hint"
          style={{ 
            display: 'flex', 
            gap: '1rem', 
            alignItems: 'center',
            overflowX: 'auto',
            paddingBottom: '8px'
          }}
        >
          <Link to="/map" style={{ color: '#ff6600', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Fleet Map</Link>
          {isFleetMode && <Link to="/fleet" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Shop Dashboard</Link>}
          <Link to={isFleetMode ? "/fleet?chargers=true" : "/map?chargers=true"} style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Chargers</Link>
          <Link to="/about" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>About</Link>
          {user && <Link to="/shop-profile" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{isFleetMode ? 'Shop Profile' : 'Settings'}</Link>}
          
          {isSuperAdmin && (
            <button 
              onClick={toggleRole}
              style={{ 
                background: 'rgba(255,102,0,0.1)', 
                border: '1px solid #ff6600', 
                color: '#ff6600', 
                borderRadius: '20px', 
                padding: '0.3rem 0.8rem', 
                fontSize: '0.65rem', 
                fontWeight: 'bold',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Switch: {userData?.role === 'fleet' ? 'Customer View' : 'Manager View'}
            </button>
          )}
          
          {user && (
            <button 
              onClick={() => navigate('/notifications')}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: unreadCount > 0 ? '#ff6600' : '#888', 
                fontSize: '1.2rem', 
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              🔔
              {unreadCount > 0 && (
                <span style={{ 
                  position: 'absolute', 
                  top: '-5px', 
                  right: '-5px', 
                  background: '#ff0000', 
                  color: 'white', 
                  fontSize: '0.6rem', 
                  padding: '2px 5px', 
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  boxShadow: '0 0 5px rgba(255,0,0,0.5)'
                }}>
                  {unreadCount}
                </span>
              )}
            </button>
          )}

          {user && (
            <button 
              onClick={handleLogout}
              style={{ 
                background: 'none', 
                border: '1px solid #444', 
                color: '#888', 
                borderRadius: '20px', 
                padding: '0.3rem 0.8rem', 
                fontSize: '0.65rem', 
                fontWeight: 'bold',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Log Out
            </button>
          )}

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
            Get App
          </button>
        </nav>
      </div>
    </header>
  )
}

export default NavBar
