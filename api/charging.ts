import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const distance = url.searchParams.get('distance') || 25;
  const API_KEY = process.env.OPENCHARGEMAP_API_KEY;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Latitude and Longitude are required' });
  }

  try {
    const response = await axios.get('https://api.openchargemap.io/v3/poi/', {
      params: {
        output: 'json',
        latitude: lat,
        longitude: lon,
        distance: distance,
        distanceunit: 'Miles',
        maxresults: 50,
        key: API_KEY
      },
      headers: {
        'User-Agent': 'RangeAnxietyApp'
      }
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    
    const formattedPois = response.data.map((poi: any) => ({
      id: `ocm-${poi.ID}`,
      name: poi.AddressInfo.Title,
      address: poi.AddressInfo.AddressLine1,
      position: { lat: poi.AddressInfo.Latitude, lng: poi.AddressInfo.Longitude },
      type: 'charging station',
      details: poi.Equipment?.map((e: any) => e.ConnectionType?.Title).join(', ') || 'Standard Outlet'
    }));

    return res.status(200).json(formattedPois);
  } catch (error) {
    console.error('Open Charge Map API error:', error);
    return res.status(500).json({ error: 'Failed to fetch charging data' });
  }
}
