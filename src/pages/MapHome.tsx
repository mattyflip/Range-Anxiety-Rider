import { useState, useRef, useEffect, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker, InfoWindow } from '@react-google-maps/api'
import axios from 'axios'
import { toPng } from 'html-to-image'
import { auth, db, storage } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, collection, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import AdBanner from '../components/AdBanner'
import TermsOfService from '../components/TermsOfService'
import InstallTutorial from '../components/InstallTutorial'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import WelcomeModal from '../components/WelcomeModal'
import { STATE_COORDINATES } from '../utils/ebikeLaws'

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

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
  endingVoltage?: number;
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
  { name: "Talaria Sting MX5 Pro", specs: { voltage: 72, capacityAh: 40, motorWatts: 13400, bikeWeightLbs: 167 } },
  { name: "Onyx RCR", specs: { voltage: 72, capacityAh: 41, motorWatts: 5000, bikeWeightLbs: 145 } },
  { name: "Stark Varg Alpha", specs: { voltage: 360, capacityAh: 18, motorWatts: 60000, bikeWeightLbs: 260 } },
  { name: "Specialized Turbo Levo", specs: { voltage: 36, capacityAh: 19.4, motorWatts: 565, bikeWeightLbs: 50 } },
  { name: "Trek Fuel EXe", specs: { voltage: 50, capacityAh: 7.2, motorWatts: 250, bikeWeightLbs: 41 } },
  { name: "Segway Ninebot Max G2", specs: { voltage: 36, capacityAh: 15.3, motorWatts: 450, bikeWeightLbs: 53 } },
  { name: "Dualtron Thunder 3", specs: { voltage: 72, capacityAh: 40, motorWatts: 2500, bikeWeightLbs: 126 } },
  { name: "Nami Burn-E 2 Max", specs: { voltage: 72, capacityAh: 40, motorWatts: 1500, bikeWeightLbs: 103 } },
  { name: "Inmotion RS", specs: { voltage: 72, capacityAh: 40, motorWatts: 2000, bikeWeightLbs: 128 } }
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
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", libraries: LIBRARIES });
  const mapRef = useRef<google.maps.Map | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const metricsCardRef = useRef<HTMLDivElement>(null);

  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [specs, setSpecs] = useState<BikeSpecs>({ voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 65 });
  const [riderWeightLbs, setRiderWeightLbs] = useState<number | ''>(200);
  const [ambientTempF, setAmbientTempF] = useState<number | ''>(70);
  const [tireType, setTireType] = useState<'road' | 'knobby'>('road');
  const [tirePressurePsi, setTirePressurePsi] = useState<number | ''>(''); 
  
  const [trip, setTrip] = useState<TripDetails>({ origin: '', destination: '', waypoints: [] });
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
  const [settingsDirty, setSettingsDirty] = useState(true);

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
    if (authInitialized && !user && !localStorage.getItem('ebike_portal_visited')) setShowWelcomeModal(true);
  }, [authInitialized, user]);

  useEffect(() => {
    if (userData?.homeRegion && mapRef.current) {
      const coords = STATE_COORDINATES[userData.homeRegion];
      if (coords) { mapRef.current.panTo(coords); mapRef.current.setZoom(8); }
    }
  }, [userData?.homeRegion]);

  useEffect(() => {
    if (!response || !response.routes[selectedRouteIndex]) return;
    const polyline = response.routes[selectedRouteIndex].overview_polyline;
    const points = (polyline as any).points || polyline;
    fetch(`/api/static-map?polyline=${encodeURIComponent(points)}`).then(r => r.blob()).then(blob => {
      const reader = new FileReader(); reader.onloadend = () => setMapSnapshot(reader.result as string); reader.readAsDataURL(blob);
    }).catch(console.error);
  }, [response, selectedRouteIndex]);

  const markDirty = () => { if (!settingsDirty) setSettingsDirty(true); };
  
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
    if (newMode === 'voltage') setStartVoltage(Number((min + (Number(startBattery)/100)*(max-min)).toFixed(1)));
    else setStartBattery(Math.min(100, Math.max(0, Number((((Number(startVoltage)-min)/(max-min))*100).toFixed(0)))));
    setBatteryInputMode(newMode);
  };

  const loadBike = (bike: SavedBike) => {
    setSpecs(bike.specs); setBikeSearchQuery(bike.name); setShowBikeResults(false);
    if (bike.specs.voltage) setStartVoltage(getBatteryLevels(Number(bike.specs.voltage)).max);
    const name = bike.name.toLowerCase();
    if (name.includes("surron") || name.includes("talaria") || name.includes("onyx") || name.includes("dualtron") || name.includes("nami") || Number(bike.specs.voltage) >= 60) setControlType('switch');
    else setControlType('pas');
    markDirty();
  };

  const handleCalculate = () => { 
    if (!trip.origin || !trip.destination) return;
    setIsLoading(true); setResponse(null); setMetrics(null); setPois([]); setSettingsDirty(false); 
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

      let windSpeed = 0, headwindMph = 0;
      try {
        const res = await axios.get(`/api/weather?lat=${path[0].lat}&lng=${path[0].lng}`);
        windSpeed = res.data.wind_speed; headwindMph = windSpeed * 0.5;
      } catch (e) { console.error(e); }

      const massKg = (Number(specs.bikeWeightLbs) + Number(riderWeightLbs)) * 0.453592;
      const velocityMps = Number(targetSpeedMph) * 0.44704;
      const Crr = tireType === 'road' ? 0.007 : 0.015;
      const ForceRolling = Crr * massKg * 9.81;
      const ForceDrag = 0.5 * 1.225 * 0.55 * Math.pow(Math.max(0.1, velocityMps + headwindMph * 0.44704), 2);
      const motorEff = mode === 'eco' ? 0.85 : 0.80;
      const totalWhUsable = (Number(specs.voltage) * Number(specs.capacityAh)) * 0.92;
      const WhPerMile = Math.max(10, ((ForceRolling + ForceDrag) * velocityMps / velocityMps) * (1609.34 / 3600) / motorEff);
      const estimatedWh = (distMiles * WhPerMile) + (gainFeet * 0.1);

      const { min, max } = getBatteryLevels(Number(specs.voltage));
      const startWh = batteryInputMode === 'percent' ? (totalWhUsable * (Number(startBattery)/100)) : (totalWhUsable * ((Number(startVoltage)-min)/(max-min)));
      const remaining = ((startWh - estimatedWh) / totalWhUsable) * 100;
      const endingVoltage = min + (Math.max(0, remaining / 100) * (max - min));
      
      let deathPoint; if (remaining <= 0) deathPoint = path[Math.floor(path.length * 0.8)];

      setMetrics({ distanceMiles: distMiles, durationMin: distMiles / (Number(targetSpeedMph) || 15) * 60, elevationGainFeet: gainFeet, elevationLossFeet: lossFeet, estimatedWh, batteryPercentUsed: Math.max(0, remaining), recommendedSpeedMph: 20, deathPoint, endingVoltage, windConditions: { speed: windSpeed, direction: 0, headwindComponent: headwindMph } });
      setIsLoading(false);
    } catch (e) { console.error(e); setIsLoading(false); }
  };

  const directionsCallback = (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
    if (status === 'OK' && result) { setResponse(result); setSelectedRouteIndex(0); calculateMetrics(result, 0); }
    else { setIsLoading(false); }
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

  const saveCurrentBike = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!newBikeName) return;
    const updated = [...savedBikes, { id: Date.now().toString(), name: newBikeName, specs }];
    setSavedBikes(updated);
    try { await updateDoc(doc(db, "users", user.uid), { bikes: updated }); } catch (e) { console.error(e); }
    setNewBikeName(''); alert("Bike saved!");
  };

  const useCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => { setTrip(p => ({ ...p, origin: `${pos.coords.latitude},${pos.coords.longitude}` })); markDirty(); });
    }
  };

  const downloadShareCard = async () => {
    if (!shareCardRef.current || !metrics || !mapSnapshot) return;
    try {
      setIsLoading(true); shareCardRef.current.style.opacity = '1';
      await new Promise(r => setTimeout(r, 1500));
      const dataUrl = await toPng(shareCardRef.current, { backgroundColor: "#121212", pixelRatio: 2 });
      shareCardRef.current.style.opacity = '0';
      const link = document.createElement('a'); link.download = `trip.png`; link.href = dataUrl; link.click();
      setIsLoading(false);
    } catch (e) { setIsLoading(false); }
  };

  const shareToCommunity = async () => {
    if (!shareCardRef.current || !metrics || !user || !mapSnapshot) return;
    setIsLoading(true);
    try {
      shareCardRef.current.style.opacity = '1';
      await new Promise(r => setTimeout(r, 1500));
      const dataUrl = await toPng(shareCardRef.current, { backgroundColor: "#121212", pixelRatio: 2 });
      shareCardRef.current.style.opacity = '0';
      const blob = await (await fetch(dataUrl)).blob();
      const imageRef = ref(storage, `trips/${user.uid}/${Date.now()}.png`);
      await uploadBytes(imageRef, blob);
      const url = await getDownloadURL(imageRef);
      await addDoc(collection(db, "posts"), { 
        authorId: user.uid, authorUsername: userData?.username || 'Rider', authorProfilePic: userData?.profilePic || '', imageUrl: url, 
        caption: `Rode ${metrics.distanceMiles.toFixed(1)} miles!`, likes: [], commentsEnabled: true, createdAt: serverTimestamp(),
        tripData: { origin: trip.origin, destination: trip.destination, waypoints: trip.waypoints, isRoundTrip }
      });
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
          <div className="form-group"><label>Units</label><div className="mode-toggle">
            <button className={unitSystem === 'imperial' ? 'active' : ''} onClick={() => setUnitSystem('imperial')}>Imperial</button>
            <button className={unitSystem === 'metric' ? 'active' : ''} onClick={() => setUnitSystem('metric')}>Metric</button>
          </div></div>
          <section className="form-group" style={{ position: 'relative' }}>
            <label>Bike Library</label>
            <input type="text" placeholder="Search..." value={bikeSearchQuery} onFocus={() => setShowBikeResults(true)} onChange={e => setBikeSearchQuery(e.target.value)} />
            {showBikeResults && bikeSearchQuery && (
              <div className="bike-results-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', zIndex: 100, border: '1px solid #333', maxHeight: '200px', overflowY: 'auto' }}>
                {filteredBikes.map(b => <div key={b.name} onClick={() => loadBike(b)} style={{ padding: '0.8rem', borderBottom: '1px solid #222', cursor: 'pointer' }}>{b.name}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input type="text" placeholder="Nickname" value={newBikeName} onChange={e => setNewBikeName(e.target.value)} style={{ padding: '0.4rem' }} />
              <button onClick={saveCurrentBike} style={{ padding: '0.4rem 0.8rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '4px' }}>Save</button>
            </div>
          </section>
          <section className="form-group">
            <label>Route</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" placeholder="Start" value={trip.origin} onChange={e => { setTrip(p => ({ ...p, origin: e.target.value })); markDirty(); }} style={{ flex: 1 }} />
              <button onClick={useCurrentLocation} style={{ background: 'none', border: 'none', fontSize: '1.2rem' }}>📍</button>
            </div>
            <input type="text" placeholder="End" value={trip.destination} onChange={e => { setTrip(p => ({ ...p, destination: e.target.value })); markDirty(); }} style={{ marginTop: '0.5rem' }} />
            <div className="mode-toggle" style={{ marginTop: '0.5rem' }}>
              <button className={!isRoundTrip ? 'active' : ''} onClick={() => { setIsRoundTrip(false); markDirty(); }}>One Way</button>
              <button className={isRoundTrip ? 'active' : ''} onClick={() => { setIsRoundTrip(true); markDirty(); }}>Round Trip</button>
            </div>
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <section className="form-group"><label>Voltage</label><input type="number" value={specs.voltage} onChange={e => { setSpecs(p => ({ ...p, voltage: parseFloat(e.target.value) || '' })); markDirty(); }} /></section>
            <section className="form-group"><label>Capacity (Ah)</label><input type="number" value={specs.capacityAh} onChange={e => { setSpecs(p => ({ ...p, capacityAh: parseFloat(e.target.value) || '' })); markDirty(); }} /></section>
          </div>
          <section className="form-group"><label>Rider Weight ({unitSystem === 'imperial' ? 'lbs' : 'kg'})</label><input type="number" value={riderWeightLbs} onChange={e => { setRiderWeightLbs(parseFloat(e.target.value) || ''); markDirty(); }} /></section>
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
          <section className="form-group">
            <label>Drive Type</label>
            <div className="mode-toggle">
              <button className={controlType === 'pas' ? 'active' : ''} onClick={() => { setControlType('pas'); markDirty(); }}>PAS (1-5)</button>
              <button className={controlType === 'switch' ? 'active' : ''} onClick={() => { setControlType('switch'); markDirty(); }}>3 Speed Switch</button>
            </div>
          </section>
          {controlType === 'pas' ? (
            <section className="form-group"><label>PAS Level (1-5)</label><div className="mode-toggle">
              {[1, 2, 3, 4, 5].map(l => <button key={l} className={pasLevel === l ? 'active' : ''} onClick={() => { setPasLevel(l); markDirty(); }}>{l}</button>)}
            </div></section>
          ) : (
            <section className="form-group"><label>Speed Mode</label><div className="mode-toggle">
              <button className={mode === 'eco' ? 'active' : ''} onClick={() => { setMode('eco'); markDirty(); }}>Eco</button>
              <button className={mode === 'normal' ? 'active' : ''} onClick={() => { setMode('normal'); markDirty(); }}>Normal</button>
              <button className={mode === 'sport' ? 'active' : ''} onClick={() => { setMode('sport'); markDirty(); }}>Sport</button>
            </div></section>
          )}
          <section className="form-group">
            <label>Battery Entry</label>
            <div className="mode-toggle">
              <button className={batteryInputMode === 'percent' ? 'active' : ''} onClick={() => handleToggleBatteryMode('percent')}>%</button>
              <button className={batteryInputMode === 'voltage' ? 'active' : ''} onClick={() => handleToggleBatteryMode('voltage')}>V</button>
            </div>
            <input type="number" value={batteryInputMode === 'percent' ? startBattery : startVoltage} onChange={e => { if (batteryInputMode === 'percent') setStartBattery(parseFloat(e.target.value) || ''); else setStartVoltage(parseFloat(e.target.value) || ''); markDirty(); }} />
          </section>
          {metrics && (
            <div ref={metricsCardRef} className="card metrics-card" style={{ marginTop: '1rem', borderLeft: '4px solid #ff6600', padding: '1rem', background: 'rgba(40,40,40,0.9)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{metrics.batteryPercentUsed.toFixed(1)}% Left</div>
              <p style={{ color: '#888', fontSize: '0.85rem' }}>{metrics.distanceMiles.toFixed(1)} mi • End Volts: {metrics.endingVoltage?.toFixed(1)}V • Gain: {metrics.elevationGainFeet.toFixed(0)}ft</p>
              <button onClick={() => setShowSharePreview(true)} style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', background: '#ff6600', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold' }}>Share Trip</button>
            </div>
          )}
          <AdBanner isPro={isPro} />
        </aside>
        <main style={{ flex: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <button onClick={() => searchPOIs('charging')} style={{ padding: '1rem 1.5rem', background: 'rgba(20,20,20,0.95)', color: 'white', border: '1px solid #333', borderRadius: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.6rem', boxShadow: '0 8px 30px rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)' }}><span style={{ color: '#ff6600', fontSize: '1.2rem' }}>⚡</span> Chargers</button>
            <button onClick={() => searchPOIs('cafe')} style={{ padding: '1rem 1.5rem', background: 'rgba(20,20,20,0.95)', color: 'white', border: '1px solid #333', borderRadius: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.6rem', boxShadow: '0 8px 30px rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)' }}><span style={{ color: '#ffcc00', fontSize: '1.2rem' }}>☕</span> Cafes</button>
          </div>
          {isLoaded ? (
            <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={center} zoom={10} onLoad={onMapLoad}>
              {trip.origin && trip.destination && isLoading && !response && (
                <DirectionsService options={{ origin: trip.origin, destination: isRoundTrip ? trip.origin : trip.destination, travelMode: google.maps.TravelMode.BICYCLING }} callback={directionsCallback} />
              )}
              {response && <DirectionsRenderer options={{ directions: response }} />}
              {metrics?.deathPoint && <Marker position={metrics.deathPoint} label="☠️" />}
              {pois.map(p => (
                <Marker key={p.id} position={p.position} onClick={() => setSelectedPoi(p)} label={p.type === 'charging' ? { text: '⚡', color: 'white', fontWeight: 'bold' } : undefined} icon={{ url: p.type === 'charging' ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }} />
              ))}
              {selectedPoi && <InfoWindow position={selectedPoi.position} onCloseClick={() => setSelectedPoi(null)}><div style={{ color: 'black' }}><strong>{selectedPoi.name}</strong><br/>{selectedPoi.address}</div></InfoWindow>}
            </GoogleMap>
          ) : <div style={{ color: 'white', padding: '2rem' }}>Loading Maps...</div>}
        </main>
      </div>
      <div className="persistent-controls" style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 2000, display: 'flex', gap: '1rem', background: 'rgba(20,20,20,0.9)', padding: '0.8rem 1.5rem', borderRadius: '40px', border: '1px solid #333' }}>
        <button onClick={useCurrentLocation} style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: 'none', width: '45px', height: '45px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', cursor: 'pointer' }}>
          📍
        </button>
        <button onClick={() => { if (showMobileMenu && trip.origin && trip.destination && settingsDirty) { handleCalculate(); setShowMobileMenu(false); } else setShowMobileMenu(!showMobileMenu); }} style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '25px', fontWeight: 'bold' }}>
          {showMobileMenu ? (settingsDirty ? (metrics ? '🔄 Update Trip' : '🚀 Find Route') : '🗺️ Map') : (metrics && !settingsDirty ? '📊 Stats' : '🏁 Start Here')}
        </button>
      </div>
      {showSharePreview && metrics && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', padding: '20px' }}>
          <div ref={shareCardRef} style={{ width: '500px', height: '800px', background: '#0a0a0a', padding: '2.5rem', display: 'flex', flexDirection: 'column', borderRadius: '40px', border: '1px solid #333', position: 'relative' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><h2 style={{ color: '#ff6600', fontStyle: 'italic', fontSize: '2.1rem', fontWeight: 900, margin: 0 }}>RANGE ANXIETY</h2><p style={{ color: '#666', fontSize: '0.75rem', fontWeight: 'bold' }}>Trip Report • {new Date().toLocaleDateString()}</p></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white' }}>{specs.voltage}V {specs.capacityAh}Ah</div><div style={{ fontSize: '0.8rem', color: '#ff6600', fontWeight: 'bold' }}>{bikeSearchQuery || "Custom"}</div></div>
             </div>
             {mapSnapshot && <div style={{ flex: 1, margin: '1.5rem 0', borderRadius: '24px', overflow: 'hidden', border: '1px solid #333' }}><img src={mapSnapshot} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Map" /></div>}
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
                <div style={{ background: '#111', padding: '1rem', borderRadius: '20px', border: '1px solid #222', textAlign: 'center' }}><div style={{ fontSize: '0.55rem', color: '#ff6600', fontWeight: 800, textTransform: 'uppercase' }}>Battery Left</div><div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'white' }}>{metrics.batteryPercentUsed.toFixed(0)}%</div><div style={{ fontSize: '0.8rem', color: '#ff6600', fontWeight: 700 }}>{metrics.endingVoltage?.toFixed(1)}V</div></div>
                <div style={{ background: '#111', padding: '1rem', borderRadius: '20px', border: '1px solid #222', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}><div style={{ fontSize: '0.55rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Distance</div><div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'white' }}>{metrics.distanceMiles.toFixed(1)}mi</div></div>
                <div style={{ background: '#111', padding: '1rem', borderRadius: '20px', border: '1px solid #222', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}><div style={{ fontSize: '0.55rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Efficiency</div><div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'white' }}>{(metrics.estimatedWh / metrics.distanceMiles).toFixed(0)}<span style={{ fontSize: '0.8rem' }}>Wh/mi</span></div></div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '15px', border: '1px solid #222', textAlign: 'center' }}><div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Start Battery</div><div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>{startBattery}% • {startVoltage}V</div></div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '15px', border: '1px solid #222', textAlign: 'center' }}><div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Elevation</div><div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>+{metrics.elevationGainFeet.toFixed(0)}ft</div></div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '15px', border: '1px solid #222', textAlign: 'center' }}><div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Wind</div><div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>{Math.abs(Math.round(metrics.windConditions?.speed || 0))}mph 🌬️</div></div>
             </div>
             <div style={{ fontSize: '1.1rem', color: 'white', textAlign: 'center', margin: '1rem 0' }}>{trip.origin.split(',')[0]} <span style={{ color: '#ff6600' }}>➔</span> {trip.destination.split(',')[0]}</div>
             <div style={{ textAlign: 'center', marginTop: 'auto' }}><div style={{ color: '#ff6600', fontWeight: 900, fontSize: '1.3rem' }}>rangeanxiety.app</div><p style={{ color: '#444', fontSize: '0.6rem' }}>* Estimates only. Actual range may vary.</p></div>
          </div>
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => setShowSharePreview(false)} style={{ padding: '1rem 2rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Cancel</button>
            <button onClick={downloadShareCard} style={{ padding: '1rem 2rem', background: '#444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Save PNG</button>
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
