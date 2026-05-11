import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const pathPoints = url.searchParams.get('path');
  const GOOGLE_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!pathPoints) {
    return res.status(400).json({ error: 'Path is required' });
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/elevation/json', {
      params: {
        path: pathPoints,
        samples: 50,
        key: GOOGLE_API_KEY
      }
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Elevation API error:', error);
    return res.status(500).json({ error: 'Failed to fetch elevation data' });
  }
}
