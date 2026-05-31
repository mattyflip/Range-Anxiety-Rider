import React, { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDoc, doc, updateDoc, increment, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { useParams, Link } from 'react-router-dom'
import NavBar from '../shared/ui/NavBar'
import InstallTutorial from '../shared/ui/InstallTutorial'
import AuthModal from '../features/auth/AuthModal'
import { createNotification } from '../utils/notifications'
import SEO from '../shared/ui/SEO'
import ShareButton from '../features/social/ShareButton'
import type { ForumComment, Thread, Community } from '../types';
import { useUserData } from '../hooks/useUserData';

const ThreadView: React.FC = () => {
  const { communityId, threadId } = useParams<{ communityId: string, threadId: string }>();
  const { user, userData, loading: authLoading } = useUserData();
  const [thread, setThread] = useState<Thread | null>(null);
  const [communityData, setCommunityData] = useState<Community | null>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = userData?.isAdmin || false;

  const promptForModerationReason = (action: string) => {
    const reason = window.prompt(`Reason for ${action}:`, "Violates community guidelines");
    return reason;
  };
  
  const [newComment, setNewComment] = useState('');
  const [replyText, setReplyText] = useState('');
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  // Admin states
  const [adminEditingComment, setAdminEditingComment] = useState<ForumComment | null>(null);
  const [adminEditValue, setAdminEditValue] = useState('');
  
  const [adminEditingThread, setAdminEditingThread] = useState(false);
  const [adminThreadTitle, setAdminThreadTitle] = useState('');
  const [adminThreadBody, setAdminThreadBody] = useState('');

  useEffect(() => {
    if (!communityId || !threadId) return;

    // Fetch Community Metadata
    const commRef = doc(db, "communities", communityId);
    getDoc(commRef).then(snap => {
      if (snap.exists()) setCommunityData({ id: snap.id, ...snap.data() } as Community);
    });

    // Fetch Thread Details
    const threadRef = doc(db, `communities/${communityId}/threads`, threadId);
    const unsubThread = onSnapshot(threadRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setThread({ id: snap.id, ...data } as Thread);
        setAdminThreadTitle(data.title);
        setAdminThreadBody(data.body || '');
      }
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
    if (!user || !userData || !communityId || !threadId) {
      setShowAuthModal(true);
      return;
    }

    const text = parentId ? replyText : newComment;
    if (!text.trim()) return;

    try {
      await addDoc(collection(db, `communities/${communityId}/threads/${threadId}/comments`), {
        authorId: user.uid,
        authorUsername: userData.username || "Rider",
        authorProfilePic: userData.profilePic || "",
        authorIsAdmin: userData.isAdmin || false,
        text: text,
        parentId: parentId,
        score: 0,
        upvotedBy: [],
        downvotedBy: [],
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, `communities/${communityId}/threads`, threadId), {
        commentCount: increment(1)
      });

      if (parentId) {
        setReplyText('');
        setActiveReplyId(null);
      } else {
        setNewComment('');
      }

      // Notify thread author
      if (thread && thread.authorId !== user?.uid) {
        await createNotification(
          thread.authorId,
          user?.uid || 'guest',
          userData?.username || "Rider",
          'comment',
          threadId,
          `replied to your thread: "${thread.title}"`
        );
      }
    } catch (e) {
      console.error("Comment failed", e);
    }
  };

  const handleVote = async (targetId: string, isThread: boolean, incrementVal: number) => {
    if (!user || !communityId || !threadId) {
      setShowAuthModal(true);
      return;
    }

    const docRef = isThread 
      ? doc(db, `communities/${communityId}/threads`, threadId)
      : doc(db, `communities/${communityId}/threads/${threadId}/comments`, targetId);

    const userId = user.uid;
    const target = isThread ? thread : comments.find(c => c.id === targetId);
    if (!target) return;

    const hasUpvoted = target.upvotedBy?.includes(userId);
    const hasDownvoted = target.downvotedBy?.includes(userId);

    try {
      if (incrementVal === 1) {
        if (hasUpvoted) {
          await updateDoc(docRef, { score: increment(-1), upvotedBy: arrayRemove(userId) });
        } else if (hasDownvoted) {
          await updateDoc(docRef, { score: increment(2), downvotedBy: arrayRemove(userId), upvotedBy: arrayUnion(userId) });
        } else {
          await updateDoc(docRef, { score: increment(1), upvotedBy: arrayUnion(userId) });
        }
      } else {
        if (hasDownvoted) {
          await updateDoc(docRef, { score: increment(1), downvotedBy: arrayRemove(userId) });
        } else if (hasUpvoted) {
          await updateDoc(docRef, { score: increment(-2), upvotedBy: arrayRemove(userId), downvotedBy: arrayUnion(userId) });
        } else {
          await updateDoc(docRef, { score: increment(-1), downvotedBy: arrayUnion(userId) });
        }
      }
    } catch (e) {
      console.error("Vote failed", e);
    }
  };

  const handleDeleteComment = async (comment: ForumComment) => {
    if (!isAdmin || !communityId || !threadId || !user) return;
    const reason = promptForModerationReason("comment deletion");
    if (reason === null) return;

    try {
      await deleteDoc(doc(db, `communities/${communityId}/threads/${threadId}/comments`, comment.id));
      await updateDoc(doc(db, `communities/${communityId}/threads`, threadId), {
        commentCount: increment(-1)
      });
      await createNotification(
        comment.authorId,
        user.uid,
        "System Admin",
        'moderation',
        'deleted_comment',
        `Your comment was removed by a moderator. Reason: ${reason}`
      );
      alert("Comment deleted by Admin.");
    } catch (e) {
      console.error("Delete failed", e);
      alert("Failed to delete comment.");
    }
  };

  const handleSaveAdminEdit = async () => {
    if (!isAdmin || !adminEditingComment || !communityId || !threadId || !user) return;
    const reason = promptForModerationReason("edit");
    if (reason === null) return;

    try {
      await updateDoc(doc(db, `communities/${communityId}/threads/${threadId}/comments`, adminEditingComment.id), {
        text: adminEditValue
      });
      await createNotification(
        adminEditingComment.authorId,
        user.uid,
        "System Admin",
        'moderation',
        adminEditingComment.id,
        `Your comment was edited by a moderator. Reason: ${reason}`
      );
      setAdminEditingComment(null);
      alert("Comment updated by Admin.");
    } catch (e) {
      console.error("Update failed", e);
      alert("Failed to save edits.");
    }
  };

  const handleSaveThreadAdminEdit = async () => {
    if (!isAdmin || !communityId || !threadId || !user || !thread) return;
    const reason = promptForModerationReason("thread edit");
    if (reason === null) return;

    try {
      await updateDoc(doc(db, `communities/${communityId}/threads`, threadId), {
        title: adminThreadTitle,
        body: adminThreadBody
      });
      await createNotification(
        thread.authorId,
        user.uid,
        "System Admin",
        'moderation',
        threadId,
        `Your thread was edited by a moderator. Reason: ${reason}`
      );
      setAdminEditingThread(false);
      alert("Thread updated by Admin.");
    } catch (e) {
      console.error("Update failed", e);
      alert("Failed to save thread edits.");
    }
  };

  const renderComments = (parentId: string | null = null, depth: number = 0) => {
    const filtered = comments.filter(c => c.parentId === parentId);
    if (filtered.length === 0) return null;

    return (
      <div style={{ marginLeft: depth > 0 ? '1.5rem' : 0, borderLeft: depth > 0 ? '1px solid #333' : 'none', paddingLeft: depth > 0 ? '1rem' : 0 }}>
        {filtered.map(comment => (
          <div key={comment.id} style={{ marginTop: '1.5rem' }}>
             <div style={{ display: 'flex', gap: '0.8rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                   <button onClick={() => handleVote(comment.id, false, 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>🔋</button>
                   <span style={{ color: '#888', fontSize: '0.75rem', fontWeight: 'bold' }}>{comment.score || 0}</span>
                   <button onClick={() => handleVote(comment.id, false, -1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>🪫</button>
                </div>
                <div style={{ flex: 1 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                      <Link to={`/profile/${comment.authorUsername.replace(/\s+/g, '_')}`} style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#333', overflow: 'hidden' }}>
                        {comment.authorProfilePic ? <img src={comment.authorProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚲'}
                      </Link>
                      <Link to={`/profile/${comment.authorUsername.replace(/\s+/g, '_')}`} style={{ color: '#ff6600', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.85rem' }}>{comment.authorUsername}</Link>
                      {comment.authorIsAdmin && <span style={{ background: '#ff0000', color: 'white', fontSize: '0.45rem', padding: '1px 2px', borderRadius: '2px', fontWeight: 900 }}>ADMIN</span>}
                      <span style={{ color: '#444', fontSize: '0.7rem' }}>{comment.createdAt?.toDate().toLocaleString()}</span>
                   </div>
                   <p style={{ color: '#ccc', margin: 0, fontSize: '0.95rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{comment.text}</p>
                   
                   <div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem' }}>
                      <button onClick={() => setActiveReplyId(activeReplyId === comment.id ? null : comment.id)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>Reply</button>
                      {isAdmin && (
                        <>
                          <button onClick={() => { setAdminEditingComment(comment); setAdminEditValue(comment.text); }} style={{ background: 'none', border: 'none', color: '#ffcc00', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>Edit</button>
                          <button onClick={() => handleDeleteComment(comment)} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>Delete</button>
                        </>
                      )}
                   </div>

                   {activeReplyId === comment.id && (
                     <div style={{ marginTop: '1rem' }}>
                        <textarea 
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Write a reply..."
                          style={{ width: '100%', background: '#222', border: '1px solid #333', borderRadius: '12px', color: 'white', padding: '1rem', minHeight: '80px', fontFamily: 'inherit', outline: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.5rem' }}>
                          <button onClick={() => handleSubmitComment(comment.id)} disabled={!replyText.trim()} style={{ background: '#ff6600', color: 'white', border: 'none', borderRadius: '8px', padding: '0.5rem 1.2rem', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>Post Reply</button>
                          <button onClick={() => setActiveReplyId(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                        </div>
                     </div>
                   )}
                </div>
             </div>
             {renderComments(comment.id, depth + 1)}
          </div>
        ))}
      </div>
    );
  };

  if (loading || authLoading) return <div style={{ minHeight: '100vh', background: '#121212' }} />;
  if (!thread) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>Thread not found.</div>;

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', overflowY: 'auto' }}>
      <SEO 
        title={thread.title} 
        description={thread.body?.substring(0, 160) || "Join the discussion on Range Anxiety."}
      />
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />

      <main style={{ padding: '2rem 1.5rem', maxWidth: '800px', margin: '0 auto' }}>
        <Link to={`/forum/c/${communityId}`} style={{ color: '#888', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase' }}>← Back to c/{communityData?.name || communityId}</Link>
        
        <article style={{ marginTop: '2rem', background: '#1a1a1a', borderRadius: '24px', border: '1px solid #333', padding: '2rem' }}>
           <div style={{ display: 'flex', gap: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', background: '#121212', padding: '0.8rem', borderRadius: '12px', height: 'fit-content' }}>
                 <button onClick={() => handleVote(thread.id, true, 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🔋</button>
                 <span style={{ color: 'white', fontWeight: 900, fontSize: '1.1rem' }}>{thread.score}</span>
                 <button onClick={() => handleVote(thread.id, true, -1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🪫</button>
              </div>
              <div style={{ flex: 1 }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
                    <Link to={`/profile/${thread.authorUsername.replace(/\s+/g, '_')}`} style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#333', overflow: 'hidden' }}>
                      {thread.authorProfilePic ? <img src={thread.authorProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚲'}
                    </Link>
                    <div style={{ fontSize: '0.8rem' }}>
                      <Link to={`/profile/${thread.authorUsername.replace(/\s+/g, '_')}`} style={{ color: 'white', fontWeight: 'bold', textDecoration: 'none' }}>{thread.authorUsername}</Link>
                      {thread?.authorIsAdmin && <span style={{ background: '#ff0000', color: 'white', fontSize: '0.5rem', padding: '1px 3px', borderRadius: '2px', fontWeight: 900, marginLeft: '0.4rem' }}>ADMIN</span>}
                      <div style={{ color: '#555', marginTop: '2px' }}>{thread.createdAt?.toDate().toLocaleString()}</div>
                    </div>
                    {isAdmin && (
                      <button onClick={() => setAdminEditingThread(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ffcc00', fontSize: '1.2rem', cursor: 'pointer' }}>✏️</button>
                    )}
                 </div>
                 
                 <h1 style={{ color: 'white', margin: '0 0 1.5rem 0', fontSize: '1.8rem', lineHeight: '1.2' }}>{thread.title}</h1>
                 
                 {thread.mediaUrl && (
                   <div style={{ marginBottom: '1.5rem', borderRadius: '16px', overflow: 'hidden', border: '1px solid #333', background: '#000' }}>
                      {thread.mediaType === 'video' ? (
                        <video src={thread.mediaUrl} controls style={{ width: '100%', display: 'block' }} />
                      ) : (
                        <img src={thread.mediaUrl} style={{ width: '100%', display: 'block' }} />
                      )}
                   </div>
                 )}

                 <p style={{ color: '#ccc', fontSize: '1.1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{thread.body}</p>
                 
                 <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                    <ShareButton 
                      title={thread.title}
                      text={thread.body}
                      url={window.location.href}
                    />
                 </div>
              </div>
           </div>
        </article>

        <section style={{ marginTop: '3rem' }}>
           <h3 style={{ color: 'white', marginBottom: '1.5rem' }}>{thread.commentCount} Comments</h3>
           
           {user ? (
             <div style={{ marginBottom: '3rem' }}>
                <textarea 
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="What are your thoughts?"
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: '16px', color: 'white', padding: '1.2rem', minHeight: '120px', fontFamily: 'inherit', outline: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                   <button onClick={() => handleSubmitComment()} disabled={!newComment.trim()} style={{ background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', padding: '0.8rem 2rem', fontWeight: 'bold', cursor: 'pointer', opacity: !newComment.trim() ? 0.5 : 1 }}>Post Comment</button>
                </div>
             </div>
           ) : (
             <div style={{ padding: '2rem', background: '#1a1a1a', borderRadius: '16px', textAlign: 'center', border: '1px dashed #333', marginBottom: '3rem' }}>
                <p style={{ color: '#666' }}>Sign in to join the discussion.</p>
                <button onClick={() => setShowAuthModal(true)} style={{ background: '#ff6600', color: 'white', border: 'none', borderRadius: '8px', padding: '0.6rem 1.5rem', fontWeight: 'bold', cursor: 'pointer', marginTop: '0.5rem' }}>Log In</button>
             </div>
           )}

           {renderComments()}
        </section>
      </main>

      {/* Admin Comment Edit Modal */}
      {adminEditingComment && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '450px', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Admin Comment Edit</h2>
            <p style={{ color: '#ffcc00', fontSize: '0.8rem', fontWeight: 'bold' }}>MODERATION MODE</p>
            <textarea 
              value={adminEditValue}
              onChange={(e) => setAdminEditValue(e.target.value)}
              style={{ width: '100%', height: '150px', background: '#222', border: '1px solid #444', borderRadius: '12px', color: 'white', padding: '1rem', fontFamily: 'inherit', marginBottom: '1.5rem' }}
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setAdminEditingComment(null)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveAdminEdit} style={{ flex: 2, padding: '1rem', background: '#ffcc00', color: '#000', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Thread Edit Modal */}
      {adminEditingThread && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '600px', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Admin Thread Edit</h2>
            <p style={{ color: '#ffcc00', fontSize: '0.8rem', fontWeight: 'bold' }}>MODERATION MODE</p>
            
            <input 
              value={adminThreadTitle}
              onChange={(e) => setAdminThreadTitle(e.target.value)}
              style={{ width: '100%', background: '#222', border: '1px solid #444', borderRadius: '12px', color: 'white', padding: '1rem', marginBottom: '1rem' }}
            />
            <textarea 
              value={adminThreadBody}
              onChange={(e) => setAdminThreadBody(e.target.value)}
              style={{ width: '100%', height: '200px', background: '#222', border: '1px solid #444', borderRadius: '12px', color: 'white', padding: '1rem', fontFamily: 'inherit', marginBottom: '1.5rem' }}
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setAdminEditingThread(false)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveThreadAdminEdit} style={{ flex: 2, padding: '1rem', background: '#ffcc00', color: '#000', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
    </div>
  );
};

export default ThreadView;
