import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { db, storage } from '../firebase'
import { doc, collection, setDoc, query, where, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import NavBar from '../shared/ui/NavBar'
import InstallTutorial from '../shared/ui/InstallTutorial'
import AuthModal from '../features/auth/AuthModal'
import SEO from '../shared/ui/SEO'
import type { UserProfile } from '../types';
import { useUserData } from '../hooks/useUserData';

const Profile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const { user, userData, loading: authLoading } = useUserData();
  
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Settings states
  const [showSettings, setShowSettings] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newProfilePic, setNewProfilePic] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Garage states
  const [showBikeModal, setShowBikeModal] = useState(false);
  const [editingBike, setEditingBike] = useState<any>(null);
  const [bikeForm, setBikeForm] = useState({
    name: '',
    voltage: '48',
    capacityAh: '15',
    motorWatts: '750',
    bikeWeightLbs: '65',
    tirePSI: '30',
    tireType: 'road' as 'road' | 'knobby',
    driveMode: 'both' as 'throttle_only' | 'pas_only' | 'both',
    targetSpeedMph: '20'
  });

  const handleSaveBike = async () => {
    if (!user || !profileData || !bikeForm.name.trim()) return;
    
    const newBike = {
      id: editingBike?.id || Date.now().toString(),
      name: bikeForm.name,
      specs: {
        voltage: parseFloat(bikeForm.voltage),
        capacityAh: parseFloat(bikeForm.capacityAh),
        motorWatts: parseFloat(bikeForm.motorWatts),
        bikeWeightLbs: parseFloat(bikeForm.bikeWeightLbs),
        tirePSI: parseFloat(bikeForm.tirePSI),
        tireType: bikeForm.tireType,
        driveMode: bikeForm.driveMode,
        targetSpeedMph: parseFloat(bikeForm.targetSpeedMph)
      }
    };

    let updatedBikes = [...(profileData.bikes || [])];
    if (editingBike) {
      updatedBikes = updatedBikes.map(b => b.id === editingBike.id ? newBike : b);
    } else {
      updatedBikes.push(newBike);
    }

    try {
      await updateDoc(doc(db, "users", profileData.uid), {
        bikes: updatedBikes
      });
      setShowBikeModal(false);
      setEditingBike(null);
      alert("Garage updated!");
    } catch (e) {
      console.error(e);
      alert("Failed to save bike.");
    }
  };

  const deleteBike = async (bikeId: string) => {
    if (!profileData || !window.confirm("Delete this bike from your garage?")) return;
    const updatedBikes = (profileData.bikes || []).filter(b => b.id !== bikeId);
    try {
      await updateDoc(doc(db, "users", profileData.uid), {
        bikes: updatedBikes
      });
    } catch (e) { console.error(e); }
  };

  const openEditBike = (bike: any) => {
    setEditingBike(bike);
    setBikeForm({
      name: bike.name,
      voltage: bike.specs.voltage.toString(),
      capacityAh: bike.specs.capacityAh.toString(),
      motorWatts: bike.specs.motorWatts.toString(),
      bikeWeightLbs: (bike.specs.bikeWeightLbs || 65).toString(),
      tirePSI: (bike.specs.tirePSI || 30).toString(),
      tireType: bike.specs.tireType || 'road',
      driveMode: bike.specs.driveMode || 'both',
      targetSpeedMph: (bike.specs.targetSpeedMph || 20).toString()
    });
    setShowBikeModal(true);
  };

  // Profile Edit states
  const [editHomeRegion, setEditHomeRegion] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editRiderWeight, setEditRiderWeight] = useState('180');

  // Review states
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);

  const isAdmin = userData?.isAdmin || false;

  useEffect(() => {
    if (!username) return;

    let profileUnsub: (() => void) | null = null;
    
    const target = username.replace(/_/g, ' ');
    const spaceTarget = username.replace(/_/g, ' ');
    const lowerTarget = target.toLowerCase();
    const lowerSpaceTarget = spaceTarget.toLowerCase();

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("usernameLowercase", "in", [lowerTarget, lowerSpaceTarget]));

    profileUnsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setProfileData({ uid: snap.docs[0].id, ...data } as UserProfile);
        setNewUsername(data.username || '');
        setNewProfilePic(data.profilePic || '');
        setEditHomeRegion(data.homeRegion || '');
        setEditBirthday(data.birthday || '');
        setEditRiderWeight(data.riderWeight?.toString() || '180');
      } else {
        setProfileData(null);
      }
      setLoading(false);
    });

    return () => { if (profileUnsub) profileUnsub(); };
  }, [username]);

  // Fetch Reviews
  useEffect(() => {
    if (!profileData?.uid) return;
    const q = query(collection(db, `users/${profileData.uid}/reviews`), where('status', '==', 'approved'));
    const unsub = onSnapshot(q, (snap) => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [profileData?.uid]);

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        username: newUsername,
        usernameLowercase: newUsername.toLowerCase(),
        profilePic: newProfilePic,
        homeRegion: editHomeRegion,
        birthday: editBirthday,
        riderWeight: parseInt(editRiderWeight) || 180
      });
      setShowSettings(false);
      alert("Profile updated!");
    } catch (e) {
      console.error(e);
      alert("Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      const storageRef = ref(storage, `profiles/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setNewProfilePic(url);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const submitReview = async () => {
    if (!user || !userData || !profileData) return;
    try {
      await setDoc(doc(db, `users/${profileData.uid}/reviews`, user.uid), {
        reviewerId: user.uid,
        reviewerName: userData.username || 'Anonymous',
        rating: reviewRating,
        text: reviewText,
        status: 'approved',
        createdAt: serverTimestamp()
      });
      setReviewText('');
      alert("Review posted!");
    } catch (e) { console.error(e); }
  };

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  if (loading || authLoading) return <div style={{ minHeight: '100vh', background: '#121212' }} />;
  if (!profileData) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>User not found.</div>;

  const isOwnProfile = user?.uid === profileData.uid;
  const canEdit = isOwnProfile || isAdmin;

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <SEO title={`${profileData.username}'s Profile`} />
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />

      <main style={{ padding: '2rem 1.5rem', maxWidth: '800px', margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
           <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: '#1a1a1a', margin: '0 auto 1.5rem', border: '3px solid #ff6600', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
              {profileData.profilePic ? <img src={profileData.profilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚲'}
           </div>
           <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ color: 'white', margin: 0 }}>{profileData.username || 'Anonymous Rider'}</h1>
              {profileData.isAdmin && (
                <span style={{ background: '#ff0000', color: 'white', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 900 }}>ADMIN</span>
              )}
           </div>
           <p style={{ color: '#666', marginTop: '0.5rem' }}>{profileData.homeRegion || 'E-Bike Enthusiast'}</p>
           
           {canEdit && (
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
               <button onClick={() => setShowSettings(true)} style={{ background: '#222', border: '1px solid #333', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Edit Profile</button>
               {isAdmin && !isOwnProfile && <p style={{ color: '#ffcc00', fontSize: '0.6rem', fontWeight: 'bold', margin: 0 }}>MODERATION ACCESS</p>}
             </div>
           )}
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '3rem' }}>
           <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '20px', border: '1px solid #333', textAlign: 'center' }}>
              <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Bikes Owned</div>
              <div style={{ color: 'white', fontSize: '1.5rem', fontWeight: 900 }}>{profileData.bikes?.length || 0}</div>
           </div>
           <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '20px', border: '1px solid #333', textAlign: 'center' }}>
              <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Rating</div>
              <div style={{ color: '#ffcc00', fontSize: '1.5rem', fontWeight: 900 }}>
                {reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : '5.0'} ⭐
              </div>
           </div>
        </section>

        {/* My Garage Section */}
        <section style={{ marginBottom: '4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ color: 'white', fontSize: '1.2rem', margin: 0 }}>My Garage</h2>
            {canEdit && (
              <button 
                onClick={() => { setEditingBike(null); setBikeForm({ name: '', voltage: '48', capacityAh: '15', motorWatts: '750', bikeWeightLbs: '65', tirePSI: '30', tireType: 'road', driveMode: 'both', targetSpeedMph: '20' }); setShowBikeModal(true); }}
                style={{ background: 'none', border: '1px solid #ff6600', color: '#ff6600', padding: '0.4rem 1rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                + Add Bike
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem' }}>
            {!profileData.bikes || profileData.bikes.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', background: '#1a1a1a', borderRadius: '24px', border: '1px dashed #333' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚲</div>
                <p style={{ color: '#666', margin: 0 }}>No bikes in the garage yet.</p>
              </div>
            ) : (
              profileData.bikes.map((bike: any) => (
                <div key={bike.id} style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '24px', border: '1px solid #333', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, right: 0, padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                    {canEdit && (
                      <>
                        <button onClick={() => openEditBike(bike)} style={{ background: '#222', border: 'none', color: '#ffcc00', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>✏️</button>
                        <button onClick={() => deleteBike(bike.id)} style={{ background: '#222', border: 'none', color: '#ff4444', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>🗑️</button>
                      </>
                    )}
                  </div>

                  <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚡</div>
                  <h3 style={{ color: 'white', margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{bike.name}</h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginTop: '1rem' }}>
                    <div style={{ background: '#121212', padding: '0.6rem', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ color: '#555', fontSize: '0.6rem', textTransform: 'uppercase' }}>Voltage</div>
                      <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{bike.specs.voltage}V</div>
                    </div>
                    <div style={{ background: '#121212', padding: '0.6rem', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ color: '#555', fontSize: '0.6rem', textTransform: 'uppercase' }}>Capacity</div>
                      <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{bike.specs.capacityAh}Ah</div>
                    </div>
                    <div style={{ background: '#121212', padding: '0.6rem', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ color: '#555', fontSize: '0.6rem', textTransform: 'uppercase' }}>Motor</div>
                      <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{bike.specs.motorWatts}W</div>
                    </div>
                    <div style={{ background: '#121212', padding: '0.6rem', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ color: '#555', fontSize: '0.6rem', textTransform: 'uppercase' }}>Weight</div>
                      <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{bike.specs.bikeWeightLbs || 65} lbs</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Reviews Section */}
        <section style={{ marginBottom: '4rem' }}>
          <h2 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Rider Reviews</h2>
          
          {user && !isOwnProfile && (
            <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '20px', border: '1px solid #333', marginBottom: '2rem' }}>
               <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setReviewRating(s)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: s <= reviewRating ? '#ffcc00' : '#444' }}>⭐</button>
                  ))}
               </div>
               <textarea 
                 value={reviewText}
                 onChange={e => setReviewText(e.target.value)}
                 placeholder="Leave a review for this rider..."
                 style={{ width: '100%', background: '#121212', border: '1px solid #333', borderRadius: '12px', color: 'white', padding: '1rem', minHeight: '80px', fontFamily: 'inherit' }}
               />
               <button onClick={submitReview} style={{ marginTop: '1rem', background: '#ff6600', color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Submit Review</button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             {reviews.length === 0 ? (
               <p style={{ color: '#444', textAlign: 'center' }}>No reviews yet.</p>
             ) : (
               reviews.map(r => (
                 <div key={r.id} style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '20px', border: '1px solid #333' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                       <span style={{ color: '#ff6600', fontWeight: 'bold', fontSize: '0.9rem' }}>{r.reviewerName}</span>
                       <span style={{ color: '#ffcc00' }}>{'⭐'.repeat(r.rating)}</span>
                    </div>
                    <p style={{ color: '#ccc', margin: 0, fontSize: '0.9rem' }}>{r.text}</p>
                 </div>
               ))
             )}
          </div>
        </section>
      </main>

      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '500px', padding: '2.5rem', borderRadius: '24px', border: '1px solid #333' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Edit Profile</h2>
            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Profile Photo</label>
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
            </div>
            <div className="form-group" style={{ marginTop: '1.5rem' }}><label>Username</label><input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} /></div>
            <div className="form-group" style={{ marginTop: '1.5rem' }}><label>Home Region</label><input type="text" value={editHomeRegion} onChange={e => setEditHomeRegion(e.target.value)} placeholder="e.g. Southern California" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
              <div className="form-group"><label>Birthday</label><input type="date" value={editBirthday} onChange={e => setEditBirthday(e.target.value)} /></div>
              <div className="form-group"><label>Weight (lbs)</label><input type="number" value={editRiderWeight} onChange={e => setEditRiderWeight(e.target.value)} /></div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
              <button onClick={() => setShowSettings(false)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={handleUpdateProfile} disabled={isSavingProfile} style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>{isSavingProfile ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
      
      {showBikeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '500px', padding: '2.5rem', borderRadius: '24px', border: '1px solid #333', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>{editingBike ? 'Edit Bike' : 'Add to Garage'}</h2>
            
            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Bike Nickname</label>
              <input type="text" value={bikeForm.name} onChange={e => setBikeForm({ ...bikeForm, name: e.target.value })} placeholder="e.g. My Fast Commuter" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
              <div className="form-group">
                <label>Voltage (V)</label>
                <select value={bikeForm.voltage} onChange={e => setBikeForm({ ...bikeForm, voltage: e.target.value })} style={{ background: '#222', color: 'white', border: '1px solid #333', padding: '0.8rem', borderRadius: '12px', width: '100%' }}>
                  <option value="36">36V</option>
                  <option value="48">48V</option>
                  <option value="52">52V</option>
                  <option value="60">60V</option>
                  <option value="72">72V</option>
                </select>
              </div>
              <div className="form-group">
                <label>Capacity (Ah)</label>
                <input type="number" value={bikeForm.capacityAh} onChange={e => setBikeForm({ ...bikeForm, capacityAh: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
              <div className="form-group">
                <label>Motor (Watts)</label>
                <input type="number" value={bikeForm.motorWatts} onChange={e => setBikeForm({ ...bikeForm, motorWatts: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Bike Weight (lbs)</label>
                <input type="number" value={bikeForm.bikeWeightLbs} onChange={e => setBikeForm({ ...bikeForm, bikeWeightLbs: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
              <div className="form-group">
                <label>Tire PSI</label>
                <input type="number" value={bikeForm.tirePSI} onChange={e => setBikeForm({ ...bikeForm, tirePSI: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Tire Type</label>
                <select value={bikeForm.tireType} onChange={e => setBikeForm({ ...bikeForm, tireType: e.target.value as any })} style={{ background: '#222', color: 'white', border: '1px solid #333', padding: '0.8rem', borderRadius: '12px', width: '100%' }}>
                  <option value="road">Road / Slicks</option>
                  <option value="knobby">Knobby / Off-road</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Drive Mode</label>
              <select value={bikeForm.driveMode} onChange={e => setBikeForm({ ...bikeForm, driveMode: e.target.value as any })} style={{ background: '#222', color: 'white', border: '1px solid #333', padding: '0.8rem', borderRadius: '12px', width: '100%' }}>
                <option value="both">PAS + Throttle</option>
                <option value="pas_only">PAS Only (Class 1/3)</option>
                <option value="throttle_only">Throttle Only</option>
              </select>
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Target Average Speed (mph)</label>
              <input type="number" value={bikeForm.targetSpeedMph} onChange={e => setBikeForm({ ...bikeForm, targetSpeedMph: e.target.value })} style={{ width: '100%', padding: '0.8rem', background: '#222', border: '1px solid #333', borderRadius: '12px', color: '#ff6600', fontWeight: 'bold' }} />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
              <button onClick={() => setShowBikeModal(false)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={handleSaveBike} style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Save Bike</button>
            </div>
          </div>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
    </div>
  );
};

export default Profile;
