import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccount: ServiceAccount = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1'),
};

if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  console.error('Missing Firebase Admin credentials in .env file.');
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount),
});

const auth = getAuth();
const db = getFirestore();

async function migrateAdminUsers() {
  console.log('🔍 Searching for admin users in Firestore...');
  
  try {
    const usersSnap = await db.collection('users').where('isAdmin', '==', true).get();
    
    if (usersSnap.empty) {
      console.log('No admin users found in Firestore.');
      return;
    }

    console.log(`Found ${usersSnap.size} admin users. Starting migration...`);

    for (const doc of usersSnap.docs) {
      const uid = doc.id;
      const userData = doc.data();
      
      try {
        const user = await auth.getUser(uid);
        await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: true });
        console.log(`✅ Set admin claim for: ${uid} (${userData.email || user.email || 'No email'})`);
      } catch (authErr) {
        console.error(`❌ Failed to set claim for UID ${uid}:`, authErr);
      }
    }

    console.log('🎉 Migration complete! Admin users will need to refresh their tokens (logout/login).');
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

migrateAdminUsers();
