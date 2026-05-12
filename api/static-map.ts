import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

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
  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&scale=2&maptype=roadmap&path=color:0xff6600ff|weight:6|enc:${polyline}&key=${apiKey}&style=feature:all|element:all|saturation:-100|lightness:-20&style=feature:water|element:geometry|color:0x000000&style=feature:landscape|element:geometry|color:0x111111&style=feature:road|element:geometry|color:0x333333&style=feature:poi|element:labels|visibility:off&style=feature:transit|element:labels|visibility:off`;

  try {
    const response = await axios.get(staticMapUrl, { responseType: 'arraybuffer' });
    
    // Set headers for CORS and image type
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    return res.send(response.data);
  } catch (error: any) {
    console.error('Static Map Proxy Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch static map from Google' });
  }
}
