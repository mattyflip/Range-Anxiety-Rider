import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, auth } from '../firebase'
import { collection, query, orderBy, onSnapshot, updateDoc, doc, writeBatch } from 'firebase/firestore'
import NavBar from '../shared/ui/NavBar'
import InstallTutorial from '../shared/ui/InstallTutorial'
import AuthModal from '../features/auth/AuthModal'

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      setUser(u);
      if (!u) {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    let isActive = true;

    if(isActive && !loading) {
       // use setTimeout to skip render sync loop
       setTimeout(() => setLoading(true), 0);
    }
    const q = query(
      collection(db, `users/${user.uid}/notifications`),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const notifs: any[] = [];
      snap.forEach(d => {
        notifs.push({ id: d.id, ...d.data() });
      });
      setNotifications(notifs);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const handleNotificationClick = async (notif: any) => {
    // Mark as read
    try {
      await updateDoc(doc(db, `users/${user.uid}/notifications`, notif.id), { read: true });
    } catch (e) { console.error("Mark read failed", e); }

    // Navigate based on type
    if (notif.type === 'like' || notif.type === 'comment') {
      navigate('/feed'); 
    } else if (notif.type === 'upvote') {
      navigate('/forum'); 
    } else if (notif.type === 'review' || notif.type === 'moderation') {
      navigate(`/profile/me`);
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    const batch = writeBatch(db);
    notifications.forEach(n => {
      if (!n.read) {
        batch.update(doc(db, `users/${user.uid}/notifications`, n.id), { read: true });
      }
    });
    await batch.commit();
  };

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <NavBar 
        user={user} 
        onShowInstall={() => setShowInstallTutorial(true)} 
        onShowAuth={() => setShowAuthModal(true)} 
      />

      <main style={{ padding: '2rem 1.5rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ color: 'white', margin: 0 }}>Notifications</h1>
          {notifications.some(n => !n.read) && (
            <button 
              onClick={markAllRead}
              style={{ background: 'none', border: '1px solid #ff6600', color: '#ff6600', padding: '0.5rem 1rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Mark all as read
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ color: '#666', textAlign: 'center', padding: '4rem 0' }}>Loading notifications...</div>
        ) : !user ? (
          <div style={{ color: '#666', textAlign: 'center', padding: '4rem 0' }}>
             <p>Please sign in to view your notifications.</p>
             <button onClick={() => setShowAuthModal(true)} style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.8rem 2rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '1rem' }}>Sign In</button>
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ color: '#444', textAlign: 'center', padding: '4rem 0' }}>No notifications yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {notifications.map(n => (
              <div 
                key={n.id} 
                onClick={() => handleNotificationClick(n)}
                style={{ 
                  background: n.read ? '#1a1a1a' : 'rgba(255,102,0,0.1)', 
                  padding: '1.5rem', 
                  borderRadius: '20px', 
                  border: n.read ? '1px solid #333' : '1px solid #ff6600',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'center',
                  transition: 'transform 0.2s, background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.01)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{ fontSize: '2rem' }}>
                  {n.type === 'like' && '❤️'}
                  {n.type === 'comment' && '💬'}
                  {n.type === 'upvote' && '🔋'}
                  {n.type === 'review' && '⭐'}
                  {n.type === 'moderation' && '🛡️'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'white', fontSize: '1rem', lineHeight: '1.4' }}>
                    <span style={{ fontWeight: 'bold' }}>{n.senderUsername}</span>
                    {n.type === 'like' && ' liked your post'}
                    {n.type === 'comment' && ' commented on your post'}
                    {n.type === 'upvote' && ' upvoted your thread'}
                    {n.type === 'review' && ' left you a rider review'}
                    {n.type === 'moderation' && ` moderated your content: ${n.content}`}
                  </div>
                  <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    {n.createdAt?.toDate().toLocaleString()}
                  </div>
                </div>
                {!n.read && <div style={{ width: '10px', height: '10px', background: '#ff6600', borderRadius: '50%' }} />}
              </div>
            ))}
          </div>
        )}
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
    </div>
  );
};

export default Notifications;
