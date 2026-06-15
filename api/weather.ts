import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from './_auth.js';

const ALLOWED_ORIGINS = [
  'https://rangeanxietyrider.com',
  'https://www.rangeanxietyrider.com',
];

const LOCALHOST_REGEX = /^http:\/\/localhost(:\d+)?$/;
const IP_REGEX = /^http:\/\/127\.0\.0\.1(:\d+)?$/;

function setCorsHeadersLocal(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  if (origin && typeof origin === 'string') {
    const isAllowed = ALLOWED_ORIGINS.includes(origin) || LOCALHOST_REGEX.test(origin) || IP_REGEX.test(origin);
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (setCorsHeadersLocal(req, res)) return;

    // Validate authentication
    const decodedToken = await verifyAuth(req, res);
    if (!decodedToken) return;

    const lat = req.query.lat as string;
    const lon = req.query.lng as string;
    const API_KEY = process.env.OPENWEATHER_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({ error: 'SERVER_CONFIG_ERROR', message: 'Missing API Key' });
    }

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and Longitude are required' });
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=imperial`;
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (!response.ok) {
      throw new Error(data.message || 'Weather API failed');
    }

    return res.status(200).json({
      wind_speed: data.wind.speed,
      wind_degree: data.wind.deg,
      temp: data.main.temp,
      description: data.weather[0].description
    });
  } catch (error: any) {
    return res.status(500).json({ 
      error: 'Failed to fetch weather data',
      details: error.message 
    });
  }
}
