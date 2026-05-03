import { useState, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer } from '@react-google-maps/api'
import axios from 'axios'

interface BikeSpecs {
  voltage: number;
  capacityAh: number;
  motorWatts: number;
  totalWeightLbs: number;
}

interface TripDetails {
  origin: string;
  destination: string;
}

interface RouteMetrics {
  distanceMiles: number;
  durationMin: number;
  elevationGainFeet: number;
  estimatedWh: number;
  batteryPercentUsed: number;
  recommendedSpeedMph: number;
  windConditions?: {
    speed: number;
    direction: number;
    headwindComponent: number;
  };
}

interface SavedBike {
  name: string;
  specs: BikeSpecs;
}

const containerStyle = {
  width: '100%',
  height: '500px',
  borderRadius: '8px'
};

const center = {
  lat: 40.7128,
  lng: -74.0060
};

function App() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""
  })

  const [specs, setSpecs] = useState<BikeSpecs>({
    voltage: 48,
    capacityAh: 15,
    motorWatts: 750,
    totalWeightLbs: 220
  });

  const [trip, setTrip] = useState<TripDetails>({
    origin: '',
    destination: ''
  });

  const [mode, setMode] = useState<'eco' | 'sport'>('eco');
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [targetSpeedMph, setTargetSpeedMph] = useState(15);
  const [batteryInputMode, setBatteryInputMode] = useState<'percent' | 'voltage'>('percent');
  const [startBattery, setStartBattery] = useState(100);
  const [startVoltage, setStartVoltage] = useState(54.6);
  const [response, setResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [savedBikes, setSavedBikes] = useState<SavedBike[]>(() => {
    const local = localStorage.getItem('ebike-saved-bikes');
    return local ? JSON.parse(local) : [];
  });
  const [newBikeName, setNewBikeName] = useState('');

  const saveCurrentBike = () => {
    if (!newBikeName) return;
    const updated = [...savedBikes, { name: newBikeName, specs }];
    setSavedBikes(updated);
    localStorage.setItem('ebike-saved-bikes', JSON.stringify(updated));
    setNewBikeName('');
  };

  const loadBike = (bike: SavedBike) => {
    setSpecs(bike.specs);
  };

  const getBatteryLevels = (nominal: number) => {
    const series = Math.round(nominal / 3.7);
    return {
      max: series * 4.2,
      min: series * 3.0
    };
  };

  const calculateEfficiency = async (directions: google.maps.DirectionsResult) => {
    setError(null);
    const route = directions.routes[0];
    const leg = route.legs[0];
    
    const distanceMiles = (leg.distance?.value || 0) * 0.000621371;
    const totalWhAvailable = specs.voltage * specs.capacityAh;
    const multiplier = isRoundTrip ? 2 : 1;
    const totalWeightKg = specs.totalWeightLbs * 0.453592;

    let effectiveStartPercent = startBattery;
    const { max, min } = getBatteryLevels(specs.voltage);

    if (batteryInputMode === 'voltage') {
      effectiveStartPercent = ((startVoltage - min) / (max - min)) * 100;
      effectiveStartPercent = Math.min(100, Math.max(0, effectiveStartPercent));
    }

    const recommendedSpeedMph = mode === 'eco' ? 15 : 22;

    try {
      // 1. Fetch Elevation
      const polyline = typeof route.overview_polyline === 'string' 
        ? route.overview_polyline 
        : (route.overview_polyline as any).points;

      const elevRes = await axios.get(`/api/elevation`, {
        params: { path: `enc:${polyline}` }
      });

      // 2. Fetch Weather (using destination coordinates as a sample)
      const lat = leg.end_location.lat();
      const lon = leg.end_location.lng();
      const weatherRes = await axios.get(`/api/weather`, { params: { lat, lon } });
      const { wind_speed, wind_deg } = weatherRes.data;

      // 3. Calculate Headwind Component
      // Simplification: Calculate average route bearing
      const startLat = leg.start_location.lat() * (Math.PI / 180);
      const startLon = leg.start_location.lng() * (Math.PI / 180);
      const endLat = leg.end_location.lat() * (Math.PI / 180);
      const endLon = leg.end_location.lng() * (Math.PI / 180);
      const y = Math.sin(endLon - startLon) * Math.cos(endLat);
      const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLon - startLon);
      const routeBearing = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;

      // Angle difference between wind and route
      const angleDiff = (wind_deg - routeBearing) * (Math.PI / 180);
      const headwindComponent = wind_speed * Math.cos(angleDiff);

      const elevations = elevRes.data.results || [];
      let elevationGainM = 0;
      for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i].elevation - elevations[i - 1].elevation;
        if (diff > 0) elevationGainM += diff;
      }

      const elevationGainFeet = elevationGainM * 3.28084;
      
      // Physics: Speed-based Drag + Wind
      const airSpeed = Math.max(5, targetSpeedMph + headwindComponent);
      const Wh_base = 12; 
      const Wh_drag = 0.04 * Math.pow(airSpeed, 2);
      const effectiveWhPerMile = Wh_base + Wh_drag;

      const Wh_flat = effectiveWhPerMile * distanceMiles * multiplier;
      const Wh_climb = (totalWeightKg * 9.81 * elevationGainM * multiplier) / (3600 * 0.75);
      
      const estimatedWh = Wh_flat + Wh_climb;
      const batteryPercentUsed = (estimatedWh / totalWhAvailable) * 100;
      const calculatedDurationMin = (distanceMiles / targetSpeedMph) * 60;

      setMetrics({
        distanceMiles: distanceMiles * multiplier,
        durationMin: calculatedDurationMin * multiplier,
        elevationGainFeet: elevationGainFeet * multiplier,
        estimatedWh,
        batteryPercentUsed: (effectiveStartPercent - batteryPercentUsed),
        recommendedSpeedMph,
        windConditions: {
          speed: wind_speed,
          direction: wind_deg,
          headwindComponent
        }
      });
    } catch (err) {
      console.error('Efficiency calculation failed:', err);
      setError('Note: Some data (Elevation/Weather) unavailable. Using simplified estimates.');
      
      const Wh_base = 15;
      const Wh_drag = 0.05 * Math.pow(targetSpeedMph, 2);
      const estWh = (Wh_base + Wh_drag) * distanceMiles * multiplier;

      setMetrics({
        distanceMiles: distanceMiles * multiplier,
        durationMin: (distanceMiles / targetSpeedMph) * 60 * multiplier,
        elevationGainFeet: 0,
        estimatedWh: estWh,
        batteryPercentUsed: (effectiveStartPercent - (estWh / totalWhAvailable) * 100),
        recommendedSpeedMph
      });
    }
    setIsLoading(false);
  };

  const directionsCallback = useCallback((
    res: google.maps.DirectionsResult | null,
    status: google.maps.DirectionsStatus
  ) => {
    if (status === 'OK' && res !== null) {
      setResponse(res);
      calculateEfficiency(res);
    } else {
      console.log('Directions request failed:', status);
      setIsLoading(false);
      if (status === 'REQUEST_DENIED') {
        setError('Error: Google API Key is not authorized for Directions. Please ENABLE "Directions API" and "Elevation API" in your Google Cloud Console.');
      } else if (status === 'ZERO_RESULTS') {
        setError('Error: No routes found between these locations.');
      } else {
        setError(`Error: Google Maps could not find a route (${status}).`);
      }
    }
  }, [mode, specs, isRoundTrip, targetSpeedMph, batteryInputMode, startBattery, startVoltage]);

  const handleCalculate = () => {
    if (trip.origin !== '' && trip.destination !== '') {
      setError(null);
      setIsLoading(true);
      setResponse(null);
      setMetrics(null);
    } else {
      setError('Please enter both an origin and a destination.');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTrip(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSpecChange = (name: keyof BikeSpecs, value: string) => {
    const parsed = parseFloat(value);
    setSpecs(prev => ({ ...prev, [name]: isNaN(parsed) ? 0 : parsed }));
  };

  return (
    <div className="container">
      <header>
        <h1>Range Anxiety</h1>
        <div style={{ fontSize: '0.8rem', color: 'var(--secondary-text)' }}>
          Efficient E-Bike Planning
        </div>
      </header>

      <aside className="sidebar">
        <section className="form-group" style={{ backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <label>Favorite Bikes</label>
          <select 
            style={{ marginBottom: '0.5rem' }} 
            onChange={(e) => {
              const bike = savedBikes.find(b => b.name === e.target.value);
              if (bike) loadBike(bike);
            }}
            value=""
          >
            <option value="" disabled>Load a saved bike...</option>
            {savedBikes.map((bike, idx) => (
              <option key={idx} value={bike.name}>{bike.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              placeholder="Bike Name" 
              value={newBikeName} 
              onChange={(e) => setNewBikeName(e.target.value)}
              style={{ padding: '0.4rem', fontSize: '0.85rem' }}
            />
            <button 
              onClick={saveCurrentBike}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer', backgroundColor: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px' }}
            >
              Save
            </button>
          </div>
        </section>

        <section className="form-group">
          <label>Origin</label>
          <input 
            type="text" 
            name="origin" 
            placeholder="e.g. Times Square, NY" 
            value={trip.origin}
            onChange={handleInputChange}
          />
        </section>

        <section className="form-group">
          <label>Destination</label>
          <input 
            type="text" 
            name="destination" 
            placeholder="e.g. Central Park, NY" 
            value={trip.destination}
            onChange={handleInputChange}
          />
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <section className="form-group">
            <label>Voltage (V)</label>
            <input 
              type="number" 
              name="voltage" 
              value={specs.voltage}
              onChange={(e) => handleSpecChange('voltage', e.target.value)}
            />
          </section>
          <section className="form-group">
            <label>Capacity (Ah)</label>
            <input 
              type="number" 
              name="capacityAh" 
              value={specs.capacityAh}
              onChange={(e) => handleSpecChange('capacityAh', e.target.value)}
            />
          </section>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <section className="form-group">
            <label>Motor (W)</label>
            <input 
              type="number" 
              name="motorWatts" 
              value={specs.motorWatts}
              onChange={(e) => handleSpecChange('motorWatts', e.target.value)}
            />
          </section>
          <section className="form-group">
            <label>Weight (lbs)</label>
            <input 
              type="number" 
              name="totalWeightLbs" 
              value={specs.totalWeightLbs}
              onChange={(e) => handleSpecChange('totalWeightLbs', e.target.value)}
            />
          </section>
        </div>

        <section className="form-group">
          <label>Start Battery</label>
          <div className="mode-toggle" style={{ marginBottom: '0.5rem' }}>
            <button 
              className={batteryInputMode === 'percent' ? 'active' : ''} 
              onClick={() => setBatteryInputMode('percent')}
            >
              %
            </button>
            <button 
              className={batteryInputMode === 'voltage' ? 'active' : ''} 
              onClick={() => setBatteryInputMode('voltage')}
            >
              Voltage
            </button>
          </div>
          {batteryInputMode === 'percent' ? (
            <input 
              type="number" 
              value={startBattery}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setStartBattery(isNaN(val) ? 0 : Math.min(100, Math.max(0, val)));
              }}
            />
          ) : (
            <input 
              type="number" 
              step="0.1"
              value={startVoltage}
              onChange={(e) => setStartVoltage(parseFloat(e.target.value) || 0)}
            />
          )}
        </section>

        <section className="form-group">
          <label>Target Speed (mph)</label>
          <input 
            type="number" 
            value={targetSpeedMph}
            onChange={(e) => setTargetSpeedMph(parseFloat(e.target.value) || 0)}
          />
        </section>

        <section className="form-group">
          <label>Trip Type</label>
          <div className="mode-toggle">
            <button 
              className={!isRoundTrip ? 'active' : ''} 
              onClick={() => setIsRoundTrip(false)}
            >
              One Way
            </button>
            <button 
              className={isRoundTrip ? 'active' : ''} 
              onClick={() => setIsRoundTrip(true)}
            >
              Round Trip
            </button>
          </div>
        </section>

        <section className="form-group">
          <label>Efficiency Mode</label>
          <div className="mode-toggle">
            <button 
              className={mode === 'eco' ? 'active' : ''} 
              onClick={() => setMode('eco')}
            >
              ECO
            </button>
            <button 
              className={mode === 'sport' ? 'active' : ''} 
              onClick={() => setMode('sport')}
            >
              SPORT
            </button>
          </div>
        </section>

        <button className="calculate-btn" onClick={handleCalculate} disabled={isLoading}>
          {isLoading ? 'Calculating...' : 'Find Efficient Route'}
        </button>

        {error && (
          <div style={{ color: '#d93025', fontSize: '0.8rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
            {error}
          </div>
        )}

        {metrics && (
          <div className="card" style={{ marginTop: '1.5rem', borderLeft: '4px solid var(--accent-color)' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>ESTIMATED TRIP METRICS</h3>
            <p style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.2rem' }}>
              Remaining Battery: {metrics.batteryPercentUsed.toFixed(1)}%
            </p>
            <p style={{ fontSize: '1rem', color: 'var(--secondary-text)', marginBottom: '0.5rem' }}>
              Est. Final Voltage: {(getBatteryLevels(specs.voltage).min + (metrics.batteryPercentUsed / 100) * (getBatteryLevels(specs.voltage).max - getBatteryLevels(specs.voltage).min)).toFixed(1)}V
            </p>
            
            {metrics.windConditions && (
              <div style={{ margin: '0.5rem 0', fontSize: '0.85rem', padding: '0.5rem', backgroundColor: '#f0f7ff', borderRadius: '4px' }}>
                <strong>Wind:</strong> {metrics.windConditions.speed} mph | 
                <span style={{ color: metrics.windConditions.headwindComponent > 0 ? '#d93025' : '#188038' }}>
                  {metrics.windConditions.headwindComponent > 0 ? ` +${metrics.windConditions.headwindComponent.toFixed(1)} mph Headwind` : ` ${Math.abs(metrics.windConditions.headwindComponent).toFixed(1)} mph Tailwind`}
                </span>
              </div>
            )}

            <div style={{ margin: '0.8rem 0', padding: '0.8rem', backgroundColor: 'var(--card-bg)', borderRadius: '4px' }}>
              <p style={{ color: 'var(--text-color)', fontSize: '0.9rem', fontWeight: '600' }}>
                Your Target Speed: {targetSpeedMph} mph
              </p>
              <p style={{ color: 'var(--secondary-text)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Rec. Speed for {mode.toUpperCase()}: {metrics.recommendedSpeedMph} mph
              </p>
            </div>
            <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border-color)' }}>
              <p style={{ color: 'var(--secondary-text)', fontSize: '0.85rem' }}>
                Distance: {metrics.distanceMiles.toFixed(1)} miles
              </p>
              <p style={{ color: 'var(--secondary-text)', fontSize: '0.85rem' }}>
                Elevation Gain: {metrics.elevationGainFeet.toFixed(0)} ft
              </p>
              <p style={{ color: 'var(--secondary-text)', fontSize: '0.85rem' }}>
                Energy Used: {metrics.estimatedWh.toFixed(0)} Wh
              </p>
            </div>
          </div>
        )}
      </aside>

      <main>
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={10}
          >
            {trip.origin && trip.destination && isLoading && !response && (
              <DirectionsService
                options={{
                  destination: trip.destination,
                  origin: trip.origin,
                  travelMode: google.maps.TravelMode.BICYCLING,
                }}
                callback={directionsCallback}
              />
            )}

            {response && (
              <DirectionsRenderer
                options={{
                  directions: response
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="map-placeholder">Loading Google Maps...</div>
        )}
      </main>
    </div>
  )
}

export default App
