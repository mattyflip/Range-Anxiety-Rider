import { useState, useCallback, useRef, useEffect } from 'react'
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker, InfoWindow } from '@react-google-maps/api'
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
  bikeWeightLbs: number | '';
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

const STANDARD_BIKES: SavedBike[] = [
  // --- Moped & High Performance ---
  { name: "Macfox X1 / X1S", specs: { voltage: 48, capacityAh: 10.4, motorWatts: 500, bikeWeightLbs: 65 } },
  { name: "Macfox X2", specs: { voltage: 48, capacityAh: 15.6, motorWatts: 750, bikeWeightLbs: 75 } },
  { name: "Ride1Up Revv 1", specs: { voltage: 52, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 93 } },
  { name: "Super73 S2", specs: { voltage: 48, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 73 } },
  { name: "Super73 R-Adventure", specs: { voltage: 48, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 80 } },
  { name: "Goat Motor Goat V3", specs: { voltage: 60, capacityAh: 20, motorWatts: 1000, bikeWeightLbs: 85 } },
  { name: "Ridstar Q20 Pro", specs: { voltage: 52, capacityAh: 20, motorWatts: 2000, bikeWeightLbs: 88 } },
  { name: "Onyx RCR", specs: { voltage: 72, capacityAh: 41, motorWatts: 3000, bikeWeightLbs: 145 } },
  { name: "Sur-Ron Light Bee X", specs: { voltage: 60, capacityAh: 32, motorWatts: 6000, bikeWeightLbs: 110 } },
  { name: "Talaria Sting R", specs: { voltage: 60, capacityAh: 45, motorWatts: 8000, bikeWeightLbs: 145 } },

  // --- Commuter & Everyday ---
  { name: "Aventon Level.2", specs: { voltage: 48, capacityAh: 14, motorWatts: 500, bikeWeightLbs: 62 } },
  { name: "Velotric Discover 1", specs: { voltage: 48, capacityAh: 14.4, motorWatts: 500, bikeWeightLbs: 65 } },
  { name: "Velotric Nomad 1", specs: { voltage: 48, capacityAh: 14.4, motorWatts: 750, bikeWeightLbs: 73 } },
  { name: "Vanpowers City Vanture", specs: { voltage: 36, capacityAh: 7, motorWatts: 350, bikeWeightLbs: 35 } },
  { name: "Vanpowers UrbanGlide-Ultra", specs: { voltage: 48, capacityAh: 15, motorWatts: 500, bikeWeightLbs: 70 } },
  { name: "Ride1Up 700 Series", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 62 } },
  { name: "Lectric XP 3.0", specs: { voltage: 48, capacityAh: 14, motorWatts: 500, bikeWeightLbs: 64 } },
  { name: "Rad Power RadRunner 2", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 65 } },
  { name: "Electra Townie Go! 7D", specs: { voltage: 36, capacityAh: 7, motorWatts: 250, bikeWeightLbs: 48 } },

  // --- Utility & Delivery ---
  { name: "Arrow 10 (Delivery)", specs: { voltage: 48, capacityAh: 20, motorWatts: 500, bikeWeightLbs: 65 } },
  { name: "Fly-7 (Delivery)", specs: { voltage: 48, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 75 } },
  { name: "Senada Herald", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 68 } },
  { name: "Sondors MadMod", specs: { voltage: 48, capacityAh: 21, motorWatts: 750, bikeWeightLbs: 80 } },
  { name: "BOB E-Trike (PH)", specs: { voltage: 48, capacityAh: 20, motorWatts: 500, bikeWeightLbs: 110 } },
  { name: "Tern GSD S10", specs: { voltage: 36, capacityAh: 11, motorWatts: 250, bikeWeightLbs: 75 } }
];

interface POI {
  id: string;
  name: string;
  address: string;
  position: google.maps.LatLngLiteral;
  type: string;
  details?: string;
}

const center = { lat: 40.7128, lng: -74.0060 };

function App() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const [specs, setSpecs] = useState<BikeSpecs>({ voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 65 });
  const [riderWeightLbs, setRiderWeightLbs] = useState<number | ''>(200);
  
  // Advanced Factors
  const [ambientTempF, setAmbientTempF] = useState<number | ''>(70);
  const [tireType, setTireType] = useState<'road' | 'knobby'>('road');
  const [tirePressurePsi, setTirePressurePsi] = useState<number | ''>(''); // Empty assumes optimal

  const [trip, setTrip] = useState<TripDetails>({ origin: '', destination: '', waypoints: [], returnWaypoints: [] });
  const [controlType, setControlType] = useState<'switch' | 'pas'>('pas');
  const [mode, setMode] = useState<'eco' | 'normal' | 'sport'>('normal');
  const [pasLevel, setPasLevel] = useState<number>(3); // 1-5 default

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
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const [bikeSearchQuery, setBikeSearchQuery] = useState("");
  const [showBikeResults, setShowBikeResults] = useState(false);
  const [savedBikes, setSavedBikes] = useState<SavedBike[]>([]);
  const [newBikeName, setNewBikeName] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setIsPro(userDoc.data().isPro || false);
            if (userDoc.data().bikes) setSavedBikes(userDoc.data().bikes);
          } else {
            await setDoc(doc(db, "users", currentUser.uid), { email: currentUser.email, isPro: false, createdAt: new Date() });
            setIsPro(false);
          }
        } catch (e) { console.error("Firestore error:", e); }
      } else {
        setIsPro(false);
        const local = localStorage.getItem('ebike-saved-bikes');
        if (local) setSavedBikes(JSON.parse(local));
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async () => {
    setError(null);
    try {
      if (isRegistering) { await createUserWithEmailAndPassword(auth, authEmail, authPass); }
      else { await signInWithEmailAndPassword(auth, authEmail, authPass); }
      setShowAuthModal(false); setAuthEmail(''); setAuthPass('');
    } catch (err: any) { console.error("Auth error:", err); setError(err.message); }
  };

  const handleSignOut = () => signOut(auth);

  const handleUpgrade = async () => {
    if (!user) { setShowAuthModal(true); return; }
    try {
      const resp = await axios.post('/api/create-checkout-session', { userId: user.uid, email: user.email });
      if (resp.data.url) { window.location.href = resp.data.url; }
      else { throw new Error("No checkout URL returned."); }
    } catch (err: any) {
      console.error("Upgrade error:", err);
      setError(`Checkout Error: ${err.response?.data?.error || err.message}`);
    }
  };

  const saveCurrentBike = async () => {
    if (!newBikeName) return;
    const newBike = { name: newBikeName, specs };
    const updated = [...savedBikes, newBike];
    setSavedBikes(updated);
    if (user) {
      try { await setDoc(doc(db, "users", user.uid), { bikes: updated }, { merge: true }); }
      catch (e) { console.error("Cloud save failed:", e); setError("Failed to sync bike to the cloud."); }
    } else { localStorage.setItem('ebike-saved-bikes', JSON.stringify(updated)); }
    setNewBikeName('');
  };

  const getBatteryLevels = (v: number) => {
    if (v >= 72) return { min: 60, max: 84 };
    if (v >= 60) return { min: 50, max: 70 };
    if (v >= 52) return { min: 42, max: 58.8 };
    if (v >= 48) return { min: 39, max: 54.6 };
    if (v >= 36) return { min: 30, max: 42 };
    return { min: v * 0.8, max: v * 1.15 };
  };

  const loadBike = (bike: SavedBike) => {
    setSpecs(bike.specs);
    setBikeSearchQuery(bike.name);
    setShowBikeResults(false);
    if (bike.specs.voltage) {
      setStartVoltage(getBatteryLevels(Number(bike.specs.voltage)).max);
    }
    // Simple heuristic to set control type
    if (Number(bike.specs.voltage) >= 60 || bike.name.includes("Onyx") || bike.name.includes("Sur-Ron") || bike.name.includes("Talaria")) {
      setControlType('switch');
    } else {
      setControlType('pas');
    }
  };

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTrip(prev => ({ ...prev, [name]: value }));
  };

  const handleSpecChange = (name: keyof BikeSpecs, value: string) => {
    const val = value === '' ? '' : parseFloat(value);
    setSpecs(prev => ({ ...prev, [name]: isNaN(Number(val)) ? '' : val }));
  };

  const directionsCallback = (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
    if (status === 'OK' && result) { setResponse(result); calculateMetrics(result); }
    else { console.error('Directions error:', status); setError(`Google Maps Directions Error: ${status}`); setIsLoading(false); }
  };

  const calculateBearing = (start: {lat: number, lng: number}, end: {lat: number, lng: number}) => {
    const startLat = (start.lat * Math.PI) / 180;
    const startLng = (start.lng * Math.PI) / 180;
    const endLat = (end.lat * Math.PI) / 180;
    const endLng = (end.lng * Math.PI) / 180;
    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };

  const calculateMetrics = async (result: google.maps.DirectionsResult) => {
    try {
      let totalDistMeters = 0;
      let totalDurationSec = 0;
      const route = result.routes[0];
      route.legs.forEach(leg => {
        totalDistMeters += (leg.distance?.value || 0);
        totalDurationSec += (leg.duration?.value || 0);
      });

      const distMiles = totalDistMeters / 1609.34;
      const path = route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
      const routeBearing = calculateBearing(path[0], path[path.length - 1]);

      let gainFeet = 0;
      try { 
        const elevResp = await axios.post('/api/elevation', { path }); 
        gainFeet = elevResp.data.gain; 
      } catch (e) { console.warn("Elevation API failed", e); }

      let headwindMph = 0;
      let windSpeed = 0;
      let windDir = 0;
      try {
        const weatherResp = await axios.get(`/api/weather?lat=${path[0].lat}&lng=${path[0].lng}`);
        windSpeed = weatherResp.data.wind_speed;
        windDir = weatherResp.data.wind_deg;
        const angleDiff = (windDir - routeBearing + 360) % 360;
        headwindMph = windSpeed * Math.cos((angleDiff * Math.PI) / 180);
      } catch (e) { console.warn("Weather API failed", e); }

      // --- PHYSICS-BASED MODEL ---
      const bikeWeight = Number(specs.bikeWeightLbs) || 60;
      const riderWeight = Number(riderWeightLbs) || 200;
      const massKg = (bikeWeight + riderWeight) * 0.453592;
      const velocityMps = (Number(targetSpeedMph) || 15) * 0.44704;
      
      let Crr = tireType === 'road' ? 0.007 : 0.015;
      if (tirePressurePsi !== '' && tirePressurePsi < 35) {
        Crr += (35 - tirePressurePsi) / 5 * 0.002;
      }
      const ForceRolling = Crr * massKg * 9.81;

      const tempF = Number(ambientTempF) || 70;
      const tempC = (tempF - 32) * 5 / 9;
      const rho = 1.225 * (288.15 / (273.15 + tempC));
      const CdA = 0.55;
      const relativeVelocityMps = Math.max(0.1, velocityMps + (headwindMph * 0.44704));
      const ForceDrag = 0.5 * rho * CdA * Math.pow(relativeVelocityMps, 2);

      const gainMeters = gainFeet * 0.3048;
      let thermalEfficiency = 1.0;
      if (tempF < 60) thermalEfficiency -= (60 - tempF) * 0.003;
      
      // --- MODE SYSTEM ---
      let motorEfficiency = 0.80;
      let modeStyleMultiplier = 1.0;
      let humanPowerWatts = 0;

      if (controlType === 'switch') {
        if (mode === 'eco') { motorEfficiency = 0.85; modeStyleMultiplier = 0.95; }
        else if (mode === 'sport') { motorEfficiency = 0.75; modeStyleMultiplier = 1.25; }
      } else {
        // PAS Logic: Rider contributes power. Higher PAS = lower rider effort.
        // PAS 1: 150W human | PAS 3: 75W human | PAS 5: 0W human (throttle)
        humanPowerWatts = Math.max(0, 150 - (pasLevel - 1) * 37.5);
        motorEfficiency = 0.82; // PAS controllers usually standard sine wave
      }
      
      const combinedEfficiency = motorEfficiency * thermalEfficiency;
      const WorkClimbJoules = massKg * 9.81 * gainMeters;
      const WhClimb = (WorkClimbJoules / 3600) / combinedEfficiency;

      const TotalPowerWatts = (ForceRolling + ForceDrag) * velocityMps;
      const MotorPowerWatts = Math.max(0, TotalPowerWatts - humanPowerWatts);
      
      const WhPerMileFlat = (MotorPowerWatts / velocityMps) * (1609.34 / 3600) / combinedEfficiency;

      const styleMultiplier = ridingStyle === 'aggressive' ? 1.2 : 1.0;
      const estimatedWh = (distMiles * WhPerMileFlat * styleMultiplier * modeStyleMultiplier) + WhClimb;
      
      const BATTERY_HEALTH_FACTOR = 0.92;
      const totalWhRaw = (capacityInputMode === 'ah') ? (Number(specs.voltage) * Number(specs.capacityAh)) : Number(specs.capacityAh);
      const totalWhUsable = totalWhRaw * BATTERY_HEALTH_FACTOR;
      
      const minV = getBatteryLevels(Number(specs.voltage)).min;
      const maxV = getBatteryLevels(Number(specs.voltage)).max;
      
      const startWh = (batteryInputMode === 'percent')
        ? (totalWhUsable * (Number(startBattery) / 100))
        : (totalWhUsable * ((Number(startVoltage) - minV) / (maxV - minV)));

      const batteryLeftWh = startWh - estimatedWh;
      const batteryPercentRemaining = (batteryLeftWh / totalWhUsable) * 100;

      setMetrics({
        distanceMiles: distMiles,
        durationMin: distMiles / (Number(targetSpeedMph) || 15) * 60,
        elevationGainFeet: gainFeet,
        estimatedWh,
        batteryPercentUsed: Math.max(0, batteryPercentRemaining),
        recommendedSpeedMph: mode === 'eco' || pasLevel <= 2 ? 18 : 25,
        windConditions: { speed: windSpeed, direction: windDir, headwindComponent: headwindMph }
      });
      setIsLoading(false);
    } catch (e: any) { console.error("Calculation error", e); setError("Failed to calculate metrics."); setIsLoading(false); }
  };

  const handleCalculate = () => { if (!trip.origin || !trip.destination) return; setIsLoading(true); setResponse(null); setMetrics(null); setError(null); setPois([]); };
  const useCurrentLocation = () => { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition((pos) => { setTrip(prev => ({ ...prev, origin: `${pos.coords.latitude},${pos.coords.longitude}` })); }); } };

  const searchPOIs = async (category: string) => {
    if (!response) return; setPoiCategory(category);
    const path = response.routes[0].overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
    try { const resp = await axios.post('/api/charging', { path, category }); setPois(resp.data.pois); }
    catch (e) { console.error("POI search failed", e); }
  };

  const searchByMapCenter = async () => {
    if (!mapRef.current || !poiCategory) return;
    const c = mapRef.current.getCenter(); if (!c) return;
    try { const resp = await axios.post('/api/charging', { lat: c.lat(), lng: c.lng(), category: poiCategory, isRadius: true }); setPois(resp.data.pois); }
    catch (e) { console.error("Radius search failed", e); }
  };

  const addPOIAsWaypoint = (poi: POI) => { setTrip(prev => ({ ...prev, waypoints: [...prev.waypoints, poi.address] })); setResponse(null); setMetrics(null); };

  const downloadShareCard = async () => {
    if (!shareCardRef.current) return;
    try { const dataUrl = await toPng(shareCardRef.current, { cacheBust: true }); const link = document.createElement('a'); link.download = `trip-${Date.now()}.png`; link.href = dataUrl; link.click(); }
    catch (err) { console.error('Error sharing:', err); }
  };

  const filteredBikes = [...STANDARD_BIKES, ...savedBikes].filter(b => 
    b.name.toLowerCase().includes(bikeSearchQuery.toLowerCase())
  );

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', position: 'relative' }}>
      <header style={{ flexShrink: 0, height: '4.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', background: '#1e1e1e', borderBottom: '1px solid #333' }}>
        <div className="logo" style={{ color: '#ff6600', fontWeight: '900', fontSize: '1.4rem' }}>Range Anxiety</div>
        <div className="nav-actions">
          <button onClick={() => user ? handleSignOut() : setShowAuthModal(true)} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '20px', padding: '0.4rem 1rem', fontSize: '0.8rem', cursor: 'pointer' }}>
            {user ? `Sign Out (${isPro ? 'PRO' : 'Free'})` : 'Sign In'}
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flexGrow: 1, position: 'relative', width: '100%', height: 'calc(100vh - 4.5rem)' }}>
        <aside className="sidebar" style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', width: '380px', maxHeight: '90%', background: 'rgba(30,30,30,0.95)', padding: '1.5rem', borderRadius: '16px', border: '1px solid #333', overflowY: 'auto', zIndex: 10, boxShadow: 'none' }}>
          {error && <div style={{ background: 'rgba(217,48,37,0.1)', color: '#d93025', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem' }}>{error}</div>}
          
          <section className="form-group" style={{ position: 'relative' }}>
            <label>Search Bike Model</label>
            <input type="text" placeholder="e.g. Onyx, Sur-Ron..." value={bikeSearchQuery} onFocus={() => setShowBikeResults(true)} onChange={(e) => { setBikeSearchQuery(e.target.value); setShowBikeResults(true); }} />
            {showBikeResults && bikeSearchQuery && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '4px', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                {filteredBikes.map((bike, idx) => (<div key={idx} onClick={() => loadBike(bike)} style={{ padding: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #222' }}>{bike.name}</div>))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input type="text" placeholder="Nickname to Save" value={newBikeName} onChange={(e) => setNewBikeName(e.target.value)} style={{ padding: '0.4rem' }} />
              <button onClick={saveCurrentBike} style={{ padding: '0.4rem 0.8rem', backgroundColor: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
            </div>
          </section>

          <section className="form-group">
            <label>Origin</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}><input type="text" name="origin" value={trip.origin} onChange={handleInputChange} /><button onClick={useCurrentLocation} style={{ padding: '0 0.8rem', cursor: 'pointer' }}>Loc</button></div>
          </section>
          
          <div style={{ textAlign: 'center', margin: '-0.5rem 0 0.5rem 0' }}>
              <button onClick={() => setTrip(p => ({ ...p, origin: p.destination, destination: p.origin }))} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '1.2rem' }}>⇅</button>
          </div>

          <section className="form-group"><label>Destination</label><input type="text" name="destination" value={trip.destination} onChange={handleInputChange} /></section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>        
            <section className="form-group"><label>Voltage (V)</label><input type="number" value={specs.voltage} onChange={(e) => handleSpecChange('voltage', e.target.value)} /></section>
            <section className="form-group">
              <label>Capacity ({capacityInputMode.toUpperCase()})</label>
              <div className="mode-toggle" style={{ marginBottom: '0.5rem' }}>
                <button className={capacityInputMode === 'ah' ? 'active' : ''} onClick={() => setCapacityInputMode('ah')}>Ah</button>
                <button className={capacityInputMode === 'wh' ? 'active' : ''} onClick={() => setCapacityInputMode('wh')}>Wh</button>
              </div>
              <input type="number" value={specs.capacityAh} onChange={(e) => handleSpecChange('capacityAh', e.target.value)} />
            </section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>        
            <section className="form-group"><label>Motor (W)</label><input type="number" value={specs.motorWatts} onChange={(e) => handleSpecChange('motorWatts', e.target.value)} /></section>
            <section className="form-group"><label>Bike Wt (lbs)</label><input type="number" value={specs.bikeWeightLbs} onChange={(e) => handleSpecChange('bikeWeightLbs', e.target.value)} /></section>
          </div>

          <section className="form-group"><label>Rider Weight (lbs)</label><input type="number" value={riderWeightLbs} onChange={(e) => setRiderWeightLbs(parseFloat(e.target.value) || '')} /></section>

          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1rem' }}>
            <label style={{ color: 'var(--accent-color)', fontSize: '0.65rem' }}>Advanced Environment</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
               <section className="form-group">
                 <label>Temp (°F)</label>
                 <input type="number" value={ambientTempF} onChange={(e) => setAmbientTempF(parseFloat(e.target.value) || '')} />
               </section>
               <section className="form-group">
                 <label>Tire PSI</label>
                 <input type="number" placeholder="Auto" value={tirePressurePsi} onChange={(e) => setTirePressurePsi(parseFloat(e.target.value) || '')} />
               </section>
            </div>
            <section className="form-group">
               <label>Tire Type</label>
               <div className="mode-toggle">
                  <button className={tireType === 'road' ? 'active' : ''} onClick={() => setTireType('road')}>Road</button>
                  <button className={tireType === 'knobby' ? 'active' : ''} onClick={() => setTireType('knobby')}>Knobby</button>
               </div>
            </section>
          </div>

          <section className="form-group">
            <label>Power Control Type</label>
            <div className="mode-toggle">
              <button className={controlType === 'pas' ? 'active' : ''} onClick={() => setControlType('pas')}>Pedal Assist (PAS)</button>
              <button className={controlType === 'switch' ? 'active' : ''} onClick={() => setControlType('switch')}>3-Speed Switch</button>
            </div>
          </section>

          {controlType === 'pas' ? (
            <section className="form-group">
              <label>Pedal Assist Level (1-5)</label>
              <div className="mode-toggle" style={{ flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map(lv => (
                  <button key={lv} className={pasLevel === lv ? 'active' : ''} onClick={() => setPasLevel(lv)} style={{ flex: 'none', width: '18%' }}>{lv}</button>
                ))}
              </div>
              <p style={{ fontSize: '0.6rem', color: '#777', marginTop: '0.4rem' }}>* Assumes 150W human power at PAS 1, decreasing as PAS increases.</p>
            </section>
          ) : (
            <section className="form-group">
              <label>3-Speed Switch Mode</label>
              <div className="mode-toggle">
                <button className={mode === 'eco' ? 'active' : ''} onClick={() => setMode('eco')}>ECO</button>
                <button className={mode === 'normal' ? 'active' : ''} onClick={() => setMode('normal')}>NORMAL</button>
                <button className={mode === 'sport' ? 'active' : ''} onClick={() => setMode('sport')}>SPORT</button>
              </div>
            </section>
          )}

          <section className="form-group">
            <label>Start Battery</label>
            <div className="mode-toggle" style={{ marginBottom: '0.5rem' }}>
              <button className={batteryInputMode === 'percent' ? 'active' : ''} onClick={() => setBatteryInputMode('percent')}>%</button>
              <button className={batteryInputMode === 'voltage' ? 'active' : ''} onClick={() => setBatteryInputMode('voltage')}>V</button>
            </div>
            <input type="number" value={batteryInputMode === 'percent' ? startBattery : startVoltage} onChange={(e) => batteryInputMode === 'percent' ? setStartBattery(parseFloat(e.target.value) || '') : setStartVoltage(parseFloat(e.target.value) || '')} />
          </section>

          <section className="form-group"><label>Target Speed (mph)</label><input type="number" value={targetSpeedMph} onChange={(e) => setTargetSpeedMph(parseFloat(e.target.value) || '')} /></section>

          <section className="form-group">
            <label>Trip Type</label>
            <div className="mode-toggle">
              <button className={!isRoundTrip ? 'active' : ''} onClick={() => setIsRoundTrip(false)}>One Way</button>
              <button className={isRoundTrip ? 'active' : ''} onClick={() => setIsRoundTrip(true)}>Round Trip</button>
            </div>
            {isRoundTrip && (
              <div style={{ marginTop: '0.8rem', padding: '0.8rem', background: '#222', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'none' }}>
                  <input type="checkbox" checked={isCustomReturn} onChange={e => setIsCustomReturn(e.target.checked)} style={{ width: 'auto' }} />
                  Custom Return Route
                </label>
              </div>
            )}
          </section>

          <section className="form-group">
            <label>Style</label>
            <div className="mode-toggle">
              <button className={ridingStyle === 'relaxed' ? 'active' : ''} onClick={() => setRidingStyle('relaxed')}>Relaxed</button>
              <button className={ridingStyle === 'aggressive' ? 'active' : ''} onClick={() => setRidingStyle('aggressive')}>Aggressive</button>
            </div>
          </section>

          {metrics && (
            <div className="card metrics-card" style={{ marginTop: '1rem', borderLeft: '4px solid #ff6600', background: 'rgba(40,40,40,0.9)' }}>
              <h3 style={{ fontSize: '0.9rem', color: '#ff6600' }}>ESTIMATED METRICS</h3>
              <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'white' }}>Battery Left: {metrics.batteryPercentUsed.toFixed(1)}%</p>
              <p style={{ fontSize: '0.8rem', color: '#b0b0b0' }}>Est. End Voltage: {(getBatteryLevels(Number(specs.voltage)).min + (metrics.batteryPercentUsed / 100) * (getBatteryLevels(Number(specs.voltage)).max - getBatteryLevels(Number(specs.voltage)).min)).toFixed(1)}V</p>
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#b0b0b0' }}>
                <div>Dist: {metrics.distanceMiles.toFixed(1)} mi</div>
                <div>Gain: {metrics.elevationGainFeet.toFixed(0)} ft</div>
                <div>Wh/mile: {(metrics.estimatedWh / metrics.distanceMiles).toFixed(1)}</div>
              </div>
              <button onClick={() => {
                  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(trip.origin)}&destination=${encodeURIComponent(trip.destination)}&travelmode=bicycling`;
                  window.open(url, '_blank');
              }} style={{ width: '100%', marginTop: '1rem', padding: '0.6rem', backgroundColor: '#34a853', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>🚀 Open Maps</button>
              
              <button onClick={downloadShareCard} style={{ width: '100%', marginTop: '0.5rem', padding: '0.6rem', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Save Image</button>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <AdBanner isPro={isPro} />
            {!isPro && <button onClick={handleUpgrade} style={{ width: '100%', marginTop: '0.5rem', background: 'none', border: 'none', color: '#ff6600', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}>Go PRO / Remove Ads</button>}
          </div>
          
          <button 
            className="calculate-btn" 
            onClick={handleCalculate} 
            disabled={isLoading}
            style={{ width: '100%', marginTop: '1rem', padding: '1rem', borderRadius: '12px' }}
          >
            {isLoading ? 'Calculating...' : 'Find Route'}
          </button>
        </aside>

        <main style={{ flexGrow: 1, position: 'relative', width: '100%', height: '100%' }}>
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
              center={center}
              zoom={10}
              onLoad={onMapLoad}
            >
              {response && (
                <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 1, display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => searchPOIs('cafe')} style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #ccc', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer' }}>☕ Cafes</button>
                    <button onClick={() => searchPOIs('bike shop')} style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #ccc', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer' }}>🚲 Shops</button>
                    <button onClick={searchByMapCenter} style={{ padding: '0.5rem 1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer' }}>🔍 Search Area</button>
                </div>
              )}

              {trip.origin && trip.destination && isLoading && !response && (
                <DirectionsService
                  options={{
                    origin: trip.origin,
                    destination: isRoundTrip ? trip.origin : trip.destination,
                    waypoints: [
                      ...(isRoundTrip ? [{ location: trip.destination, stopover: true }] : []),
                      ...(isRoundTrip && isCustomReturn ? trip.returnWaypoints.map(wp => ({ location: wp, stopover: true })) : [])
                    ].filter(wp => wp.location.trim() !== ""),
                    travelMode: google.maps.TravelMode.BICYCLING,
                  }}
                  callback={directionsCallback}
                />
              )}
              {response && <DirectionsRenderer options={{ directions: response }} />}
              {pois.map(poi => (<Marker key={poi.id} position={poi.position} title={poi.name} onClick={() => setSelectedPoi(poi)} />))}
              {selectedPoi && (
                <InfoWindow position={selectedPoi.position} onCloseClick={() => setSelectedPoi(null)}>
                  <div style={{ padding: '0.5rem', color: '#333' }}>
                    <h4 style={{ margin: 0 }}>{selectedPoi.name}</h4>
                    <p style={{ margin: '0.2rem 0', fontSize: '0.8rem' }}>{selectedPoi.address}</p>
                    <button onClick={() => { addPOIAsWaypoint(selectedPoi); setSelectedPoi(null); }} style={{ width: '100%', marginTop: '0.5rem', padding: '0.2rem', backgroundColor: '#ff6600', color: 'white', border: 'none', cursor: 'pointer' }}>Add Stop</button>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121212', color: '#888' }}>
              {loadError ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <p style={{ color: '#ff4444', fontWeight: 'bold' }}>Error Loading Maps</p>
                  <p style={{ fontSize: '0.8rem' }}>{loadError.message}</p>
                  <p style={{ fontSize: '0.7rem', marginTop: '1rem' }}>Check VITE_GOOGLE_MAPS_API_KEY.</p>
                </div>
              ) : "Loading Google Maps API..."}
            </div>
          )}
        </main>
      </div>

      <footer style={{ position: 'fixed', bottom: '10px', width: '100%', textAlign: 'center', pointerEvents: 'none', zIndex: 100 }}>
        <p style={{ fontSize: '0.6rem', color: '#444' }}>&copy; 2026 Range Anxiety. Estimates only.</p>
      </footer>
      
      {showAuthModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <div className="card" style={{ width: '350px', background: '#1e1e1e', padding: '2rem', borderRadius: '12px', border: '1px solid #333' }}>
            <h2 style={{ color: '#ff6600', marginBottom: '1.5rem', textAlign: 'center' }}>{isRegistering ? 'Create Account' : 'Sign In'}</h2>
            <div className="form-group"><label>Email</label><input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} /></div>
            <div className="form-group"><label>Password</label><input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} /></div>
            <button className="calculate-btn" style={{ width: '100%', padding: '0.8rem' }} onClick={handleAuth}>{isRegistering ? 'Register' : 'Login'}</button>
            <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#888' }}>{isRegistering ? 'Already have an account?' : 'Need an account?'} <button onClick={() => setIsRegistering(!isRegistering)} style={{ background: 'none', border: 'none', color: '#ff6600', cursor: 'pointer', textDecoration: 'underline' }}>{isRegistering ? 'Sign In' : 'Register Now'}</button></p>
            <button onClick={() => setShowAuthModal(false)} style={{ width: '100%', marginTop: '1.5rem', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Off-screen ref for image generation */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} ref={shareCardRef}>
          <div style={{ width: '500px', background: '#121212', padding: '2rem', color: 'white' }}>
              <h2>Range Anxiety Report</h2>
              {metrics && <p>Remaining Battery: {metrics.batteryPercentUsed.toFixed(1)}%</p>}
          </div>
      </div>
    </div>
  )
}

export default App
