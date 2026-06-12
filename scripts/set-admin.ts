import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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

async function setAdminClaim() {
  const uid = process.argv[2];
  const removeFlag = process.argv[3];

  if (!uid) {
    console.error('Usage: npx ts-node scripts/set-admin.ts <uid> [--remove]');
    process.exit(1);
  }

  try {
    const user = await auth.getUser(uid);
    const isAdmin = removeFlag !== '--remove';
    
    await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: isAdmin });
    
    console.log(`Successfully set admin=${isAdmin} custom claim for user ${uid} (${user.email || 'No email'})`);
    console.log('The user may need to log out and log back in for the token to refresh.');
  } catch (error) {
    console.error('Error setting custom claim:', error);
  }
}

setAdminClaim();
