import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { db, storage } from '../firebase'
import { doc, collection, setDoc, query, where, onSnapshot, updateDoc, serverTimestamp, orderBy } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import NavBar from '../shared/ui/NavBar'
import InstallTutorial from '../shared/ui/InstallTutorial'
import AuthModal from '../features/auth/AuthModal'
import SEO from '../shared/ui/SEO'
import Toast, { type ToastType } from '../shared/ui/Toast';
import ConfirmationModal from '../shared/ui/ConfirmationModal';
import UpgradeModal from '../shared/ui/UpgradeModal';
import type { UserProfile, Post } from '../types';
import { useUserData } from '../hooks/useUserData';
import { getTierLimits } from '../utils/tierLimits';

const Profile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const { user, userData, loading: authLoading } = useUserData();
  
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<ToastType>('info');

  // Confirmation state
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  } | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToastMessage(message);
    setToastType(type);
  }, []);

  // Posts state
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  // Settings states
  const [showSettings, setShowSettings] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newProfilePic, setNewProfilePic] = useState('');
  const [editHomeRegion, setEditHomeRegion] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editRiderWeight, setEditRiderWeight] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Garage states
  const [showBikeModal, setShowBikeModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState({ title: '', message: '', feature: '' });
  
  const limits = getTierLimits(userData);

  const handleOpenAddBike = () => {
    const currentBikes = profileData?.bikes?.length || 0;
    if (currentBikes >= limits.maxBikes) {
      setUpgradeContext({
        title: "Garage Full!",
        message: `Your current plan allows for ${limits.maxBikes} bike. Upgrade to Pro for an unlimited garage!`,
        feature: "Unlimited Garage"
      });
      setShowUpgradeModal(true);
      return;
    }
    setEditingBike(null);
    setBikeForm({
      name: '',
      imageUrl: '',
      voltage: '48',
      capacityAh: '15',
      motorWatts: '750',
      bikeWeightLbs: '65',
      tirePSI: '30',
      tireType: 'road' as 'road' | 'knobby',
      driveMode: 'both' as 'throttle_only' | 'pas_only' | 'both',
      targetSpeedMph: '20'
    });
    setShowBikeModal(true);
  };

  const handleStartUpgrade = async () => {
    setShowUpgradeModal(false);
    if (!user) return;
    try {
      // Logic for Stripe Checkout would go here
      showToast("Forwarding to secure checkout...", "info");
      // window.location.href = ...
    } catch (e) {
      console.error(e);
    }
  };

  const [isUploadingBikePic, setIsUploadingBikePic] = useState(false);
  const [editingBike, setEditingBike] = useState<import('../types').SavedBike | null>(null);
  const [bikeForm, setBikeForm] = useState({
    name: '',
    imageUrl: '',
    voltage: '48',
    capacityAh: '15',
    motorWatts: '750',
    bikeWeightLbs: '65',
    tirePSI: '30',
    tireType: 'road' as 'road' | 'knobby',
    driveMode: 'both' as 'throttle_only' | 'pas_only' | 'both',
    targetSpeedMph: '20'
  });

  const handleDeleteAccount = async () => {
    if (!user || !profileData) return;
    
    setConfirmation({
      title: "Delete Account?",
      message: "CRITICAL: This will permanently delete your account, garage, and all ride telemetry. This cannot be undone. Are you absolutely sure?",
      confirmText: "Delete Permanently",
      isDestructive: true,
      onConfirm: async () => {
        setConfirmation(null);
        setIsSavingProfile(true);
        try {
          const idToken = await user.getIdToken();
          const response = await fetch('/api/delete-account', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json'
            }
          });

          const result = await response.json();
          if (response.ok) {
            showToast("Account successfully deleted. Ride safe!", "success");
            setTimeout(() => { window.location.href = '/'; }, 2000);
          } else {
            throw new Error(result.error || 'Deletion failed');
          }
        } catch (e: any) {
          console.error(e);
          showToast(`Error: ${e.message}`, "error");
        } finally {
          setIsSavingProfile(false);
        }
      }
    });
  };

  const handleSaveBike = async () => {
    if (!user || !profileData || !bikeForm.name.trim()) return;
    
    const newBike = {
      id: editingBike?.id || Date.now().toString(),
      name: bikeForm.name,
      imageUrl: bikeForm.imageUrl,
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
      showToast("Garage updated!", "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to save bike.", "error");
    }
  };

  const deleteBike = async (bikeId: string) => {
    if (!profileData) return;

    setConfirmation({
      title: "Delete Bike?",
      message: "Remove this bike from your garage?",
      confirmText: "Delete",
      isDestructive: true,
      onConfirm: async () => {
        setConfirmation(null);
        const updatedBikes = (profileData.bikes || []).filter(b => b.id !== bikeId);
        try {
          await updateDoc(doc(db, "users", profileData.uid), {
            bikes: updatedBikes
          });
          showToast("Bike deleted.", "success");
        } catch (e) { 
          console.error(e);
          showToast("Failed to delete bike.", "error");
        }
      }
    });
  };

  const openEditBike = (bike: import('../types').SavedBike) => {
    setEditingBike(bike);
    setBikeForm({
      name: bike.name,
      imageUrl: bike.imageUrl || '',
      voltage: bike.specs.voltage?.toString() || '48',
      capacityAh: bike.specs.capacityAh?.toString() || '15',
      motorWatts: bike.specs.motorWatts?.toString() || '750',
      bikeWeightLbs: (bike.specs.bikeWeightLbs || 65).toString(),
      tirePSI: (bike.specs.tirePSI || 30).toString(),
      tireType: (bike.specs.tireType as 'road' | 'knobby') || 'road',
      driveMode: (bike.specs.driveMode as 'both' | 'pas_only' | 'throttle_only') || 'both',
      targetSpeedMph: ((bike.specs as any).targetSpeedMph || 20).toString()
    });
    setShowBikeModal(true);
  };

  const handleBikeImageUpload = async (file: File) => {
    if (!user) return;
    setIsUploadingBikePic(true);
    try {
      const storageRef = ref(storage, `bikes/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setBikeForm(prev => ({ ...prev, imageUrl: url }));
    } catch (e) {
      console.error(e);
      showToast("Failed to upload bike image.", "error");
    } finally {
      setIsUploadingBikePic(false);
    }
  };

  interface ReviewType {
    id: string;
    reviewerName: string;
    rating: number;
    text: string;
  }
  // Review states
  const [reviews, setReviews] = useState<ReviewType[]>([]);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);

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
      } else {
        setProfileData(null);
      }
      setLoading(false);
    });

    return () => { if (profileUnsub) profileUnsub(); };
  }, [username]);

  const [prevProfileData, setPrevProfileData] = useState<UserProfile | null>(null);
  if (profileData !== prevProfileData) {
    setPrevProfileData(profileData);
    if (profileData) {
      setNewUsername(profileData.username || '');
      setNewProfilePic(profileData.profilePic || '');
      setEditHomeRegion(profileData.homeRegion || '');
      setEditBirthday(profileData.birthday || '');
      setEditRiderWeight(profileData.riderWeight?.toString() || '180');
    }
  }

  // Fetch Reviews
  useEffect(() => {
    if (!profileData?.uid) return;
    const q = query(collection(db, `users/${profileData.uid}/reviews`), where('status', '==', 'approved'));
    const unsub = onSnapshot(q, (snap) => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReviewType)));
    });
    return () => unsub();
  }, [profileData?.uid]);

  // Fetch Posts
  useEffect(() => {
    if (!profileData?.uid) return;
    const q = query(collection(db, "posts"), where("authorId", "==", profileData.uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setUserPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Post)));
      setLoadingPosts(false);
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
      showToast("Profile updated!", "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to update profile.", "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      const storageRef = ref(storage, `profile_pics/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setNewProfilePic(url);
    } catch (e) {
      console.error(e);
      showToast("Failed to upload profile photo.", "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const submitReview = async () => {
    if (!user || !userData || !profileData) return;
    if (reviewRating === 0) {
      showToast("Please select a star rating (1-5)", "error");
      return;
    }
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
      showToast("Review posted!", "success");
    } catch (e) { 
      console.error(e); 
      showToast("Failed to post review.", "error");
    }
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

      <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
           <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#1a1a1a', marginBottom: '1.2rem', border: '3px solid #ff6600', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', flexShrink: 0 }}>
              {profileData.profilePic ? <img src={profileData.profilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚲'}
           </div>
           <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <h1 style={{ color: 'white', margin: 0, fontSize: '1.5rem' }}>{profileData.username || 'Anonymous Rider'}</h1>
              {profileData.isAdmin && (
                <span style={{ background: '#ff0000', color: 'white', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 900 }}>ADMIN</span>
              )}
           </div>
            <p style={{ color: '#666', marginTop: '0.4rem', fontSize: '0.9rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <span>{profileData.homeRegion || 'E-Bike Enthusiast'}</span>
              {profileData.riderWeight && <span>• {profileData.riderWeight} lbs</span>}
            </p>
           
           {canEdit && (
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', marginTop: '1rem' }}>
               <button onClick={() => setShowSettings(true)} style={{ background: '#222', border: '1px solid #333', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>Edit Profile</button>
               {isAdmin && !isOwnProfile && <p style={{ color: '#ffcc00', fontSize: '0.65rem', fontWeight: 'bold', margin: 0 }}>MODERATION ACCESS</p>}
             </div>
           )}
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
           <div style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '20px', border: '1px solid #333', textAlign: 'center' }}>
              <div style={{ color: '#666', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Bikes Owned</div>
              <div style={{ color: 'white', fontSize: '1.4rem', fontWeight: 900 }}>{profileData.bikes?.length || 0}</div>
           </div>
           <div style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '20px', border: '1px solid #333', textAlign: 'center' }}>
              <div style={{ color: '#666', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Rating</div>
              <div style={{ color: '#ffcc00', fontSize: '1.4rem', fontWeight: 900 }}>
                {reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : '5.0'} ⭐
              </div>
           </div>
        </section>

        {/* My Garage Section */}
        <section style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ color: 'white', fontSize: '1.1rem', margin: 0 }}>My Garage</h2>
            {canEdit && (
              <button 
                onClick={handleOpenAddBike}
                style={{ background: 'none', border: '1px solid #ff6600', color: '#ff6600', padding: '0.4rem 1rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                + Add Bike
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {!profileData.bikes || profileData.bikes.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2.5rem', background: '#1a1a1a', borderRadius: '24px', border: '1px dashed #333' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>🚲</div>
                <p style={{ color: '#666', margin: 0, fontSize: '0.9rem' }}>No bikes in the garage yet.</p>
              </div>
            ) : (
              profileData.bikes.map((bike: import('../types').SavedBike) => (
                <div key={bike.id || bike.name} style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '24px', border: '1px solid #333', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, right: 0, padding: '0.8rem', display: 'flex', gap: '0.4rem', zIndex: 10 }}>
                    {canEdit && (
                      <>
                        <button onClick={() => openEditBike(bike)} style={{ background: '#222', border: 'none', color: '#ffcc00', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
                        <button onClick={() => deleteBike(bike.id!)} style={{ background: '#222', border: 'none', color: '#ff4444', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
                      </>
                    )}
                  </div>

                  {bike.imageUrl ? (
                    <div style={{ width: '100%', height: '150px', borderRadius: '12px', overflow: 'hidden', marginBottom: '0.8rem' }}>
                      <img src={bike.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={bike.name} />
                    </div>
                  ) : (
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.8rem' }}>⚡</div>
                  )}
                  <h3 style={{ color: 'white', margin: '0 0 0.5rem 0', fontSize: '1rem' }}>{bike.name}</h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.8rem' }}>
                    <div style={{ background: '#121212', padding: '0.5rem', borderRadius: '10px', textAlign: 'center' }}>
                      <div style={{ color: '#555', fontSize: '0.55rem', textTransform: 'uppercase' }}>Voltage</div>
                      <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>{bike.specs.voltage}V</div>
                    </div>
                    <div style={{ background: '#121212', padding: '0.5rem', borderRadius: '10px', textAlign: 'center' }}>
                      <div style={{ color: '#555', fontSize: '0.55rem', textTransform: 'uppercase' }}>Capacity</div>
                      <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>{bike.specs.capacityAh}Ah</div>
                    </div>
                    <div style={{ background: '#121212', padding: '0.5rem', borderRadius: '10px', textAlign: 'center' }}>
                      <div style={{ color: '#555', fontSize: '0.55rem', textTransform: 'uppercase' }}>Motor</div>
                      <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>{bike.specs.motorWatts}W</div>
                    </div>
                    <div style={{ background: '#121212', padding: '0.5rem', borderRadius: '10px', textAlign: 'center' }}>
                      <div style={{ color: '#555', fontSize: '0.55rem', textTransform: 'uppercase' }}>Weight</div>
                      <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>{bike.specs.bikeWeightLbs || 65} lb</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Posts & Trips Section */}
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Posts & Trips</h2>
          {loadingPosts ? (
            <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>Loading posts...</div>
          ) : userPosts.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '2.5rem', background: '#1a1a1a', borderRadius: '24px', border: '1px dashed #333' }}>
               <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>📸</div>
               <p style={{ color: '#666', margin: 0, fontSize: '0.9rem' }}>No posts or trips yet.</p>
             </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
              {userPosts.map(post => (
                <div key={post.id} style={{ background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ width: '100%', aspectRatio: '1', position: 'relative' }}>
                    <img src={post.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Post" />
                    {post.tripData && (
                       <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(255, 102, 0, 0.9)', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '4px 8px', borderRadius: '12px' }}>
                         TRIP
                       </div>
                    )}
                  </div>
                  <div style={{ padding: '0.8rem' }}>
                    <p style={{ color: '#ccc', fontSize: '0.8rem', margin: '0 0 0.5rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.caption}</p>
                    <div style={{ display: 'flex', gap: '0.8rem', color: '#666', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      <span>❤️ {post.likes?.length || 0}</span>
                      {post.commentsEnabled !== false && <span>💬 {post.commentCount || 0}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reviews Section */}
        <section style={{ marginBottom: '4rem' }}>
          <h2 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Rider Reviews</h2>
          
          {user && !isOwnProfile && (
            <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '20px', border: '1px solid #333', marginBottom: '2rem' }}>
               <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setReviewRating(s)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: s <= reviewRating ? '#ffcc00' : '#444' }}>★</button>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#222', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #ff6600', flexShrink: 0 }}>
                  {newProfilePic ? <img src={newProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '2rem' }}>🚲</span>}
                </div>
                <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} style={{ flex: 1 }} />
              </div>
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

            {isOwnProfile && (
              <div style={{ marginTop: '2.5rem', borderTop: '1px solid #333', paddingTop: '1.5rem', textAlign: 'center' }}>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={isSavingProfile}
                  style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Permanently Delete Account
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {showBikeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '500px', padding: '2.5rem', borderRadius: '24px', border: '1px solid #333', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>{editingBike ? 'Edit Bike' : 'Add to Garage'}</h2>
            
            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Bike Photo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '12px', background: '#222', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #333', flexShrink: 0 }}>
                  {bikeForm.imageUrl ? <img src={bikeForm.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '2rem' }}>📸</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleBikeImageUpload(e.target.files[0])} disabled={isUploadingBikePic} />
                  {isUploadingBikePic && <div style={{ color: '#ff6600', fontSize: '0.8rem', marginTop: '0.4rem' }}>Uploading...</div>}
                </div>
              </div>
            </div>

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
                <select value={bikeForm.tireType} onChange={e => setBikeForm({ ...bikeForm, tireType: e.target.value as 'road' | 'knobby' })} style={{ background: '#222', color: 'white', border: '1px solid #333', padding: '0.8rem', borderRadius: '12px', width: '100%' }}>
                  <option value="road">Road / Slicks</option>
                  <option value="knobby">Knobby / Off-road</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Drive Mode</label>
              <select value={bikeForm.driveMode} onChange={e => setBikeForm({ ...bikeForm, driveMode: e.target.value as 'both' | 'pas_only' | 'throttle_only' })} style={{ background: '#222', color: 'white', border: '1px solid #333', padding: '0.8rem', borderRadius: '12px', width: '100%' }}>
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
      {toastMessage && <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} />}
      {showUpgradeModal && (
        <UpgradeModal
          title={upgradeContext.title}
          message={upgradeContext.message}
          featureName={upgradeContext.feature}
          onUpgrade={handleStartUpgrade}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
      {confirmation && (
        <ConfirmationModal
          title={confirmation.title}
          message={confirmation.message}
          confirmText={confirmation.confirmText}
          isDestructive={confirmation.isDestructive}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </div>
  );
};

export default Profile;
