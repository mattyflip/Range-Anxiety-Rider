import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { onAuthStateChanged, updateEmail, deleteUser, signOut } from 'firebase/auth'
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import NavBar from '../components/NavBar'

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [isUpdating, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        setEmail(u.email || '');
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          setUsername(data.username || '');
          setBio(data.bio || '');
        }
        setLoading(false);
      } else {
        navigate('/');
      }
    });
    return () => unsub();
  }, [navigate]);

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsPosting(true);
    setError(null);
    try {
      // Update Firestore
      await updateDoc(doc(db, "users", user.uid), {
        username,
        usernameLowercase: username.toLowerCase(),
        bio
      });

      // Update Email if changed
      if (email !== user.email) {
        await updateEmail(user, email);
      }

      alert("Profile updated successfully!");
    } catch (e: any) {
      console.error("Update failed", e);
      setError(e.message);
    } finally {
      setIsPosting(false);
    }
  };

  // Garage states
  const [newBikeName, setNewBikeName] = useState('');
  const [newBikeVolts, setNewBikeVolts] = useState('48');
  const [newBikeAh, setNewBikeAh] = useState('15');

  const handleAddBike = async () => {
    if (!newBikeName.trim() || !user) return;
    const newBike = {
      id: Date.now().toString(),
      name: newBikeName,
      specs: {
        voltage: parseFloat(newBikeVolts),
        capacityAh: parseFloat(newBikeAh),
        motorWatts: 750,
        bikeWeightLbs: 65
      }
    };
    try {
      const updatedBikes = [...(userData.bikes || []), newBike];
      await updateDoc(doc(db, "users", user.uid), { bikes: updatedBikes });
      setUserData({ ...userData, bikes: updatedBikes });
      setNewBikeName('');
    } catch (e) {
      console.error("Add bike failed", e);
    }
  };

  const handleDeleteBike = async (bikeId: string) => {
    if (!window.confirm("Are you sure you want to remove this bike from your garage?")) return;
    try {
      const updatedBikes = userData.bikes.filter((b: any) => b.id !== bikeId);
      await updateDoc(doc(db, "users", user.uid), { bikes: updatedBikes });
      setUserData({ ...userData, bikes: updatedBikes });
    } catch (e) {
      console.error("Delete bike failed", e);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("WARNING: This will permanently delete your account and all your data. This cannot be undone. Are you sure?")) return;
    try {
      // Cleanup Firestore
      await deleteDoc(doc(db, "users", user.uid));
      // Delete Auth User
      await deleteUser(user);
      navigate('/');
    } catch (e: any) {
      console.error("Delete account failed", e);
      setError("Failed to delete account. You may need to sign out and back in to perform this action.");
    }
  };

  if (loading) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Loading settings...</div>;

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212' }}>
      <NavBar user={user} onShowInstall={() => {}} />

      <main style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem' }}>
        <h1 style={{ color: 'white', marginBottom: '2rem' }}>User Settings</h1>

        {error && <div style={{ background: 'rgba(217,48,37,0.1)', color: '#d93025', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>{error}</div>}

        {/* Profile Settings */}
        <section className="card" style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', marginBottom: '2rem' }}>
          <h2 style={{ color: '#ff6600', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Profile Information</h2>
          
          <div className="form-group" style={{ marginBottom: '1.2rem' }}>
            <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Email Address</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              style={{ width: '100%', padding: '0.8rem', background: '#222', border: '1px solid #444', borderRadius: '8px', color: 'white' }} 
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.2rem' }}>
            <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              style={{ width: '100%', padding: '0.8rem', background: '#222', border: '1px solid #444', borderRadius: '8px', color: 'white' }} 
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Bio</label>
            <textarea 
              value={bio} 
              onChange={e => setBio(e.target.value)} 
              style={{ width: '100%', padding: '0.8rem', background: '#222', border: '1px solid #444', borderRadius: '8px', color: 'white', minHeight: '100px' }} 
            />
          </div>

          <button 
            onClick={handleUpdateProfile}
            disabled={isUpdating}
            style={{ width: '100%', padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {isUpdating ? 'Saving...' : 'Save Changes'}
          </button>
        </section>

        {/* Garage Management */}
        <section className="card" style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', marginBottom: '2rem' }}>
          <h2 style={{ color: '#ff6600', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Your Garage</h2>
          
          {/* Add Bike Form */}
          <div style={{ background: '#222', padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem', border: '1px dashed #444' }}>
            <h3 style={{ color: 'white', fontSize: '0.9rem', marginBottom: '1rem' }}>Add New Bike</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input 
                type="text" 
                placeholder="Bike Name (e.g. Sur-Ron X)" 
                value={newBikeName} 
                onChange={e => setNewBikeName(e.target.value)}
                style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }}
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Voltage (V)</label>
                  <input 
                    type="number" 
                    value={newBikeVolts} 
                    onChange={e => setNewBikeVolts(e.target.value)}
                    style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Capacity (Ah)</label>
                  <input 
                    type="number" 
                    value={newBikeAh} 
                    onChange={e => setNewBikeAh(e.target.value)}
                    style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }}
                  />
                </div>
              </div>
              <button 
                onClick={handleAddBike}
                style={{ padding: '0.8rem', background: '#333', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                + Add to Garage
              </button>
            </div>
          </div>

          {userData?.bikes && userData.bikes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {userData.bikes.map((bike: any) => (
                <div key={bike.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', padding: '1rem', borderRadius: '12px' }}>
                  <div>
                    <div style={{ color: 'white', fontWeight: 'bold' }}>{bike.name}</div>
                    <div style={{ color: '#888', fontSize: '0.75rem' }}>{bike.specs.voltage}V {bike.specs.capacityAh}Ah</div>
                  </div>
                  <button 
                    onClick={() => handleDeleteBike(bike.id)}
                    style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1.2rem' }}
                    title="Remove Bike"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#666', textAlign: 'center' }}>No bikes in your garage yet.</p>
          )}
        </section>

        {/* Danger Zone */}
        <section className="card" style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
          <h2 style={{ color: '#ff4444', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Account Security</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button 
              onClick={() => signOut(auth).then(() => navigate('/'))}
              style={{ width: '100%', padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Sign Out
            </button>
            <button 
              onClick={handleDeleteAccount}
              style={{ width: '100%', padding: '1rem', background: 'none', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Delete Account
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Settings;
