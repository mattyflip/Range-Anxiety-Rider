import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db, auth, storage } from '../firebase'
import { doc, collection, query, where, onSnapshot, updateDoc, arrayRemove, getDoc, getDocs, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { signOut } from 'firebase/auth'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '../utils/imageUtils'
import CommentModal from '../components/CommentModal'

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
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [userReviews, setUserReviews] = useState<Review[]>([]);

  const isAdmin = user?.email?.toLowerCase() === 'mattyfliptv@gmail.com';

  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Review states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Comment Modal state
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);
  const [selectedFullPost, setSelectedFullPost] = useState<Post | null>(null);

  // Cropper states
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [croppingType, setCroppingType] = useState<'profile' | 'bike' | null>(null);
  const [activeBike, setActiveBike] = useState<any>(null);

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
    let profileUnsub: () => void;
    let postsUnsub: () => void;

    // Standardize the target: treat spaces and underscores as the same for lookup
    const normalizedTarget = target.replace(/%20/g, ' ').replace(/\s+/g, '_');
    const spaceTarget = normalizedTarget.replace(/_/g, ' ');
    const lowerTarget = normalizedTarget.toLowerCase();
    const lowerSpaceTarget = spaceTarget.toLowerCase();

    const usersRef = collection(db, "users");
    
    // Search for user by username (Case-Insensitive & Space/Underscore Agnostic)
    const q = query(usersRef, where("usernameLowercase", "in", [lowerTarget, lowerSpaceTarget]));

    profileUnsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setProfileData({ ...data, id: snap.docs[0].id });
        setEditBio(data.bio || '');
        
        // Start listening to posts for this specific user
        if (postsUnsub) postsUnsub();
        postsUnsub = fetchUserPosts(snap.docs[0].id);

        // Start listening to reviews for this user
        fetchUserReviews(snap.docs[0].id);
      } else {
        // Fallback 1: Search by original username field (case-sensitive, both versions)
        const qOrig = query(usersRef, where("username", "in", [normalizedTarget, spaceTarget, target]));
        getDocs(qOrig).then((origSnap: any) => {
          if (!origSnap.empty) {
            const data = origSnap.docs[0].data();
            setProfileData({ ...data, id: origSnap.docs[0].id });
            setEditBio(data.bio || '');
            
            if (postsUnsub) postsUnsub();
            postsUnsub = fetchUserPosts(origSnap.docs[0].id);
            fetchUserReviews(origSnap.docs[0].id);
          } else {
            // Fallback 2: Check if target is actually a UID
            const docRef = doc(db, "users", target);
            getDoc(docRef).then((uSnap: any) => {
              if (uSnap.exists()) {
                const data = uSnap.data();
                setProfileData({ ...data, id: uSnap.id });
                setEditBio(data.bio || '');
                
                if (postsUnsub) postsUnsub();
                postsUnsub = fetchUserPosts(uSnap.id);
                fetchUserReviews(uSnap.id);
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
    };
  }, [username, user?.uid]);

  const fetchUserReviews = (userId: string) => {
    const q = query(collection(db, "rider_reviews"), where("targetUserId", "==", userId));
    return onSnapshot(q, (snap) => {
      const reviews: Review[] = [];
      snap.forEach(docSnap => reviews.push({ id: docSnap.id, ...docSnap.data() } as Review));
      
      // Client-side sort by createdAt desc
      const sorted = reviews.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });
      
      setUserReviews(sorted);
    });
  };

  const handleDeleteReview = async (review: Review) => {
    if (!isAdmin || !profileData) return;
    if (!window.confirm("Are you sure you want to delete this review? This action cannot be undone.")) return;

    try {
      await deleteDoc(doc(db, "rider_reviews", review.id));
      
      // Recalculate stats
      const currentAvg = profileData.averageRating || 0;
      const currentCount = profileData.ratingCount || 0;
      
      let newCount = currentCount - 1;
      if (newCount < 0) newCount = 0;
      
      let newAvg = 0;
      if (newCount > 0) {
        newAvg = ((currentAvg * currentCount) - review.rating) / newCount;
      }

      await updateDoc(doc(db, "users", profileData.id), {
        averageRating: newAvg,
        ratingCount: newCount
      });

      alert("Review deleted successfully.");
    } catch (e) {
      console.error("Delete failed", e);
      alert("Failed to delete review.");
    }
  };

  const handleDeletePost = async (post: Post) => {
    if (!isAdmin) return;
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    try {
      await deleteDoc(doc(db, "posts", post.id));
      alert("Post deleted successfully.");
    } catch (e) {
      console.error("Delete post failed", e);
      alert("Failed to delete post.");
    }
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

      // Update cached stats on target user profile
      const currentAvg = profileData.averageRating || 0;
      const currentCount = profileData.ratingCount || 0;
      const newCount = currentCount + 1;
      const newAvg = ((currentAvg * currentCount) + newRating) / newCount;

      await updateDoc(doc(db, "users", profileData.id), {
        averageRating: newAvg,
        ratingCount: newCount
      });

      setNewReviewComment('');
      setNewRating(5);
      setShowReviewModal(false);
      alert("Review submitted! Thank you for helping keep the community safe.");
    } catch (e) {
      console.error("Review submission failed", e);
      alert("Failed to submit review. Please try again.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const fetchUserPosts = (userId: string) => {
    const postsRef = collection(db, "posts");
    // Remove orderBy to avoid requiring a composite index; sort client-side instead
    const q = query(postsRef, where("authorId", "==", userId));
    
    return onSnapshot(q, (snap) => {
      const posts: Post[] = [];
      snap.forEach(docSnap => posts.push({ id: docSnap.id, ...docSnap.data() } as Post));
      
      // Client-side sort by createdAt desc
      const sorted = posts.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });

      setUserPosts(sorted);
    }, (error) => {
      console.error("User posts snapshot error:", error);
    });
  };

  const handleUpdateBio = async () => {
    if (!user || !profileData || user.uid !== profileData.id) return;
    try {
      await updateDoc(doc(db, "users", user.uid), { bio: editBio });
      setIsEditing(false);
    } catch (e) { console.error("Bio update failed", e); }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'bike', bike?: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      alert("Image is too large. Please select a photo under 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setTempImage(event.target?.result as string);
      setCroppingType(type);
      if (bike) setActiveBike(bike);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleApplyCrop = async () => {
    if (tempImage && croppedAreaPixels && user) {
      setIsUploading(true);
      try {
        const croppedImageBase64 = await getCroppedImg(tempImage, croppedAreaPixels);
        
        // Convert base64 to blob for professional Storage upload
        const response = await fetch(croppedImageBase64);
        const blob = await response.blob();

        if (croppingType === 'profile') {
          const imageRef = ref(storage, `profiles/${user.uid}.jpg`);
          await uploadBytes(imageRef, blob);
          const imageUrl = await getDownloadURL(imageRef);
          const finalUrl = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
          await updateDoc(doc(db, "users", user.uid), { profilePic: finalUrl });
        } else if (croppingType === 'bike' && activeBike) {
          console.log("Updating photo for bike:", activeBike.name, "ID:", activeBike.id);
          const bikeId = activeBike.id || activeBike.name; 
          const imageRef = ref(storage, `bikes/${user.uid}/${bikeId}.jpg`);
          
          await uploadBytes(imageRef, blob);
          const imageUrl = await getDownloadURL(imageRef);
          const finalUrl = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
          
          const updatedBikes = profileData.bikes.map((b: any) => {
            // Match by ID primarily, fallback to Name
            const isMatch = (b.id && b.id === activeBike.id) || (!b.id && b.name === activeBike.name);
            return isMatch ? { ...b, image: finalUrl } : b;
          });

          await updateDoc(doc(db, "users", user.uid), { bikes: updatedBikes });
          console.log("Garage updated in Firestore.");
          alert(`Photo saved for ${activeBike.name}!`);
        }

        setTempImage(null);
        setCroppingType(null);
        setActiveBike(null);
        alert("Image updated!");
      } catch (e: any) {
        console.error("Upload failed:", e);
        alert(`Failed to save photo: ${e.message}`);
      } finally {
        setIsUploading(false);
      }
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
                      onChange={(e) => handleImageSelect(e, 'profile')} 
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    />
                  </label>
                )}
              </div>

              <h1 style={{ color: 'white', margin: 0 }}>{profileData.username || 'Anonymous Rider'}</h1>
              
              {/* Average Rating Display */}
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <div style={{ color: '#ffcc00', fontSize: '1.2rem' }}>
                  {'★'.repeat(Math.round(profileData.averageRating || 0))}{'☆'.repeat(5 - Math.round(profileData.averageRating || 0))}
                </div>
                <span style={{ color: '#888', fontSize: '0.85rem' }}>({(profileData.averageRating || 0).toFixed(1)} / {profileData.ratingCount || 0} reviews)</span>
              </div>
              
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

              {user && !isOwner && (
                <button 
                  onClick={() => setShowReviewModal(true)}
                  style={{ marginTop: '2rem', background: '#ff6600', color: 'white', border: 'none', padding: '0.8rem 2rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}
                >
                  ⭐ Rate Rider
                </button>
              )}

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
              <section style={{ marginBottom: '4rem' }}>
                <h3 style={{ color: '#ff6600', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                  Garage
                  {isOwner && <span style={{ fontSize: '0.7rem', textTransform: 'none', color: '#444' }}>(Manage bikes on Map page)</span>}
                </h3>
                <div className="garage-grid">
                  {profileData.bikes.length === 0 ? (
                    <div style={{ color: '#444', fontSize: '0.9rem' }}>No bikes in garage yet.</div>
                  ) : (
                    profileData.bikes.map((bike: any, idx: number) => (
                      <div key={bike.id || idx} className="garage-item">
                        <div style={{ width: '100%', aspectRatio: '1/1', background: '#222', position: 'relative' }}>
                          {bike.image ? (
                            <img src={bike.image} alt={bike.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🚲</div>
                          )}
                          {isOwner && (
                            <label style={{ 
                              position: 'absolute', top: '0.5rem', right: '0.5rem', 
                              background: 'rgba(0,0,0,0.6)', width: '30px', height: '30px', 
                              borderRadius: '50%', display: 'flex', alignItems: 'center', 
                              justifyContent: 'center', cursor: 'pointer', color: 'white'
                            }}>
                              📸
                              <input type="file" accept="image/*" hidden onChange={(e) => handleImageSelect(e, 'bike', bike)} />
                            </label>
                          )}
                        </div>
                        <div style={{ padding: '0.8rem' }}>
                          <div style={{ fontWeight: 'bold', color: 'white', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bike.name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#888' }}>{bike.specs.voltage}V {bike.specs.capacityAh}Ah</div>
                        </div>
                        {isOwner && (
                          <button 
                            onClick={() => removeBike(bike)}
                            style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '0.8rem' }}
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

            <style>{`
              .garage-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                gap: 1rem;
              }
              .garage-item {
                background: #1a1a1a;
                border-radius: 12px;
                border: 1px solid #333;
                position: relative;
                overflow: hidden;
              }
              @media (max-width: 600px) {
                .garage-grid {
                  grid-template-columns: 1fr 1fr;
                  gap: 0.8rem;
                }
              }
            `}</style>

            <section>
              <h3 style={{ color: '#ff6600', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>Shared Trips & Posts</h3>
              {userPosts.length === 0 ? (
                <div style={{ color: '#444', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>No trips shared yet.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {userPosts.map(post => (
                    <div key={post.id} style={{ background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', overflow: 'hidden' }}>
                      <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setSelectedFullPost(post)}>
                        <img src={post.imageUrl} alt="Post" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ padding: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ color: 'white', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {post.likes.length} Likes
                          {isAdmin && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeletePost(post); }}
                              style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold' }}
                            >
                              DELETE
                            </button>
                          )}
                        </div>
                        {(post.commentsEnabled !== false) && (
                          <button onClick={() => setActiveCommentPost(post)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>💬</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section style={{ marginTop: '4rem', paddingBottom: '6rem' }}>
              <h3 style={{ color: '#ff6600', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>Community Reviews</h3>
              {userReviews.length === 0 ? (
                <div style={{ color: '#444', fontSize: '0.9rem', textAlign: 'center', padding: '2rem', background: '#1a1a1a', borderRadius: '16px' }}>No reviews yet. Be the first to rate this rider!</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {userReviews.map(review => (
                    <div key={review.id} style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '16px', border: '1px solid #333', position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#333', overflow: 'hidden' }}>
                            {review.reviewerProfilePic ? <img src={review.reviewerProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚲'}
                          </div>
                          <span style={{ fontWeight: 'bold', color: 'white', fontSize: '0.9rem' }}>{review.reviewerUsername}</span>
                        </div>
                        <div style={{ color: '#ffcc00', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                          <div>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</div>
                          {isAdmin && (
                            <button 
                              onClick={() => handleDeleteReview(review)}
                              style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.7rem', padding: '4px', borderLeft: '1px solid #333' }}
                            >
                              DELETE
                            </button>
                          )}
                        </div>
                      </div>
                      <p style={{ color: '#ccc', margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>{review.comment}</p>
                      <div style={{ fontSize: '0.7rem', color: '#444', marginTop: '0.8rem' }}>{review.createdAt?.toDate().toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <div style={{ color: 'white', textAlign: 'center' }}>User not found.</div>
        )}
      </main>

      {/* Rate Rider Modal */}
      {showReviewModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '450px', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Rate {profileData.username}</h2>
            <p style={{ color: '#888', fontSize: '0.9rem' }}>Shared your experience with this rider. Reviews cannot be edited by the receiver.</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', fontSize: '2.5rem', margin: '2rem 0' }}>
              {[1,2,3,4,5].map(star => (
                <span 
                  key={star} 
                  onClick={() => setNewRating(star)}
                  style={{ cursor: 'pointer', color: star <= newRating ? '#ffcc00' : '#333' }}
                >
                  ★
                </span>
              ))}
            </div>

            <textarea 
              value={newReviewComment}
              onChange={(e) => setNewReviewComment(e.target.value)}
              placeholder="What was it like riding with them?"
              style={{ width: '100%', height: '120px', background: '#222', border: '1px solid #444', borderRadius: '12px', color: 'white', padding: '1rem', fontFamily: 'inherit', marginBottom: '1.5rem' }}
            />

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => setShowReviewModal(false)}
                style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmitReview}
                disabled={isSubmittingReview || !newReviewComment.trim()}
                style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', opacity: (isSubmittingReview || !newReviewComment.trim()) ? 0.5 : 1 }}
              >
                {isSubmittingReview ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Post Modal */}
      {selectedFullPost && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.98)', zIndex: 4000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <button 
            onClick={() => setSelectedFullPost(null)}
            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', color: 'white', fontSize: '2rem', cursor: 'pointer', zIndex: 4001 }}
          >
            ✕
          </button>
          
          <div style={{ width: '100%', maxWidth: '600px', padding: '1rem' }}>
             <img src={selectedFullPost.imageUrl} alt="Full View" style={{ width: '100%', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }} />
             <div style={{ marginTop: '1.5rem', padding: '0 1rem' }}>
                <p style={{ color: '#ccc', fontSize: '1.1rem', lineHeight: '1.6' }}>
                  <span style={{ fontWeight: 'bold', color: 'white', marginRight: '0.5rem' }}>{selectedFullPost.authorUsername}</span>
                  {selectedFullPost.caption}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                   <span style={{ color: '#ff6600', fontWeight: 'bold' }}>🧡 {selectedFullPost.likes.length} Likes</span>
                   {(selectedFullPost.commentsEnabled !== false) && (
                     <button onClick={() => { setActiveCommentPost(selectedFullPost); setSelectedFullPost(null); }} style={{ background: '#333', border: 'none', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>View Comments</button>
                   )}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Global Cropper Modal */}
      {tempImage && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 3000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '500px', height: '400px', background: '#000', borderRadius: '12px', overflow: 'hidden' }}>
            <Cropper
              image={tempImage}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', width: '100%', maxWidth: '500px' }}>
             <button onClick={() => { setTempImage(null); setCroppingType(null); setActiveBike(null); }} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
             <button onClick={handleApplyCrop} disabled={isUploading} style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
               {isUploading ? 'Uploading...' : 'Save Photo'}
             </button>
          </div>
        </div>
      )}

      {activeCommentPost && (
        <CommentModal 
          postId={activeCommentPost.id} 
          user={user} 
          onClose={() => setActiveCommentPost(null)} 
        />
      )}

      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default Profile;
