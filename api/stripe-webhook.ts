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
  apiVersion: '2026-04-22.dahlia',
});

export const config = {
  api: {
    bodyParser: false,
  },
};

// --- HELPERS ---

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// --- EVENT HANDLERS ---

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const tier = session.metadata?.tier;

  if (!userId || typeof userId !== 'string' || userId.length > 128) {
    console.error(`[SECURITY] Invalid or missing userId in session metadata: ${userId}`);
    return;
  }

  const updateData: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  const now = new Date();

  if (tier === 'shop') {
    updateData.isShopTier = true;
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 31);
    updateData.shopTierExpiresAt = Timestamp.fromDate(expiresAt);
  } else if (tier === 'group_ride') {
    updateData.canHostGroupRide = true;
    const expiresAt = new Date(now);
    expiresAt.setHours(expiresAt.getHours() + 24);
    updateData.groupRideExpiresAt = Timestamp.fromDate(expiresAt);
  } else {
    console.warn(`[SECURITY] Received unhandled or invalid tier in webhook: ${tier}`);
    return;
  }

  await db.collection('users').doc(userId).set(updateData, { merge: true });
  console.log(`Successfully upgraded user ${userId} to ${tier}`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const invoiceExt = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  const subscriptionId = typeof invoiceExt.subscription === 'string' ? invoiceExt.subscription : invoiceExt.subscription?.id;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata?.userId;

  if (userId) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 31);
    await db.collection('users').doc(userId).update({
      shopTierExpiresAt: Timestamp.fromDate(expiresAt),
      isShopTier: true
    });
    console.log(`Successfully renewed SHOP TIER for user ${userId}`);
  }
}

async function handleSubscriptionDeletedOrFailed(obj: Stripe.Subscription | Stripe.Invoice) {
  let subscriptionId: string | undefined;
  if ('subscription' in obj) {
    const invoiceExt = obj as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
    subscriptionId = typeof invoiceExt.subscription === 'string' ? invoiceExt.subscription : invoiceExt.subscription?.id;
  } else {
    subscriptionId = obj.id;
  }

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata?.userId;

  if (userId) {
    await db.collection('users').doc(userId).update({
      isShopTier: false
    });
    console.log(`Successfully deactivated SHOP TIER for user ${userId}`);
  }
}

// --- MAIN HANDLER ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).send('Webhook Error: Missing signature or secret');
  }

  try {
    const rawBody = await getRawBody(req);
    const event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.deleted':
      case 'invoice.payment_failed':
        await handleSubscriptionDeletedOrFailed(event.data.object as Stripe.Subscription | Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Webhook Processing Error: ${errorMsg}`);
    return res.status(400).send(`Webhook Error: ${errorMsg}`);
  }
}
