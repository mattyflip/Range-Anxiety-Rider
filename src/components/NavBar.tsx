import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, query, orderBy, limit, onSnapshot, updateDoc, doc, writeBatch } from 'firebase/firestore'

interface NavBarProps {
  user: any;
  onShowInstall: () => void;
  onShowAuth: () => void;
}

const NavBar: React.FC<NavBarProps> = ({ user, onShowInstall, onShowAuth }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/notifications`),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const notifs: any[] = [];
      let unread = 0;
      snap.forEach(d => {
        const data = d.data();
        notifs.push({ id: d.id, ...data });
        if (!data.read) unread++;
      });
      setNotifications(notifs);
      setUnreadCount(unread);
    });

    return () => unsubscribe();
  }, [user]);

  const handleNotificationClick = async (notif: any) => {
    // Mark as read
    try {
      await updateDoc(doc(db, `users/${user.uid}/notifications`, notif.id), { read: true });
    } catch (e) { console.error("Mark read failed", e); }

    setShowNotifications(false);

    // Navigate based on type
    if (notif.type === 'like' || notif.type === 'comment') {
      navigate('/feed'); // Ideally navigate to specific post
    } else if (notif.type === 'upvote') {
      navigate('/forum'); // Ideally navigate to specific thread
    } else if (notif.type === 'review') {
      navigate(`/profile/me`);
    }
  };

  const markAllRead = async () => {
    const batch = writeBatch(db);
    notifications.forEach(n => {
      if (!n.read) {
        batch.update(doc(db, `users/${user.uid}/notifications`, n.id), { read: true });
      }
    });
    await batch.commit();
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
        <Link to="/" style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/app-icon.png" alt="Logo" style={{ height: '2.5rem', width: 'auto' }} />
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
          <Link to="/" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Map</Link>
          <Link to="/how-it-works" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Info</Link>
          <Link to="/feed" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Feed</Link>
          <Link to="/forum" style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Forum</Link>
          {user && <Link to={`/profile/${user.displayName || user.uid}`} style={{ color: '#888', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Profile</Link>}
          
          {user && (
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
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

              {showNotifications && (
                <div style={{ 
                  position: 'absolute', 
                  top: '100%', 
                  right: 0, 
                  marginTop: '0.5rem', 
                  width: '280px', 
                  maxHeight: '400px', 
                  background: '#1a1a1a', 
                  border: '1px solid #333', 
                  borderRadius: '12px', 
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  overflowY: 'auto',
                  zIndex: 2000
                }}>
                  <div style={{ padding: '0.8rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'white' }}>Notifications</span>
                    {unreadCount > 0 && <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#ff6600', fontSize: '0.65rem', cursor: 'pointer' }}>Mark all read</button>}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#666', fontSize: '0.8rem' }}>No notifications yet</div>
                  ) : (
                    notifications.map(n => (
                      <div 
                        key={n.id} 
                        onClick={() => handleNotificationClick(n)}
                        style={{ 
                          padding: '0.8rem', 
                          borderBottom: '1px solid #222', 
                          cursor: 'pointer',
                          background: n.read ? 'transparent' : 'rgba(255,102,0,0.05)',
                          transition: 'background 0.2s'
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', color: '#ccc', lineHeight: '1.4' }}>
                          <span style={{ fontWeight: 'bold', color: 'white' }}>{n.senderUsername}</span>
                          {n.type === 'like' && ' liked your post'}
                          {n.type === 'comment' && ' commented on your post'}
                          {n.type === 'upvote' && ' upvoted your thread'}
                          {n.type === 'review' && ' left you a rider review'}
                          {n.type === 'moderation' && ` moderated your content: ${n.content}`}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: '#555', marginTop: '0.3rem' }}>
                          {n.createdAt?.toDate().toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
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
