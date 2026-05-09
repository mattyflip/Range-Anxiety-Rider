import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path, encodedPath, samples = 100 } = req.method === 'POST' ? req.body : req.query;
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
  }

  let params: any = { key: GOOGLE_API_KEY };

  if (encodedPath) {
    params.path = `enc:${encodedPath}`;
    params.samples = samples;
  } else if (path && Array.isArray(path) && path.length > 0) {
    // Fallback to locations if no encoded path provided
    const maxPoints = 250; 
    const sampledPath = path.length <= maxPoints 
      ? path 
      : path.filter((_, i) => i % Math.ceil(path.length / maxPoints) === 0);
    params.locations = sampledPath.map(p => `${p.lat},${p.lng}`).join('|');
  } else {
    return res.status(400).json({ error: 'A valid path or encodedPath is required' });
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/elevation/json', { params });

    if (response.data.status !== 'OK') {
      return res.status(400).json({ 
        error: `Google API Error: ${response.data.status}`, 
        message: response.data.error_message 
      });
    }

    const results = response.data.results;
    if (!results || results.length === 0) {
      return res.status(200).json({ gain: 0, message: 'No elevation data found' });
    }

    let gain = 0;
    let loss = 0;
    for (let i = 1; i < results.length; i++) {
      const diff = results[i].elevation - results[i-1].elevation;
      if (diff > 0) gain += diff;
      else if (diff < 0) loss += Math.abs(diff);
    }

    // Convert meters to feet
    const gainFeet = gain * 3.28084;
    const lossFeet = loss * 3.28084;

    return res.status(200).json({ gain: gainFeet, loss: lossFeet });
  } catch (error: any) {
    return res.status(500).json({ 
      error: 'Failed to fetch elevation data', 
      details: error.response?.data || error.message 
    });
  }
}
