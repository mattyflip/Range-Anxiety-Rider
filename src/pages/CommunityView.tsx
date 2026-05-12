import React, { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDoc, doc, updateDoc, increment, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { useParams, Link } from 'react-router-dom'
import NavBar from '../components/NavBar'
import InstallTutorial from '../components/InstallTutorial'
import AuthModal from '../components/AuthModal'
import { createNotification } from '../utils/notifications'

interface Thread {
  id: string;
  authorId: string;
  authorUsername: string;
  title: string;
  body: string;
  score: number;
  commentCount: number;
  upvotedBy: string[];
  downvotedBy: string[];
  createdAt: any;
}

const CommunityView: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);

  const isAdmin = user?.email?.toLowerCase() === 'mattyfliptv@gmail.com';

  const promptForModerationReason = (action: string) => {
    const reason = window.prompt(`Reason for ${action}:`, "Violates community guidelines");
    return reason;
  };

  const [showCreateThread, setShowCreatePost] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) setUserData(snap.data());
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!communityId) return;

    const q = query(
      collection(db, `communities/${communityId}/threads`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched: Thread[] = [];
      snap.forEach(docSnap => {
        fetched.push({ id: docSnap.id, ...docSnap.data() } as Thread);
      });
      setThreads(fetched);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [communityId]);

  const handleCreateThread = async () => {
    if (!newTitle.trim() || !user || !userData || !communityId) return;

    try {
      await addDoc(collection(db, `communities/${communityId}/threads`), {
        authorId: user.uid,
        authorUsername: userData.username || user.email?.split('@')[0],
        title: newTitle,
        body: newBody,
        score: 0,
        commentCount: 0,
        upvotedBy: [],
        downvotedBy: [],
        createdAt: serverTimestamp()
      });

      setShowCreatePost(false);
      setNewTitle('');
      setNewBody('');
    } catch (e) {
      console.error("Thread creation failed", e);
    }
  };

  const handleVote = async (thread: Thread, incrementVal: number) => {
    if (!user || !communityId) {
      setShowAuthModal(true);
      return;
    }

    const threadRef = doc(db, `communities/${communityId}/threads`, thread.id);
    const userId = user.uid;
    const hasUpvoted = thread.upvotedBy?.includes(userId);
    const hasDownvoted = thread.downvotedBy?.includes(userId);

    try {
      if (incrementVal === 1) {
        if (!hasUpvoted && thread.authorId !== user.uid) {
           await createNotification(thread.authorId, user.uid, userData?.username || "Rider", 'upvote', thread.id);
        }

        if (hasUpvoted) {
          await updateDoc(threadRef, { score: increment(-1), upvotedBy: arrayRemove(userId) });
        } else if (hasDownvoted) {
          await updateDoc(threadRef, { score: increment(2), downvotedBy: arrayRemove(userId), upvotedBy: arrayUnion(userId) });
        } else {
          await updateDoc(threadRef, { score: increment(1), upvotedBy: arrayUnion(userId) });
        }
      } else {
        if (hasDownvoted) {
          await updateDoc(threadRef, { score: increment(1), downvotedBy: arrayRemove(userId) });
        } else if (hasUpvoted) {
          await updateDoc(threadRef, { score: increment(-2), upvotedBy: arrayRemove(userId), downvotedBy: arrayUnion(userId) });
        } else {
          await updateDoc(threadRef, { score: increment(-1), downvotedBy: arrayUnion(userId) });
        }
      }
    } catch (e) {
      console.error("Vote failed", e);
    }
  };

  const handleDeleteThread = async (thread: Thread) => {
    if (!isAdmin || !communityId) return;
    const reason = promptForModerationReason("thread deletion");
    if (reason === null) return;

    try {
      await deleteDoc(doc(db, `communities/${communityId}/threads`, thread.id));
      await createNotification(
        thread.authorId,
        user.uid,
        "System Admin",
        'moderation',
        'deleted_thread',
        `Your thread was removed by a moderator. Reason: ${reason}`
      );
      alert("Thread deleted by Admin.");
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
      <main style={{ padding: '2rem 1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
          <div><Link to="/forum" style={{ color: '#888', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 'bold' }}>FORUM HUB</Link><h1 style={{ color: 'white', margin: '0.2rem 0 0 0', fontSize: '1.8rem' }}>c/{communityId}</h1></div>
          {user && <button onClick={() => setShowCreatePost(true)} style={{ background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', padding: '0.8rem 1.5rem', fontWeight: 'bold', cursor: 'pointer' }}>New Thread</button>}
        </div>
        {loading ? <div style={{ color: '#666', textAlign: 'center', padding: '4rem 0' }}>Loading community...</div> : threads.length === 0 ? <div style={{ color: '#444', textAlign: 'center', padding: '4rem 0' }}>No discussions yet. Start one!</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {threads.map(thread => (
              <div key={thread.id} style={{ background: '#1a1a1a', borderRadius: '20px', border: '1px solid #333', padding: '1.2rem', display: 'flex', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', background: '#121212', padding: '0.6rem', borderRadius: '10px', height: 'fit-content' }}>
                   <button onClick={() => handleVote(thread, 1)} style={{ background: 'none', border: 'none', color: thread.upvotedBy?.includes(user?.uid) ? '#4ade80' : '#444', cursor: 'pointer', fontSize: '1.2rem' }}>🔋</button>
                   <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{thread.score}</span>
                   <button onClick={() => handleVote(thread, -1)} style={{ background: 'none', border: 'none', color: thread.downvotedBy?.includes(user?.uid) ? '#f87171' : '#444', cursor: 'pointer', fontSize: '1.2rem' }}>🪫</button>
                </div>
                <div style={{ flex: 1 }}>
                   <div style={{ fontSize: '0.65rem', color: '#555', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                     Posted by <Link to={`/profile/${thread.authorUsername.replace(/\s+/g, '_')}`} style={{ color: '#777', textDecoration: 'none' }}>{thread.authorUsername}</Link>
                     {(thread.authorUsername === 'MattyFlip' || thread.authorUsername === 'mattyflip') && <span style={{ background: '#ff0000', color: 'white', fontSize: '0.5rem', padding: '1px 3px', borderRadius: '2px', fontWeight: 900 }}>ADMIN</span>}
                   </div>
                   <Link to={`/forum/c/${communityId}/t/${thread.id}`} style={{ textDecoration: 'none' }}><h2 style={{ color: 'white', margin: '0 0 0.5rem 0', fontSize: '1.2rem', lineHeight: '1.4' }}>{thread.title}</h2></Link>
                   <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#666', fontWeight: 'bold' }}>💬 {thread.commentCount} Comments</div>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: '0.8rem', borderLeft: '1px solid #333', paddingLeft: '1rem' }}>
                          <button onClick={() => handleDeleteThread(thread)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                        </div>
                      )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      {showCreateThread && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '600px', padding: '2.5rem', borderRadius: '24px', border: '1px solid #333' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Start a Discussion</h2>
            <div className="form-group" style={{ marginTop: '1.5rem' }}><label>Thread Title</label><input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="What's on your mind?" style={{ background: '#222', border: '1px solid #333', borderRadius: '12px', color: 'white', padding: '1rem', width: '100%', outline: 'none' }} /></div>
            <div className="form-group" style={{ marginTop: '1.5rem' }}><label>Body (Optional)</label><textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="Explain in more detail..." style={{ background: '#222', border: '1px solid #333', borderRadius: '12px', color: 'white', padding: '1rem', width: '100%', minHeight: '150px', outline: 'none', fontFamily: 'inherit' }} /></div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
              <button onClick={() => setShowCreatePost(false)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={handleCreateThread} disabled={!newTitle.trim()} style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', opacity: !newTitle.trim() ? 0.5 : 1 }}>Create Thread</button>
            </div>
          </div>
        </div>
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
    </div>
  );
};

export default CommunityView;
