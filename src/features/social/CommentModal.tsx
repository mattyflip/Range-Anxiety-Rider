import React, { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDoc, doc, updateDoc, increment } from 'firebase/firestore'
import { createNotification } from '../utils/notifications'

interface Comment {
  id: string;
  authorId: string;
  authorUsername: string;
  authorProfilePic?: string;
  text: string;
  createdAt: any;
}

interface CommentModalProps {
  postId: string;
  postAuthorId?: string;
  onClose: () => void;
  user: any;
}

const CommentModal: React.FC<CommentModalProps> = ({ postId, postAuthorId, onClose, user }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, `posts/${postId}/comments`),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched: Comment[] = [];
      snap.forEach(docSnap => {
        fetched.push({ id: docSnap.id, ...docSnap.data() } as Comment);
      });
      setComments(fetched);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [postId]);

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !user) return;

    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const userData = userSnap.exists() ? userSnap.data() : {};
      
      await addDoc(collection(db, `posts/${postId}/comments`), {
        authorId: user.uid,
        authorUsername: userData.username || user.email?.split('@')[0] || "Rider",
        authorProfilePic: userData.profilePic || "",
        text: newComment,
        createdAt: serverTimestamp()
      });

      // Notify post author
      if (postAuthorId && postAuthorId !== user.uid) {
        await createNotification(
          postAuthorId,
          user.uid,
          userData.username || "Rider",
          'comment',
          postId,
          newComment
        );
      }

      // Update comment count on post
      await updateDoc(doc(db, "posts", postId), {
        commentCount: increment(1)
      });

      setNewComment('');
    } catch (e) {
      console.error("Comment failed", e);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(10px)' }}>
      <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '500px', height: '80vh', borderRadius: '24px', border: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: 'white', margin: 0 }}>Comments</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {loading ? (
            <div style={{ color: '#666', textAlign: 'center' }}>Loading comments...</div>
          ) : comments.length === 0 ? (
            <div style={{ color: '#444', textAlign: 'center', marginTop: '2rem' }}>No comments yet. Start the conversation!</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {comments.map(comment => (
                <div key={comment.id} style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#333', overflow: 'hidden', flexShrink: 0 }}>
                    {comment.authorProfilePic ? <img src={comment.authorProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚲'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', color: 'white', fontSize: '0.85rem' }}>{comment.authorUsername}</div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', marginTop: '0.2rem', lineHeight: '1.4' }}>{comment.text}</div>
                    <div style={{ color: '#444', fontSize: '0.65rem', marginTop: '0.4rem' }}>{comment.createdAt?.toDate().toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '1.5rem', borderTop: '1px solid #333', background: '#121212' }}>
          {user ? (
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <input 
                type="text" 
                placeholder="Write a comment..." 
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSubmitComment()}
                style={{ flex: 1, background: '#1a1a1a', border: '1px solid #333', borderRadius: '20px', padding: '0.7rem 1.2rem', color: 'white', outline: 'none' }}
              />
              <button 
                onClick={handleSubmitComment}
                disabled={!newComment.trim()}
                style={{ background: '#ff6600', color: 'white', border: 'none', borderRadius: '20px', padding: '0 1.2rem', fontWeight: 'bold', cursor: 'pointer', opacity: !newComment.trim() ? 0.5 : 1 }}
              >
                Post
              </button>
            </div>
          ) : (
            <div style={{ color: '#666', textAlign: 'center', fontSize: '0.85rem' }}>Sign in to join the conversation.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommentModal;
