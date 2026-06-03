import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type NotificationType = 'like' | 'comment' | 'upvote' | 'review' | 'moderation' | 'rental_request' | 'rental_approved' | 'rental_declined' | 'fleet_alert';

export const createNotification = async (
  targetUserId: string,
  senderId: string,
  senderUsername: string,
  type: NotificationType,
  relatedId: string, // postId, threadId, or reviewId
  content?: string,
  relatedText?: string
) => {
  if (targetUserId === senderId) return; // Don't notify yourself

  try {
    await addDoc(collection(db, `users/${targetUserId}/notifications`), {
      fromId: senderId,
      fromName: senderUsername,
      senderId,       // keep for compat
      senderUsername, // keep for compat
      type,
      relatedId,
      content: content || '',
      relatedText: relatedText || '',
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Failed to create notification:", e);
  }
};
