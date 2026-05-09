import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { db, auth } from '../firebase'
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'

const Profile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  useEffect(() => {
    // Basic auth sync for NavBar
    const unsub = auth.onAuthStateChanged(u => {
      setUser(u);
      if (u) {
        getDoc(doc(db, "users", u.uid)).then(snap => {
          if (snap.exists()) setIsPro(snap.data().isPro || false);
        });
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        // Search for user by username or UID
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", username));
        onSnapshot(q, (snap) => {
          if (!snap.empty) {
            setProfileData(snap.docs[0].data());
          } else {
            // Fallback: Check if it's a UID
            getDoc(doc(db, "users", username!)).then(uSnap => {
              if (uSnap.exists()) setProfileData(uSnap.data());
            });
          }
          setLoading(false);
        });
      } catch (e) {
        console.error("Profile fetch error:", e);
        setLoading(false);
      }
    };
    if (username) fetchProfile();
  }, [username]);

  if (loading) return <div style={{ color: 'white', padding: '2rem' }}>Loading profile...</div>;

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212' }}>
      <NavBar 
        user={user} 
        isPro={isPro} 
        onShowAuth={() => setShowAuthModal(true)} 
        onShowInstall={() => setShowInstallTutorial(true)} 
      />

      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        {profileData ? (
          <div className="profile-header" style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ 
              width: '120px', 
              height: '120px', 
              borderRadius: '50%', 
              background: '#333', 
              margin: '0 auto 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '3rem',
              border: '2px solid #ff6600'
            }}>
              {profileData.profilePic ? <img src={profileData.profilePic} alt="Profile" style={{ width: '100%', height: '100%', borderRadius: '50%' }} /> : '🚲'}
            </div>
            <h1 style={{ color: 'white', margin: 0 }}>{profileData.username || 'Anonymous Rider'}</h1>
            <p style={{ color: '#888', marginTop: '0.5rem' }}>{profileData.bio || 'No bio yet.'}</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1.5rem' }}>
              <div>
                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>0</div>
                <div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Followers</div>
              </div>
              <div>
                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>0</div>
                <div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Following</div>
              </div>
            </div>

            {user && user.uid !== profileData.uid && (
              <button style={{ 
                marginTop: '2rem', 
                padding: '0.6rem 2rem', 
                background: '#ff6600', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontWeight: 'bold',
                cursor: 'pointer'
              }}>
                Follow
              </button>
            )}
          </div>
        ) : (
          <div style={{ color: 'white', textAlign: 'center' }}>User not found.</div>
        )}

        {profileData?.bikes && profileData.bikes.length > 0 && (
          <section>
            <h3 style={{ color: '#ff6600', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', marginBottom: '1rem' }}>Garage</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {profileData.bikes.map((bike: any, idx: number) => (
                <div key={idx} style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '12px', border: '1px solid #333' }}>
                  <div style={{ fontWeight: 'bold', color: 'white' }}>{bike.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>{bike.specs.voltage}V {bike.specs.capacityAh}Ah</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
    </div>
  );
};

export default Profile;
