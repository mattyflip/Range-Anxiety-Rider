import React, { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDoc, doc, updateDoc, increment } from 'firebase/firestore'
import { useParams, Link } from 'react-router-dom'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'

interface Thread {
  id: string;
  authorId: string;
  authorUsername: string;
  title: string;
  body: string;
  score: number;
  commentCount: number;
  createdAt: any;
}

const CommunityView: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const [community, setCommunity] = useState<any>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!communityId) return;

    // Fetch Community Details
    const commRef = doc(db, "communities", communityId);
    getDoc(commRef).then(snap => {
      if (snap.exists()) setCommunity({ id: snap.id, ...snap.data() });
    });

    // Fetch Threads
    const q = query(
      collection(db, `communities/${communityId}/threads`),
      orderBy("score", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched: Thread[] = [];
      snap.forEach(docSnap => fetched.push({ id: docSnap.id, ...docSnap.data() } as Thread));
      setThreads(fetched);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [communityId]);

  const handleCreateThread = async () => {
    if (!user || !newTitle.trim() || !communityId) return;

    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const userData = userSnap.exists() ? userSnap.data() : {};

      await addDoc(collection(db, `communities/${communityId}/threads`), {
        authorId: user.uid,
        authorUsername: userData.username || user.email?.split('@')[0] || "Rider",
        title: newTitle,
        body: newBody,
        score: 1,
        commentCount: 0,
        createdAt: serverTimestamp()
      });

      setNewTitle('');
      setNewBody('');
      setShowCreateThread(false);
    } catch (e) {
      console.error("Create thread failed", e);
    }
  };

  const handleVote = async (threadId: string, incrementVal: number) => {
    if (!user || !communityId) {
      setShowAuthModal(true);
      return;
    }
    const threadRef = doc(db, `communities/${communityId}/threads`, threadId);
    try {
      await updateDoc(threadRef, {
        score: increment(incrementVal)
      });
    } catch (e) {
      console.error("Vote failed", e);
    }
  };

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} />

      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        {community && (
          <div style={{ marginBottom: '3rem', borderBottom: '1px solid #222', paddingBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ color: '#ff6600', margin: 0, fontSize: '2.5rem' }}>c/{community.name}</h1>
                <p style={{ color: '#888', marginTop: '0.8rem', fontSize: '1.1rem', lineHeight: '1.5' }}>{community.description}</p>
              </div>
              {user && (
                <button 
                  onClick={() => setShowCreateThread(true)}
                  style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  + New Post
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {loading ? (
            <div style={{ color: '#666', textAlign: 'center' }}>Loading discussions...</div>
          ) : threads.length === 0 ? (
            <div style={{ color: '#444', textAlign: 'center', padding: '4rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
              <h2>Quiet in here...</h2>
              <p>Start a discussion or ask a question!</p>
            </div>
          ) : (
            threads.map(thread => (
              <div key={thread.id} style={{ background: '#1a1a1a', borderRadius: '20px', border: '1px solid #333', display: 'flex', overflow: 'hidden' }}>
                <div style={{ background: '#121212', width: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem 0', gap: '0.5rem' }}>
                   <button onClick={() => handleVote(thread.id, 1)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.2rem' }}>▲</button>
                   <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{thread.score}</span>
                   <button onClick={() => handleVote(thread.id, -1)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.2rem' }}>▼</button>
                </div>
                <Link to={`/forum/c/${communityId}/t/${thread.id}`} style={{ flex: 1, padding: '1.5rem', textDecoration: 'none' }}>
                  <div style={{ fontSize: '0.7rem', color: '#444', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    Posted by <Link to={`/profile/${thread.authorUsername.replace(/\s+/g, '_')}`} style={{ color: '#888', textDecoration: 'none' }}>{thread.authorUsername}</Link> • {thread.createdAt?.toDate().toLocaleDateString()}
                  </div>
                  <h3 style={{ color: 'white', margin: 0, fontSize: '1.2rem', lineHeight: '1.4' }}>{thread.title}</h3>
                  <div style={{ color: '#666', fontSize: '0.8rem', marginTop: '1rem', fontWeight: 'bold' }}>
                    💬 {thread.commentCount} Comments
                  </div>
                </Link>
              </div>
            ))
          )}
        </div>
      </main>

      {showCreateThread && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '30px', border: '1px solid #333', maxWidth: '600px', width: '100%' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>New Discussion</h2>
            
            <div className="form-group" style={{ marginTop: '2rem' }}>
              <label>Title</label>
              <input 
                type="text" 
                placeholder="What's on your mind?" 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                style={{ background: '#121212' }}
              />
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Body (optional)</label>
              <textarea 
                placeholder="Share your thoughts, experiences, or questions..."
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                style={{ width: '100%', background: '#121212', border: '1px solid #333', borderRadius: '12px', color: 'white', padding: '1rem', minHeight: '150px', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
              <button onClick={() => setShowCreateThread(false)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button 
                onClick={handleCreateThread}
                disabled={!newTitle.trim()}
                style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', opacity: !newTitle.trim() ? 0.5 : 1 }}
              >
                Post Discussion
              </button>
            </div>
          </div>
        </div>
      )}

      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default CommunityView;
