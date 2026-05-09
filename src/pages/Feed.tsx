import React, { useState, useEffect } from 'react'
import { db, auth, storage } from '../firebase'
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'

interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorProfilePic?: string;
  imageUrl: string;
  caption: string;
  likes: string[];
  createdAt: any;
}

const Feed: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  const [showCreatePost, setShowCreatePost] = useState(false);
  const [newCaption, setNewCaption] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          setIsPro(data.isPro || false);
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
      setPosts(fetchedPosts);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

    // High-res Blaze limit (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("Image is too large. Please select a photo under 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCreatePost = async () => {
    if (!user || !selectedImage) return;

    // Enforce profile completeness
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
        createdAt: serverTimestamp()
      });

      setNewCaption('');
      setSelectedImage(null);
      setShowCreatePost(false);
      alert("Post shared with the community!");
    } catch (e: any) {
      console.error("Post creation failed", e);
      alert(`Failed to share: ${e.message}. Check Storage CORS settings.`);
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

              <textarea 
                placeholder="Write a caption (optional)..."
                value={newCaption}
                onChange={e => setNewCaption(e.target.value)}
                style={{ width: '100%', background: '#222', border: '1px solid #444', borderRadius: '8px', color: 'white', padding: '1rem', marginTop: '1.5rem', height: '100px', fontFamily: 'inherit' }}
              />

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
                <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
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
                
                <img src={post.imageUrl} alt="Trip Report" style={{ width: '100%', display: 'block' }} />
                
                <div style={{ padding: '1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
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
                    <span style={{ color: '#888', fontSize: '0.9rem' }}>{post.likes.length} likes</span>
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

      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default Feed;
