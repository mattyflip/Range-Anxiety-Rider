import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { getApps, initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-01-27.acacia' as any,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  const { userId, email, tier } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (decodedToken.uid !== userId) {
    return res.status(403).json({ error: 'Forbidden: Cannot checkout for another user' });
  }

  let unit_amount = 0;
  let product_name = "";
  let product_description = "";
  let mode: Stripe.Checkout.Session.Mode = 'payment';
  let isSubscription = false;

  if (tier === 'shop') {
    unit_amount = 4999;
    product_name = 'Range Anxiety SHOP TIER';
    product_description = 'Professional fleet management, live unit tracking, and shop-specific physics tools.';
    mode = 'subscription';
    isSubscription = true;
  } else if (tier === 'group_ride') {
    unit_amount = 999;
    product_name = 'Group Ride Host Pass';
    product_description = 'Host a group ride and see all participants live on the map for 24 hours.';
    mode = 'payment';
  } else {
    return res.status(400).json({ error: 'Invalid tier selected' });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: product_name,
              description: product_description,
            },
            unit_amount: unit_amount,
            ...(isSubscription && { recurring: { interval: 'month' } }),
          },
          quantity: 1,
        },
      ],
      mode: mode,
      success_url: `${req.headers.origin}/?payment=success`,
      cancel_url: `${req.headers.origin}/?payment=cancel`,
      customer_email: email || decodedToken.email,
      metadata: {
        userId,
        tier: tier || 'free',
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe session creation error:', error);
    return res.status(500).json({ error: error.message });
  }
}
