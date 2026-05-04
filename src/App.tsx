import { useState, useCallback, useRef, useEffect } from 'react'
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker } from '@react-google-maps/api'
import axios from 'axios'
import { toPng } from 'html-to-image'
import { auth, db } from './firebase'
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import AdBanner from './components/AdBanner'

const LIBRARIES: ("places")[] = ["places"];

interface BikeSpecs {
  voltage: number | '';
  capacityAh: number | '';
  motorWatts: number | '';
  totalWeightLbs: number | '';
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
  details?: string;
}

const containerStyle = {
  width: '100%',
  height: '100%'
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
  const shareCardRef = useRef<HTMLDivElement>(null);

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
  const [ridingStyle, setRidingStyle] = useState<'relaxed' | 'aggressive'>('relaxed');
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [isCustomReturn, setIsCustomReturn] = useState(false);
  const [targetSpeedMph, setTargetSpeedMph] = useState<number | ''>(15);
  const [batteryInputMode, setBatteryInputMode] = useState<'percent' | 'voltage'>('percent');
  const [capacityInputMode, setCapacityInputMode] = useState<'ah' | 'wh'>('ah');
  const [startBattery, setStartBattery] = useState<number | ''>(100);
  const [startVoltage, setStartVoltage] = useState<number | ''>(54.6);
  const [response, setResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [poiCategory, setPoiCategory] = useState<string | null>(null);
  
  const [user, setUser] = useState<User | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setIsPro(userDoc.data().isPro || false);
          } else {
            await setDoc(doc(db, "users", currentUser.uid), {
              email: currentUser.email,
              isPro: false,
              createdAt: new Date()
            });
            setIsPro(false);
          }
        } catch (e) {
          console.error("Firestore error:", e);
        }
      } else {
        setIsPro(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async () => {
    setError(null);
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, authEmail, authPass);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPass);
      }
      setShowAuthModal(false);
      setAuthEmail('');
      setAuthPass('');
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message);
    }
  };

  const handleSignOut = () => signOut(auth);

  const handleUpgrade = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    try {
      const resp = await axios.post('/api/create-checkout-session', {
        userId: user.uid,
        email: user.email
      });
      
      if (resp.data.url) {
        window.location.href = resp.data.url;
      } else {
        throw new Error("No checkout URL returned.");
      }
    } catch (err: any) {
      console.error("Upgrade error:", err);
      const msg = err.response?.data?.error || err.message || "Failed to start checkout process.";
      setError(`Checkout Error: ${msg}`);
    }
  };

  const [savedBikes, setSavedBikes] = useState<SavedBike[]>([]);
  const [newBikeName, setNewBikeName] = useState('');

  useEffect(() => {
    if (!user) {
      const local = localStorage.getItem('ebike-saved-bikes');
      if (local) setSavedBikes(JSON.parse(local));
      else setSavedBikes([]);
    } else {
      const fetchCloudBikes = async () => {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists() && userDoc.data().bikes) {
            setSavedBikes(userDoc.data().bikes);
          }
        } catch (e) {
          console.error("Error fetching cloud bikes:", e);
        }
      };
      fetchCloudBikes();
    }
  }, [user]);

  const saveCurrentBike = async () => {
    if (!newBikeName) return;
    const newBike = { name: newBikeName, specs };
    const updated = [...savedBikes, newBike];
    
    setSavedBikes(updated);

    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid), {
          bikes: updated
        }, { merge: true });
      } catch (e) {
        console.error("Cloud save failed:", e);
        setError("Failed to sync bike to the cloud.");
      }
    } else {
      localStorage.setItem('ebike-saved-bikes', JSON.stringify(updated));
    }
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

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coords = `${latitude},${longitude}`;
        setTrip(prev => ({ ...prev, origin: coords }));
        setIsLoading(false);
      },
      (err) => {
        console.error("Geolocation error:", err);
        setError("Unable to retrieve your location. Ensure location permissions are enabled.");
        setIsLoading(false);
      }
    );
  };

  const searchByMapCenter = () => {
    if (!mapRef.current || !poiCategory) return;
    const center = mapRef.current.getCenter();
    if (!center) return;

    const service = new google.maps.places.PlacesService(mapRef.current);
    service.nearbySearch(
      {
        location: center,
        radius: 2000, 
        keyword: poiCategory
      },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          const newPois = results.map(r => ({
            id: r.place_id || Math.random().toString(),
            name: r.name || 'Unknown',
            address: r.vicinity || 'No address',
            position: { lat: r.geometry?.location?.lat() || 0, lng: r.geometry?.location?.lng() || 0 },
            type: poiCategory
          }));
          setPois(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const filtered = newPois.filter(p => !existingIds.has(p.id));
            return [...prev, ...filtered];
          });
        }
      }
    );
  };

  const searchPOIs = async (category: string) => {
    if (!mapRef.current || !response) return;
    
    // Gating for Charging Station
    if (category === 'charging station' && !isPro) {
      setError("Premium Charging Data requires PRO. Unlock to see real-time charging stations!");
      setShowAuthModal(!user);
      return;
    }

    setPoiCategory(category);
    setPois([]);

    const service = new google.maps.places.PlacesService(mapRef.current);
    const route = response.routes[0];
    const path = route.overview_path;

    const searchPoints = [
      path[0],
      path[Math.floor(path.length / 2)],
      path[path.length - 1]
    ];

    for (const point of searchPoints) {
      if (category === 'charging station') {
        // Use our premium Open Charge Map API for PRO users
        try {
          const lat = point.lat();
          const lon = point.lng();
          const ocmRes = await axios.get(`/api/charging`, { params: { lat, lon } });
          const batch = ocmRes.data;
          
          setPois(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const unique = batch.filter((p: any) => !existingIds.has(p.id));
            return [...prev, ...unique];
          });
        } catch (e) {
          console.error("Premium charging fetch failed:", e);
        }
      } else {
        // Regular Places Search for other categories
        service.nearbySearch(
          {
            location: point,
            radius: 5000, 
            keyword: category
          },
          (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
              const batch = results.map(r => ({
                id: r.place_id || Math.random().toString(),
                name: r.name || 'Unknown',
                address: r.vicinity || 'No address',
                position: { lat: r.geometry?.location?.lat() || 0, lng: r.geometry?.location?.lng() || 0 },
                type: category
              }));
              
              setPois(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const unique = batch.filter(p => !existingIds.has(p.id));
                return [...prev, ...unique];
              });
            }
          }
        );
      }
    }
  };

  const addPOIAsWaypoint = (poi: POI) => {
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

    const v = Number(specs.voltage) || 48;
    const c = Number(specs.capacityAh) || 15;
    const w = Number(specs.totalWeightLbs) || 220;
    const s = Number(targetSpeedMph) || 15;
    const sb = Number(startBattery);
    const sv = Number(startVoltage);

    const totalWhAvailable = capacityInputMode === 'ah' 
      ? (v * c)
      : c; 
    
    const multiplier = (isRoundTrip && !isCustomReturn) ? 2 : 1;
    const totalWeightKg = w * 0.453592;

    let effectiveStartPercent = sb;
    const { max, min } = getBatteryLevels(v);

    if (batteryInputMode === 'voltage') {
      effectiveStartPercent = ((sv - min) / (max - min)) * 100;
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
      
      const airSpeed = Math.max(5, s + headwindComponent);
      const styleMultiplier = ridingStyle === 'aggressive' ? 1.3 : 1.0;
      const Wh_base = 12 * styleMultiplier; 
      const Wh_drag = 0.04 * Math.pow(airSpeed, 2);
      const effectiveWhPerMile = Wh_base + Wh_drag;

      const Wh_flat = effectiveWhPerMile * distanceMiles * multiplier;
      const Wh_climb = (totalWeightKg * 9.81 * elevationGainM * multiplier) / (3600 * 0.75);
      
      const estimatedWh = Wh_flat + Wh_climb;
      const batteryPercentUsed = (estimatedWh / totalWhAvailable) * 100;
      const calculatedDurationMin = (distanceMiles / s) * 60;

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
      const Wh_drag = 0.05 * Math.pow(s, 2);
      const estWh = (Wh_base + Wh_drag) * distanceMiles * multiplier;

      setMetrics({
        distanceMiles: distanceMiles * multiplier,
        durationMin: (distanceMiles / s) * 60 * multiplier,
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
  }, [mode, specs, isRoundTrip, targetSpeedMph, batteryInputMode, startBattery, startVoltage, capacityInputMode, trip, isCustomReturn, ridingStyle]);

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
    if (value === '') {
      setSpecs(prev => ({ ...prev, [name]: '' }));
      return;
    }
    const parsed = parseFloat(value);
    setSpecs(prev => ({ ...prev, [name]: isNaN(parsed) ? '' : parsed }));
  };

  const downloadShareCard = async () => {
    if (shareCardRef.current === null) return;
    
    setIsLoading(true);
    try {
      const dataUrl = await toPng(shareCardRef.current, { cacheBust: true });
      const link = document.createElement('a');
      link.download = `range-anxiety-route-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to generate image:', err);
      setError('Failed to generate share image.');
    }
    setIsLoading(false);
  };

  return (
    <div className="container">
      <header>
        <h1>Range Anxiety</h1>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <button 
            onClick={user ? handleSignOut : () => setShowAuthModal(true)}
            style={{ 
              background: 'none', 
              border: '1px solid #444', 
              color: user ? 'white' : 'var(--accent-color)', 
              borderRadius: '20px', 
              padding: '0.4rem 1rem', 
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            {user ? `Sign Out (${isPro ? 'PRO' : 'Free'})` : 'Sign In'}
          </button>
          <button 
            className="calculate-btn" 
            onClick={handleCalculate} 
            disabled={isLoading}
            style={{ margin: 0, padding: '0.5rem 1.2rem', whiteSpace: 'nowrap' }}
          >
            {isLoading ? 'Calculating...' : 'Find Route'}
          </button>
        </div>
      </header>

      {showAuthModal && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(10px)'
        }}>
          <div className="card" style={{ width: '350px', border: '1px solid var(--accent-color)' }}>
            <h2 style={{ color: 'var(--accent-color)', marginBottom: '1.5rem', textAlign: 'center' }}>
              {isRegistering ? 'Create Account' : 'Sign In'}
            </h2>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} />
            </div>
            <button className="calculate-btn" style={{ width: '100%' }} onClick={handleAuth}>
              {isRegistering ? 'Register' : 'Login'}
            </button>
            <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#888' }}>
              {isRegistering ? 'Already have an account?' : 'Need an account?'}
              <button 
                onClick={() => setIsRegistering(!isRegistering)}
                style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', textDecoration: 'underline', marginLeft: '0.5rem' }}
              >
                {isRegistering ? 'Sign In' : 'Register Now'}
              </button>
            </p>
            <button 
              onClick={() => setShowAuthModal(false)}
              style={{ width: '100%', marginTop: '1.5rem', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              name="origin" 
              placeholder="e.g. Times Square, NY" 
              value={trip.origin}
              onChange={handleInputChange}
            />
            <button 
              onClick={useCurrentLocation}
              style={{ background: '#333', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '0 0.8rem', cursor: 'pointer' }}
              title="Use Current Location"
            >
              📍
            </button>
          </div>
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
                const val = e.target.value;
                if (val === '') { setStartBattery(''); return; }
                const parsed = parseFloat(val);
                setStartBattery(isNaN(parsed) ? '' : Math.min(100, Math.max(0, parsed)));
              }}
            />
          ) : (
            <input 
              type="number" 
              step="0.1"
              value={startVoltage}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') { setStartVoltage(''); return; }
                const parsed = parseFloat(val);
                setStartVoltage(isNaN(parsed) ? '' : parsed);
              }}
            />
          )}
        </section>

        <section className="form-group">
          <label>Target Speed (mph)</label>
          <input 
            type="number" 
            value={targetSpeedMph}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') { setTargetSpeedMph(''); return; }
              const parsed = parseFloat(val);
              setTargetSpeedMph(isNaN(parsed) ? '' : parsed);
            }}
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

        <section className="form-group">
          <label>Riding Style</label>
          <div className="mode-toggle">
            <button 
              className={ridingStyle === 'relaxed' ? 'active' : ''} 
              onClick={() => setRidingStyle('relaxed')}
            >
              Relaxed
            </button>
            <button 
              className={ridingStyle === 'aggressive' ? 'active' : ''} 
              onClick={() => setRidingStyle('aggressive')}
            >
              Aggressive
            </button>
          </div>
        </section>

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
              Est. Final Voltage: {(getBatteryLevels(Number(specs.voltage)).min + (metrics.batteryPercentUsed / 100) * (getBatteryLevels(Number(specs.voltage)).max - getBatteryLevels(Number(specs.voltage)).min)).toFixed(1)}V
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

            {isPro ? (
              <button 
                onClick={downloadShareCard}
                style={{ 
                  width: '100%', 
                  marginTop: '0.5rem', 
                  padding: '0.6rem', 
                  backgroundColor: 'var(--accent-color)', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px', 
                  fontWeight: '700', 
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                📸 Save Image to Share
              </button>
            ) : (
              <div style={{ marginTop: '0.5rem', padding: '0.6rem', backgroundColor: '#2a2a2a', borderRadius: '6px', border: '1px dashed #444', textAlign: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '0.3rem' }}>Want to share this with friends?</p>
                <button 
                  onClick={() => user ? handleUpgrade() : setShowAuthModal(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}
                >
                  Unlock Share Cards with PRO
                </button>
              </div>
            )}

            {(!isPro && user) && (
              <button 
                onClick={handleUpgrade}
                style={{ 
                  width: '100%', 
                  marginTop: '0.5rem', 
                  padding: '0.6rem', 
                  backgroundColor: '#ffffff', 
                  color: '#000000', 
                  border: 'none', 
                  borderRadius: '6px', 
                  fontWeight: '900', 
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  textTransform: 'uppercase'
                }}
              >
                ⭐ Go PRO / Remove Ads
              </button>
            )}

            <p style={{ marginTop: '1rem', fontSize: '0.65rem', color: '#777', fontStyle: 'italic', lineHeight: '1.2' }}>
              * Results may vary based on battery age, cycle count, and internal degradation.
            </p>
          </div>
        )}

        <AdBanner isPro={isPro} />
        
        {!isPro && (
          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <button 
              onClick={() => user ? handleUpgrade() : setShowAuthModal(true)}
              style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.7rem', cursor: 'pointer', textTransform: 'uppercase', fontWeight: 'bold' }}
            >
              ⭐ Remove Ads with PRO
            </button>
          </div>
        )}
      </aside>

      <main style={{ position: 'relative' }}>
        {isLoaded ? (
          <>
            {poiCategory && (
              <button 
                onClick={searchByMapCenter}
                style={{ 
                  position: 'absolute',
                  top: '1rem',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 1000,
                  backgroundColor: '#ffffff',
                  color: '#333',
                  border: '1px solid #ccc',
                  padding: '0.6rem 1rem',
                  borderRadius: '24px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                🔍 Search This Area
              </button>
            )}
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
        </>
        ) : (
          <div className="map-placeholder">Loading Google Maps...</div>
        )}
      </main>

      <footer style={{ gridColumn: '1 / -1', marginTop: '3rem', padding: '1.5rem 0', borderTop: '1px solid #333', textAlign: 'center' }}>
        <p style={{ fontSize: '0.7rem', color: '#666', maxWidth: '600px', margin: '0 auto' }}>
          &copy; 2026 Range Anxiety. All calculations are theoretical estimates. Actual range is significantly impacted by battery health, tire pressure, and riding style.
        </p>
      </footer>

      {metrics && response && (
        <div className="share-card-container">
          <div ref={shareCardRef} className="share-card">
            <div className="share-card-header">
              <div className="share-card-logo">Range Anxiety</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8rem', color: '#888' }}>Planned Route Summary</div>
                <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{trip.origin.split(',')[0]} → {trip.destination.split(',')[0]}</div>
              </div>
            </div>

            <img 
              className="share-card-map"
              src={`https://maps.googleapis.com/maps/api/staticmap?size=600x300&scale=2&maptype=roadmap&theme=dark&style=element:geometry%7Ccolor:0x242f3e&style=element:labels.text.stroke%7Ccolor:0x242f3e&style=element:labels.text.fill%7Ccolor:0x746855&style=feature:administrative.locality%7Celement:labels.text.fill%7Ccolor:0xd59563&style=feature:poi%7Celement:labels.text.fill%7Ccolor:0xd59563&style=feature:poi.park%7Celement:geometry%7Ccolor:0x263c3f&style=feature:poi.park%7Celement:labels.text.fill%7Ccolor:0x6b9a76&style=feature:road%7Celement:geometry%7Ccolor:0x38414e&style=feature:road%7Celement:geometry.stroke%7Ccolor:0x212a37&style=feature:road%7Celement:labels.text.fill%7Ccolor:0x9ca5b3&style=feature:road.highway%7Celement:geometry%7Ccolor:0x746855&style=feature:road.highway%7Celement:geometry.stroke%7Ccolor:0x1f2835&style=feature:road.highway%7Celement:labels.text.fill%7Ccolor:0xf3d19c&style=feature:transit%7Celement:geometry%7Ccolor:0x2f3948&style=feature:transit.station%7Celement:labels.text.fill%7Ccolor:0xd59563&style=feature:water%7Celement:geometry%7Ccolor:0x17263c&style=feature:water%7Celement:labels.text.fill%7Ccolor:0x515c6d&style=feature:water%7Celement:labels.text.stroke%7Ccolor:0x17263c&path=color:0xff6600%7Cweight:5%7Cenc:${encodeURIComponent(typeof response.routes[0].overview_polyline === 'string' ? response.routes[0].overview_polyline : (response.routes[0].overview_polyline as any).points)}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`}
              alt="Route Map"
            />

            <div className="share-card-metrics">
              <div className="share-metric-box" style={{ gridColumn: 'span 2', background: '#252525', border: '1px solid #444' }}>
                <div className="share-metric-label">Bike Configuration</div>
                <div className="share-metric-value" style={{ fontSize: '1rem' }}>
                  {specs.voltage}V {specs.capacityAh}{capacityInputMode.toUpperCase()} | {specs.totalWeightLbs} lbs | {ridingStyle.toUpperCase()} Style
                </div>
              </div>
              <div className="share-metric-box">
                <div className="share-metric-label">Remaining Battery</div>
                <div className="share-metric-value">{metrics.batteryPercentUsed.toFixed(1)}%</div>
              </div>
              <div className="share-metric-box">
                <div className="share-metric-label">Est. Final Voltage</div>
                <div className="share-metric-value">{(getBatteryLevels(Number(specs.voltage)).min + (metrics.batteryPercentUsed / 100) * (getBatteryLevels(Number(specs.voltage)).max - getBatteryLevels(Number(specs.voltage)).min)).toFixed(1)}V</div>
              </div>
              <div className="share-metric-box">
                <div className="share-metric-label">Total Distance</div>
                <div className="share-metric-value">{metrics.distanceMiles.toFixed(1)} mi</div>
              </div>
              <div className="share-metric-box">
                <div className="share-metric-label">Target Speed</div>
                <div className="share-metric-value">{targetSpeedMph} mph</div>
              </div>
              <div className="share-metric-box" style={{ gridColumn: 'span 2' }}>
                <div className="share-metric-label">Elevation Gain</div>
                <div className="share-metric-value">{metrics.elevationGainFeet.toFixed(0)} ft total ascent</div>
              </div>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.7rem', color: '#666' }}>
              Planned with Range Anxiety E-Bike Tool
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
