import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// SECURITY FIX #3 (continued): Same origin restriction applied to weather API.
import { setCorsHeaders } from './_cors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (setCorsHeaders(req, res)) return;

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
