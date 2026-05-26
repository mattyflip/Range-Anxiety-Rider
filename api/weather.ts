import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// SECURITY FIX #3 (continued): Same origin restriction applied to weather API.
const ALLOWED_ORIGINS = [
  'https://rangeanxietyrider.com',
  'https://www.rangeanxietyrider.com',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set restricted CORS headers
  const origin = req.headers.origin as string | undefined;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Use the modern URL API instead of legacy parsing
  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lng');
  const API_KEY = process.env.OPENWEATHER_API_KEY;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Latitude and Longitude are required' });
  }

  try {
    const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: {
        lat,
        lon,
        appid: API_KEY,
        units: 'imperial'
      }
    });
    
    return res.status(200).json({
      wind_speed: response.data.wind.speed,
      wind_deg: response.data.wind.deg,
      temp: response.data.main.temp,
      description: response.data.weather[0].description
    });
  } catch (error) {
    console.error('Weather API error:', error);
    return res.status(500).json({ error: 'Failed to fetch weather data' });
  }
}
