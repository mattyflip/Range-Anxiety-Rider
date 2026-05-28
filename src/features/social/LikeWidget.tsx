import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getCountFromServer, serverTimestamp } from 'firebase/firestore';

interface LikeWidgetProps {
  post: any;
  user: any;
  onAuthNeeded: () => void;
}

const LikeWidget: React.FC<LikeWidgetProps> = ({ post, user, onAuthNeeded }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    if (user) {
      getDoc(doc(db, "posts", post.id, "likes", user.uid)).then(d => setIsLiked(d.exists()));
    }
    getCountFromServer(collection(db, "posts", post.id, "likes")).then(c => setLikeCount(c.data().count));
  }, [post.id, user]);

  const handleLike = async () => {
    if (!user) {
      onAuthNeeded();
      return;
    }
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikeCount(prev => prev + (wasLiked ? -1 : 1));

    try {
      if (wasLiked) {
        await deleteDoc(doc(db, "posts", post.id, "likes", user.uid));
      } else {
        await setDoc(doc(db, "posts", post.id, "likes", user.uid), { timestamp: serverTimestamp() });
      }
    } catch (e) {
      console.error("Like error:", e);
      setIsLiked(wasLiked);
      setLikeCount(prev => prev + (wasLiked ? 1 : -1));
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <button 
        onClick={handleLike}
        style={{ background: 'none', border: 'none', color: isLiked ? '#ff4444' : 'white', fontSize: '1.2rem', cursor: 'pointer', padding: 0 }}
      >
        {isLiked ? '🧡' : '🤍'}
      </button>
      <div style={{ color: '#666', fontWeight: 'bold', fontSize: '0.85rem' }}>
        {likeCount}
      </div>
    </div>
  );
};

export default LikeWidget;
