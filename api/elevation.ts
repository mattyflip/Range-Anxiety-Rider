import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_BACKEND_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

  try {
    let pathParam = '';
    
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      pathParam = body.encodedPath || body.path;
    } else {
      const url = new URL(req.url || '', `https://${req.headers.host}`);
      pathParam = url.searchParams.get('path') || '';
    }

    if (!pathParam) {
      console.error('Elevation API: Missing path parameter');
      return res.status(400).json({ error: 'Path is required' });
    }

    let params: any = { key: GOOGLE_API_KEY };
    const isPath = pathParam.includes('|') || (!pathParam.includes(',') && !pathParam.startsWith('enc:')) || pathParam.startsWith('enc:');
    
    // Improved detection: if it has multiple commas and pipes, it's a coordinate list
    // if it's just one comma and looks like numbers, it's a single location
    const isSingleLocation = /^-?\d+\.\d+,-?\d+\.\d+$/.test(pathParam);

    if (isSingleLocation) {
      params.locations = pathParam;
    } else {
      params.path = pathParam.startsWith('enc:') ? pathParam : `enc:${pathParam}`;
      params.samples = 100;
    }

    console.log(`Calling Elevation API with ${isSingleLocation ? 'locations' : 'path'}`);
    
    const response = await axios.get('https://maps.googleapis.com/maps/api/elevation/json', { params });

    if (response.data.status !== 'OK') {
      console.error('Google Elevation Error:', response.data.status, response.data.error_message);
      return res.status(400).json({ error: response.data.status, message: response.data.error_message });
    }

    if (isSingleLocation) {
      return res.status(200).json({ 
        gain: 0, 
        loss: 0, 
        results: response.data.results 
      });
    }

    const results = response.data.results;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < results.length; i++) {
      const diff = results[i].elevation - results[i-1].elevation;
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }

    return res.status(200).json({ 
      gain: gain * 3.28084, 
      loss: loss * 3.28084, 
      results 
    });

  } catch (error: any) {
    console.error('Elevation API error:', error.message);
    return res.status(500).json({ error: 'Internal Error', details: error.message });
  }
}
