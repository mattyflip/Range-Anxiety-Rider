import React, { useRef, useState, useEffect } from 'react';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { polylineToGeoJSON } from '../../utils/mapUtils';

interface RouteReplay3DProps {
  polyline: any;
  onClose: () => void;
  maptilerKey?: string;
  userPhotoURL?: string;
}

const RouteReplay3D: React.FC<RouteReplay3DProps> = ({ 
  polyline, 
  onClose, 
  maptilerKey,
  userPhotoURL
}) => {
  const mapRef = useRef<MapRef>(null);
  const [routeData] = useState(() => polylineToGeoJSON(polyline));
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [uiProgress, setUiProgress] = useState(0); // 0 to 1
  const [bikePosition, setBikePosition] = useState<[number, number] | null>(
    routeData ? [routeData.geometry.coordinates[0][0], routeData.geometry.coordinates[0][1]] : null
  );

  // MapTiler Satellite + Terrain
  const isKeyValid = maptilerKey && maptilerKey !== 'get_your_own_key';
  const styleUrl = isKeyValid 
    ? `https://api.maptiler.com/maps/hybrid/style.json?key=${maptilerKey}`
    : '';

  // Haversine distance
  const haversine = (lon1: number, lat1: number, lon2: number, lat2: number) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const y = Math.sin((lon2 - lon1) * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180));
    const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
              Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos((lon2 - lon1) * (Math.PI / 180));
    return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
  };

  // Precalculate distance mapping (run once)
  const [routeMetrics] = useState(() => {
    const coords = routeData?.geometry.coordinates || [];
    if (coords.length < 2) return null;
    
    const segments: number[] = [];
    let totalDistance = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const dist = Math.max(0.1, haversine(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1]));
      segments.push(dist);
      totalDistance += dist;
    }
    return { segments, totalDistance, coords };
  });

  // Animation Engine Refs
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const progressRef = useRef(0);
  const bearingRef = useRef<number>(
    routeMetrics ? calculateBearing(routeMetrics.coords[0][1], routeMetrics.coords[0][0], routeMetrics.coords[1][1], routeMetrics.coords[1][0]) : 0
  );
  
  const isPlayingRef = useRef(isPlaying);
  const playbackSpeedRef = useRef(playbackSpeed);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { playbackSpeedRef.current = playbackSpeed; }, [playbackSpeed]);

  const updateCamera = (currentProgress: number) => {
    if (!routeMetrics || !mapRef.current) return;
    const { segments, totalDistance, coords } = routeMetrics;

    const targetDistance = currentProgress * totalDistance;
    let accumulated = 0;
    let currentIndex = 0;

    for (let i = 0; i < segments.length; i++) {
      if (accumulated + segments[i] >= targetDistance) {
        currentIndex = i;
        break;
      }
      accumulated += segments[i];
    }

    const segmentStart = coords[currentIndex];
    const segmentEnd = coords[currentIndex + 1] || segmentStart;
    const segmentDist = segments[currentIndex] || 1;
    const segmentProgress = (targetDistance - accumulated) / segmentDist;

    const currentLng = segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * segmentProgress;
    const currentLat = segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * segmentProgress;

    setBikePosition([currentLng, currentLat]);

    let targetBearing = calculateBearing(segmentStart[1], segmentStart[0], segmentEnd[1], segmentEnd[0]);
    if (targetBearing - bearingRef.current > 180) targetBearing -= 360;
    if (targetBearing - bearingRef.current < -180) targetBearing += 360;
    bearingRef.current = bearingRef.current + (targetBearing - bearingRef.current) * 0.1;

    mapRef.current.jumpTo({
      center: [currentLng, currentLat],
      bearing: bearingRef.current,
      pitch: 65,
      zoom: 16.5
    });
  };

  const animate = (time: number) => {
    if (lastTimeRef.current != null) {
      const deltaTime = time - lastTimeRef.current;
      const durationMs = 15000; // Base 15s duration
      const progressDelta = (deltaTime / durationMs) * playbackSpeedRef.current;
      let newProgress = progressRef.current + progressDelta;

      if (newProgress >= 1) {
        newProgress = 1;
        setIsPlaying(false);
      }

      progressRef.current = newProgress;
      setUiProgress(newProgress);
      updateCamera(newProgress);
    }
    
    lastTimeRef.current = time;
    if (progressRef.current < 1 && isPlayingRef.current) {
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      if (progressRef.current >= 1) {
        progressRef.current = 0;
        setUiProgress(0);
      }
      lastTimeRef.current = undefined; // Reset delta
      requestRef.current = requestAnimationFrame(animate);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying]);

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    progressRef.current = val;
    setUiProgress(val);
    updateCamera(val);
  };

  const togglePlayback = () => setIsPlaying(!isPlaying);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1rem', background: '#111', display: 'flex', flexDirection: 'column', gap: '1rem', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#ff6600', fontSize: '1.2rem', fontWeight: 900 }}>3D ROUTE REPLAY</h2>
          <button 
            onClick={onClose}
            style={{ padding: '0.6rem 1.2rem', background: '#333', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            CLOSE
          </button>
        </div>
        
        {/* Playback Controls */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: '#1a1a1a', padding: '0.8rem', borderRadius: '12px' }}>
          <button 
            onClick={togglePlayback}
            style={{ 
              width: '40px', height: '40px', borderRadius: '50%', background: '#ff6600', color: 'white', 
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' 
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          
          <input 
            type="range" 
            min="0" max="1" step="0.001" 
            value={uiProgress} 
            onChange={handleScrub}
            style={{ flex: 1, accentColor: '#ff6600', cursor: 'pointer' }}
          />
          
          <select 
            value={playbackSpeed} 
            onChange={e => setPlaybackSpeed(Number(e.target.value))}
            style={{ background: '#333', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer' }}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1.0x</option>
            <option value={2}>2.0x</option>
            <option value={4}>4.0x</option>
          </select>
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

          {/* Bike Location Marker */}
          {bikePosition && (
            <Marker longitude={bikePosition[0]} latitude={bikePosition[1]} anchor="bottom">
              <div style={{
                background: '#ff6600',
                padding: '3px',
                borderRadius: '50%',
                boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid white'
              }}>
                {userPhotoURL ? (
                  <img 
                    src={userPhotoURL} 
                    alt="Rider" 
                    style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#444', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                    🚲
                  </div>
                )}
              </div>
            </Marker>
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
