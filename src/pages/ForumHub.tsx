import React, { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore'
import { useNavigate, Link } from 'react-router-dom'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'
import UniversalSearch from '../components/UniversalSearch'
import AdBanner from '../components/AdBanner'
import SEO from '../components/SEO'

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
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCommName, setNewCommName] = useState('');
  const [newCommDesc, setNewCommDesc] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const navigate = useNavigate();

  const isAdmin = user?.email?.toLowerCase() === 'mattyfliptv@gmail.com';

  // Admin states
  const [adminEditingComm, setAdminEditingComm] = useState<Community | null>(null);
  const [adminCommName, setAdminCommName] = useState('');
  const [adminCommDesc, setAdminCommDesc] = useState('');

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async u => {
      setUser(u);
      if (u) {
        // Logged in
      } else {
        // Prompt for account creation if guest
        setShowAuthModal(true);
      }
      setAuthLoading(false);
    });
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

  const handleSaveAdminEdit = async () => {
    if (!isAdmin || !adminEditingComm) return;
    try {
      await updateDoc(doc(db, "communities", adminEditingComm.id), {
        name: adminCommName.toLowerCase().replace(/\s+/g, '-'),
        description: adminCommDesc
      });
      setAdminEditingComm(null);
      alert("Community updated.");
    } catch (e) { console.error("Update failed", e); }
  };

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <SEO 
        title="Forum Hub" 
        description="Explore specialized e-bike communities. From Sur-Ron performance to DIY battery builds, join the discussion with thousands of riders."
        url="https://rangeanxietyrider.com/forum"
      />
      <NavBar 
        user={user} 
        onShowInstall={() => setShowInstallTutorial(true)} 
        onShowAuth={() => setShowAuthModal(true)}
      />

      <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        {!user && !authLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🔒</div>
            <h2 style={{ color: 'white', marginBottom: '1rem' }}>Member Only Forum</h2>
            <p style={{ color: '#888', marginBottom: '2rem', fontSize: '1.1rem' }}>Join the community to participate in specialized e-bike groups and discussions.</p>
            <button 
              onClick={() => setShowAuthModal(true)}
              style={{ padding: '1rem 2.5rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 10px 20px rgba(255,102,0,0.2)' }}
            >
              Create Account to Enter
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '2rem' }}>
              <UniversalSearch />
            </div>

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
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {communities.map(comm => (
                    <div key={comm.id} style={{ position: 'relative' }}>
                      <Link 
                        to={`/forum/c/${comm.id}`} 
                        style={{ display: 'block', textDecoration: 'none', background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', transition: 'transform 0.2s, border-color 0.2s' }}
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
                      {isAdmin && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setAdminEditingComm(comm); setAdminCommName(comm.name); setAdminCommDesc(comm.description); }}
                          style={{ position: 'absolute', top: '1rem', right: '1rem', background: '#121212', border: '1px solid #333', borderRadius: '8px', color: '#ffcc00', padding: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', zIndex: 5 }}
                          title="Edit Community"
                        >✏️</button>
                      )}
                    </div>
                  ))}
                </div>
                
                <div style={{ marginTop: '4rem' }}>
                  <AdBanner />
                </div>
              </>
            )}
          </>
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

      {/* Admin Edit Modal */}
      {adminEditingComm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '30px', border: '1px solid #333', maxWidth: '500px', width: '100%' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Admin Community Edit</h2>
            <p style={{ color: '#ffcc00', fontSize: '0.8rem', fontWeight: 'bold' }}>MODERATION MODE</p>
            
            <div className="form-group" style={{ marginTop: '2rem' }}>
              <label>Community Name</label>
              <input 
                type="text" 
                value={adminCommName}
                onChange={e => setAdminCommName(e.target.value)}
                style={{ background: '#121212' }}
              />
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Description</label>
              <textarea 
                value={adminCommDesc}
                onChange={e => setAdminCommDesc(e.target.value)}
                style={{ width: '100%', background: '#121212', border: '1px solid #333', borderRadius: '12px', color: 'white', padding: '1rem', minHeight: '150px', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
              <button onClick={() => setAdminEditingComm(null)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button 
                onClick={handleSaveAdminEdit}
                style={{ flex: 2, padding: '1rem', background: '#ffcc00', color: '#000', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Save Changes
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
