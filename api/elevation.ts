import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import polylineCodec from '@mapbox/polyline';

const ALLOWED_ORIGINS = [
  'https://rangeanxietyrider.com',
  'https://www.rangeanxietyrider.com',
];

/**
 * Simplifies a polyline to stay within safe URL limits for the Google Elevation API.
 */
function simplifyPolyline(encoded: string, maxLen: number = 2000): string {
  if (encoded.length <= maxLen) return encoded;
  try {
    const points = polylineCodec.decode(encoded);
    const step = Math.ceil(encoded.length / maxLen);
    const simplified = points.filter((_: any, i: number) => i % step === 0);
    if (simplified.length > 0 && (simplified[simplified.length - 1] !== points[points.length - 1])) {
      simplified.push(points[points.length - 1]);
    }
    return polylineCodec.encode(simplified);
  } catch (e) {
    return encoded.substring(0, maxLen);
  }
}

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

  if (!apiKey) {
    return res.status(500).json({ error: 'SERVER_CONFIG_ERROR', message: 'Missing API Key' });
  }

  try {
    let pathParam = '';
    let isEncoded = false;

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body.encodedPath) {
        pathParam = body.encodedPath;
        isEncoded = true;
      } else {
        pathParam = body.path || body.locations || '';
      }
    } else {
      const url = new URL(req.url || '', 'http://localhost');
      pathParam = url.searchParams.get('path') || url.searchParams.get('locations') || '';
    }

    if (!pathParam) {
      return res.status(422).json({ error: 'VALIDATION_ERROR' });
    }

    const queryParams: any = { key: apiKey };
    const isRawCoords = /^[0-9.,|\-\s]+$/.test(pathParam);

    if (isEncoded || !isRawCoords) {
      // Protect against extremely long Route API polylines
      const safePath = simplifyPolyline(pathParam, 1500);
      queryParams.path = safePath.startsWith('enc:') ? safePath : 'enc:' + safePath;
      queryParams.samples = 80; // Slightly lower samples to speed up processing
    } else {
      queryParams.locations = pathParam.replace(/\s/g, '');
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/elevation/json', { 
      params: queryParams,
      timeout: 8000 // Allow more time for processing
    });

    if (response.data.status !== 'OK') {
      console.error('Google Elevation API Error:', response.data);
      return res.status(502).json({ 
        error: 'GOOGLE_API_ERROR', 
        status: response.data.status, 
        message: response.data.error_message
      });
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
    console.error('Elevation Proxy Error:', error.message);
    return res.status(500).json({ 
      error: 'PROXY_ERROR', 
      message: error.message 
    });
  }
}
