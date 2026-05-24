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

  const isShop = tier === 'shop';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: isShop ? 'Range Anxiety SHOP TIER' : 'Range Anxiety PRO',
              description: isShop 
                ? 'Professional fleet management, live unit tracking, and shop-specific physics tools.' 
                : 'Unlock all features and remove ads forever.',
            },
            unit_amount: isShop ? 4999 : 499,
            ...(isShop && { recurring: { interval: 'month' } }),
          },
          quantity: 1,
        },
      ],
      mode: isShop ? 'subscription' : 'payment',
      success_url: `${req.headers.origin}/?payment=success`,
      cancel_url: `${req.headers.origin}/?payment=cancel`,
      customer_email: email || decodedToken.email,
      metadata: {
        userId,
        tier: isShop ? 'shop' : 'pro',
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe session creation error:', error);
    return res.status(500).json({ error: error.message });
  }
}
