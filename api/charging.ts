import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const API_KEY = process.env.OPENCHARGEMAP_API_KEY;

  try {
    let searchParams: any = {
      output: 'json',
      maxresults: 50,
      compact: true,
      verbose: false,
      key: API_KEY
    };

    // Case 1: Search along a path (POST)
    if (req.method === 'POST') {
      const { path, lat, lng } = req.body;

      if (path && Array.isArray(path)) {
        // To find chargers along a route, we pick key points (Start, Middle, End) 
        // because OCM doesn't support "Polyline" searching directly.
        // We'll search around the center point for now, or you can expand this to multiple queries.
        const midIdx = Math.floor(path.length / 2);
        searchParams.latitude = path[midIdx].lat;
        searchParams.longitude = path[midIdx].lng;
        searchParams.distance = 50; // Larger radius for route search
      } else if (lat && lng) {
        searchParams.latitude = lat;
        searchParams.longitude = lng;
        searchParams.distance = 15;
      }
    } 
    // Case 2: Direct coordinate search (GET)
    else {
      const url = new URL(req.url || '', `https://${req.headers.host}`);
      searchParams.latitude = url.searchParams.get('lat');
      searchParams.longitude = url.searchParams.get('lon') || url.searchParams.get('lng');
      searchParams.distance = url.searchParams.get('distance') || 25;
    }

    if (!searchParams.latitude || !searchParams.longitude) {
      return res.status(400).json({ error: 'Location data (lat/lng) is required' });
    }

    const response = await axios.get('https://api.openchargemap.io/v3/poi/', {
      params: searchParams,
      headers: { 'User-Agent': 'RangeAnxietyApp' }
    });
    
    const formattedPois = response.data.map((poi: any) => ({
      id: `ocm-${poi.ID}`,
      name: poi.AddressInfo.Title,
      address: `${poi.AddressInfo.AddressLine1}${poi.AddressInfo.Town ? ', ' + poi.AddressInfo.Town : ''}`,
      position: { lat: poi.AddressInfo.Latitude, lng: poi.AddressInfo.Longitude },
      type: 'charging station',
      details: poi.Connections?.map((e: any) => e.ConnectionType?.Title).filter(Boolean).join(', ') || 'Standard Outlet'
    }));

    return res.status(200).json({ pois: formattedPois });
  } catch (error: any) {
    console.error('Open Charge Map API error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch charging data', details: error.message });
  }
}
