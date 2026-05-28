import { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
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

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- AUTHENTICATION ---
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    await getAuth().verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { to, subject, text, html } = req.body;

  // SECURITY FIX: Basic input validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || typeof to !== 'string' || !emailRegex.test(to)) {
    return res.status(400).json({ error: 'Invalid recipient email' });
  }

  if (!subject || typeof subject !== 'string' || subject.length > 255) {
    return res.status(400).json({ error: 'Invalid subject' });
  }

  if ((!text || typeof text !== 'string') && (!html || typeof html !== 'string')) {
    return res.status(400).json({ error: 'Email content (text or html) is required' });
  }

  try {
    const data = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Range Anxiety Rider <Info@rangeanxietyrider.com>',
      to: [to],
      subject: subject,
      text: text,
      html: html,
    });

    return res.status(200).json({ success: true, id: data.data?.id });
  } catch (error: any) {
    console.error('Resend Error:', error.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
