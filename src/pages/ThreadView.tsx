import React, { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDoc, doc, updateDoc, increment } from 'firebase/firestore'
import { useParams, Link } from 'react-router-dom'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'

interface ForumComment {
  id: string;
  authorId: string;
  authorUsername: string;
  authorProfilePic?: string;
  text: string;
  parentId?: string | null;
  createdAt: any;
}

const ThreadView: React.FC = () => {
  const { communityId, threadId } = useParams<{ communityId: string, threadId: string }>();
  const [thread, setThread] = useState<any>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  
  const [replyText, setReplyText] = useState('');
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!communityId || !threadId) return;

    // Fetch Thread Details
    const threadRef = doc(db, `communities/${communityId}/threads`, threadId);
    const unsubThread = onSnapshot(threadRef, (snap) => {
      if (snap.exists()) setThread({ id: snap.id, ...snap.data() });
    });

    // Fetch Comments
    const q = query(
      collection(db, `communities/${communityId}/threads/${threadId}/comments`),
      orderBy("createdAt", "asc")
    );

    const unsubComments = onSnapshot(q, (snap) => {
      const fetched: ForumComment[] = [];
      snap.forEach(docSnap => fetched.push({ id: docSnap.id, ...docSnap.data() } as ForumComment));
      setComments(fetched);
      setLoading(false);
    });

    return () => { unsubThread(); unsubComments(); };
  }, [communityId, threadId]);

  const handleSubmitComment = async (parentId: string | null = null) => {
    if (!replyText.trim() || !user || !communityId || !threadId) return;

    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const userData = userSnap.exists() ? userSnap.data() : {};

      await addDoc(collection(db, `communities/${communityId}/threads/${threadId}/comments`), {
        authorId: user.uid,
        authorUsername: userData.username || user.email?.split('@')[0] || "Rider",
        authorProfilePic: userData.profilePic || "",
        text: replyText,
        parentId,
        createdAt: serverTimestamp()
      });

      // Update comment count on thread
      await updateDoc(doc(db, `communities/${communityId}/threads`, threadId), {
        commentCount: increment(1)
      });

      setReplyText('');
      setActiveReplyId(null);
    } catch (e) {
      console.error("Comment failed", e);
    }
  };

  const handleVote = async (incrementVal: number) => {
    if (!user || !communityId || !threadId) {
      setShowAuthModal(true);
      return;
    }
    const threadRef = doc(db, `communities/${communityId}/threads`, threadId);
    try {
      await updateDoc(threadRef, {
        score: increment(incrementVal)
      });
    } catch (e) {
      console.error("Vote failed", e);
    }
  };

  const renderComments = (parentId: string | null = null, depth = 0) => {
    return comments
      .filter(c => c.parentId === parentId)
      .map(comment => (
        <div key={comment.id} style={{ marginLeft: depth > 0 ? '1.5rem' : '0', marginTop: '1.5rem', borderLeft: depth > 0 ? '1px solid #333' : 'none', paddingLeft: depth > 0 ? '1rem' : '0' }}>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <Link to={`/profile/${comment.authorUsername}`} style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#333', overflow: 'hidden', flexShrink: 0, display: 'block' }}>
              {comment.authorProfilePic ? <img src={comment.authorProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚲'}
            </Link>
            <div style={{ flex: 1 }}>
               <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'white' }}>
                 <Link to={`/profile/${comment.authorUsername}`} style={{ color: 'white', textDecoration: 'none' }}>{comment.authorUsername}</Link> <span style={{ color: '#444', fontWeight: 'normal', marginLeft: '0.5rem' }}>• {comment.createdAt?.toDate().toLocaleString()}</span>
               </div>
               <div style={{ color: '#ccc', fontSize: '0.95rem', marginTop: '0.4rem', lineHeight: '1.5' }}>{comment.text}</div>
               
               {user && (
                 <button 
                   onClick={() => setActiveReplyId(comment.id)}
                   style={{ background: 'none', border: 'none', color: '#ff6600', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', marginTop: '0.5rem', padding: 0 }}
                 >
                   Reply
                 </button>
               )}

               {activeReplyId === comment.id && (
                 <div style={{ marginTop: '1rem' }}>
                    <textarea 
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder={`Reply to ${comment.authorUsername}...`}
                      style={{ width: '100%', background: '#121212', border: '1px solid #333', borderRadius: '8px', color: 'white', padding: '0.8rem', fontSize: '0.9rem', fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                       <button onClick={() => handleSubmitComment(comment.id)} style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Post Reply</button>
                       <button onClick={() => setActiveReplyId(null)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                    </div>
                 </div>
               )}
            </div>
          </div>
          {renderComments(comment.id, depth + 1)}
        </div>
      ));
  };

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} />

      <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <Link to={`/forum/c/${communityId}`} style={{ color: '#ff6600', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '1.5rem' }}>← Back to c/{communityId}</Link>

        {thread && (
          <article style={{ background: '#1a1a1a', borderRadius: '24px', border: '1px solid #333', padding: '2rem', marginBottom: '2rem', display: 'flex', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', background: '#121212', padding: '1rem', borderRadius: '12px', alignSelf: 'flex-start' }}>
               <button onClick={() => handleVote(1)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.5rem' }}>▲</button>
               <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.1rem' }}>{thread.score}</span>
               <button onClick={() => handleVote(-1)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.5rem' }}>▼</button>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.7rem', color: '#444', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '1rem' }}>
                Posted by <Link to={`/profile/${thread.authorUsername.replace(/\s+/g, '_')}`} style={{ color: '#888', textDecoration: 'none' }}>{thread.authorUsername}</Link> • {thread.createdAt?.toDate().toLocaleString()}
              </div>
              <h1 style={{ color: 'white', margin: 0, fontSize: '1.8rem', lineHeight: '1.3' }}>{thread.title}</h1>
              {thread.body && (
                <div style={{ color: '#ccc', fontSize: '1.1rem', lineHeight: '1.6', marginTop: '1.5rem', whiteSpace: 'pre-wrap' }}>
                  {thread.body}
                </div>
              )}
              <div style={{ marginTop: '2rem', borderTop: '1px solid #333', paddingTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                 <div style={{ color: '#666', fontWeight: 'bold', fontSize: '0.9rem' }}>💬 {thread.commentCount} Comments</div>
              </div>
            </div>
          </article>
        )}

        <section>
          <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '20px', border: '1px solid #333' }}>
            {user ? (
              <>
                <label style={{ color: '#ff6600', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', display: 'block', marginBottom: '0.8rem' }}>Leave a comment</label>
                <textarea 
                  value={activeReplyId === null ? replyText : ''}
                  onChange={e => activeReplyId === null && setReplyText(e.target.value)}
                  placeholder="Share your thoughts..."
                  style={{ width: '100%', background: '#121212', border: '1px solid #333', borderRadius: '12px', color: 'white', padding: '1rem', minHeight: '100px', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                   <button 
                     onClick={() => handleSubmitComment(null)}
                     disabled={activeReplyId !== null || !replyText.trim()}
                     style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.6rem 2rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: (activeReplyId !== null || !replyText.trim()) ? 0.5 : 1 }}
                   >
                     Post Comment
                   </button>
                </div>
              </>
            ) : (
              <div style={{ color: '#666', textAlign: 'center', padding: '1rem' }}>Sign in to join the discussion.</div>
            )}
          </div>

          <div style={{ marginTop: '2rem' }}>
            {loading ? (
              <div style={{ color: '#666', textAlign: 'center' }}>Loading comments...</div>
            ) : comments.length === 0 ? (
              <div style={{ color: '#444', textAlign: 'center', padding: '2rem' }}>No comments yet.</div>
            ) : (
              renderComments(null)
            )}
          </div>
        </section>
      </main>

      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default ThreadView;
