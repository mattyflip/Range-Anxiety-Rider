import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// SECURITY FIX #3 (continued): Same origin restriction applied to static-map API.
const ALLOWED_ORIGINS = [
  'https://rangeanxietyrider.com',
  'https://www.rangeanxietyrider.com',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { polyline } = req.query;
  
  if (!polyline) {
    return res.status(400).json({ error: 'Polyline is required' });
  }

  // Use a dedicated backend key if available to avoid referer restrictions
  const apiKey = process.env.GOOGLE_MAPS_BACKEND_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Google Maps API Key not configured on server' });
  }

  // Construct the Static Map URL with the same dark theme and route highlighting
  // IMPORTANT: The encoded polyline string itself needs to be URL-encoded because it contains special characters
  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&scale=2&maptype=roadmap&path=color:0xff6600ff|weight:6|enc:${encodeURIComponent(polyline as string)}&key=${apiKey}&style=feature:all|element:all|saturation:-100|lightness:-20&style=feature:water|element:geometry|color:0x000000&style=feature:landscape|element:geometry|color:0x111111&style=feature:road|element:geometry|color:0x333333&style=feature:poi|element:labels|visibility:off&style=feature:transit|element:labels|visibility:off`;

  try {
    const response = await axios.get(staticMapUrl, { responseType: 'arraybuffer' });
    
    // Set restricted CORS headers (images can be embedded cross-origin but we
    // still restrict the explicit Access-Control-Allow-Origin header)
    const origin = req.headers.origin as string | undefined;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    return res.send(response.data);
  } catch (error: any) {
    console.error('Static Map Proxy Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch static map from Google' });
  }
}
