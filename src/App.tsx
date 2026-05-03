import { useState, useCallback, useRef } from 'react'
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker } from '@react-google-maps/api'
import axios from 'axios'

const LIBRARIES: ("places")[] = ["places"];

interface BikeSpecs {
  voltage: number;
  capacityAh: number;
  motorWatts: number;
  totalWeightLbs: number;
}

interface TripDetails {
  origin: string;
  destination: string;
  waypoints: string[];
  returnWaypoints: string[];
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

interface POI {
  id: string;
  name: string;
  address: string;
  position: google.maps.LatLngLiteral;
  type: string;
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
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  })

  const mapRef = useRef<google.maps.Map | null>(null);

  const [specs, setSpecs] = useState<BikeSpecs>({
    voltage: 48,
    capacityAh: 15,
    motorWatts: 750,
    totalWeightLbs: 220
  });

  const [trip, setTrip] = useState<TripDetails>({
    origin: '',
    destination: '',
    waypoints: [],
    returnWaypoints: []
  });

  const [mode, setMode] = useState<'eco' | 'sport'>('eco');
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [isCustomReturn, setIsCustomReturn] = useState(false);
  const [targetSpeedMph, setTargetSpeedMph] = useState(15);
  const [batteryInputMode, setBatteryInputMode] = useState<'percent' | 'voltage'>('percent');
  const [capacityInputMode, setCapacityInputMode] = useState<'ah' | 'wh'>('ah');
  const [startBattery, setStartBattery] = useState(100);
  const [startVoltage, setStartVoltage] = useState(54.6);
  const [response, setResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [poiCategory, setPoiCategory] = useState<string | null>(null);
  
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

  const swapLocations = () => {
    setTrip(prev => ({
      ...prev,
      origin: prev.destination,
      destination: prev.origin
    }));
    setResponse(null);
    setMetrics(null);
  };

  const addWaypoint = () => {
    setTrip(prev => ({ ...prev, waypoints: [...prev.waypoints, ''] }));
  };

  const removeWaypoint = (index: number) => {
    setTrip(prev => ({
      ...prev,
      waypoints: prev.waypoints.filter((_, i) => i !== index)
    }));
    setResponse(null);
    setMetrics(null);
  };

  const updateWaypoint = (index: number, value: string) => {
    setTrip(prev => ({
      ...prev,
      waypoints: prev.waypoints.map((wp, i) => i === index ? value : wp)
    }));
  };

  const addReturnWaypoint = () => {
    setTrip(prev => ({ ...prev, returnWaypoints: [...prev.returnWaypoints, ''] }));
  };

  const removeReturnWaypoint = (index: number) => {
    setTrip(prev => ({
      ...prev,
      returnWaypoints: prev.returnWaypoints.filter((_, i) => i !== index)
    }));
    setResponse(null);
    setMetrics(null);
  };

  const updateReturnWaypoint = (index: number, value: string) => {
    setTrip(prev => ({
      ...prev,
      returnWaypoints: prev.returnWaypoints.map((wp, i) => i === index ? value : wp)
    }));
  };

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const searchPOIs = (category: string) => {
    if (!mapRef.current || !response) return;
    setPoiCategory(category);

    const service = new google.maps.places.PlacesService(mapRef.current);
    const route = response.routes[0];
    const destination = route.legs[route.legs.length - 1].end_location;

    service.nearbySearch(
      {
        location: destination,
        radius: 5000, // 5km radius around destination
        keyword: category
      },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          const newPois = results.map(r => ({
            id: r.place_id || Math.random().toString(),
            name: r.name || 'Unknown',
            address: r.vicinity || 'No address',
            position: { lat: r.geometry?.location?.lat() || 0, lng: r.geometry?.location?.lng() || 0 },
            type: category
          }));
          setPois(newPois);
        }
      }
    );
  };

  const addPOIAsWaypoint = (poi: POI) => {
    // Using Coordinates (lat,lng) is 100% reliable for routing vs just a name
    const locationString = `${poi.position.lat},${poi.position.lng}`;
    setTrip(prev => ({
      ...prev,
      waypoints: [...prev.waypoints, locationString]
    }));
    setPois([]);
    setPoiCategory(null);
    handleCalculate(); 
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
    
    let totalDistanceMeters = 0;
    route.legs.forEach(leg => {
      totalDistanceMeters += leg.distance?.value || 0;
    });

    const distanceMiles = totalDistanceMeters * 0.000621371;
    const totalWhAvailable = capacityInputMode === 'ah' 
      ? specs.voltage * specs.capacityAh 
      : specs.capacityAh; 
    
    const multiplier = (isRoundTrip && !isCustomReturn) ? 2 : 1;
    const totalWeightKg = specs.totalWeightLbs * 0.453592;

    let effectiveStartPercent = startBattery;
    const { max, min } = getBatteryLevels(specs.voltage);

    if (batteryInputMode === 'voltage') {
      effectiveStartPercent = ((startVoltage - min) / (max - min)) * 100;
      effectiveStartPercent = Math.min(100, Math.max(0, effectiveStartPercent));
    }

    const recommendedSpeedMph = mode === 'eco' ? 15 : 22;

    try {
      const polyline = typeof route.overview_polyline === 'string' 
        ? route.overview_polyline 
        : (route.overview_polyline as any).points;

      const elevRes = await axios.get(`/api/elevation`, {
        params: { path: `enc:${polyline}` }
      });

      const lastLeg = route.legs[route.legs.length - 1];
      const lat = lastLeg.end_location.lat();
      const lon = lastLeg.end_location.lng();
      const weatherRes = await axios.get(`/api/weather`, { params: { lat, lon } });
      const { wind_speed, wind_deg } = weatherRes.data;

      const firstLeg = route.legs[0];
      const startLat = firstLeg.start_location.lat() * (Math.PI / 180);
      const startLon = firstLeg.start_location.lng() * (Math.PI / 180);
      const endLat = lastLeg.end_location.lat() * (Math.PI / 180);
      const endLon = lastLeg.end_location.lng() * (Math.PI / 180);
      const y = Math.sin(endLon - startLon) * Math.cos(endLat);
      const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLon - startLon);
      const routeBearing = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;

      const angleDiff = (wind_deg - routeBearing) * (Math.PI / 180);
      const headwindComponent = wind_speed * Math.cos(angleDiff);

      const elevations = elevRes.data.results || [];
      let elevationGainM = 0;
      for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i].elevation - elevations[i - 1].elevation;
        if (diff > 0) elevationGainM += diff;
      }

      const elevationGainFeet = elevationGainM * 3.28084;
      
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
  }, [mode, specs, isRoundTrip, targetSpeedMph, batteryInputMode, startBattery, startVoltage, capacityInputMode, trip, isCustomReturn]);

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

        {trip.waypoints.map((wp, idx) => (
          <section key={idx} className="form-group" style={{ position: 'relative' }}>
            <label>Stop {idx + 1}</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                placeholder="Enter waypoint" 
                value={wp}
                onChange={(e) => updateWaypoint(idx, e.target.value)}
              />
              <button 
                onClick={() => removeWaypoint(idx)}
                style={{ background: '#d93025', color: 'white', border: 'none', borderRadius: '4px', padding: '0 0.8rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          </section>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0 0 1rem 0' }}>
          <button 
            onClick={addWaypoint}
            style={{ background: '#333', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            + Add Stop
          </button>
          <button 
            onClick={swapLocations}
            style={{ 
              background: 'none', 
              border: '1px solid #444', 
              color: 'var(--accent-color)', 
              borderRadius: '50%', 
              width: '30px', 
              height: '30px', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem'
            }}
            title="Swap Origin/Destination"
          >
            ⇅
          </button>
        </div>

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
            <label>Capacity ({capacityInputMode === 'ah' ? 'Ah' : 'Wh'})</label>
            <div className="mode-toggle" style={{ marginBottom: '0.5rem' }}>
              <button 
                className={capacityInputMode === 'ah' ? 'active' : ''} 
                onClick={() => setCapacityInputMode('ah')}
              >
                Ah
              </button>
              <button 
                className={capacityInputMode === 'wh' ? 'active' : ''} 
                onClick={() => setCapacityInputMode('wh')}
              >
                Wh
              </button>
            </div>
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
          
          {isRoundTrip && (
            <div style={{ marginTop: '0.8rem', padding: '0.8rem', backgroundColor: '#2a2a2a', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input 
                  type="checkbox" 
                  checked={isCustomReturn}
                  onChange={(e) => setIsCustomReturn(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <label style={{ margin: 0, textTransform: 'none', fontSize: '0.8rem' }}>Different Return Route</label>
              </div>

              {isCustomReturn && (
                <div style={{ borderTop: '1px solid #444', paddingTop: '0.5rem' }}>
                  <label style={{ fontSize: '0.7rem' }}>Return Stops</label>
                  {trip.returnWaypoints.map((wp, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <input 
                        type="text" 
                        placeholder="Return stop" 
                        value={wp}
                        onChange={(e) => updateReturnWaypoint(idx, e.target.value)}
                        style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                      />
                      <button 
                        onClick={() => removeReturnWaypoint(idx)}
                        style={{ background: '#d93025', color: 'white', border: 'none', borderRadius: '4px', padding: '0 0.5rem', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={addReturnWaypoint}
                    style={{ width: '100%', background: '#333', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    + Add Return Stop
                  </button>
                </div>
              )}
            </div>
          )}
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

        {response && (
          <section className="form-group" style={{ marginTop: '1.5rem', backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <label style={{ fontSize: '0.7rem' }}>Explore Along Route</label>
            <div className="mode-toggle" style={{ flexWrap: 'wrap' }}>
              <button onClick={() => searchPOIs('bike shop')} className={poiCategory === 'bike shop' ? 'active' : ''}>🛠 Bike Shops</button>
              <button onClick={() => searchPOIs('cafe')} className={poiCategory === 'cafe' ? 'active' : ''}>☕ Cafes</button>
              <button onClick={() => searchPOIs('park')} className={poiCategory === 'park' ? 'active' : ''}>🌳 Parks</button>
              <button onClick={() => searchPOIs('charging station')} className={poiCategory === 'charging station' ? 'active' : ''}>⚡ Charging</button>
            </div>
            {pois.length > 0 && <p style={{ fontSize: '0.7rem', color: 'var(--secondary-text)', marginTop: '0.5rem' }}>Found {pois.length} spots. Click a marker on the map to add as stop!</p>}
          </section>
        )}

        {error && (
          <div style={{ color: '#d93025', fontSize: '0.8rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
            {error}
          </div>
        )}

        {metrics && (
          <div className="card metrics-card" style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--accent-color)' }}>ESTIMATED TRIP METRICS</h3>
            <p style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '0.2rem', color: 'white' }}>
              Remaining Battery: {metrics.batteryPercentUsed.toFixed(1)}%
            </p>
            <p style={{ fontSize: '1rem', color: 'var(--secondary-text)', marginBottom: '0.8rem' }}>
              Est. Final Voltage: {(getBatteryLevels(specs.voltage).min + (metrics.batteryPercentUsed / 100) * (getBatteryLevels(specs.voltage).max - getBatteryLevels(specs.voltage).min)).toFixed(1)}V
            </p>
            
            {metrics.windConditions && (
              <div style={{ margin: '0.8rem 0', fontSize: '0.85rem', padding: '0.6rem', backgroundColor: '#2a2a2a', borderRadius: '6px', border: '1px solid #444' }}>
                <strong style={{ color: 'white' }}>Wind:</strong> {metrics.windConditions.speed} mph | 
                <span style={{ color: metrics.windConditions.headwindComponent > 0 ? '#ff4444' : '#00c853', fontWeight: '600' }}>
                  {metrics.windConditions.headwindComponent > 0 ? ` +${metrics.windConditions.headwindComponent.toFixed(1)} mph Headwind` : ` ${Math.abs(metrics.windConditions.headwindComponent).toFixed(1)} mph Tailwind`}
                </span>
              </div>
            )}

            <div style={{ margin: '0.8rem 0', padding: '0.8rem', backgroundColor: '#2a2a2a', borderRadius: '6px', border: '1px solid #444' }}>
              <p style={{ color: 'white', fontSize: '0.9rem', fontWeight: '600' }}>
                Your Target Speed: {targetSpeedMph} mph
              </p>
              <p style={{ color: 'var(--secondary-text)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Rec. Speed for {mode.toUpperCase()}: {metrics.recommendedSpeedMph} mph
              </p>
            </div>
            <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid #333' }}>
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

            <button 
              onClick={() => {
                let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(trip.origin)}`;
                
                if (isRoundTrip && isCustomReturn) {
                  const loopWaypoints = [
                    ...trip.waypoints.filter(w => w.trim() !== ''),
                    trip.destination,
                    ...trip.returnWaypoints.filter(w => w.trim() !== '')
                  ];
                  url += `&destination=${encodeURIComponent(trip.origin)}`;
                  url += `&waypoints=${loopWaypoints.map(wp => encodeURIComponent(wp)).join('|')}`;
                } else {
                  const wpQuery = trip.waypoints.length > 0 
                    ? `&waypoints=${trip.waypoints.map(wp => encodeURIComponent(wp)).join('|')}` 
                    : '';
                  url += `&destination=${encodeURIComponent(trip.destination)}${wpQuery}`;
                }
                
                url += `&travelmode=bicycling`;
                window.open(url, '_blank');
              }}
              style={{ 
                width: '100%', 
                marginTop: '1rem', 
                padding: '0.6rem', 
                backgroundColor: '#34a853', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                fontWeight: '700', 
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              🚀 Open in Google Maps
            </button>

            <p style={{ marginTop: '1rem', fontSize: '0.65rem', color: '#777', fontStyle: 'italic', lineHeight: '1.2' }}>
              * Results may vary based on battery age, cycle count, and internal degradation.
            </p>
          </div>
        )}
      </aside>

      <main>
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={10}
            onLoad={onMapLoad}
          >
            {trip.origin && trip.destination && isLoading && !response && (
              <DirectionsService
                options={{
                  origin: trip.origin,
                  destination: (isRoundTrip && isCustomReturn) ? trip.origin : trip.destination,
                  waypoints: (isRoundTrip && isCustomReturn) 
                    ? [
                        ...trip.waypoints.filter(w => w.trim() !== '').map(w => ({ location: w, stopover: true })),
                        { location: trip.destination, stopover: true },
                        ...trip.returnWaypoints.filter(w => w.trim() !== '').map(w => ({ location: w, stopover: true }))
                      ]
                    : trip.waypoints.filter(wp => wp.trim() !== '').map(wp => ({ location: wp, stopover: true })),
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

            {pois.map(poi => (
              <Marker 
                key={poi.id}
                position={poi.position}
                title={poi.name}
                onClick={() => addPOIAsWaypoint(poi)}
                label={{
                  text: '➕',
                  color: 'white',
                  fontSize: '14px'
                }}
              />
            ))}
          </GoogleMap>
        ) : (
          <div className="map-placeholder">Loading Google Maps...</div>
        )}
      </main>

      <footer style={{ gridColumn: '1 / -1', marginTop: '3rem', padding: '1.5rem 0', borderTop: '1px solid #333', textAlign: 'center' }}>
        <p style={{ fontSize: '0.7rem', color: '#666', maxWidth: '600px', margin: '0 auto' }}>
          &copy; 2026 Range Anxiety. All calculations are theoretical estimates. Actual range is significantly impacted by battery health, tire pressure, and riding style.
        </p>
      </footer>
    </div>
  )
}

export default App
