import { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { getApps, initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setCorsHeaders } from './_cors.js';
import { verifyAuth } from './_auth.js';
import { z } from 'zod';

const EmailRequestSchema = z.object({
  to: z.string().email(),
  subject: z.string().max(255),
  text: z.string().optional(),
  html: z.string().optional(),
}).refine(data => data.text || data.html, {
  message: "Email content (text or html) is required",
});

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

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (setCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- AUTHENTICATION ---
  const decodedToken = await verifyAuth(req, res);
  if (!decodedToken) return;

  const parsed = EmailRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.issues });
  }

  const { to, subject, text, html } = parsed.data;

  // SECURITY FIX: Verify that the recipient is either the authenticated user 
  // OR the sender is an authorized shop/fleet owner.
  if (to.toLowerCase() !== decodedToken.email?.toLowerCase()) {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    
    const isFleetOwner = userData?.role === 'fleet' || userData?.isAdmin === true || decodedToken.admin === true;
    
    if (!isFleetOwner) {
       return res.status(403).json({ error: 'Forbidden: You can only send emails to yourself' });
    }
  }

  try {
    const emailOptions: any = {
      from: 'Range Anxiety <noreply@range-anxiety.com>',
      to: [to],
      subject: subject,
    };
    if (text) emailOptions.text = text;
    if (html) emailOptions.html = html;

    const data = await resend.emails.send(emailOptions);

    return res.status(200).json({ success: true, id: data.data?.id });
  } catch (error: any) {
    console.error('Resend Error:', error.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
