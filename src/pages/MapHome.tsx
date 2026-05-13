import { useState, useRef, useEffect, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker, InfoWindow } from '@react-google-maps/api'
import axios from 'axios'
import { toPng } from 'html-to-image'
import { auth, db, storage } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, collection, addDoc, serverTimestamp, onSnapshot, query, where, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import AdBanner from '../components/AdBanner'
import TermsOfService from '../components/TermsOfService'
import InstallTutorial from '../components/InstallTutorial'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import WelcomeModal from '../components/WelcomeModal'
import { STATE_COORDINATES } from '../utils/ebikeLaws'

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

interface GroupRide {
  id: string;
  name: string;
  isPublic: boolean;
  pin: string;
  creatorId: string;
  origin: string;
  startLat: number;
  startLng: number;
  status: string;
}

interface Participant {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  lastUpdatedAt: number;
}

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
  elevationLossFeet: number;
  estimatedWh: number;
  batteryPercentUsed: number;
  recommendedSpeedMph: number;
  deathPoint?: google.maps.LatLngLiteral;
  windConditions?: {
    speed: number;
    direction: number;
    headwindComponent: number;
  };
}

interface SavedBike {
  id?: string;
  name: string;
  specs: BikeSpecs;
}

const STANDARD_BIKES: SavedBike[] = [
  { name: "Surron Light Bee X (2025)", specs: { voltage: 60, capacityAh: 40, motorWatts: 8000, bikeWeightLbs: 125 } },
  { name: "Surron Ultra Bee", specs: { voltage: 74, capacityAh: 55, motorWatts: 12500, bikeWeightLbs: 187 } },
  { name: "Talaria Sting MX5 Pro", specs: { voltage: 72, capacityAh: 40, motorWatts: 13400, bikeWeightLbs: 167 } },
  { name: "Onyx RCR", specs: { voltage: 72, capacityAh: 41, motorWatts: 5000, bikeWeightLbs: 145 } },
  { name: "Specialized Turbo Levo", specs: { voltage: 36, capacityAh: 19.4, motorWatts: 565, bikeWeightLbs: 50 } },
  { name: "Trek Fuel EXe", specs: { voltage: 50, capacityAh: 7.2, motorWatts: 250, bikeWeightLbs: 41 } },
  { name: "Segway Ninebot Max G2", specs: { voltage: 36, capacityAh: 15.3, motorWatts: 450, bikeWeightLbs: 53 } }
];

interface POI {
  id: string;
  name: string;
  address: string;
  position: google.maps.LatLngLiteral;
  type: string;
}

const center = { lat: 40.7128, lng: -74.0060 };

function MapHome() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const metricsCardRef = useRef<HTMLDivElement>(null);

  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [specs, setSpecs] = useState<BikeSpecs>({ voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 65 });
  const [riderWeightLbs, setRiderWeightLbs] = useState<number | ''>(200);
  const [ambientTempF, setAmbientTempF] = useState<number | ''>(70);
  const [tireType, setTireType] = useState<'road' | 'knobby'>('road');
  const [tirePressurePsi, setTirePressurePsi] = useState<number | ''>(''); 

  const [trip, setTrip] = useState<TripDetails>({ origin: '', destination: '', waypoints: [], returnWaypoints: [] });
  const [mode, setMode] = useState<'eco' | 'normal' | 'sport'>('normal');
  const [pasLevel, setPasLevel] = useState<number>(3);
  const [controlType, setControlType] = useState<'switch' | 'pas'>('pas');
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [targetSpeedMph, setTargetSpeedMph] = useState<number | ''>(20);
  
  const [batteryInputMode, setBatteryInputMode] = useState<'percent' | 'voltage'>('percent'); 
  const [startBattery, setStartBattery] = useState<number | ''>(100);
  const [startVoltage, setStartVoltage] = useState<number | ''>(54.6);
  
  const [response, setResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pois, setPois] = useState<POI[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  
  const [showSharePreview, setShowSharePreview] = useState(false);
  const [commentsEnabled] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [bikeSearchQuery, setBikeSearchQuery] = useState("");
  const [showBikeResults, setShowBikeResults] = useState(false);
  const [savedBikes, setSavedBikes] = useState<SavedBike[]>([]);
  const [newBikeName, setNewBikeName] = useState('');

  const [showToSPage, setShowToSPage] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [mapSnapshot, setMapSnapshot] = useState<string | null>(null);
  const [pendingBikeAutoSelect, setPendingBikeAutoSelect] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(true);

  const [activeRide] = useState<GroupRide | null>(null);
  const [rideParticipants, setRideParticipants] = useState<Participant[]>([]);

  // --- Helpers ---

  const getBatteryLevels = (v: number) => {
    if (v >= 72) return { min: 60, max: 84 };
    if (v >= 60) return { min: 50, max: 70 };
    if (v >= 52) return { min: 42, max: 58.8 };
    if (v >= 48) return { min: 39, max: 54.6 };
    if (v >= 36) return { min: 30, max: 42 };
    return { min: v * 0.8, max: v * 1.15 };
  };

  const handleToggleBatteryMode = (newMode: 'percent' | 'voltage') => {
    if (newMode === batteryInputMode) return;
    const { min, max } = getBatteryLevels(Number(specs.voltage));
    if (newMode === 'voltage') {
      const p = Number(startBattery) / 100;
      const v = min + (p * (max - min));
      setStartVoltage(Number(v.toFixed(1)));
    } else {
      const v = Number(startVoltage);
      const p = ((v - min) / (max - min)) * 100;
      setStartBattery(Math.min(100, Math.max(0, Number(p.toFixed(0)))));
    }
    setBatteryInputMode(newMode);
  };

  // --- Logic & Effects ---

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u); setAuthInitialized(true);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, "users", u.uid));
          if (userDoc.exists()) {
            const data = userDoc.data(); setUserData(data);
            setIsPro(data.isPro || false);
            if (data.bikes) setSavedBikes(data.bikes);
          }
        } catch (e) { console.error(e); }
      } else {
        setUserData(null); setIsPro(false);
        const local = localStorage.getItem('ebike-saved-bikes');
        if (local) setSavedBikes(JSON.parse(local));
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !isPro) return;
    const q = query(collection(db, "group_rides"), where("isPublic", "==", true), where("status", "==", "active"));
    return onSnapshot(q, (_snap) => {
      // Logic for public rides here if needed
    });
  }, [user, isPro]);

  useEffect(() => {
    if (!activeRide || !user) return;
    return onSnapshot(collection(db, `group_rides/${activeRide.id}/participants`), (snap) => {
      const parts: Participant[] = [];
      snap.forEach(docSnap => parts.push(docSnap.data() as Participant));
      setRideParticipants(parts);
    });
  }, [activeRide?.id, user?.uid]);

  useEffect(() => {
    if (authInitialized) {
      const visited = localStorage.getItem('ebike_portal_visited');
      if (!visited && !user) setShowWelcomeModal(true);
      if (user || visited) localStorage.setItem('ebike_portal_visited', 'true');
    }
  }, [authInitialized, user]);

  useEffect(() => {
    if (userData?.homeRegion && mapRef.current) {
      const coords = STATE_COORDINATES[userData.homeRegion];
      if (coords) { mapRef.current.panTo(coords); mapRef.current.setZoom(8); }
    }
  }, [userData?.homeRegion]);

  useEffect(() => {
    if (showMobileMenu && metrics && metricsCardRef.current) {
      setTimeout(() => metricsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  }, [showMobileMenu, metrics]);

  useEffect(() => {
    const savedRoute = localStorage.getItem('ebike_load_route');
    if (savedRoute) {
      try {
        const data = JSON.parse(savedRoute);
        setTrip({ origin: data.origin || "", destination: data.destination || "", waypoints: data.waypoints || [], returnWaypoints: data.returnWaypoints || [] });
        setIsRoundTrip(data.isRoundTrip || false);
        setShowMobileMenu(true); setPendingBikeAutoSelect(true);
        localStorage.removeItem('ebike_load_route');
        if (data.origin && data.destination) setTimeout(() => handleCalculate(), 1000);
      } catch (e) { console.error("Load route failed", e); }
    }
  }, []);

  useEffect(() => {
    if (pendingBikeAutoSelect && authInitialized && savedBikes.length > 0) {
      loadBike(savedBikes[0]); setPendingBikeAutoSelect(false);
      setTimeout(() => handleCalculate(), 500);
    }
  }, [pendingBikeAutoSelect, savedBikes, authInitialized]);

  useEffect(() => {
    if (!response || !response.routes[selectedRouteIndex]) return;
    const polyline = response.routes[selectedRouteIndex].overview_polyline;
    const points = (polyline as any).points || polyline;
    const proxyUrl = `/api/static-map?polyline=${encodeURIComponent(points)}`;
    const fetchSnapshot = async () => {
      try {
        const resp = await fetch(proxyUrl);
        if (!resp.ok) return;
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onloadend = () => setMapSnapshot(reader.result as string);
        reader.readAsDataURL(blob);
      } catch (e) { console.error(e); }
    };
    fetchSnapshot();
  }, [response, selectedRouteIndex]);

  const markDirty = () => { if (!settingsDirty) setSettingsDirty(true); };

  const handleCalculate = () => { 
    if (!trip.origin || !trip.destination) return; 
    setIsLoading(true); setResponse(null); setMetrics(null); setPois([]); 
    setSettingsDirty(false); 
  };

  const loadBike = (bike: SavedBike) => {
    setSpecs(bike.specs); setBikeSearchQuery(bike.name); setShowBikeResults(false);
    if (bike.specs.voltage) setStartVoltage(getBatteryLevels(Number(bike.specs.voltage)).max);
    markDirty();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTrip(prev => ({ ...prev, [name]: value }));
    markDirty();
  };

  const handleSpecChange = (name: keyof BikeSpecs, value: string) => {
    const val = value === '' ? '' : parseFloat(value);
    setSpecs(prev => ({ ...prev, [name]: isNaN(Number(val)) ? '' : val }));
    markDirty();
  };

  const saveCurrentBike = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!newBikeName) return;
    const updated = [...savedBikes, { id: Date.now().toString(), name: newBikeName, specs }];
    setSavedBikes(updated);
    try { await updateDoc(doc(db, "users", user.uid), { bikes: updated }); } catch (e) { console.error(e); }
    setNewBikeName('');
    alert("Bike saved!");
  };

  const useCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setTrip(prev => ({ ...prev, origin: `${pos.coords.latitude},${pos.coords.longitude}` }));
        markDirty();
      });
    }
  };

  const searchPOIs = async (category: string) => {
    if (!isLoaded || !mapRef.current) return;
    if (category === 'charging' && !isPro) { alert("PRO required."); return; }
    const service = new google.maps.places.PlacesService(mapRef.current!);
    service.textSearch({ location: mapRef.current!.getCenter()!, radius: 5000, query: category }, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        setPois(results.map(p => ({ id: p.place_id!, name: p.name!, address: p.formatted_address!, position: { lat: p.geometry!.location!.lat(), lng: p.geometry!.location!.lng() }, type: category })));
      }
    });
  };

  const calculateMetrics = async (result: google.maps.DirectionsResult, routeIndex: number = 0) => {
    try {
      const route = result.routes[routeIndex];
      let distMeters = 0; route.legs.forEach(leg => distMeters += (leg.distance?.value || 0));
      const distMiles = distMeters / 1609.34;
      const path = route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
      let gainFeet = 0, lossFeet = 0;
      try {
        const encodedPath = google.maps.geometry.encoding.encodePath(route.overview_path);
        const elevResp = await axios.post('/api/elevation', { encodedPath, samples: 100 });
        if (elevResp.data?.gain) { gainFeet = elevResp.data.gain; lossFeet = elevResp.data.loss || 0; }
      } catch (e) { console.error(e); }
      let windSpeed = 0, windDir = 0, headwindMph = 0;
      try {
        const weatherResp = await axios.get(`/api/weather?lat=${path[0].lat}&lng=${path[0].lng}`);
        windSpeed = weatherResp.data.wind_speed; windDir = weatherResp.data.wind_deg;
        headwindMph = windSpeed * 0.5;
      } catch (e) { console.error(e); }
      const totalWhRaw = (Number(specs.voltage) * Number(specs.capacityAh));
      const totalWhUsable = totalWhRaw * 0.92;
      const WhPerMile = 25;
      const estimatedWh = (distMiles * WhPerMile) + (gainFeet * 0.1); 
      const minV = getBatteryLevels(Number(specs.voltage)).min, maxV = getBatteryLevels(Number(specs.voltage)).max;
      const startWh = batteryInputMode === 'percent' ? (totalWhUsable * (Number(startBattery)/100)) : (totalWhUsable * ((Number(startVoltage)-minV)/(maxV-minV)));
      const batteryPercentRemaining = ((startWh - estimatedWh) / totalWhUsable) * 100;
      let deathPoint: google.maps.LatLngLiteral | undefined = undefined;
      if (batteryPercentRemaining <= 0) {
        const avgWhPerMile = estimatedWh / distMiles; let cumulativeWh = 0;
        for (let i = 1; i < path.length; i++) {
          const d = google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(path[i-1]), new google.maps.LatLng(path[i])) / 1609.34;
          cumulativeWh += d * avgWhPerMile;
          if (cumulativeWh >= startWh) { deathPoint = path[i]; break; }
        }
      }
      setMetrics({ distanceMiles: distMiles, durationMin: distMiles / 15 * 60, elevationGainFeet: gainFeet, elevationLossFeet: lossFeet, estimatedWh, batteryPercentUsed: Math.max(0, batteryPercentRemaining), recommendedSpeedMph: 20, deathPoint, windConditions: { speed: windSpeed, direction: windDir, headwindComponent: headwindMph } });
      setIsLoading(false);
    } catch (e) { console.error(e); setIsLoading(false); }
  };

  const directionsCallback = (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
    if (status === 'OK' && result) { setResponse(result); setSelectedRouteIndex(0); calculateMetrics(result, 0); }
    else { setIsLoading(false); }
  };

  const recenterMap = () => {
    if (mapRef.current && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => mapRef.current?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
    }
  };

  const downloadShareCard = async () => {
    if (!shareCardRef.current || !metrics || !mapSnapshot) return;
    try {
      setIsLoading(true); shareCardRef.current.style.opacity = '1';
      await new Promise(r => setTimeout(r, 1500));
      const dataUrl = await toPng(shareCardRef.current, { backgroundColor: "#121212" });
      shareCardRef.current.style.opacity = '0';
      const link = document.createElement('a'); link.download = 'trip.png'; link.href = dataUrl; link.click();
      setIsLoading(false);
    } catch (e) { setIsLoading(false); }
  };

  const shareToCommunity = async () => {
    if (!shareCardRef.current || !metrics || !user || !mapSnapshot) return;
    setIsLoading(true);
    try {
      shareCardRef.current.style.opacity = '1';
      await new Promise(r => setTimeout(r, 1500));
      const dataUrl = await toPng(shareCardRef.current, { backgroundColor: "#121212" });
      shareCardRef.current.style.opacity = '0';
      const blob = await (await fetch(dataUrl)).blob();
      const imageRef = ref(storage, `trips/${user.uid}/${Date.now()}.png`);
      await uploadBytes(imageRef, blob);
      const url = await getDownloadURL(imageRef);
      await addDoc(collection(db, "posts"), { authorId: user.uid, authorUsername: userData?.username || 'Rider', authorProfilePic: userData?.profilePic || '', imageUrl: url, caption: `Rode ${metrics.distanceMiles.toFixed(1)} miles!`, likes: [], commentsEnabled: commentsEnabled, createdAt: serverTimestamp(), city: userData?.city || "", homeRegion: userData?.homeRegion || "", tripData: { origin: trip.origin, destination: trip.destination, waypoints: trip.waypoints, isRoundTrip } });
      alert("Shared!"); setIsLoading(false); setShowSharePreview(false);
    } catch (e) { setIsLoading(false); }
  };

  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);

  const filteredBikes = [...STANDARD_BIKES, ...savedBikes].filter(b => b.name.toLowerCase().includes(bikeSearchQuery.toLowerCase()));

  return (
    <div className="container">
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
      <div className="main-layout">
        <aside className={`sidebar ${showMobileMenu ? 'mobile-visible' : ''}`}>
          <div className="form-group">
            <label>Unit System</label>
            <div className="mode-toggle">
              <button className={unitSystem === 'imperial' ? 'active' : ''} onClick={() => setUnitSystem('imperial')}>Imperial</button>
              <button className={unitSystem === 'metric' ? 'active' : ''} onClick={() => setUnitSystem('metric')}>Metric</button>
            </div>
          </div>
          <section className="form-group" style={{ position: 'relative' }}>
            <label>Bike Library</label>
            <input type="text" placeholder="Search..." value={bikeSearchQuery} onFocus={() => setShowBikeResults(true)} onChange={e => setBikeSearchQuery(e.target.value)} />
            {showBikeResults && bikeSearchQuery && (
              <div className="bike-results-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', zIndex: 100, border: '1px solid #333', maxHeight: '200px', overflowY: 'auto' }}>
                {filteredBikes.map(b => <div key={b.name} onClick={() => loadBike(b)} style={{ padding: '0.8rem', borderBottom: '1px solid #222', cursor: 'pointer' }}>{b.name}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input type="text" placeholder="Name" value={newBikeName} onChange={e => setNewBikeName(e.target.value)} style={{ padding: '0.4rem' }} />
              <button onClick={saveCurrentBike} style={{ padding: '0.4rem 0.8rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '4px' }}>Save</button>
            </div>
          </section>
          <section className="form-group">
            <label>Route</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" name="origin" placeholder="Start" value={trip.origin} onChange={handleInputChange} style={{ flex: 1 }} />
              <button onClick={useCurrentLocation} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>📍</button>
            </div>
            <input type="text" name="destination" placeholder="End" value={trip.destination} onChange={handleInputChange} style={{ marginTop: '0.5rem' }} />
            <div className="mode-toggle" style={{ marginTop: '0.5rem' }}>
              <button className={!isRoundTrip ? 'active' : ''} onClick={() => { setIsRoundTrip(false); markDirty(); }}>One Way</button>
              <button className={isRoundTrip ? 'active' : ''} onClick={() => { setIsRoundTrip(true); markDirty(); }}>Round Trip</button>
            </div>
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <section className="form-group"><label>Voltage</label><input type="number" value={specs.voltage} onChange={e => handleSpecChange('voltage', e.target.value)} /></section>
            <section className="form-group"><label>Capacity (Ah)</label><input type="number" value={specs.capacityAh} onChange={e => handleSpecChange('capacityAh', e.target.value)} /></section>
          </div>
          <section className="form-group"><label>Rider weight ({unitSystem === 'imperial' ? 'lbs' : 'kg'})</label><input type="number" value={riderWeightLbs} onChange={e => { setRiderWeightLbs(parseFloat(e.target.value) || ''); markDirty(); }} /></section>
          <section className="form-group"><label>Avg Speed ({unitSystem === 'imperial' ? 'mph' : 'km/h'})</label><input type="number" value={targetSpeedMph} onChange={e => { setTargetSpeedMph(parseFloat(e.target.value) || ''); markDirty(); }} /></section>
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.65rem', color: '#ff6600' }}>Environment</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
               <section className="form-group"><label>Temp</label><input type="number" value={ambientTempF} onChange={e => { setAmbientTempF(parseFloat(e.target.value) || ''); markDirty(); }} /></section>
               <section className="form-group"><label>Tire PSI</label><input type="number" placeholder="Auto" value={tirePressurePsi} onChange={e => { setTirePressurePsi(parseFloat(e.target.value) || ''); markDirty(); }} /></section>
            </div>
            <div className="mode-toggle" style={{ marginTop: '0.5rem' }}>
              <button className={tireType === 'road' ? 'active' : ''} onClick={() => { setTireType('road'); markDirty(); }}>Road</button>
              <button className={tireType === 'knobby' ? 'active' : ''} onClick={() => { setTireType('knobby'); markDirty(); }}>Knobby</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <section className="form-group">
              <label>Control</label>
              <div className="mode-toggle">
                <button className={controlType === 'pas' ? 'active' : ''} onClick={() => { setControlType('pas'); markDirty(); }}>PAS</button>
                <button className={controlType === 'switch' ? 'active' : ''} onClick={() => { setControlType('switch'); markDirty(); }}>SW</button>
              </div>
            </section>
            <section className="form-group">
              <label>Mode</label>
              <select value={mode} onChange={e => { setMode(e.target.value as any); markDirty(); }} style={{ width: '100%', padding: '0.8rem', background: '#222', border: '1px solid #333', borderRadius: '8px', color: 'white' }}>
                <option value="eco">ECO</option>
                <option value="normal">NORMAL</option>
                <option value="sport">SPORT</option>
              </select>
            </section>
          </div>
          {controlType === 'pas' && (
            <section className="form-group">
              <label>Assist Level (1-5)</label>
              <div className="mode-toggle">
                {[1, 2, 3, 4, 5].map(l => <button key={l} className={pasLevel === l ? 'active' : ''} onClick={() => { setPasLevel(l); markDirty(); }}>{l}</button>)}
              </div>
            </section>
          )}
          <section className="form-group">
            <label>Battery Entry</label>
            <div className="mode-toggle">
              <button className={batteryInputMode === 'percent' ? 'active' : ''} onClick={() => handleToggleBatteryMode('percent')}>%</button>
              <button className={batteryInputMode === 'voltage' ? 'active' : ''} onClick={() => handleToggleBatteryMode('voltage')}>V</button>
            </div>
            <input type="number" value={batteryInputMode === 'percent' ? startBattery : startVoltage} onChange={e => { if (batteryInputMode === 'percent') setStartBattery(parseFloat(e.target.value) || ''); else setStartVoltage(parseFloat(e.target.value) || ''); markDirty(); }} />
          </section>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button onClick={() => searchPOIs('charging')} style={{ flex: 1, padding: '0.6rem', background: '#333', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.7rem' }}>⚡ Chargers</button>
            <button onClick={() => searchPOIs('cafe')} style={{ flex: 1, padding: '0.6rem', background: '#333', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.7rem' }}>☕ Cafes</button>
          </div>
          {metrics && (
            <div ref={metricsCardRef} className="card metrics-card" style={{ marginTop: '1rem', borderLeft: '4px solid #ff6600', padding: '1rem', background: 'rgba(40,40,40,0.9)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{metrics.batteryPercentUsed.toFixed(1)}% Left</div>
              <p style={{ margin: '0.5rem 0', color: '#888' }}>{metrics.distanceMiles.toFixed(1)} mi • {Math.round(metrics.durationMin)} min</p>
              <button onClick={() => setShowSharePreview(true)} style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', background: '#ff6600', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold' }}>Share Trip</button>
            </div>
          )}
          <AdBanner isPro={isPro} />
        </aside>
        <main style={{ flex: 1, position: 'relative' }}>
          {isLoaded ? (
            <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={center} zoom={10} onLoad={onMapLoad}>
              {trip.origin && trip.destination && isLoading && !response && (
                <DirectionsService options={{ origin: trip.origin, destination: isRoundTrip ? trip.origin : trip.destination, travelMode: google.maps.TravelMode.BICYCLING, waypoints: trip.waypoints.map(w => ({ location: w, stopover: true })) }} callback={directionsCallback} />
              )}
              {response && <DirectionsRenderer options={{ directions: response, routeIndex: selectedRouteIndex }} />}
              {metrics?.deathPoint && <Marker position={metrics.deathPoint} label={{ text: '☠️', color: 'white', fontWeight: 'bold' }} />}
              {rideParticipants.map(p => <Marker key={p.userId} position={{ lat: p.lat, lng: p.lng }} label={{ text: p.name, color: 'white', fontSize: '10px' }} />)}
              {pois.map(p => (
                <Marker key={p.id} position={p.position} onClick={() => setSelectedPoi(p)} icon={{ url: p.type === 'charging' ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }} />
              ))}
              {selectedPoi && <InfoWindow position={selectedPoi.position} onCloseClick={() => setSelectedPoi(null)}><div style={{ color: 'black' }}><strong>{selectedPoi.name}</strong><br/>{selectedPoi.address}</div></InfoWindow>}
            </GoogleMap>
          ) : <div style={{ color: 'white', padding: '2rem' }}>Loading Maps...</div>}
        </main>
      </div>
      <div className="persistent-controls" style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 2000, display: 'flex', gap: '1rem', background: 'rgba(20,20,20,0.9)', padding: '0.8rem 1.5rem', borderRadius: '40px', border: '1px solid #333' }}>
        <button 
          onClick={() => {
            if (showMobileMenu && trip.origin && trip.destination && settingsDirty) { handleCalculate(); setShowMobileMenu(false); }
            else setShowMobileMenu(!showMobileMenu);
          }}
          style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '25px', fontWeight: 'bold' }}
        >
          {showMobileMenu ? (settingsDirty ? (metrics ? '🔄 Update Trip' : '🚀 Find Route') : '🗺️ Map') : (metrics && !settingsDirty ? '📊 Stats' : '🏁 Start Here')}
        </button>
        <button onClick={recenterMap} style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#333', color: 'white', border: 'none', cursor: 'pointer' }}>🎯</button>
      </div>
      {showSharePreview && metrics && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', padding: '20px' }}>
          <div ref={shareCardRef} style={{ width: '500px', height: '800px', background: '#0a0a0a', padding: '2rem', display: 'flex', flexDirection: 'column', borderRadius: '40px', border: '1px solid #333' }}>
             <h2 style={{ color: '#ff6600', fontStyle: 'italic' }}>RANGE ANXIETY</h2>
             {mapSnapshot && <div style={{ flex: 1, margin: '1.5rem 0', borderRadius: '20px', overflow: 'hidden' }}><img src={mapSnapshot} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Map" /></div>}
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '15px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: 'white' }}>{metrics.batteryPercentUsed.toFixed(0)}%</div>
                </div>
                <div style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '15px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: 'white' }}>{metrics.distanceMiles.toFixed(1)}mi</div>
                </div>
             </div>
             <div style={{ textAlign: 'center', marginTop: 'auto', color: '#ff6600', fontWeight: 'bold' }}>rangeanxiety.app</div>
          </div>
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => setShowSharePreview(false)} style={{ padding: '1rem 2rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px' }}>Cancel</button>
            <button onClick={downloadShareCard} style={{ padding: '1rem 2rem', background: '#444', color: 'white', border: 'none', borderRadius: '12px' }}>Save PNG</button>
            <button onClick={shareToCommunity} style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Post Feed</button>
          </div>
        </div>
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}
    </div>
  );
}

export default MapHome;
