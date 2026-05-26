import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = [
  'https://rangeanxietyrider.com',
  'https://www.rangeanxietyrider.com',
];

function setCorsHeaders(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin as string | undefined;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return req.method === 'OPTIONS';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (setCorsHeaders(req, res)) {
    return res.status(200).end();
  }

  const apiKey = process.env.GOOGLE_MAPS_BACKEND_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

  try {
    let pathParam = '';
    let isEncoded = false;

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body.encodedPath) {
        pathParam = body.encodedPath;
        isEncoded = true;
      } else {
        pathParam = body.path || '';
      }
    }

    if (!pathParam) {
      return res.status(400).json({ error: 'Path is required' });
    }

    let queryParams: any = { key: apiKey };
    
    if (isEncoded) {
      queryParams.path = pathParam.startsWith('enc:') ? pathParam : 'enc:' + pathParam;
      queryParams.samples = 100;
    } else if (pathParam.includes('|') || pathParam.includes(',')) {
      queryParams.locations = pathParam;
    } else {
      queryParams.path = 'enc:' + pathParam;
      queryParams.samples = 100;
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/elevation/json', { params: queryParams });

    if (response.data.status !== 'OK') {
      return res.status(400).json({ error: response.data.status, message: response.data.error_message });
    }

    const results = response.data.results;
    let gain = 0;
    let loss = 0;
    
    if (results.length > 1) {
      for (let i = 1; i < results.length; i++) {
        const diff = results[i].elevation - results[i-1].elevation;
        if (diff > 0) gain += diff;
        else loss += Math.abs(diff);
      }
    }

    return res.status(200).json({
      gain: gain * 3.28084,
      loss: loss * 3.28084,
      results
    });

  } catch (error: any) {
    return res.status(500).json({ error: 'Internal Error' });
  }
}
