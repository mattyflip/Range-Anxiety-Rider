import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db, auth } from '../firebase'
import { doc, collection, query, where, onSnapshot, updateDoc, arrayRemove } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'

const Profile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!username || username === 'me') {
      if (!user) {
        setLoading(false);
        return;
      }
    }

    const target = (username === 'me' && user) ? user.uid : username;
    if (!target) return;

    setLoading(true);
    let unsubscribe: () => void;

    // Search for user by username
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", target));

    unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setProfileData({ ...data, id: snap.docs[0].id });
        setEditBio(data.bio || '');
        setLoading(false);
      } else {
        // Fallback: Check if username parameter is actually a UID
        const docRef = doc(db, "users", target);
        onSnapshot(docRef, (uSnap) => {
          if (uSnap.exists()) {
            const data = uSnap.data();
            setProfileData({ ...data, id: uSnap.id });
            setEditBio(data.bio || '');
          }
          setLoading(false);
        });
      }
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, [username, user?.uid]);

  const handleUpdateBio = async () => {
    if (!user || !profileData || user.uid !== profileData.id) return;
    try {
      await updateDoc(doc(db, "users", user.uid), { bio: editBio });
      setIsEditing(false);
    } catch (e) { console.error("Bio update failed", e); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !profileData || user.uid !== profileData.id) return;
    
    if (file.size > 10 * 1024 * 1024) {
      alert("Image is too large. Please select a photo under 10MB.");
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result);
        reader.readAsDataURL(file);
      });

      await updateDoc(doc(db, "users", user.uid), { 
        profilePic: base64 
      });

      alert("Profile picture updated!");
    } catch (err: any) { 
      console.error("Upload failed:", err);
      alert(`Upload failed: ${err.message}`);
    } finally { 
      setIsUploading(false); 
    }
  };

  const removeBike = async (bike: any) => {
    if (!user || !profileData || user.uid !== profileData.id) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        bikes: arrayRemove(bike)
      });
    } catch (e) { console.error("Bike removal failed", e); }
  };

  const handleSignOut = () => {
    signOut(auth);
    navigate('/');
  };

  if (loading) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Loading profile...</div>;

  const isOwner = user && profileData && user.uid === profileData.id;

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <NavBar 
        user={user} 
        onShowInstall={() => setShowInstallTutorial(true)} 
      />

      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        {!user && !profileData ? (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <h2 style={{ color: 'white' }}>Welcome to Range Anxiety</h2>
            <p style={{ color: '#888', marginBottom: '2rem' }}>Sign in to view your profile, manage your garage, and share trips.</p>
            <button 
              onClick={() => setShowAuthModal(true)}
              style={{ padding: '1rem 3rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}
            >
              Sign In / Register
            </button>
          </div>
        ) : profileData ? (
          <>
            <div className="profile-header" style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 1.5rem' }}>
                <div style={{ 
                  width: '100%', 
                  height: '100%', 
                  borderRadius: '50%', 
                  background: '#333', 
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '3rem',
                  border: '2px solid #ff6600',
                  overflow: 'hidden'
                }}>
                  {profileData.profilePic ? (
                    <img 
                      src={profileData.profilePic} 
                      alt="Profile" 
                      key={profileData.profilePic} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : '🚲'}
                </div>
                {isOwner && (
                  <label style={{ 
                    position: 'absolute', bottom: 0, right: 0, 
                    background: '#ff6600', width: '32px', height: '32px', 
                    borderRadius: '50%', display: 'flex', alignItems: 'center', 
                    justifyContent: 'center', cursor: 'pointer', border: '2px solid #121212',
                    overflow: 'hidden'
                  }}>
                    <span style={{ fontSize: '1rem' }}>📷</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                      disabled={isUploading} 
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    />
                  </label>
                )}
              </div>

              <h1 style={{ color: 'white', margin: 0 }}>{profileData.username || 'Anonymous Rider'}</h1>
              
              {isEditing ? (
                <div style={{ marginTop: '1rem' }}>
                  <textarea 
                    value={editBio} 
                    onChange={e => setEditBio(e.target.value)}
                    style={{ width: '100%', background: '#222', border: '1px solid #444', borderRadius: '8px', color: 'white', padding: '0.8rem', marginBottom: '0.5rem', fontFamily: 'inherit' }}
                    placeholder="Tell us about your ride..."
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button onClick={handleUpdateBio} style={{ background: '#34a853', color: 'white', border: 'none', padding: '0.4rem 1.2rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                    <button onClick={() => setIsEditing(false)} style={{ background: '#444', color: 'white', border: 'none', padding: '0.4rem 1.2rem', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ color: '#888', marginTop: '0.5rem' }}>{profileData.bio || 'No bio yet.'}</p>
                  {isOwner && <button onClick={() => setIsEditing(true)} style={{ background: 'none', border: 'none', color: '#ff6600', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>Edit Bio</button>}
                </>
              )}
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1.5rem' }}>
                <div>
                  <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{profileData.followers?.length || 0}</div>
                  <div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Followers</div>
                </div>
                <div>
                  <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{profileData.following?.length || 0}</div>
                  <div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Following</div>
                </div>
              </div>

              {isOwner && (
                <button 
                  onClick={handleSignOut}
                  style={{ marginTop: '2rem', background: 'rgba(255,255,255,0.05)', color: '#ff4444', border: '1px solid #333', padding: '0.6rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Sign Out
                </button>
              )}
            </div>

            {profileData?.bikes && (
              <section>
                <h3 style={{ color: '#ff6600', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                  Garage
                  {isOwner && <span style={{ fontSize: '0.7rem', textTransform: 'none', color: '#444' }}>(Manage bikes on Map page)</span>}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                  {profileData.bikes.length === 0 ? (
                    <div style={{ color: '#444', fontSize: '0.9rem' }}>No bikes in garage yet.</div>
                  ) : (
                    profileData.bikes.map((bike: any, idx: number) => (
                      <div key={idx} style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '16px', border: '1px solid #333', position: 'relative' }}>
                        <div style={{ fontWeight: 'bold', color: 'white' }}>{bike.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.3rem' }}>{bike.specs.voltage}V {bike.specs.capacityAh}Ah</div>
                        {isOwner && (
                          <button 
                            onClick={() => removeBike(bike)}
                            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '0.9rem' }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}
          </>
        ) : (
          <div style={{ color: 'white', textAlign: 'center' }}>User not found.</div>
        )}
      </main>

      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default Profile;
