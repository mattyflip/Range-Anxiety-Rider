import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { db, auth, storage } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, orderBy, onSnapshot, getDoc, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { serverTimestamp } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'
import UniversalSearch from '../components/UniversalSearch'
import LikeWidget from '../components/LikeWidget'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '../utils/imageUtils'
import CommentModal from '../components/CommentModal'
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

const Feed: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLoadRoute = (post: Post) => {
    if (!post.tripData) return;
    localStorage.setItem('ebike_load_route', JSON.stringify(post.tripData));
    window.dispatchEvent(new Event('ebike-route-loaded'));
    navigate('/');
  };

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
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

  // Modal states
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);

  // Admin states
  const [adminEditingPost, setAdminEditingPost] = useState<Post | null>(null);
  const [adminEditValue, setAdminEditValue] = useState('');

  const promptForModerationReason = (action: string) => {
    const reason = window.prompt(`Reason for ${action}:`, "Violates community guidelines");
    return reason;
  };

  // Cropper states
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [showCropper, setShowCropper] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      // empty or real function if you need
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
        }
      } else {
        // Prompt guests to sign up
        setShowAuthModal(true);
      }
    });
    return () => unsub();
  }, []);

  // Calculate derived state directly dynamically to prevent cascading render
  const selectedFullPostState = (() => {
      const searchParams = new URLSearchParams(location.search);
      const postId = searchParams.get('post');
      if (postId) {
        return posts.find(p => p.id === postId) || null;
      }
      return null;
  })();

  const [explicitSelectedPost, setExplicitSelectedPost] = useState<Post | null>(null);

  const clearSelectedPost = () => {
    setExplicitSelectedPost(null);
    const searchParams = new URLSearchParams(location.search);
    if(searchParams.get('post')) {
      navigate('/feed', { replace: true });
    }
  }

  const setExplicitSelectedPostInner = (post: Post | null) => {
    // Override function that controls explicit override, or clears it and query params to sync it all up
    if (!post) {
      clearSelectedPost();
    } else {
      setExplicitSelectedPost(post);
    }
  }

  // Backwards compat shim for rest of code
  const setSelectedFullPost = (post: Post | null) => {
    setExplicitSelectedPostInner(post);
  };
  const selectedFullPost = explicitSelectedPost || selectedFullPostState;

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetchedPosts: Post[] = [];
      snap.forEach(docSnap => fetchedPosts.push({ id: docSnap.id, ...docSnap.data() } as Post));
      setPosts(fetchedPosts);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      alert("File is too large. Please upload an image under 10MB.");
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

  const handleCreatePost = async () => {
    if (!selectedImage || !user || !userData || isPosting) return;

    setIsPosting(true);
    try {
      const croppedImageBase64 = await getCroppedImg(selectedImage, croppedAreaPixels);
      
      const response = await fetch(croppedImageBase64);
      const blob = await response.blob();

      const imageRef = ref(storage, `posts/${user.uid}/${Date.now()}.jpg`);
      await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(imageRef);

      await addDoc(collection(db, "posts"), {
        authorId: user.uid,
        authorUsername: userData.username || user.email?.split('@')[0],
        authorProfilePic: userData.profilePic || "",
        imageUrl,
        caption: newCaption,
        likes: [],
        commentsEnabled: allowComments,
        createdAt: serverTimestamp()
      });

      setShowCreatePost(false);
      setNewCaption('');
      setSelectedImage(null);
      setShowCropper(false);
    } catch (e) {
      console.error("Post creation failed", e);
      alert("Failed to create post. Please check your connection.");
    } finally {
      setIsPosting(false);
    }
  };

  const handleDeletePost = async (post: Post) => {
    if (!isAdmin) return;
    const reason = promptForModerationReason("deletion");
    if (reason === null) return; 

    try {
      await deleteDoc(doc(db, "posts", post.id));
      await createNotification(
        post.authorId,
        user.uid,
        "System Admin",
        'moderation',
        'deleted_post',
        `Your post was removed. Reason: ${reason}`
      );
      alert("Post deleted by Admin.");
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  const handleSaveAdminEdit = async () => {
    if (!isAdmin || !adminEditingPost) return;
    const reason = promptForModerationReason("edit");
    if (reason === null) return;

    try {
      await updateDoc(doc(db, "posts", adminEditingPost.id), {
        caption: adminEditValue
      });
      await createNotification(
        adminEditingPost.authorId,
        user.uid,
        "System Admin",
        'moderation',
        adminEditingPost.id,
        `Your post caption was edited by a moderator. Reason: ${reason}`
      );
      setAdminEditingPost(null);
      alert("Post updated by Admin.");
    } catch (e) {
      console.error("Update failed", e);
      alert("Failed to save edits.");
    }
  };

  if (authLoading) return <div style={{ minHeight: '100vh', background: '#121212' }} />;

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <NavBar 
        user={user} 
        onShowInstall={() => setShowInstallTutorial(true)} 
        onShowAuth={() => setShowAuthModal(true)}
      />

      <main style={{ padding: '2rem 1.5rem', maxWidth: '600px', margin: '0 auto' }}>
        <UniversalSearch />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', marginTop: '2rem' }}>
          <h1 style={{ color: 'white', margin: 0, fontSize: '1.5rem' }}>Community Feed</h1>
          {user && (
            <button 
              onClick={() => setShowCreatePost(true)}
              style={{ background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', padding: '0.8rem 1.5rem', fontWeight: 'bold', cursor: 'pointer' }}
            >
              + Create Post
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ color: '#666', textAlign: 'center', padding: '4rem 0' }}>Loading feed...</div>
        ) : posts.length === 0 ? (
          <div style={{ color: '#444', textAlign: 'center', padding: '4rem 0' }}>No posts yet. Be the first to share your trip!</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {posts.map(post => (
              <article key={post.id} style={{ background: '#1a1a1a', borderRadius: '24px', border: '1px solid #333', overflow: 'hidden' }}>
                <div style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <Link to={`/profile/${post.authorUsername.replace(/\s+/g, '_')}`} style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#333', overflow: 'hidden', display: 'block' }}>
                    {post.authorProfilePic ? <img src={post.authorProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚲'}
                  </Link>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Link to={`/profile/${post.authorUsername.replace(/\s+/g, '_')}`} style={{ fontWeight: 'bold', color: 'white', fontSize: '0.9rem', textDecoration: 'none' }}>{post.authorUsername}</Link>
                      {(post.authorUsername === 'MattyFlip' || post.authorUsername === 'mattyflip') && <span style={{ background: '#ff0000', color: 'white', fontSize: '0.55rem', padding: '1px 4px', borderRadius: '3px', fontWeight: 900 }}>ADMIN</span>}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.7rem' }}>{post.createdAt?.toDate().toLocaleString()}</div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                      <button 
                        onClick={() => { setAdminEditingPost(post); setAdminEditValue(post.caption); }}
                        style={{ background: 'none', border: 'none', color: '#ffcc00', fontSize: '1.2rem', cursor: 'pointer' }}
                        title="Edit Post"
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={() => handleDeletePost(post)}
                        style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '1.2rem', cursor: 'pointer' }}
                        title="Delete Post"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ width: '100%', aspectRatio: '1/1', background: '#000', cursor: 'pointer' }} onClick={() => setSelectedFullPost(post)}>
                  <img src={post.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Ride" />
                </div>

                <div style={{ padding: '1.2rem' }}>
                  <div style={{ display: 'flex', gap: '1.2rem', marginBottom: '1rem' }}>
                    <LikeWidget post={post} user={user} onAuthNeeded={() => setShowAuthModal(true)} />
                    {post.commentsEnabled !== false && (
                      <button onClick={() => setActiveCommentPost(post)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}>💬</button>
                    )}
                    {post.tripData && (
                      <button 
                        onClick={() => handleLoadRoute(post)}
                        style={{ marginLeft: 'auto', background: 'rgba(255,102,0,0.1)', border: '1px solid #ff6600', color: '#ff6600', padding: '0.4rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem' }}
                      >
                        📍 Use Route
                      </button>
                    )}
                  </div>
                  
                  <p style={{ color: '#ccc', fontSize: '0.95rem', lineHeight: '1.5', margin: 0 }}>
                    <span style={{ fontWeight: 'bold', color: 'white', marginRight: '0.5rem' }}>{post.authorUsername}</span>
                    {post.caption}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {showCreatePost && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '500px', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Share a Trip</h2>
            
            {!selectedImage ? (
              <div style={{ border: '2px dashed #333', borderRadius: '16px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{ textAlign: 'center', color: '#666' }}>
                  <div style={{ fontSize: '2rem' }}>📸</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Select your Route Card</div>
                </div>
                <input type="file" accept="image/*" onChange={handleFileSelect} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, cursor: 'pointer' }} />
              </div>
            ) : showCropper ? (
              <div style={{ position: 'relative', height: '300px', background: '#000', borderRadius: '16px', overflow: 'hidden' }}>
                <Cropper
                  image={selectedImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>
            ) : (
              <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: '16px', overflow: 'hidden' }}>
                 <img src={selectedImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}

            {showCropper && (
              <button 
                onClick={() => setShowCropper(false)}
                style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Apply Crop
              </button>
            )}

            {!showCropper && (
              <>
                <textarea 
                  value={newCaption}
                  onChange={e => setNewCaption(e.target.value)}
                  placeholder="Tell the community about your ride..."
                  style={{ width: '100%', background: '#222', border: '1px solid #333', borderRadius: '12px', color: 'white', padding: '1rem', marginTop: '1.5rem', minHeight: '80px', fontFamily: 'inherit' }}
                />
                
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <input type="checkbox" id="allow-comments" checked={allowComments} onChange={e => setAllowComments(e.target.checked)} style={{ width: 'auto' }} />
                  <label htmlFor="allow-comments" style={{ margin: 0, textTransform: 'none', fontSize: '0.85rem', color: '#888' }}>Allow comments</label>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button onClick={() => { setShowCreatePost(false); setSelectedImage(null); }} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleCreatePost} disabled={isPosting || !selectedImage} style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', opacity: isPosting ? 0.5 : 1 }}>
                    {isPosting ? 'Posting...' : 'Share Ride'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
                   <span style={{ color: '#ff6600', fontWeight: 'bold' }}><LikeWidget post={selectedFullPost} user={user} onAuthNeeded={() => setShowAuthModal(true)} /></span>
                   {selectedFullPost.tripData && (
                     <button 
                       onClick={() => handleLoadRoute(selectedFullPost)}
                       style={{ background: 'rgba(255,102,0,0.1)', border: '1px solid #ff6600', color: '#ff6600', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                     >
                       📍 Load Route
                     </button>
                   )}
                   {(selectedFullPost.commentsEnabled !== false) && (
                     <button onClick={() => { setActiveCommentPost(selectedFullPost); setSelectedFullPost(null); }} style={{ background: '#333', border: 'none', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>View Comments</button>
                   )}
                </div>
             </div>
          </div>
        </div>
      )}

      {activeCommentPost && (
        <CommentModal 
          postId={activeCommentPost.id} 
          postAuthorId={activeCommentPost.authorId}
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
