import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { db, auth, storage } from '../firebase'
import { doc, collection, query, where, onSnapshot, updateDoc, arrayRemove, getDoc, getDocs, addDoc, serverTimestamp, arrayUnion } from 'firebase/firestore'
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
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [userReviews, setUserReviews] = useState<Review[]>([]);

  const [isFollowing, setIsFollowing] = useState(false);

  // Review states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Review Comment states
  const [activeReviewForComments, setActiveReviewForComments] = useState<string | null>(null);
  const [reviewComments, setReviewComments] = useState<{ [reviewId: string]: any[] }>({});
  const [newReviewCommentText, setNewReviewCommentText] = useState('');

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

    const normalizedTarget = target.replace(/%20/g, ' ').replace(/\s+/g, '_');
    const spaceTarget = normalizedTarget.replace(/_/g, ' ');
    const lowerTarget = normalizedTarget.toLowerCase();
    const lowerSpaceTarget = spaceTarget.toLowerCase();

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("usernameLowercase", "in", [lowerTarget, lowerSpaceTarget]));

    profileUnsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setProfileData({ ...data, id: snap.docs[0].id });
        if (user && data.followers) setIsFollowing(data.followers.includes(user.uid));
        if (postsUnsub) postsUnsub();
        postsUnsub = fetchUserPosts(snap.docs[0].id);
        fetchUserReviews(snap.docs[0].id);
      } else {
        const qOrig = query(usersRef, where("username", "in", [normalizedTarget, spaceTarget, target]));
        getDocs(qOrig).then((origSnap) => {
          if (!origSnap.empty) {
            const data = origSnap.docs[0].data();
            setProfileData({ ...data, id: origSnap.docs[0].id });
            if (user && data.followers) setIsFollowing(data.followers.includes(user.uid));
            if (postsUnsub) postsUnsub();
            postsUnsub = fetchUserPosts(origSnap.docs[0].id);
            fetchUserReviews(origSnap.docs[0].id);
          } else {
            const docRef = doc(db, "users", target);
            getDoc(docRef).then((uSnap) => {
              if (uSnap.exists()) {
                const data = uSnap.data();
                setProfileData({ ...data, id: uSnap.id });
                if (user && data.followers) setIsFollowing(data.followers.includes(user.uid));
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

  const toggleFollow = async () => {
    if (!user || !profileData) return;
    const targetUserId = profileData.id;
    const currentUserId = user.uid;

    try {
      if (isFollowing) {
        await updateDoc(doc(db, "users", targetUserId), { followers: arrayRemove(currentUserId) });
        await updateDoc(doc(db, "users", currentUserId), { following: arrayRemove(targetUserId) });
        setIsFollowing(false);
      } else {
        await updateDoc(doc(db, "users", targetUserId), { followers: arrayUnion(currentUserId) });
        await updateDoc(doc(db, "users", currentUserId), { following: arrayUnion(targetUserId) });
        setIsFollowing(true);
      }
    } catch (e) {
      console.error("Follow toggle failed", e);
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
      const sorted = comments.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
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
    if (!file || !user) return;
    try {
      const imageRef = ref(storage, `profiles/${user.uid}.jpg`);
      await uploadBytes(imageRef, file);
      const imageUrl = await getDownloadURL(imageRef);
      await updateDoc(doc(db, "users", user.uid), { profilePic: imageUrl });
      alert("Profile picture updated!");
    } catch (e) {
      console.error("Upload failed", e);
    }
  };

  const removeBike = async (bike: any) => {
    if (!user || !profileData || user.uid !== profileData.id) return;
    try {
      await updateDoc(doc(db, "users", user.uid), { bikes: arrayRemove(bike) });
    } catch (e) { console.error("Bike removal failed", e); }
  };

  if (loading) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Loading profile...</div>;

  const isOwner = user && profileData && user.uid === profileData.id;

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
                {isOwner && (
                  <label style={{ position: 'absolute', bottom: 0, right: 0, background: '#ff6600', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #121212', overflow: 'hidden' }}>
                    <span style={{ fontSize: '1rem' }}>📷</span>
                    <input type="file" accept="image/*" onChange={handleImageSelect} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                  </label>
                )}
              </div>
              <h1 style={{ color: 'white', margin: 0 }}>{profileData.username || 'Anonymous Rider'}</h1>
              {profileData.isPro && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'linear-gradient(45deg, #ffd700, #ffae00)', padding: '2px 10px', borderRadius: '20px', marginTop: '0.8rem', boxShadow: '0 0 10px rgba(255, 215, 0, 0.3)' }}>
                  <span style={{ fontSize: '0.9rem' }}>🏍️</span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'black', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PRO</span>
                </div>
              )}
              <p style={{ color: '#888', marginTop: '0.5rem' }}>{profileData.bio || 'No bio yet.'}</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1.5rem' }}>
                <div><div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{profileData.followers?.length || 0}</div><div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Followers</div></div>
                <div><div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{profileData.following?.length || 0}</div><div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Following</div></div>
              </div>
              {user && !isOwner && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                  <button onClick={toggleFollow} style={{ background: isFollowing ? 'rgba(255,255,255,0.1)' : '#ff6600', color: 'white', border: isFollowing ? '1px solid #333' : 'none', padding: '0.8rem 2rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem', minWidth: '140px' }}>{isFollowing ? '✓ Following' : 'Follow'}</button>
                  <button onClick={() => setShowReviewModal(true)} style={{ background: '#333', color: 'white', border: 'none', padding: '0.8rem 2rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>⭐ Rate Rider</button>
                </div>
              )}
            </div>

            {profileData?.bikes && (
              <section style={{ marginBottom: '4rem' }}>
                <h3 style={{ color: '#ff6600', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', marginBottom: '1rem' }}>Garage</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                  {profileData.bikes.map((bike: any, idx: number) => (
                    <div key={bike.id || idx} style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ width: '100%', aspectRatio: '1/1', background: '#222' }}>
                        {bike.image ? <img src={bike.image} alt={bike.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🚲</div>}
                      </div>
                      <div style={{ padding: '0.8rem' }}>
                        <div style={{ fontWeight: 'bold', color: 'white', fontSize: '0.85rem' }}>{bike.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#888' }}>{bike.specs.voltage}V {bike.specs.capacityAh}Ah</div>
                      </div>
                      {isOwner && <button onClick={() => removeBike(bike)} style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 style={{ color: '#ff6600', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>Shared Trips</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {userPosts.map(post => (
                  <div key={post.id} style={{ background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', overflow: 'hidden' }}>
                    <img src={post.imageUrl} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} alt="Ride" />
                  </div>
                ))}
              </div>
            </section>

            <section style={{ marginTop: '4rem', paddingBottom: '6rem' }}>
              <h3 style={{ color: '#ff6600', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>Community Reviews</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {userReviews.map(review => (
                  <div key={review.id} style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '16px', border: '1px solid #333' }}>
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
                            <div style={{ background: '#222', padding: '0.6rem 0.8rem', borderRadius: '12px', flex: 1 }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'white' }}>{c.authorUsername}</div>
                              <div style={{ fontSize: '0.85rem', color: '#bbb' }}>{c.text}</div>
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
            </section>
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
    </div>
  );
};

export default Profile;
