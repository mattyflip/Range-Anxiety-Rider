import { decode } from '@googlemaps/polyline-codec';

/**
 * Converts a Google Polyline string to a GeoJSON LineString Feature.
 * 
 * @param polyline The encoded polyline string from Google Maps API.
 * @returns A GeoJSON Feature object.
 */
export const polylineToGeoJSON = (polyline: any) => {
  if (!polyline) return null;
  const polylineStr = typeof polyline === 'string' ? polyline : (polyline.points || polyline.encodedPolyline);
  if (!polylineStr || typeof polylineStr !== 'string') return null;
  try {
    const coords = decode(polylineStr);
    if (!coords || coords.length === 0) return null;
    
    // Google polyline returns [lat, lng], GeoJSON requires [lng, lat]
    const geoJSONCoords = coords.map(([lat, lng]) => [lng, lat]);

    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: geoJSONCoords
      }
    };
  } catch (error) {
    console.error('Failed to decode polyline:', error);
    return null;
  }
};
