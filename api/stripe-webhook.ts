import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { getApps, initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const serviceAccount: ServiceAccount = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1'),
};

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-01-27.acacia' as any,
});

export const config = {
  api: {
    bodyParser: false,
  },
};

// More robust buffering for Vercel
async function getRawBody(readable: any): Promise<Buffer> {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error('Missing signature or webhook secret');
    return res.status(400).send('Webhook Error: Missing signature or secret');
  }

  const rawBody = await getRawBody(req);

  let event: Stripe.Event;

  try {
    // We pass the raw buffer directly to prevent any string-encoding issues
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Signature Verification Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const tier = session.metadata?.tier;

    if (userId) {
      try {
        const updateData: any = {
          isPro: true,
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (tier === 'host') {
          updateData.isHostTier = true;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          updateData.hostTierExpiresAt = Timestamp.fromDate(expiresAt);
        }

        await db.collection('users').doc(userId).set(updateData, { merge: true });
        console.log(`Successfully upgraded user ${userId} to ${tier === 'host' ? 'HOST' : 'PRO'}`);
      } catch (e: any) {
        console.error('Error updating user pro status in Firestore:', e.message);
        return res.status(500).send(`Database Error: ${e.message}`);
      }
    }
  }

  res.status(200).json({ received: true });
}
