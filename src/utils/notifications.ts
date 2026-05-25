import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type NotificationType = 'like' | 'comment' | 'upvote' | 'review' | 'moderation' | 'rental_request';

export const createNotification = async (
  targetUserId: string,
  senderId: string,
  senderUsername: string,
  type: NotificationType,
  relatedId: string, // postId, threadId, or reviewId
  content?: string
) => {
  if (targetUserId === senderId) return; // Don't notify yourself

  try {
    await addDoc(collection(db, `users/${targetUserId}/notifications`), {
      senderId,
      senderUsername,
      type,
      relatedId,
      content: content || '',
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Failed to create notification:", e);
  }
};
