import axios from 'axios';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * RANGE ANXIETY RIDER - OpenChargeMap (OCM) Integration
 * 
 * Prioritizes 110v/Level 1 outlets for e-bikes while still showing Level 2.
 * Optimized for standard household-style sockets (NEMA 5-15) and J1772.
 */

// SECURITY FIX #3 (continued): Same origin restriction applied to charging API.
import { setCorsHeaders } from './_cors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (setCorsHeaders(req, res)) return;

  const OCM_API_KEY = process.env.OPENCHARGEMAP_API_KEY;

  try {
    let lat: any, lng: any, radius = 25; // Default 25 miles

    if (req.method === 'POST') {
      const { lat: pLat, lng: pLng, distance } = req.body;
      lat = pLat;
      lng = pLng;
      if (distance) radius = distance;
    } else {
      const url = new URL(req.url || '', `https://${req.headers.host}`);
      lat = url.searchParams.get('lat');
      lng = url.searchParams.get('lng') || url.searchParams.get('lon');
      const d = url.searchParams.get('distance');
      if (d) radius = parseInt(d);
    }

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Location data (lat/lng) is required' });
    }

    /**
     * OCM API Parameter Strategy:
     * - connectiontypeid: 3 (NEMA 5-15 / 110v Wall Outlet), 1 (J1772 / Level 2)
     * - levelid: 1 (Level 1 / 110v), 2 (Level 2 / 240v)
     * - We don't filter strictly in the query so we don't miss chargers, 
     *   but we'll label them clearly for the rider.
     */
    const response = await axios.get('https://api.openchargemap.io/v3/poi/', {
      params: {
        output: 'json',
        key: OCM_API_KEY,
        latitude: lat,
        longitude: lng,
        distance: radius,
        distanceunit: 'Miles',
        maxresults: 50,
        compact: true,
        verbose: false
      },
      headers: { 'User-Agent': 'RangeAnxietyRider' }
    });

    const formattedPois = response.data.map((poi: any) => {
      const connections = poi.Connections || [];
      
      // Check if any connection is Level 1 (110v)
      const isLevel1 = connections.some((c: any) => c.LevelID === 1 || (c.ConnectionTypeID === 3));
      
      // Determine charger "Class"
      let chargerClass = 'Level 2';
      if (isLevel1) chargerClass = '110v Outlet';
      if (connections.some((c: any) => c.LevelID === 3)) chargerClass = 'DC Fast';

      // Format details string
      const details = connections.map((c: any) => {
        const type = c.ConnectionType?.Title || 'Standard';
        const power = c.PowerKW ? `${c.PowerKW}kW` : '';
        return `${type} ${power}`.trim();
      }).join(', ') || 'Standard Outlet';

      return {
        id: `ocm-${poi.ID}`,
        name: poi.AddressInfo?.Title || 'Charging Location',
        address: poi.AddressInfo?.AddressLine1 || '',
        position: { lat: poi.AddressInfo.Latitude, lng: poi.AddressInfo.Longitude },
        type: 'charging',
        chargerClass: chargerClass,
        is110v: isLevel1,
        details: details,
        usageCost: poi.UsageCost || 'Unknown',
        accessInfo: poi.AddressInfo?.AccessComments || ''
      };
    });

    // Sort to put 110v outlets first if desired, or just return as is
    return res.status(200).json(formattedPois);

  } catch (error: any) {
    console.error('OCM API Error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to fetch charging data' });
  }
}
