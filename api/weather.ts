import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// SECURITY FIX #3 (continued): Same origin restriction applied to weather API.
import { setCorsHeaders } from './_cors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (setCorsHeaders(req, res)) return;

    const lat = req.query.lat as string;
    const lon = req.query.lng as string;
    const API_KEY = process.env.OPENWEATHER_API_KEY;

    if (!API_KEY) {
      console.error('Missing OPENWEATHER_API_KEY');
      return res.status(500).json({ error: 'SERVER_CONFIG_ERROR', message: 'Missing API Key' });
    }

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and Longitude are required' });
    }

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
  } catch (error: any) {
    console.error('Weather API error:', error.message);
    return res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch weather data',
      details: error.message 
    });
  }
}
