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

  // Support both GET and POST for flexibility
  const path = req.method === 'POST' ? req.body.path : req.query.path;
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!GOOGLE_API_KEY) {
    console.error('Elevation API error: Google Maps API Key missing in environment');
    return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
  }

  if (!path || !Array.isArray(path) || path.length === 0) {
    return res.status(400).json({ error: 'A valid path array is required' });
  }

  // Convert array of {lat, lng} to pipe-separated string
  // Google Elevation API limit is 512 locations per request
  const maxPoints = 250; 
  const sampledPath = path.length <= maxPoints 
    ? path 
    : path.filter((_, i) => i % Math.ceil(path.length / maxPoints) === 0);
  
  const pathString = sampledPath.map(p => `${p.lat},${p.lng}`).join('|');

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/elevation/json', {
      params: {
        locations: pathString,
        key: GOOGLE_API_KEY
      }
    });

    if (response.data.status !== 'OK') {
      console.error('Google Elevation API error status:', response.data.status, response.data.error_message);
      return res.status(400).json({ 
        error: `Google API Error: ${response.data.status}`, 
        message: response.data.error_message 
      });
    }

    const results = response.data.results;
    if (!results || results.length === 0) {
      return res.status(200).json({ gain: 0, message: 'No elevation data found for this path' });
    }

    let gain = 0;
    for (let i = 1; i < results.length; i++) {
      const diff = results[i].elevation - results[i-1].elevation;
      if (diff > 0) gain += diff;
    }

    // Convert meters to feet
    const gainFeet = gain * 3.28084;

    return res.status(200).json({ gain: gainFeet });
  } catch (error: any) {
    console.error('Elevation API error:', error.response?.data || error.message);
    return res.status(500).json({ 
      error: 'Failed to fetch elevation data', 
      details: error.response?.data || error.message 
    });
  }
}
