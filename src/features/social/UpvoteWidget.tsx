import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getCountFromServer, serverTimestamp } from 'firebase/firestore';

interface UpvoteWidgetProps {
  communityId: string;
  threadId: string;
  user: any;
  onAuthNeeded: () => void;
}

const UpvoteWidget: React.FC<UpvoteWidgetProps> = ({ communityId, threadId, user, onAuthNeeded }) => {
  const [isUpvoted, setIsUpvoted] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(0);

  useEffect(() => {
    if (user) {
      getDoc(doc(db, "communities", communityId, "threads", threadId, "upvotes", user.uid)).then(d => setIsUpvoted(d.exists()));
    }
    getCountFromServer(collection(db, "communities", communityId, "threads", threadId, "upvotes")).then(c => setUpvoteCount(c.data().count));
  }, [communityId, threadId, user]);

  const handleUpvote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      onAuthNeeded();
      return;
    }
    const wasUpvoted = isUpvoted;
    setIsUpvoted(!wasUpvoted);
    setUpvoteCount(prev => prev + (wasUpvoted ? -1 : 1));

    try {
      if (wasUpvoted) {
        await deleteDoc(doc(db, "communities", communityId, "threads", threadId, "upvotes", user.uid));
      } else {
        await setDoc(doc(db, "communities", communityId, "threads", threadId, "upvotes", user.uid), { timestamp: serverTimestamp() });
      }
    } catch (err) {
      console.error("Upvote error:", err);
      setIsUpvoted(wasUpvoted);
      setUpvoteCount(prev => prev + (wasUpvoted ? 1 : -1));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
      <button 
        onClick={handleUpvote}
        style={{ background: 'none', border: 'none', color: isUpvoted ? '#4ade80' : '#444', cursor: 'pointer', fontSize: '1.5rem', filter: isUpvoted ? 'none' : 'grayscale(100%)' }}
        title="Upvote"
      >
        🔋
      </button>
      <span style={{ color: isUpvoted ? '#4ade80' : '#888', fontWeight: 'bold' }}>{upvoteCount}</span>
    </div>
  );
};

export default UpvoteWidget;
