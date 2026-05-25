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
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
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
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (tier === 'shop') {
          updateData.isShopTier = true;
          // Shop tier is monthly, but we set an initial expiry for 31 days 
          // to be safe before the next invoice.payment_succeeded
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 31);
          updateData.shopTierExpiresAt = Timestamp.fromDate(expiresAt);
        } else if (tier === 'group_ride') {
          updateData.canHostGroupRide = true;
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          updateData.groupRideExpiresAt = Timestamp.fromDate(expiresAt);
        } else {
          console.log(`Unhandled tier: ${tier}`);
        }

        await db.collection('users').doc(userId).set(updateData, { merge: true });
        console.log(`Successfully upgraded user ${userId} to ${tier}`);
      } catch (e: any) {
        console.error('Error updating user status in Firestore:', e.message);
        return res.status(500).send(`Database Error: ${e.message}`);
      }
    }
  }

  // Handle subscription renewals for SHOP TIER
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as any;
    const subscriptionId = invoice.subscription as string;
    
    // Fetch subscription to get metadata
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.userId;

      if (userId) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 31);
        await db.collection('users').doc(userId).update({
          shopTierExpiresAt: Timestamp.fromDate(expiresAt),
          isShopTier: true
        });
      }
    }
  }

  // Handle cancellation/failure
  if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
    const obj = event.data.object as any;
    const subscriptionId = obj.subscription || obj.id;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = subscription.metadata?.userId;

    if (userId) {
      await db.collection('users').doc(userId).update({
        isShopTier: false
      });
    }
  }

  res.status(200).json({ received: true });
}
