import React, { useRef, useEffect, useState } from 'react';
import Map, { Source, Layer, Sky, MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { polylineToGeoJSON } from '../../utils/mapUtils';

interface RouteReplay3DProps {
  polyline: string;
  onClose: () => void;
  maptilerKey?: string;
}

const RouteReplay3D: React.FC<RouteReplay3DProps> = ({ 
  polyline, 
  onClose, 
  maptilerKey = 'get_your_own_key' // Default or placeholder
}) => {
  const mapRef = useRef<MapRef>(null);
  const [routeData] = useState(() => polylineToGeoJSON(polyline));
  const [isAnimating, setIsAnimating] = useState(false);

  // MapTiler Satellite + Terrain
  const styleUrl = `https://api.maptiler.com/maps/hybrid/style.json?key=${maptilerKey}`;

  useEffect(() => {
    if (!routeData || !mapRef.current) return;

    // Center map on the start of the route
    const firstCoord = routeData.geometry.coordinates[0];
    mapRef.current.setCenter([firstCoord[0], firstCoord[1]]);
    mapRef.current.setZoom(14);
    mapRef.current.setPitch(60);
  }, [routeData]);

  const startFlyover = () => {
    if (!routeData || isAnimating) return;
    setIsAnimating(true);

    const coords = routeData.geometry.coordinates;
    let index = 0;

    const animate = () => {
      if (index >= coords.length - 1) {
        setIsAnimating(false);
        return;
      }

      const current = coords[index];
      const next = coords[index + 1];

      // Calculate bearing between points
      const bearing = calculateBearing(current[1], current[0], next[1], next[0]);

      mapRef.current?.easeTo({
        center: [next[0], next[1]],
        bearing: bearing,
        pitch: 65,
        duration: 1000,
        essential: true
      });

      index++;
      setTimeout(animate, 1000);
    };

    animate();
  };

  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const y = Math.sin((lon2 - lon1) * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180));
    const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
              Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos((lon2 - lon1) * (Math.PI / 180));
    return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1rem', background: '#111', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
        <h2 style={{ margin: 0, color: '#ff6600', fontSize: '1.2rem', fontWeight: 900 }}>3D ROUTE REPLAY</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={startFlyover}
            disabled={isAnimating}
            style={{ padding: '0.6rem 1.2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: isAnimating ? 0.5 : 1 }}
          >
            {isAnimating ? 'REPLAYING...' : 'START FLYOVER'}
          </button>
          <button 
            onClick={onClose}
            style={{ padding: '0.6rem 1.2rem', background: '#333', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            CLOSE
          </button>
        </div>
      </header>

      <div style={{ flex: 1, position: 'relative' }}>
        <Map
          ref={mapRef}
          mapStyle={styleUrl}
          initialViewState={{
            longitude: -122.4,
            latitude: 37.8,
            zoom: 14,
            pitch: 60
          }}
          maxPitch={85}
          terrain={{ source: 'terrainSource', exaggeration: 1.5 }}
        >
          {/* 3D Terrain Source */}
          <Source
            id="terrainSource"
            type="raster-dem"
            url={`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${maptilerKey}`}
            tileSize={256}
          />
          
          <Sky
            style={{
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [0, 90],
              'sky-atmosphere-sun-intensity': 15
            }}
          />

          {/* Route Line */}
          {routeData && (
            <Source id="route" type="geojson" data={routeData}>
              <Layer
                id="route-line"
                type="line"
                paint={{
                  'line-color': '#ff6600',
                  'line-width': 6,
                  'line-opacity': 0.8
                }}
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round'
                }}
              />
            </Source>
          )}
        </Map>
      </div>

      <footer style={{ padding: '1rem', background: 'rgba(0,0,0,0.8)', color: '#888', fontSize: '0.7rem', textAlign: 'center', position: 'absolute', bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
        3D Terrain powered by MapLibre & MapTiler. Built for Range Anxiety Rider.
      </footer>
    </div>
  );
};

export default RouteReplay3D;
