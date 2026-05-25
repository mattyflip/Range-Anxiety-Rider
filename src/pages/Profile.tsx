import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db, auth, storage } from '../firebase'
import { doc, arrayRemove, collection, setDoc, query, where, onSnapshot, updateDoc, getDoc, getCountFromServer, getDocs, addDoc, serverTimestamp, deleteDoc, orderBy } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'
import { createNotification } from '../utils/notifications'

interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorProfilePic?: string;
  imageUrl: string;
  caption: string;
  likes: string[];
  commentsEnabled?: boolean;
  createdAt: any;
  tripData?: any;
}

interface Review {
  id: string;
  reviewerId: string;
  reviewerUsername: string;
  reviewerProfilePic?: string;
  rating: number;
  comment: string;
  createdAt: any;
  targetUserId?: string;
}

const Profile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  const isAdmin = user?.email?.toLowerCase() === 'mattyfliptv@gmail.com';
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleLoadRoute = (post: Post) => {
    if (!post.tripData) return;
    localStorage.setItem('ebike_load_route', JSON.stringify(post.tripData));
    window.dispatchEvent(new Event('ebike-route-loaded'));
    navigate('/map');
  };

  const promptForModerationReason = (action: string) => {
    const reason = window.prompt(`Reason for ${action}:`, "Violates community guidelines");
    return reason;
  };
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [userReviews, setUserReviews] = useState<Review[]>([]);
  const [recordedRides, setRecordedRides] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState('garage');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Edit Profile states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editHomeRegion, setEditHomeRegion] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editIsPro, setEditIsPro] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Review states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Review Comment states
  const [activeReviewForComments, setActiveReviewForComments] = useState<string | null>(null);
  const [reviewComments, setReviewComments] = useState<{ [reviewId: string]: any[] }>({});
  const [newReviewCommentText, setNewReviewCommentText] = useState('');

  const handleUpgrade = async (tier: string) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify({ userId: user.uid, email: user.email, tier }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Checkout error: " + data.error);
      }
    } catch (e) {
      console.error("Upgrade failed", e);
      alert("Failed to initiate checkout.");
    }
  };

  useEffect(() => {
    if (username === 'me') {
      navigate('/shop-profile');
    }
  }, [username, navigate]);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(u => setUser(u));
    return () => unsubAuth();
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
    let profileUnsub: () => void;
    let postsUnsub: () => void;
    let recordedUnsub: () => void;

    const normalizedTarget = target.replace(/%20/g, ' ').replace(/\s+/g, '_');
    const spaceTarget = normalizedTarget.replace(/_/g, ' ');
    const lowerTarget = normalizedTarget.toLowerCase();
    const lowerSpaceTarget = spaceTarget.toLowerCase();

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("usernameLowercase", "in", [lowerTarget, lowerSpaceTarget]));

    profileUnsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        const tid = snap.docs[0].id;
        setProfileData({ ...data, id: tid });
        setEditUsername(data.username || '');
        setEditFullName(data.fullName || '');
        setEditBio(data.bio || '');
        setEditCity(data.city || '');
        setEditHomeRegion(data.homeRegion || '');
        setEditBirthday(data.birthday || '');
        setEditIsPro(data.isPro || false);
        if (user) {
          getDoc(doc(db, "users", tid, "followers", user.uid)).then(d => setIsFollowing(d.exists()));
        }
        getCountFromServer(collection(db, "users", tid, "followers")).then(c => setFollowerCount(c.data().count));
        getCountFromServer(collection(db, "users", tid, "following")).then(c => setFollowingCount(c.data().count));
        
        if (postsUnsub) postsUnsub();
        postsUnsub = fetchUserPosts(tid);
        
        if (recordedUnsub) recordedUnsub();
        recordedUnsub = fetchRecordedRides(tid);

        fetchUserReviews(tid);
      } else {
        const qOrig = query(usersRef, where("username", "in", [normalizedTarget, spaceTarget, target]));
        getDocs(qOrig).then((origSnap) => {
          if (!origSnap.empty) {
            const data = origSnap.docs[0].data();
            const tid = origSnap.docs[0].id;
            setProfileData({ ...data, id: tid });
            setEditUsername(data.username || '');
            setEditFullName(data.fullName || '');
            setEditBio(data.bio || '');
            setEditCity(data.city || '');
            setEditHomeRegion(data.homeRegion || '');
            setEditBirthday(data.birthday || '');
            setEditIsPro(data.isPro || false);
            if (user) {
          getDoc(doc(db, "users", tid, "followers", user.uid)).then(d => setIsFollowing(d.exists()));
        }
        getCountFromServer(collection(db, "users", tid, "followers")).then(c => setFollowerCount(c.data().count));
        getCountFromServer(collection(db, "users", tid, "following")).then(c => setFollowingCount(c.data().count));
            
            if (postsUnsub) postsUnsub();
            postsUnsub = fetchUserPosts(tid);

            if (recordedUnsub) recordedUnsub();
            recordedUnsub = fetchRecordedRides(tid);

            fetchUserReviews(tid);
          } else {
            const docRef = doc(db, "users", target);
            getDoc(docRef).then((uSnap) => {
              if (uSnap.exists()) {
                const data = uSnap.data();
                const tid = uSnap.id;
                setProfileData({ ...data, id: tid });
                setEditUsername(data.username || '');
                setEditFullName(data.fullName || '');
                setEditBio(data.bio || '');
                setEditCity(data.city || '');
                setEditHomeRegion(data.homeRegion || '');
                setEditBirthday(data.birthday || '');
                setEditIsPro(data.isPro || false);
                if (user) {
          getDoc(doc(db, "users", tid, "followers", user.uid)).then(d => setIsFollowing(d.exists()));
        }
        getCountFromServer(collection(db, "users", tid, "followers")).then(c => setFollowerCount(c.data().count));
        getCountFromServer(collection(db, "users", tid, "following")).then(c => setFollowingCount(c.data().count));
                
                if (postsUnsub) postsUnsub();
                postsUnsub = fetchUserPosts(tid);

                if (recordedUnsub) recordedUnsub();
                recordedUnsub = fetchRecordedRides(tid);

                fetchUserReviews(tid);
              }
            });
          }
        });
      }
      setLoading(false);
    });

    return () => { 
      if (profileUnsub) profileUnsub(); 
      if (postsUnsub) postsUnsub();
      if (recordedUnsub) recordedUnsub();
    };
  }, [username, user?.uid]);

  const fetchRecordedRides = (userId: string) => {
    const q = query(collection(db, `users/${userId}/recorded_routes`), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      const rides: any[] = [];
      snap.forEach(docSnap => rides.push({ id: docSnap.id, ...docSnap.data() }));
      setRecordedRides(rides);
    });
  };

  const handleLoadRecordedRide = (ride: any) => {
    if (!ride.path) return;
    // Prepare tripData structure expected by MapHome
    const tripData = {
      isRecorded: true,
      path: ride.path,
      name: ride.name,
      metrics: {
        distanceMiles: ride.distanceMiles,
        durationMin: ride.durationMin
      }
    };
    localStorage.setItem('ebike_load_route', JSON.stringify(tripData));
    window.dispatchEvent(new Event('ebike-route-loaded'));
    navigate('/map');
  };

  const toggleFollow = async () => {
    if (!user || !profileData) return;
    const targetUserId = profileData.id;
    const currentUserId = user.uid;

    try {
      if (isFollowing) {
        await deleteDoc(doc(db, "users", targetUserId, "followers", currentUserId));
        await deleteDoc(doc(db, "users", currentUserId, "following", targetUserId));
        setIsFollowing(false);
      } else {
        await setDoc(doc(db, "users", targetUserId, "followers", currentUserId), { timestamp: serverTimestamp() });
        await setDoc(doc(db, "users", currentUserId, "following", targetUserId), { timestamp: serverTimestamp() });
        setIsFollowing(true);
      }
    } catch (e) {
      console.error("Follow toggle failed", e);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !profileData || isSavingProfile) return;
    
    let reason = "";
    if (isAdmin && !isOwner) {
      const r = promptForModerationReason("profile edit");
      if (r === null) return;
      reason = r;
    }

    setIsSavingProfile(true);
    try {
      const normalizedUsername = editUsername.trim().replace(/\s+/g, '_');
      
      // If username changed, check if taken
      if (normalizedUsername.toLowerCase() !== profileData.usernameLowercase) {
         const q = query(collection(db, "users"), where("usernameLowercase", "==", normalizedUsername.toLowerCase()));
         const snap = await getDocs(q);
         if (!snap.empty) {
            alert("This username is already taken.");
            setIsSavingProfile(false);
            return;
         }
      }

      const updateData: any = {
        username: normalizedUsername,
        usernameLowercase: normalizedUsername.toLowerCase(),
        bio: editBio,
        city: editCity,
        homeRegion: editHomeRegion
      };

      if (isAdmin) {
        updateData.fullName = editFullName;
        updateData.birthday = editBirthday;
      }

      await updateDoc(doc(db, "users", profileData.id), updateData);

      if (isAdmin && !isOwner) {
        await createNotification(
          profileData.id,
          user.uid,
          "System Admin",
          'moderation',
          profileData.id,
          `Your profile was edited by a moderator. Reason: ${reason}`
        );
      }

      setShowEditModal(false);
      alert("Profile updated!");
    } catch (e) {
      console.error("Profile save failed", e);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const fetchUserReviews = (userId: string) => {
    const q = query(collection(db, "rider_reviews"), where("targetUserId", "==", userId));
    return onSnapshot(q, (snap) => {
      const reviews: Review[] = [];
      snap.forEach(docSnap => reviews.push({ id: docSnap.id, ...docSnap.data() } as Review));
      const sorted = reviews.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setUserReviews(sorted);
    });
  };

  const handleSubmitReview = async () => {
    if (!user || !profileData || isSubmittingReview || !newReviewComment.trim()) return;
    setIsSubmittingReview(true);
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const reviewerData = userSnap.exists() ? userSnap.data() : {};

      await addDoc(collection(db, "rider_reviews"), {
        targetUserId: profileData.id,
        reviewerId: user.uid,
        reviewerUsername: reviewerData.username || "Anonymous",
        reviewerProfilePic: reviewerData.profilePic || "",
        rating: newRating,
        comment: newReviewComment,
        createdAt: serverTimestamp()
      });

      await createNotification(profileData.id, user.uid, reviewerData.username || "Anonymous", 'review', profileData.id, `gave you a ${newRating} star review`);

      const currentAvg = profileData.averageRating || 0;
      const currentCount = profileData.ratingCount || 0;
      const newCount = currentCount + 1;
      const newAvg = ((currentAvg * currentCount) + newRating) / newCount;
      await updateDoc(doc(db, "users", profileData.id), { averageRating: newAvg, ratingCount: newCount });

      setNewReviewComment(''); setNewRating(5); setShowReviewModal(false);
      alert("Review submitted!");
    } catch (e) {
      console.error("Review submission failed", e);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const fetchReviewComments = (reviewId: string) => {
    const q = query(collection(db, `rider_reviews/${reviewId}/comments`));
    return onSnapshot(q, (snap) => {
      const comments: any[] = [];
      snap.forEach(docSnap => comments.push({ id: docSnap.id, ...docSnap.data() }));
      const sorted = comments.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setReviewComments(prev => ({ ...prev, [reviewId]: sorted }));
    });
  };

  const handleSubmitReviewComment = async (reviewId: string) => {
    if (!user || !newReviewCommentText.trim()) return;
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const senderData = userSnap.exists() ? userSnap.data() : {};
      await addDoc(collection(db, `rider_reviews/${reviewId}/comments`), {
        authorId: user.uid,
        authorUsername: senderData.username || "Rider",
        authorProfilePic: senderData.profilePic || "",
        text: newReviewCommentText,
        createdAt: serverTimestamp()
      });
      setNewReviewCommentText('');
    } catch (e) { console.error("Review comment failed", e); }
  };

  const fetchUserPosts = (userId: string) => {
    const q = query(collection(db, "posts"), where("authorId", "==", userId));
    return onSnapshot(q, (snap) => {
      const posts: Post[] = [];
      snap.forEach(docSnap => posts.push({ id: docSnap.id, ...docSnap.data() } as Post));
      const sorted = posts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setUserPosts(sorted);
    }, (error) => {
      console.error("User posts snapshot error:", error);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !profileData) return;
    try {
      const imageRef = ref(storage, `profiles/${profileData.id}.jpg`);
      await uploadBytes(imageRef, file);
      const imageUrl = await getDownloadURL(imageRef);
      await updateDoc(doc(db, "users", profileData.id), { profilePic: imageUrl });
      alert("Profile picture updated!");
    } catch (e) {
      console.error("Upload failed", e);
    }
  };

  const removeBike = async (bike: any) => {
    if (!user || !profileData || !canEdit) return;
    
    let reason = "";
    if (isAdmin && !isOwner) {
      const r = promptForModerationReason("bike removal");
      if (r === null) return;
      reason = r;
    }

    try {
      await updateDoc(doc(db, "users", profileData.id), { bikes: arrayRemove(bike) });
      
      if (isAdmin && !isOwner) {
        await createNotification(
          profileData.id,
          user.uid,
          "System Admin",
          'moderation',
          'bike_removed',
          `A bike (${bike.name}) was removed from your garage by a moderator. Reason: ${reason}`
        );
      }
    } catch (e) { console.error("Bike removal failed", e); }
  };

  if (loading) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Loading profile...</div>;

  const isOwner = user && profileData && user.uid === profileData.id;
  const canEdit = isOwner || isAdmin;

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />

      <main style={{ padding: '4rem 1.5rem', maxWidth: '800px', margin: '0 auto' }}>
        {!user && !profileData ? (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <h2 style={{ color: 'white' }}>Welcome to Range Anxiety</h2>
            <button onClick={() => setShowAuthModal(true)} style={{ padding: '1rem 3rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}>Sign In / Register</button>
          </div>
        ) : profileData ? (
          <>
            <div className="profile-header" style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 1.5rem' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', border: '2px solid #ff6600', overflow: 'hidden' }}>
                  {profileData.profilePic ? <img src={profileData.profilePic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚲'}
                </div>
                {canEdit && (
                  <label style={{ position: 'absolute', bottom: 0, right: 0, background: '#ff6600', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #121212', overflow: 'hidden' }}>
                    <span style={{ fontSize: '1rem' }}>📷</span>
                    <input type="file" accept="image/*" onChange={handleImageSelect} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                  </label>
                )}
              </div>
              
              {profileData.ratingCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.8rem', marginTop: '0.5rem' }}>
                  <div style={{ color: '#ffcc00', fontSize: '1.2rem' }}>
                    {'★'.repeat(Math.round(profileData.averageRating || 0))}{'☆'.repeat(5 - Math.round(profileData.averageRating || 0))}
                  </div>
                  <span style={{ color: '#888', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {(profileData.averageRating || 0).toFixed(1)} ({profileData.ratingCount})
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem' }}>
                <h1 style={{ color: 'white', margin: 0 }}>{profileData.username || 'Anonymous Rider'}</h1>
                {(profileData.email?.toLowerCase() === 'mattyfliptv@gmail.com' || profileData.username === 'MattyFlip' || profileData.username === 'mattyflip') && (
                  <span style={{ background: '#ff0000', color: 'white', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 900 }}>ADMIN</span>
                )}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={() => setShowEditModal(true)} style={{ background: 'none', border: '1px solid #444', color: '#888', borderRadius: '4px', padding: '0.3rem 0.8rem', fontSize: '0.7rem', cursor: 'pointer' }}>Edit Profile</button>
                  {isAdmin && <span style={{ color: '#ff4444', fontSize: '0.6rem', border: '1px solid #ff4444', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>Moderator Mode</span>}
                </div>
              )}
        {isOwner && profileData?.role === 'rider' && !profileData?.isShopTier && (
          <section style={{ marginBottom: '3rem', background: 'linear-gradient(45deg, #1a1a1a, #111)', padding: '2rem', borderRadius: '32px', border: '1px solid #ff6600' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Scale Your Experience</h2>
            <p style={{ color: '#888', marginBottom: '2rem' }}>Upgrade to the Shop Tier or grab a Host Pass to unlock professional tracking tools.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
               <div style={{ background: '#121212', padding: '1.5rem', borderRadius: '24px', border: '1px solid #333' }}>
                  <div style={{ color: '#ff6600', fontWeight: 900, fontSize: '1.2rem' }}>SHOP TIER</div>
                  <p style={{ color: '#666', fontSize: '0.8rem', margin: '1rem 0' }}>Professional fleet management, unlimited bike tracking, and ad-free experience.</p>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white' }}>$49.99 <span style={{ fontSize: '0.8rem', color: '#444' }}>/ month</span></div>
                  <button 
                    onClick={() => handleUpgrade('shop')}
                    style={{ width: '100%', padding: '0.8rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', marginTop: '1.5rem', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    UPGRADE SHOP
                  </button>
               </div>

               <div style={{ background: '#121212', padding: '1.5rem', borderRadius: '24px', border: '1px solid #333' }}>
                  <div style={{ color: '#ffcc00', fontWeight: 900, fontSize: '1.2rem' }}>HOST PASS</div>
                  <p style={{ color: '#666', fontSize: '0.8rem', margin: '1rem 0' }}>24-hour access to host group rides and track participant battery live on map.</p>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white' }}>$9.99 <span style={{ fontSize: '0.8rem', color: '#444' }}>/ 24h</span></div>
                  <button 
                    onClick={() => handleUpgrade('group_ride')}
                    style={{ width: '100%', padding: '0.8rem', background: '#ffcc00', color: 'black', border: 'none', borderRadius: '12px', marginTop: '1.5rem', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    GET PASS
                  </button>
               </div>
            </div>
          </section>
        )}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1.5rem' }}>
                <div><div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{followerCount}</div><div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Followers</div></div>
                <div><div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{followingCount}</div><div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Following</div></div>
              </div>
              {user && !isOwner && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                  <button onClick={toggleFollow} style={{ background: isFollowing ? 'rgba(255,255,255,0.1)' : '#ff6600', color: 'white', border: isFollowing ? '1px solid #333' : 'none', padding: '0.8rem 2rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem', minWidth: '140px' }}>{isFollowing ? '✓ Following' : 'Follow'}</button>
                  <button onClick={() => setShowReviewModal(true)} style={{ background: '#333', color: 'white', border: 'none', padding: '0.8rem 2rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>⭐ Rate Rider</button>
                </div>
              )}
            </div>

            
            <div style={{ display: 'flex', borderBottom: '1px solid #333', marginBottom: '2rem', overflowX: 'auto' }}>
              <button 
                onClick={() => setActiveTab('garage')}
                style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', borderBottom: activeTab === 'garage' ? '2px solid #ff6600' : '2px solid transparent', color: activeTab === 'garage' ? 'white' : '#888', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >Garage</button>
              <button 
                onClick={() => setActiveTab('trips')}
                style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', borderBottom: activeTab === 'trips' ? '2px solid #ff6600' : '2px solid transparent', color: activeTab === 'trips' ? 'white' : '#888', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >Trips</button>
              <button 
                onClick={() => setActiveTab('recorded')}
                style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', borderBottom: activeTab === 'recorded' ? '2px solid #ff6600' : '2px solid transparent', color: activeTab === 'recorded' ? 'white' : '#888', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >Recorded</button>
              {userPosts.some(p => !p.tripData) && (
                <button 
                  onClick={() => setActiveTab('posts')}
                  style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', borderBottom: activeTab === 'posts' ? '2px solid #ff6600' : '2px solid transparent', color: activeTab === 'posts' ? 'white' : '#888', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >Posts</button>
              )}
              <button 
                onClick={() => setActiveTab('reviews')}
                style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', borderBottom: activeTab === 'reviews' ? '2px solid #ff6600' : '2px solid transparent', color: activeTab === 'reviews' ? 'white' : '#888', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >Reviews ({profileData.ratingCount || 0})</button>
            </div>

            {activeTab === 'garage' && (
              <section style={{ marginBottom: '4rem' }}>
                {!profileData.bikes || profileData.bikes.length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No bikes in garage yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                    {profileData.bikes.map((bike: any, idx: number) => (
                      <div key={bike.id || idx} style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ width: '100%', aspectRatio: '1/1', background: '#222' }}>
                          {bike.image ? <img src={bike.image} alt={bike.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🚲</div>}
                        </div>
                        <div style={{ padding: '0.8rem' }}>
                          <div style={{ fontWeight: 'bold', color: 'white', fontSize: '0.85rem' }}>{bike.name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#888' }}>Vehicle Configuration Saved</div>
                        </div>
                        {canEdit && <button onClick={() => removeBike(bike)} style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', background: 'none', border: 'none', color: isAdmin ? '#ff4444' : '#444', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'trips' && (
              <section style={{ marginBottom: '4rem' }}>
                {userPosts.filter(p => p.tripData).length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No trips shared yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {userPosts.filter(p => p.tripData).map(post => (
                      <div key={post.id} style={{ background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', overflow: 'hidden', position: 'relative' }}>
                        <img src={post.imageUrl} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} alt="Trip" />
                        <button
                          onClick={() => handleLoadRoute(post)}
                          style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(255,102,0,0.9)', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'white', fontWeight: 'bold', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          📍 Load Route
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={async () => {
                              const reason = promptForModerationReason("post deletion");
                              if (reason === null) return;
                              await deleteDoc(doc(db, "posts", post.id));
                              await createNotification(
                                post.authorId,
                                user.uid,
                                "System Admin",
                                'moderation',
                                'deleted_post',
                                `Your trip post was removed by a moderator. Reason: ${reason}`
                              );
                            }}
                            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}
                          >🗑️</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'recorded' && (
              <section style={{ marginBottom: '4rem' }}>
                {recordedRides.length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No recorded rides yet. Try Explore Mode!</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                    {recordedRides.map(ride => (
                      <div key={ride.id} style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '16px', border: '1px solid #333', position: 'relative' }}>
                        <div style={{ fontWeight: 'bold', color: 'white', marginBottom: '0.5rem' }}>{ride.name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                           <div style={{ fontSize: '0.75rem', color: '#888' }}>📏 {ride.distanceMiles} MI</div>
                           <div style={{ fontSize: '0.75rem', color: '#888' }}>⏱️ {ride.durationMin} MIN</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            onClick={() => handleLoadRecordedRide(ride)}
                            style={{ flex: 1, padding: '0.5rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Load to Map
                          </button>
                          {canEdit && (
                            <button 
                              onClick={async () => {
                                if (!window.confirm("Delete this recorded ride?")) return;
                                await deleteDoc(doc(db, `users/${profileData.id}/recorded_routes`, ride.id));
                              }}
                              style={{ padding: '0.5rem', background: '#333', color: '#ff4444', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: '#444', marginTop: '1rem' }}>Recorded {ride.createdAt?.toDate().toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'posts' && (
              <section style={{ marginBottom: '4rem' }}>
                {userPosts.filter(p => !p.tripData).length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No posts yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {userPosts.filter(p => !p.tripData).map(post => (
                      <div key={post.id} style={{ background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', overflow: 'hidden', position: 'relative' }}>
                        <img src={post.imageUrl} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} alt="Post" />
                        <div style={{ padding: '1rem' }}>
                          <p style={{ color: '#ccc', margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>{post.caption}</p>
                        </div>
                        {isAdmin && (
                          <button 
                            onClick={async () => {
                              const reason = promptForModerationReason("post deletion");
                              if (reason === null) return;
                              await deleteDoc(doc(db, "posts", post.id));
                              await createNotification(
                                post.authorId,
                                user.uid,
                                "System Admin",
                                'moderation',
                                'deleted_post',
                                `Your post was removed by a moderator. Reason: ${reason}`
                              );
                            }}
                            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}
                          >🗑️</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'reviews' && (
              <section style={{ marginBottom: '4rem' }}>
                {userReviews.length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No reviews yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {userReviews.map(review => (
                      <div key={review.id} style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '16px', border: '1px solid #333', position: 'relative' }}>
                        {isAdmin && (
                          <button 
                            onClick={async () => {
                              const reason = promptForModerationReason("review deletion");
                              if (reason === null) return;
                              await deleteDoc(doc(db, "rider_reviews", review.id));
                              await createNotification(
                                review.reviewerId,
                                user.uid,
                                "System Admin",
                                'moderation',
                                'deleted_review',
                                `Your review for ${profileData.username} was removed. Reason: ${reason}`
                              );
                            }}
                            style={{ position: 'absolute', top: '1.2rem', right: '1.2rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                          >🗑️</button>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#333', overflow: 'hidden' }}>{review.reviewerProfilePic ? <img src={review.reviewerProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Reviewer" /> : '🚲'}</div>
                            <span style={{ fontWeight: 'bold', color: 'white', fontSize: '0.9rem' }}>{review.reviewerUsername}</span>
                          </div>
                          <div style={{ color: '#ffcc00' }}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</div>
                        </div>
                        <p style={{ color: '#ccc', margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>{review.comment}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                          <div style={{ fontSize: '0.7rem', color: '#444' }}>{review.createdAt?.toDate().toLocaleDateString()}</div>
                          <button onClick={() => { setActiveReviewForComments(review.id); fetchReviewComments(review.id); }} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>💬 {reviewComments[review.id]?.length || 0} Comments</button>
                        </div>
                        {activeReviewForComments === review.id && (
                          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #222', paddingTop: '1rem' }}>
                            {reviewComments[review.id]?.map(c => (
                              <div key={c.id} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem' }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#333', overflow: 'hidden' }}>{c.authorProfilePic ? <img src={c.authorProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Commenter" /> : '🚲'}</div>
                                <div style={{ background: '#222', padding: '0.6rem 0.8rem', borderRadius: '12px', flex: 1, position: 'relative' }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'white' }}>{c.authorUsername}</div>
                                  <div style={{ fontSize: '0.85rem', color: '#bbb' }}>{c.text}</div>
                                  {isAdmin && (
                                    <button 
                                      onClick={async () => {
                                        if (window.confirm("Delete this comment as moderator?")) {
                                          await deleteDoc(doc(db, `rider_reviews/${review.id}/comments`, c.id));
                                        }
                                      }}
                                      style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem' }}
                                    >🗑️</button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {user && (
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input value={newReviewCommentText} onChange={(e) => setNewReviewCommentText(e.target.value)} placeholder="Write a reply..." style={{ flex: 1, background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white', padding: '0.5rem 0.8rem' }} />
                                <button onClick={() => handleSubmitReviewComment(review.id)} style={{ background: '#ff6600', color: 'white', border: 'none', borderRadius: '8px', padding: '0 1rem', fontWeight: 'bold' }}>Send</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        ) : <div style={{ color: 'white', textAlign: 'center' }}>User not found.</div>}
      </main>

      {showReviewModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '450px', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Rate {profileData?.username}</h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', fontSize: '2.5rem', margin: '2rem 0' }}>
              {[1,2,3,4,5].map(star => <span key={star} onClick={() => setNewRating(star)} style={{ cursor: 'pointer', color: star <= newRating ? '#ffcc00' : '#333' }}>★</span>)}
            </div>
            <textarea value={newReviewComment} onChange={(e) => setNewReviewComment(e.target.value)} placeholder="What was it like?" style={{ width: '100%', height: '120px', background: '#222', border: '1px solid #444', borderRadius: '12px', color: 'white', padding: '1rem', fontFamily: 'inherit', marginBottom: '1.5rem' }} />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setShowReviewModal(false)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px' }}>Cancel</button>
              <button onClick={handleSubmitReview} disabled={isSubmittingReview || !newReviewComment.trim()} style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}

      {showEditModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '500px', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Edit Profile {isAdmin && "(MODERATOR)"}</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Username</label>
                <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }} />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Full Name {!isAdmin && "(Read-Only)"}</label>
                <input type="text" value={editFullName} onChange={e => setEditFullName(e.target.value)} disabled={!isAdmin} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: isAdmin ? 'white' : '#666' }} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Bio</label>
              <textarea value={editBio} onChange={e => setEditBio(e.target.value)} style={{ width: '100%', height: '60px', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>City (Optional)</label>
                <input type="text" value={editCity} onChange={e => setEditCity(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }} />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Home State/Region</label>
                <input type="text" value={editHomeRegion} onChange={e => setEditHomeRegion(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Birthday {!isAdmin && "(Read-Only)"}</label>
                <input type="date" value={editBirthday} onChange={e => setEditBirthday(e.target.value)} disabled={!isAdmin} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: isAdmin ? 'white' : '#666' }} />
              </div>
              {isAdmin && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Shop Tier Status</label>
                  <select value={profileData.isShopTier ? 'true' : 'false'} onChange={async (e) => {
                    await updateDoc(doc(db, "users", profileData.id), { isShopTier: e.target.value === 'true' });
                  }} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }}>
                    <option value="false">Free User</option>
                    <option value="true">SHOP TIER (Paid)</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid #333', marginTop: '1rem', paddingTop: '1rem' }}>
               <label style={{ display: 'block', color: '#555', fontSize: '0.6rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>System Information (Read-Only)</label>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#888' }}><span style={{ color: '#555' }}>Email:</span> {profileData.email}</div>
                  <div style={{ fontSize: '0.7rem', color: '#888' }}><span style={{ color: '#555' }}>UID:</span> {profileData.id}</div>
                  <div style={{ fontSize: '0.7rem', color: '#888' }}><span style={{ color: '#555' }}>Joined:</span> {profileData.createdAt?.toDate().toLocaleDateString()}</div>
               </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button onClick={() => setShowEditModal(false)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px' }}>Cancel</button>
              <button onClick={handleSaveProfile} disabled={isSavingProfile} style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>{isSavingProfile ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
