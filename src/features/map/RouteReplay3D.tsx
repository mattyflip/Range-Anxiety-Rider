import React, { useRef, useEffect, useState } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
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
  maptilerKey 
}) => {
  console.log('RouteReplay3D received polyline:', polyline);
  const mapRef = useRef<MapRef>(null);
  const [routeData] = useState(() => polylineToGeoJSON(polyline));
  const [isAnimating, setIsAnimating] = useState(false);

  // MapTiler Satellite + Terrain
  const isKeyValid = maptilerKey && maptilerKey !== 'get_your_own_key';
  const styleUrl = isKeyValid 
    ? `https://api.maptiler.com/maps/hybrid/style.json?key=${maptilerKey}`
    : '';



  const startFlyover = () => {
    if (!routeData || isAnimating) return;
    setIsAnimating(true);

    const coords = routeData.geometry.coordinates;
    let index = 0;
    
    // We want the flyover to take roughly 15-20 seconds total.
    // So we'll take about 100 steps, each 150ms.
    const stepSize = Math.max(1, Math.floor(coords.length / 100));

    const animate = () => {
      if (index >= coords.length - 1) {
        setIsAnimating(false);
        return;
      }

      const current = coords[index];
      let nextIndex = index + stepSize;
      if (nextIndex >= coords.length) nextIndex = coords.length - 1;
      const next = coords[nextIndex];

      // Calculate bearing between points
      const bearing = calculateBearing(current[1], current[0], next[1], next[0]);

      mapRef.current?.easeTo({
        center: [next[0], next[1]],
        bearing: bearing,
        pitch: 65,
        duration: 150,
        easing: (t) => t, // Linear easing for smooth continuous motion
        essential: true
      });

      index = nextIndex;
      setTimeout(animate, 150);
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
        {!isKeyValid && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', color: 'white', textAlign: 'center', padding: '2rem' }}>
             <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔑</div>
             <h3 style={{ margin: 0 }}>MapTiler API Key Required</h3>
             <p style={{ color: '#888', maxWidth: '300px', margin: '1rem 0' }}>The 3D Replay feature requires a MapTiler API Key. Add <code>VITE_MAPTILER_KEY</code> to your environment variables.</p>
             <button onClick={onClose} style={{ padding: '0.8rem 2rem', background: '#ff6600', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>GO BACK</button>
          </div>
        )}
        <Map
          ref={mapRef}
          mapStyle={styleUrl}
          initialViewState={{
            longitude: routeData ? routeData.geometry.coordinates[0][0] : -122.4,
            latitude: routeData ? routeData.geometry.coordinates[0][1] : 37.8,
            zoom: 14,
            pitch: 60
          }}
          maxPitch={85}
          terrain={isKeyValid ? { source: 'terrainSource', exaggeration: 1.5 } : undefined}
          onLoad={() => {
            if (routeData && mapRef.current) {
              const firstCoord = routeData.geometry.coordinates[0];
              mapRef.current.setCenter([firstCoord[0], firstCoord[1]]);
              mapRef.current.setZoom(14);
              mapRef.current.setPitch(60);
            }
          }}
        >
          {/* 3D Terrain Source */}
          {isKeyValid && (
            <Source
              id="terrainSource"
              type="raster-dem"
              url={`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${maptilerKey}`}
              tileSize={256}
            />
          )}
          
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
