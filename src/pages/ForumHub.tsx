import React, { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore'
import { useNavigate, Link } from 'react-router-dom'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'

interface Community {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  memberCount: number;
  createdAt: any;
}

const ForumHub: React.FC = () => {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCommName, setNewCommName] = useState('');
  const [newCommDesc, setNewCommDesc] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "communities"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched: Community[] = [];
      snap.forEach(docSnap => fetched.push({ id: docSnap.id, ...docSnap.data() } as Community));
      setCommunities(fetched);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleCreateCommunity = async () => {
    if (!user || !newCommName.trim()) return;

    try {
      const commRef = await addDoc(collection(db, "communities"), {
        name: newCommName.toLowerCase().replace(/\s+/g, '-'),
        description: newCommDesc,
        creatorId: user.uid,
        memberCount: 1,
        createdAt: serverTimestamp()
      });

      setNewCommName('');
      setNewCommDesc('');
      setShowCreateModal(false);
      navigate(`/forum/c/${commRef.id}`);
    } catch (e) {
      console.error("Create community failed", e);
    }
  };

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} />

      <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
          <div>
            <h1 style={{ color: 'white', margin: 0, fontSize: '2rem' }}>Communities</h1>
            <p style={{ color: '#666', marginTop: '0.5rem' }}>Discover and join specialized e-bike groups.</p>
          </div>
          {user && (
            <button 
              onClick={() => setShowCreateModal(true)}
              style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              + Create Community
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ color: '#666', textAlign: 'center' }}>Loading communities...</div>
        ) : communities.length === 0 ? (
          <div style={{ color: '#444', textAlign: 'center', padding: '4rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚲</div>
            <h2>No communities yet</h2>
            <p>Be the first to start a group for your favorite bike or region!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {communities.map(comm => (
              <Link 
                to={`/forum/c/${comm.id}`} 
                key={comm.id}
                style={{ textDecoration: 'none', background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', transition: 'transform 0.2s, border-color 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ff6600'; e.currentTarget.style.transform = 'translateY(-5px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ color: '#ff6600', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '0.8rem' }}>c/{comm.name}</div>
                <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.4', height: '3.2rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {comm.description || "No description provided."}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#444', fontSize: '0.75rem', fontWeight: 'bold' }}>{comm.memberCount} Members</span>
                  <span style={{ color: '#ff6600', fontSize: '0.8rem', fontWeight: 'bold' }}>Enter →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '30px', border: '1px solid #333', maxWidth: '500px', width: '100%' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Create Community</h2>
            
            <div className="form-group" style={{ marginTop: '2rem' }}>
              <label>Community Name</label>
              <input 
                type="text" 
                placeholder="e.g. Onyx-Riders-NYC" 
                value={newCommName}
                onChange={e => setNewCommName(e.target.value)}
                style={{ background: '#121212' }}
              />
              <p style={{ fontSize: '0.65rem', color: '#555', marginTop: '0.4rem' }}>No spaces allowed. Use hyphens.</p>
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Description</label>
              <textarea 
                placeholder="What is this community about?"
                value={newCommDesc}
                onChange={e => setNewCommDesc(e.target.value)}
                style={{ width: '100%', background: '#121212', border: '1px solid #333', borderRadius: '12px', color: 'white', padding: '1rem', minHeight: '100px', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
              <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button 
                onClick={handleCreateCommunity}
                disabled={!newCommName.trim()}
                style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', opacity: !newCommName.trim() ? 0.5 : 1 }}
              >
                Create
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

export default ForumHub;
