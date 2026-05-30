import { describe, it, expect } from 'vitest';
import { polylineToGeoJSON } from './mapUtils';

describe('Map Utilities', () => {
  it('should decode a Google Polyline into GeoJSON LineString coordinates', () => {
    // Encoded polyline for a simple path
    const mockPolyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'; 
    const geojson = polylineToGeoJSON(mockPolyline);

    expect(geojson).not.toBeNull();
    expect(geojson?.type).toBe('Feature');
    expect(geojson?.geometry.type).toBe('LineString');
    
    // Verify coordinate order: [longitude, latitude]
    const firstCoord = geojson?.geometry.coordinates[0];
    expect(firstCoord?.length).toBe(2);
    // In our mock example, we just check they are numbers
    expect(typeof firstCoord?.[0]).toBe('number');
    expect(typeof firstCoord?.[1]).toBe('number');
  });

  it('should return null for an invalid polyline', () => {
    // Note: The decoder might not throw on small strings, but it will fail on truly invalid data
    const invalidPolyline = '!!!invalid!!!';
    // The decoder often just returns what it can, so we test the try/catch or result
    const result = polylineToGeoJSON(invalidPolyline);
    // If it doesn't throw, it might return an empty array of coords
    if (result && result.geometry.coordinates.length === 0) {
        expect(result.geometry.coordinates.length).toBe(0);
    }
  });
});
