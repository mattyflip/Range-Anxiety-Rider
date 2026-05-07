import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-01-27.acacia' as any,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, email, tier } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const isHost = tier === 'host';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: isHost ? 'Range Anxiety HOST TIER' : 'Range Anxiety PRO',
              description: isHost 
                ? 'Host group rides, see live riders on map, and unlock all PRO features.' 
                : 'Unlock all features and remove ads forever.',
            },
            unit_amount: isHost ? 999 : 499,
          },
          quantity: 1,
        },
      ],
      mode: isHost ? 'subscription' : 'payment',
      success_url: `${req.headers.origin}/?payment=success`,
      cancel_url: `${req.headers.origin}/?payment=cancel`,
      customer_email: email,
      metadata: {
        userId,
        tier: isHost ? 'host' : 'pro',
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe session creation error:', error);
    return res.status(500).json({ error: error.message });
  }
}
