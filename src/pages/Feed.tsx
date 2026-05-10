import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, auth, storage } from '../firebase'
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'
import UniversalSearch from '../components/UniversalSearch'
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
  tripData?: any;
}

const Feed: React.FC = () => {
  const navigate = useNavigate();

  const handleLoadRoute = (post: Post) => {
    if (!post.tripData) return;
    localStorage.setItem('ebike_load_route', JSON.stringify(post.tripData));
    navigate('/');
  };

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  const isAdmin = user?.email?.toLowerCase() === 'mattyfliptv@gmail.com';

  const [showCreatePost, setShowCreatePost] = useState(false);
  const [newCaption, setNewCaption] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [allowComments, setAllowComments] = useState(true);

  // Comment Modal state
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);

  // Admin states
  const [adminEditingPost, setAdminEditingPost] = useState<Post | null>(null);
  const [adminEditValue, setAdminEditValue] = useState('');

  // Cropper states
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [showCropper, setShowCropper] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetchedPosts: Post[] = [];
      snap.forEach(docSnap => {
        fetchedPosts.push({ id: docSnap.id, ...docSnap.data() } as Post);
      });

      // CURATED FEED LOGIC: 
      // Prioritize followed users, then sort by date
      const sorted = fetchedPosts.sort((a, b) => {
        const following = userData?.following || [];
        const aFollowed = following.includes(a.authorId);
        const bFollowed = following.includes(b.authorId);

        if (aFollowed && !bFollowed) return -1;
        if (!aFollowed && bFollowed) return 1;

        // Both followed or both not followed: Sort by date
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });

      setPosts(sorted);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userData?.following]);

  const handleDeletePost = async (post: Post) => {
    if (!isAdmin) return;
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    try {
      await deleteDoc(doc(db, "posts", post.id));
      alert("Post deleted by Admin.");
    } catch (e) {
      console.error("Delete failed", e);
      alert("Failed to delete post.");
    }
  };

  const handleSaveAdminEdit = async () => {
    if (!isAdmin || !adminEditingPost) return;
    try {
      await updateDoc(doc(db, "posts", adminEditingPost.id), {
        caption: adminEditValue
      });
      setAdminEditingPost(null);
      alert("Post updated by Admin.");
    } catch (e) {
      console.error("Update failed", e);
      alert("Failed to save edits.");
    }
  };

  const handleLike = async (post: Post) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    const postRef = doc(db, "posts", post.id);
    const isLiked = post.likes.includes(user.uid);
    try {
      await updateDoc(postRef, {
        likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid)
      });
    } catch (e) {
      console.error("Like error:", e);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("Image is too large. Please select a photo under 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleApplyCrop = async () => {
    if (selectedImage && croppedAreaPixels) {
      try {
        const croppedImage = await getCroppedImg(selectedImage, croppedAreaPixels);
        setSelectedImage(croppedImage);
        setShowCropper(false);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleCreatePost = async () => {
    if (!user || !selectedImage) return;

    if (!userData?.username || !userData?.profilePic) {
      alert("Please complete your profile (set a username and upload a profile picture) before posting to the community!");
      return;
    }

    setIsPosting(true);
    try {
      // Professional Storage upload for high-res images
      const response = await fetch(selectedImage);
      const blob = await response.blob();

      const imageRef = ref(storage, `posts/${user.uid}/${Date.now()}.png`);
      await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(imageRef);

      await addDoc(collection(db, "posts"), {
        authorId: user.uid,
        authorUsername: userData.username,
        authorProfilePic: userData.profilePic,
        imageUrl,
        caption: newCaption || "",
        likes: [],
        commentsEnabled: allowComments,
        createdAt: serverTimestamp()
      });

      setNewCaption('');
      setSelectedImage(null);
      setShowCreatePost(false);
      alert("Post shared with the community!");
    } catch (e: any) {
      console.error("Post creation failed", e);
      alert(`Failed to share: ${e.message}`);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212' }}>
      <NavBar 
        user={user} 
        onShowInstall={() => setShowInstallTutorial(true)} 
      />

      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <UniversalSearch />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ color: '#ff6600', textTransform: 'uppercase', fontSize: '1rem', letterSpacing: '0.2em', margin: 0 }}>Community Feed</h2>
          {user && (
            <button 
              onClick={() => {
                if (!userData?.username || !userData?.profilePic) {
                   alert("Please complete your profile (username and photo) first!");
                   return;
                }
                setShowCreatePost(true);
              }}
              style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              + Create Post
            </button>
          )}
        </div>
        
        {showCreatePost && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(10px)' }}>
            <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', maxWidth: '500px', width: '100%' }}>
              <h3 style={{ color: 'white', marginTop: 0 }}>New Post</h3>
              
              {showCropper && selectedImage ? (
                <div style={{ position: 'relative', width: '100%', height: '300px', marginBottom: '1rem' }}>
                  <Cropper
                    image={selectedImage}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                  <button 
                    onClick={handleApplyCrop}
                    style={{ position: 'absolute', bottom: '1rem', right: '1rem', background: '#ff6600', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', zIndex: 1200 }}
                  >
                    Apply Crop
                  </button>
                </div>
              ) : (
                <div style={{ 
                  width: '100%', height: '250px', background: '#222', 
                  borderRadius: '12px', border: '2px dashed #444', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', cursor: 'pointer', position: 'relative'
                }}>
                  {selectedImage ? (
                    <img src={selectedImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#666' }}>Tap to select photo</span>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageSelect} 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 5 }} 
                  />
                </div>
              )}

              {!showCropper && (
                <>
                  <textarea 
                    placeholder="Write a caption (optional)..."
                    value={newCaption}
                    onChange={e => setNewCaption(e.target.value)}
                    style={{ width: '100%', background: '#222', border: '1px solid #444', borderRadius: '8px', color: 'white', padding: '1rem', marginTop: '1.5rem', height: '100px', fontFamily: 'inherit' }}
                  />

                  <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <input 
                      type="checkbox" 
                      id="allow-comments" 
                      checked={allowComments} 
                      onChange={e => setAllowComments(e.target.checked)}
                      style={{ width: 'auto' }}
                    />
                    <label htmlFor="allow-comments" style={{ margin: 0, textTransform: 'none', fontSize: '0.9rem', color: '#ccc' }}>Allow community comments</label>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                    <button 
                      onClick={() => setShowCreatePost(false)}
                      style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleCreatePost}
                      disabled={isPosting || !selectedImage}
                      style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: (isPosting || !selectedImage) ? 0.5 : 1 }}
                    >
                      {isPosting ? 'Posting...' : 'Post to Community'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ color: '#666', textAlign: 'center' }}>Loading feed...</div>
        ) : posts.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏜️</div>
            <p>No posts yet. Be the first to share a trip!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {posts.map(post => (
              <article key={post.id} style={{ background: '#1a1a1a', borderRadius: '24px', border: '1px solid #333', overflow: 'hidden' }}>
                <div 
                  style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}
                  onClick={() => navigate(`/profile/${post.authorUsername.replace(/\s+/g, '_')}`)}
                >
                  <div style={{ 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '50%', 
                    background: '#333', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    overflow: 'hidden',
                    border: '1px solid #333'
                  }}>
                    {post.authorProfilePic ? (
                      <img src={post.authorProfilePic} alt={post.authorUsername} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : '🚲'}
                  </div>
                  <div style={{ fontWeight: 'bold', color: 'white' }}>{post.authorUsername}</div>
                </div>
                
                <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden' }}>
                  <img src={post.imageUrl} alt="Trip Report" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                
                <div style={{ padding: '1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button 
                        onClick={() => handleLike(post)}
                        style={{ 
                          background: 'none', 
                          border: 'none', 
                          color: post.likes.includes(user?.uid) ? '#ff6600' : 'white', 
                          fontSize: '1.5rem', 
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        {post.likes.includes(user?.uid) ? '🧡' : '🤍'}
                      </button>
                      <span style={{ color: '#888', fontSize: '0.9rem' }}>{post.likes.length}</span>
                    </div>

                    {(post.commentsEnabled !== false) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button 
                          onClick={() => setActiveCommentPost(post)}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: 'white', 
                            fontSize: '1.5rem', 
                            cursor: 'pointer',
                            padding: 0
                          }}
                        >
                          💬
                        </button>
                      </div>
                    )}

                    {post.tripData && (
                      <button 
                        onClick={() => handleLoadRoute(post)}
                        style={{ 
                          background: 'rgba(255,102,0,0.1)', 
                          border: '1px solid #ff6600', 
                          color: '#ff6600', 
                          padding: '0.4rem 0.8rem', 
                          borderRadius: '8px', 
                          fontSize: '0.75rem', 
                          fontWeight: 'bold', 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        📍 Load Route
                      </button>
                    )}

                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '1rem', marginLeft: 'auto' }}>
                         <button 
                           onClick={() => { setAdminEditingPost(post); setAdminEditValue(post.caption); }}
                           style={{ background: 'none', border: 'none', color: '#ffcc00', fontSize: '1rem', cursor: 'pointer' }}
                           title="Edit Post"
                         >
                           ✏️
                         </button>
                         <button 
                           onClick={() => handleDeletePost(post)}
                           style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '1rem', cursor: 'pointer' }}
                           title="Delete Post"
                         >
                           🗑️
                         </button>
                      </div>
                    )}
                  </div>
                  
                  <p style={{ color: '#ccc', margin: 0, fontSize: '0.95rem', lineHeight: '1.4' }}>
                    <span style={{ fontWeight: 'bold', color: 'white', marginRight: '0.5rem' }}>{post.authorUsername}</span>
                    {post.caption}
                  </p>
                  
                  <div style={{ color: '#444', fontSize: '0.7rem', marginTop: '1rem', textTransform: 'uppercase' }}>
                    {post.createdAt?.toDate().toLocaleDateString()}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {activeCommentPost && (
        <CommentModal 
          postId={activeCommentPost.id} 
          user={user} 
          onClose={() => setActiveCommentPost(null)} 
        />
      )}

      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {/* Admin Edit Modal */}
      {adminEditingPost && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '450px', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Admin Post Edit</h2>
            <p style={{ color: '#ffcc00', fontSize: '0.8rem', fontWeight: 'bold' }}>MODERATION MODE</p>

            <textarea 
              value={adminEditValue}
              onChange={(e) => setAdminEditValue(e.target.value)}
              style={{ width: '100%', height: '150px', background: '#222', border: '1px solid #444', borderRadius: '12px', color: 'white', padding: '1rem', fontFamily: 'inherit', marginBottom: '1.5rem' }}
            />

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => setAdminEditingPost(null)}
                style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}
              >
                Cancel
              </button>
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
    </div>
  );
};

export default Feed;
