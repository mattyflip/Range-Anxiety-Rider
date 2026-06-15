import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, updateDoc, doc, writeBatch } from 'firebase/firestore'
import NavBar from '../shared/ui/NavBar'
import InstallTutorial from '../shared/ui/InstallTutorial'
import AuthModal from '../features/auth/AuthModal'

import type { Notification } from '../types';
import { useUserData } from '../hooks/useUserData';

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useUserData();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  const handleShowAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  const [authChecked, setAuthChecked] = useState(false);
  if (!authLoading && !authChecked) {
    setAuthChecked(true);
    if (!user) {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !user) return;

    const q = query(
      collection(db, `users/${user.uid}/notifications`),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const notifs: Notification[] = [];
      snap.forEach(d => {
        const data = d.data();
        notifs.push({ 
          id: d.id, 
          ...data,
          fromName: data.fromName || data.senderUsername || "Rider",
          fromId: data.fromId || data.senderId || ""
        } as Notification);
      });
      setNotifications(notifs);
      setLoading(false);
    });

    return () => unsub();
  }, [user, authLoading]);

  const handleNotificationClick = async (notif: Notification) => {
    if (!user) return;
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
    } else if (notif.type === 'rental_request') {
      navigate('/fleet#appointments');
    } else if (notif.type === 'rental_approved') {
      navigate('/map');
    } else if (notif.type === 'fleet_alert') {
      navigate('/fleet#alerts');
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
        onShowAuth={handleShowAuth} 
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
             <button onClick={() => handleShowAuth('login')} style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.8rem 2rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '1rem' }}>Sign In</button>
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
                  {n.type === 'rental_request' && '🗓️'}
                  {n.type === 'rental_approved' && '✅'}
                  {n.type === 'fleet_alert' && '🚨'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'white', fontSize: '1rem', lineHeight: '1.4' }}>
                    {n.type === 'rental_request' || n.type === 'rental_approved' || n.type === 'fleet_alert' ? (
                      <span>{n.text || n.content}</span>
                    ) : (
                      <>
                        <span style={{ fontWeight: 'bold' }}>{n.fromName}</span>
                        {n.type === 'like' && ' liked your post'}
                        {n.type === 'comment' && ' commented on your post'}
                        {n.type === 'upvote' && (n.relatedText?.length ? ' upvoted your thread' : ' upvoted your comment')}
                        {n.type === 'review' && ' left you a rider review'}
                        {n.type === 'moderation' && ` moderated your content: ${n.text || n.content}`}
                      </>
                    )}
                  </div>
                  
                  {/* Context Snippet */}
                  {n.relatedText && (
                    <div style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.3rem', fontStyle: 'italic', borderLeft: '2px solid #333', paddingLeft: '0.8rem' }}>
                      "{n.relatedText.length > 60 ? n.relatedText.substring(0, 60) + '...' : n.relatedText}"
                    </div>
                  )}

                  {/* Comment Content */}
                  {n.type === 'comment' && n.content && (
                    <div style={{ color: '#bbb', fontSize: '0.9rem', marginTop: '0.5rem', background: '#121212', padding: '0.8rem', borderRadius: '12px' }}>
                      {n.content}
                    </div>
                  )}

                  <div style={{ color: '#444', fontSize: '0.7rem', marginTop: '0.6rem', fontWeight: 'bold' }}>
                    {n.createdAt?.toDate().toLocaleString()}
                  </div>
                </div>
                {!n.read && <div style={{ width: '10px', height: '10px', background: '#ff6600', borderRadius: '50%' }} />}
              </div>
            ))}
          </div>
        )}
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} initialMode={authMode} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
    </div>
  );
};

export default Notifications;
