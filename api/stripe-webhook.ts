import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { getApps, initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const serviceAccount: ServiceAccount = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
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

async function buffer(readable: any) {
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

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret as string);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const tier = session.metadata?.tier;

    console.log('Checkout completed for session:', session.id);
    console.log('Metadata userId:', userId);
    console.log('Metadata tier:', tier);

    if (userId) {
      try {
        console.log(`Attempting to upgrade user ${userId} to PRO in Firestore...`);
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
    } else {
      console.warn('No userId found in session metadata. Upgrade skipped.');
    }
  }

  res.status(200).json({ received: true });
}
