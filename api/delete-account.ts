import { VercelRequest, VercelResponse } from '@vercel/node';
import { getApps, initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { setCorsHeaders } from './_cors.js';
import { verifyAuth } from './_auth.js';

const serviceAccount: ServiceAccount = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1'),
};

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  });
}

const db = getFirestore();
const storage = getStorage();
const auth = getAuth();

/**
 * Account Deletion API (Google Play Compliance)
 * 
 * Deletes:
 * 1. User document in Firestore
 * 2. Associated files in Storage (profile pics, bike photos, etc.)
 * 3. User record in Firebase Auth
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (setCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- AUTHENTICATION ---
  const decodedToken = await verifyAuth(req, res);
  if (!decodedToken) return;

  const userId = decodedToken.uid;

  try {
    console.log(`[DELETE ACCOUNT] Starting deletion for user: ${userId}`);

    // 1. Delete Firestore Data
    // Note: In production, we might want to also delete subcollections or associated posts.
    // For now, we delete the primary user document and associated shop/org info if applicable.
    const userRef = db.collection('users').doc(userId);
    
    // We also check for an organization owned by this user
    const orgsSnap = await db.collection('organizations').where('ownerId', '==', userId).get();
    
    const batch = db.batch();
    batch.delete(userRef);
    orgsSnap.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();

    // 2. Delete Storage Data
    // We attempt to delete the user's folders. 
    // Admin SDK doesn't have a "delete folder" but we can delete by prefix.
    const bucket = storage.bucket();
    const prefixes = [
      `profile_pics/${userId}/`,
      `bikes/${userId}/`,
      `posts/${userId}/`,
      `trips/${userId}/`
    ];

    for (const prefix of prefixes) {
      try {
        await bucket.deleteFiles({ prefix });
      } catch (e) {
        console.warn(`[DELETE ACCOUNT] Failed to delete storage prefix ${prefix}:`, e);
      }
    }

    // 3. Delete Auth User
    await auth.deleteUser(userId);

    console.log(`[DELETE ACCOUNT] Successfully deleted user: ${userId}`);
    return res.status(200).json({ data: { message: 'Account and associated data deleted successfully.' } });

  } catch (error: any) {
    console.error('[DELETE ACCOUNT] Error during deletion:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete account' });
  }
}
