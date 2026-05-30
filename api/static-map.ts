import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import polylineCodec from '@mapbox/polyline';

const ALLOWED_ORIGINS = [
  'https://rangeanxietyrider.com',
  'https://www.rangeanxietyrider.com',
];

/**
 * Simplifies a polyline by keeping every Nth point to stay under Google's 8192 char URL limit.
 */
function simplifyPolyline(encoded: string, maxLen: number = 2000): string {
  if (encoded.length <= maxLen) return encoded;
  
  try {
    const points = polylineCodec.decode(encoded);
    const step = Math.ceil(encoded.length / maxLen);
    const simplified = points.filter((_, i) => i % step === 0);
    // Always include the last point
    if (simplified[simplified.length - 1] !== points[points.length - 1]) {
      simplified.push(points[points.length - 1]);
    }
    return polylineCodec.encode(simplified);
  } catch (e) {
    return encoded.substring(0, maxLen); // Emergency fallback
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { polyline } = req.query;
  
  if (!polyline || typeof polyline !== 'string') {
    return res.status(400).json({ error: 'Polyline is required' });
  }

  const apiKey = process.env.GOOGLE_MAPS_BACKEND_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Google Maps API Key not configured on server' });
  }

  // Google Static Maps has an 8192 character limit for the entire URL.
  // We simplify the polyline if it's too long.
  const safePolyline = simplifyPolyline(polyline, 3000);

  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&scale=2&maptype=roadmap&path=color:0xff6600ff|weight:6|enc:${encodeURIComponent(safePolyline)}&key=${apiKey}&style=feature:all|element:all|saturation:-100|lightness:-20&style=feature:water|element:geometry|color:0x000000&style=feature:landscape|element:geometry|color:0x111111&style=feature:road|element:geometry|color:0x333333&style=feature:poi|element:labels|visibility:off&style=feature:transit|element:labels|visibility:off`;

  try {
    const response = await axios.get(staticMapUrl, { 
      responseType: 'arraybuffer',
      timeout: 5000 // Ensure we don't hang the function
    });
    
    const origin = req.headers.origin as string | undefined;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    return res.send(response.data);
  } catch (error: any) {
    console.error('Static Map Proxy Error:', error.message);
    if (error.response) {
       console.error('Google Response Error:', Buffer.from(error.response.data).toString());
    }
    return res.status(500).json({ error: 'Failed to fetch static map from Google' });
  }
}
