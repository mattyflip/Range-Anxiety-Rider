import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const baseUrl = 'https://rangeanxiety.app';
  const staticPages = [
    '',
    '/how-it-works',
    '/feed',
    '/forum',
  ];

  try {
    const urls: string[] = [...staticPages];

    // Fetch Communities
    const communitiesSnap = await db.collection('communities').get();
    const communityIds: string[] = [];
    
    for (const doc of communitiesSnap.docs) {
      const commId = doc.id;
      communityIds.push(commId);
      urls.push(`/forum/c/${commId}`);
    }

    // Fetch latest 100 threads for the sitemap
    // We limit this to prevent the sitemap from becoming too massive in one go, 
    // though for a start-up app 100 is plenty.
    for (const commId of communityIds) {
      const threadsSnap = await db.collection(`communities/${commId}/threads`)
        .orderBy('createdAt', 'desc')
        .limit(20) // Top 20 per community to keep it balanced
        .get();
        
      threadsSnap.forEach(threadDoc => {
        urls.push(`/forum/c/${commId}/t/${threadDoc.id}`);
      });
    }

    // Build XML
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.map(url => `
  <url>
    <loc>${baseUrl}${url}</loc>
    <changefreq>${url === '' ? 'daily' : 'weekly'}</changefreq>
    <priority>${url === '' ? '1.0' : url.includes('/t/') ? '0.6' : '0.8'}</priority>
  </url>`).join('')}
</urlset>`;

    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate'); // Cache for 24 hours
    return res.status(200).send(sitemap);
  } catch (error) {
    console.error('Sitemap error:', error);
    // Fallback to basic sitemap if DB fails
    const fallbackSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${staticPages.map(url => `
  <url>
    <loc>${baseUrl}${url}</loc>
    <priority>1.0</priority>
  </url>`).join('')}
</urlset>`;
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(fallbackSitemap);
  }
}
