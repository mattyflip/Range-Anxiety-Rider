import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Use a dedicated backend key if available to avoid referer restrictions
  // If not found, fall back to the VITE key (which may have restrictions)
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_BACKEND_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

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

    // Robust check for encoded polyline vs coordinate list
    // Encoded polylines can contain '|', so we check for 'lat,lng' pattern or 'enc:' prefix
    let finalPath = pathParam;
    if (!pathParam.startsWith('enc:')) {
      // If it doesn't look like a coordinate list (lat,lng|lat,lng), it's probably a raw polyline
      const isCoordList = /^-?\d+\.\d+,-?\d+\.\d+(\|-?\d+\.\d+,-?\d+\.\d+)*$/.test(pathParam);
      if (!isCoordList) {
        finalPath = `enc:${pathParam}`;
      }
    }

    console.log('Calling Google Elevation API with path length:', finalPath.length);
    
    let response;
    try {
      response = await axios.get('https://maps.googleapis.com/maps/api/elevation/json', {
        params: {
          path: finalPath,
          samples: 100,
          key: GOOGLE_API_KEY
        }
      });
    } catch (googleError: any) {
      console.error('Google Elevation API raw error:', googleError.response?.data || googleError.message);
      return res.status(googleError.response?.status || 400).json({ 
        error: 'Google API rejected the request', 
        details: googleError.response?.data 
      });
    }

    if (response.data.status !== 'OK') {
      console.error('Google Elevation API returned status:', response.data.status, response.data.error_message);
      return res.status(400).json({ error: response.data.status, message: response.data.error_message });
    }

    // If the frontend expects the full Google response
    if (req.method === 'GET') {
      return res.status(200).json(response.data);
    }

    // Calculate gain AND loss
    const results = response.data.results;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < results.length; i++) {
      const diff = results[i].elevation - results[i-1].elevation;
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }

    return res.status(200).json({ 
      gain: gain * 3.28084, // Return in feet
      loss: loss * 3.28084, // Return in feet
      results: response.data.results 
    });

  } catch (error: any) {
    console.error('Elevation API error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch elevation data', details: error.message });
  }
}
