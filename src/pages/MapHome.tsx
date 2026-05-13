import { useState, useRef, useEffect } from 'react'
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker } from '@react-google-maps/api'
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
  const [trip, setTrip] = useState<TripDetails>({ origin: '', destination: '', waypoints: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(true);
  
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [savedBikes, setSavedBikes] = useState<SavedBike[]>([]);
  const [bikeSearchQuery, setBikeSearchQuery] = useState("");
  const [showBikeResults, setShowBikeResults] = useState(false);
  const [newBikeName, setNewBikeName] = useState('');

  const [response, setResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [mapSnapshot, setMapSnapshot] = useState<string | null>(null);
  
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const [showToSPage, setShowToSPage] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [pendingBikeAutoSelect, setPendingBikeAutoSelect] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u); setAuthInitialized(true);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, "users", u.uid));
          if (userDoc.exists()) {
            const data = userDoc.data(); setUserData(data);
            if (data.bikes) setSavedBikes(data.bikes);
          }
        } catch (e) { console.error("Firestore error:", e); }
      } else {
        const local = localStorage.getItem('ebike-saved-bikes');
        if (local) setSavedBikes(JSON.parse(local));
      }
    });
    return () => unsub();
  }, []);

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
      setTimeout(() => metricsCardRef.current?.scrollIntoView({ behavior: 'smooth' }), 300);
    }
  }, [showMobileMenu, metrics]);

  useEffect(() => {
    const savedRoute = localStorage.getItem('ebike_load_route');
    if (savedRoute) {
      try {
        const data = JSON.parse(savedRoute);
        setTrip({ origin: data.origin || "", destination: data.destination || "", waypoints: data.waypoints || [] });
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
    if (!response || !response.routes[0]) return;
    const polyline = response.routes[0].overview_polyline;
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
      } catch (e) { console.error("Snapshot failed", e); }
    };
    fetchSnapshot();
  }, [response]);

  const markDirty = () => { if (!settingsDirty) setSettingsDirty(true); };

  const handleCalculate = () => { 
    if (!trip.origin || !trip.destination) return; 
    setIsLoading(true); setResponse(null); setMetrics(null); setSettingsDirty(false); 
  };

  const loadBike = (bike: SavedBike) => {
    setSpecs(bike.specs); setBikeSearchQuery(bike.name); setShowBikeResults(false); markDirty();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTrip(prev => ({ ...prev, [name]: value })); markDirty();
  };

  const handleSpecChange = (name: keyof BikeSpecs, value: string) => {
    const val = value === '' ? '' : parseFloat(value);
    setSpecs(prev => ({ ...prev, [name]: isNaN(Number(val)) ? '' : val })); markDirty();
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
      navigator.geolocation.getCurrentPosition(pos => {
        setTrip(prev => ({ ...prev, origin: `${pos.coords.latitude},${pos.coords.longitude}` })); markDirty();
      });
    }
  };

  const calculateMetrics = async (result: google.maps.DirectionsResult) => {
    try {
      const route = result.routes[0];
      let distMeters = 0; route.legs.forEach(l => distMeters += (l.distance?.value || 0));
      const distMiles = distMeters / 1609.34;
      const path = route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
      
      let gain = 0;
      try {
        const encoded = google.maps.geometry.encoding.encodePath(route.overview_path);
        const res = await axios.post('/api/elevation', { encodedPath: encoded, samples: 100 });
        if (res.data?.gain) gain = res.data.gain;
      } catch (e) { console.warn(e); }

      const totalWh = (Number(specs.voltage) * Number(specs.capacityAh)) * 0.92;
      const estimatedWh = (distMiles * 25) + (gain * 0.1); 
      const remaining = ((totalWh - estimatedWh) / totalWh) * 100;

      let deathPoint: google.maps.LatLngLiteral | undefined = undefined;
      if (remaining <= 0) deathPoint = path[Math.floor(path.length * 0.8)];

      setMetrics({ distanceMiles: distMiles, durationMin: distMiles / 15 * 60, elevationGainFeet: gain, elevationLossFeet: 0, estimatedWh, batteryPercentUsed: Math.max(0, remaining), deathPoint });
      setIsLoading(false);
    } catch (e) { setIsLoading(false); }
  };

  const directionsCallback = (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
    if (status === 'OK' && result) { setResponse(result); calculateMetrics(result); }
    else { setIsLoading(false); }
  };

  const recenterMap = () => {
    if (mapRef.current && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => mapRef.current?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
    }
  };

  const downloadShareCard = async () => {
    if (!shareCardRef.current || !metrics || !mapSnapshot) return;
    setIsLoading(true); shareCardRef.current.style.opacity = '1';
    await new Promise(r => setTimeout(r, 1500));
    const dataUrl = await toPng(shareCardRef.current, { backgroundColor: "#121212" });
    shareCardRef.current.style.opacity = '0';
    const link = document.createElement('a'); link.download = 'trip.png'; link.href = dataUrl; link.click();
    setIsLoading(false);
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
      await addDoc(collection(db, "posts"), { authorId: user.uid, authorUsername: userData?.username || 'Rider', authorProfilePic: userData?.profilePic || '', imageUrl: url, caption: `Trip: ${metrics.distanceMiles.toFixed(1)} miles`, likes: [], commentsEnabled: true, createdAt: serverTimestamp() });
      alert("Posted!"); setIsLoading(false);
    } catch (e) { setIsLoading(false); }
  };

  const filteredBikes = [...STANDARD_BIKES, ...savedBikes].filter(b => b.name.toLowerCase().includes(bikeSearchQuery.toLowerCase()));

  return (
    <div className="container">
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
      <div className="main-layout">
        <aside className={`sidebar ${showMobileMenu ? 'mobile-visible' : ''}`}>
          <div className="form-group">
            <label>Units</label>
            <div className="mode-toggle">
              <button className={unitSystem === 'imperial' ? 'active' : ''} onClick={() => setUnitSystem('imperial')}>Imperial</button>
              <button className={unitSystem === 'metric' ? 'active' : ''} onClick={() => setUnitSystem('metric')}>Metric</button>
            </div>
          </div>
          <section className="form-group" style={{ position: 'relative' }}>
            <label>Bike Library</label>
            <input type="text" placeholder="Search..." value={bikeSearchQuery} onFocus={() => setShowBikeResults(true)} onChange={e => setBikeSearchQuery(e.target.value)} />
            {showBikeResults && bikeSearchQuery && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', zIndex: 100, border: '1px solid #333' }}>
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
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <section className="form-group"><label>Volts</label><input type="number" value={specs.voltage} onChange={e => handleSpecChange('voltage', e.target.value)} /></section>
            <section className="form-group"><label>Ah</label><input type="number" value={specs.capacityAh} onChange={e => handleSpecChange('capacityAh', e.target.value)} /></section>
          </div>
          {metrics && (
            <div ref={metricsCardRef} className="card metrics-card" style={{ marginTop: '2rem', borderLeft: '4px solid #ff6600', padding: '1rem', background: 'rgba(40,40,40,0.9)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{metrics.batteryPercentUsed.toFixed(1)}% Left</div>
              <p style={{ color: '#888' }}>{metrics.distanceMiles.toFixed(1)} miles</p>
              <button onClick={downloadShareCard} style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', background: '#333', color: 'white', border: 'none', borderRadius: '8px' }}>Download</button>
              <button onClick={shareToCommunity} style={{ width: '100%', marginTop: '0.5rem', padding: '0.8rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '8px' }}>Post Feed</button>
            </div>
          )}
          <AdBanner isPro={userData?.isPro || false} />
        </aside>
        <main style={{ flex: 1, position: 'relative' }}>
          {isLoaded ? (
            <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={center} zoom={10} onLoad={map => { mapRef.current = map; }}>
              {trip.origin && trip.destination && isLoading && !response && (
                <DirectionsService options={{ origin: trip.origin, destination: trip.destination, travelMode: google.maps.TravelMode.BICYCLING }} callback={directionsCallback} />
              )}
              {response && <DirectionsRenderer options={{ directions: response }} />}
              {metrics?.deathPoint && <Marker position={metrics.deathPoint} label="☠️" />}
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
          {showMobileMenu ? (settingsDirty ? '🚀 Find Route' : '🗺️ Map') : (metrics ? '📊 Stats' : '🏁 Start Here')}
        </button>
        <button onClick={recenterMap} style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#333', color: 'white', border: 'none', cursor: 'pointer' }}>🎯</button>
      </div>
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', pointerEvents: 'none' }}>
        <div ref={shareCardRef} style={{ width: '500px', height: '800px', background: '#0a0a0a', padding: '2rem', display: 'flex', flexDirection: 'column', borderRadius: '40px' }}>
          <h2 style={{ color: '#ff6600' }}>RANGE ANXIETY</h2>
          {mapSnapshot && <img src={mapSnapshot} style={{ flex: 1, objectFit: 'cover', borderRadius: '20px' }} />}
          <div style={{ fontSize: '2rem', color: 'white', textAlign: 'center' }}>{metrics?.batteryPercentUsed.toFixed(0)}%</div>
        </div>
      </div>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}
    </div>
  );
}
export default MapHome;
