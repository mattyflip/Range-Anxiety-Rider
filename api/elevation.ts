import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const GOOGLE_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;

  try {
    let pathParam = '';
    
    // Check POST body first (what the current frontend uses)
    if (req.method === 'POST') {
      const { encodedPath, path } = req.body;
      pathParam = encodedPath || path;
    } 
    // Fallback to GET query params
    else {
      const url = new URL(req.url || '', `https://${req.headers.host}`);
      pathParam = url.searchParams.get('path') || '';
    }

    if (!pathParam) {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Ensure path is prefixed with enc: if it's an encoded polyline
    const finalPath = pathParam.includes('|') ? pathParam : `enc:${pathParam}`;

    const response = await axios.get('https://maps.googleapis.com/maps/api/elevation/json', {
      params: {
        path: finalPath,
        samples: 100,
        key: GOOGLE_API_KEY
      }
    });

    // If the frontend expects the full Google response
    if (req.method === 'GET') {
      return res.status(200).json(response.data);
    }

    // If the frontend expects a calculated gain (some versions of MapHome.tsx do this)
    const results = response.data.results;
    let gain = 0;
    for (let i = 1; i < results.length; i++) {
      const diff = results[i].elevation - results[i-1].elevation;
      if (diff > 0) gain += diff;
    }

    return res.status(200).json({ 
      gain: gain * 3.28084, // Return in feet
      results: response.data.results 
    });

  } catch (error: any) {
    console.error('Elevation API error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch elevation data', details: error.message });
  }
}
