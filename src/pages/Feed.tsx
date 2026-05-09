import React, { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'

interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  imageUrl: string;
  caption: string;
  likes: string[];
  createdAt: any;
}

const Feed: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  useEffect(() => {
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

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212' }}>
      <NavBar 
        user={user} 
        isPro={isPro} 
        onShowAuth={() => setShowAuthModal(true)} 
        onShowInstall={() => setShowInstallTutorial(true)} 
      />

      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
        <h2 style={{ color: '#ff6600', textTransform: 'uppercase', fontSize: '1rem', letterSpacing: '0.2em', marginBottom: '2rem' }}>Community Feed</h2>
        
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
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🚲</div>
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
    </div>
  );
};

export default Feed;
