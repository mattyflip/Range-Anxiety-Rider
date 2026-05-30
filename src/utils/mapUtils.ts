import { decode } from '@googlemaps/polyline-codec';

/**
 * Converts a Google Polyline string to a GeoJSON LineString Feature.
 * 
 * @param polyline The encoded polyline string from Google Maps API.
 * @returns A GeoJSON Feature object.
 */
export const polylineToGeoJSON = (polyline: string) => {
  try {
    const coords = decode(polyline);
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
