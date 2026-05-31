import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import polylineCodec from '@mapbox/polyline';

import { setCorsHeaders } from './_cors.js';

/**
 * Simplifies a polyline by keeping every Nth point to stay under Google's 8192 char URL limit.
 */
function simplifyPolyline(encoded: string, maxLen: number = 2000): string {
  if (encoded.length <= maxLen) return encoded;
  
  try {
    const points = polylineCodec.decode(encoded);
    const step = Math.ceil(encoded.length / maxLen);
    const simplified = points.filter((_: any, i: number) => i % step === 0);
    // Always include the last point
    if (simplified.length > 0 && simplified[simplified.length - 1] !== points[points.length - 1]) {
      simplified.push(points[points.length - 1]);
    }
    return polylineCodec.encode(simplified);
  } catch (e) {
    return encoded.substring(0, maxLen); // Emergency fallback
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (setCorsHeaders(req, res)) return;

    const polyline = req.query.polyline as string;
    
    if (!polyline) {
      return res.status(400).json({ error: 'Polyline is required' });
    }

    const apiKey = process.env.GOOGLE_MAPS_BACKEND_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing API Key' });
    }

    const safePolyline = simplifyPolyline(polyline, 1500);
    const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x600&path=color:0xff6600ff|weight:5|enc:${safePolyline}&key=${apiKey}&style=feature:all|element:all|saturation:-100|lightness:-50&style=feature:road|element:geometry|color:0x333333&style=feature:water|element:geometry|color:0x111111`;

    const response = await axios.get(staticMapUrl, { 
      responseType: 'arraybuffer',
      timeout: 8000
    });
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    return res.send(response.data);
  } catch (error: any) {
    console.error('Static Map Error:', error.message);
    let details = error.message;
    if (error.response?.data) {
       try {
         const errorBody = Buffer.from(error.response.data).toString();
         details = errorBody;
       } catch (e) {}
    }
    
    return res.status(500).json({ 
      error: 'Failed to fetch static map from Google',
      message: error.message,
      details: details
    });
  }
}
