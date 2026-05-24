import { useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker } from '@react-google-maps/api'
import { useLocation } from 'react-router-dom';
import { auth, db } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import TermsOfService from '../components/TermsOfService'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import WelcomeModal from '../components/WelcomeModal'
import SEO from '../components/SEO'

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

function MapHome() {
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", libraries: LIBRARIES });
  const mapRef = useRef<google.maps.Map | null>(null);

  const [stops, setStops] = useState<string[]>(['']);
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [suggestedRoutes, setSuggestedRoutes] = useState<any[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showToSPage, setShowToSPage] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [orgData, setOrgData] = useState<any>(null);
  const [shopBikes, setShopBikes] = useState<any[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<string>('');
  const [chargers, setChargers] = useState<any[]>([]);
  const [showChargers, setShowChargers] = useState(false);
  const location = useLocation();

  // Handle ?chargers=true from NavBar
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('chargers') === 'true' && !showChargers) {
      handleFetchChargers();
    }
  }, [location]);

  // Handle external route loading (from Feed, Search, etc)
  useEffect(() => {
    const handleRouteLoaded = () => {
      const saved = localStorage.getItem('ebike_load_route');
      if (saved) {
        try {
          const tripData = JSON.parse(saved);
          if (tripData.stops) {
            setStops(tripData.stops);
            setIsLoading(true);
            localStorage.removeItem('ebike_load_route');
          }
        } catch (e) { console.error("Failed to parse loaded route", e); }
      }
    };
    window.addEventListener('ebike-route-loaded', handleRouteLoaded);
    // Also check on mount
    handleRouteLoaded();
    return () => window.removeEventListener('ebike-route-loaded', handleRouteLoaded);
  }, []);

  // Auth & Org Initialization
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const d = snap.data();
          setUserData(d);
          
          // Fetch Org Data
          if (d.orgId) {
            const oSnap = await getDoc(doc(db, "organizations", d.orgId));
            if (oSnap.exists()) setOrgData(oSnap.data());

            // Fetch Shop Bikes
            const { query, collection, onSnapshot } = await import('firebase/firestore');
            const bQuery = query(collection(db, `organizations/${d.orgId}/bikes`));
            const bUnsub = onSnapshot(bQuery, (snap) => {
              const bikes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              setShopBikes(bikes);
            });

            // Fetch Suggested Routes
            const rQuery = query(collection(db, `organizations/${d.orgId}/suggested_routes`));
            const rUnsub = onSnapshot(rQuery, (snap) => {
              setSuggestedRoutes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });

            return () => { bUnsub(); rUnsub(); };
          }
        }
      } else { setUserData(null); setOrgData(null); setShopBikes([]); }
    });
  }, []);

  // Fetch Chargers near current location
  const handleFetchChargers = async () => {
    if (showChargers) {
      setShowChargers(false);
      return;
    }

    setIsLoading(true);
    try {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const res = await fetch(`/api/charging?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&distance=15`);
        const data = await res.json();
        setChargers(data);
        setShowChargers(true);
        setIsLoading(false);
      }, (err) => {
        console.error(err);
        setIsLoading(false);
        alert("Enable location to find chargers.");
      });
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  };

  // Rental Bike Tracking Simulation (Mock GPS updates from bikes)
  useEffect(() => {
    if (!isWorking || !user || !userData?.orgId) return;

    const watchId = navigator.geolocation.watchPosition(async (pos) => {
      await setDoc(doc(db, `organizations/${userData.orgId}/live_units`, user.uid), {    
        unitName: userData.username || 'Bike #1',
        position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        battery: 100, 
        lastSeen: Date.now(),
        status: response ? 'rented' : 'available'
      }, { merge: true });
    }, null, { enableHighAccuracy: true });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isWorking, user, userData?.orgId, response]);

  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLngLiteral | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, []);

  const directionsCallback = async (res: any, status: any) => {
    if (status === 'OK' && res) { 
        setResponse(res); 
        
        // 1. Multi-Stop Metrics Aggregation
        const totalDistance = res.routes[0].legs.reduce((acc: number, leg: any) => acc + leg.distance.value, 0);
        const totalDuration = res.routes[0].legs.reduce((acc: number, leg: any) => acc + leg.duration.value, 0);
        const polyline = res.routes[0].overview_polyline;
        const startLoc = res.routes[0].legs[0].start_location;

        const bike = shopBikes.find(b => b.id === selectedBikeId) || shopBikes[0];

        if (bike && bike.specs) {
          // 2. Fetch Environmental Data (Elevation & Wind)
          try {
            const [elevRes, weatherRes] = await Promise.all([
              fetch('/api/elevation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ encodedPath: polyline })
              }).then(r => r.json()),
              fetch(`/api/weather?lat=${startLoc.lat()}&lng=${startLoc.lng()}`).then(r => r.json())
            ]);

            const { voltage, capacityAh, motorWatts, tirePSI, bikeWeightLbs, targetSpeedMph, cycleCount, controllerAmps } = bike.specs;
            
            // 3. Constants & Physics Core
            const riderWeightLbs = 180;
            const totalMassKg = (bikeWeightLbs + riderWeightLbs) * 0.453592;
            const speedMps = Math.min(totalDistance / totalDuration, (targetSpeedMph || 20) * 0.44704);
            const gravity = 9.81;
            
            // 4. Rolling Resistance
            const crr = 0.005 + (50 / (tirePSI || 30)) * 0.0005;
            const fRoll = crr * totalMassKg * gravity;
            
            // 5. Environmental Resistance
            // A. Grade Resistance (simplified over total climb)
            const slope = (elevRes.gain * 0.3048) / totalDistance; 
            const fGrade = totalMassKg * gravity * Math.max(0, slope);

            // B. Wind Resistance: Calculate relative headwind/tailwind
            const endLoc = res.routes[0].legs[res.routes[0].legs.length - 1].end_location;
            const dy = endLoc.lat() - startLoc.lat();
            const dx = Math.cos(Math.PI / 180 * startLoc.lat()) * (endLoc.lng() - startLoc.lng());
            const routeBearing = Math.atan2(dx, dy) * 180 / Math.PI;
            const windMps = (weatherRes.wind_speed || 0) * 0.44704;
            const angleDeg = (weatherRes.wind_deg - routeBearing + 360) % 360;
            const headwindMps = windMps * Math.cos(angleDeg * Math.PI / 180);
            
            // 6. Aerodynamic Drag (v_relative^2)
            const rho = 1.225; // Air density kg/m3
            const cdA = 0.5;   // Drag coefficient * frontal area
            const effectiveAirSpeedMps = Math.max(0, speedMps + headwindMps);
            const fAero = 0.5 * rho * cdA * Math.pow(effectiveAirSpeedMps, 2);
            
            // 7. Total Power and Energy
            let powerWatts = (fRoll + fGrade + fAero) * speedMps;
            powerWatts = powerWatts / 0.85; // Efficiency factor
            
            const maxPowerWatts = controllerAmps ? (controllerAmps * voltage) : (motorWatts || 750);
            powerWatts = Math.min(powerWatts, maxPowerWatts);
            
            const energyWh = powerWatts * (totalDuration / 3600);
            
            // 8. Capacity with Degradation
            const degradationFactor = 1 - ((cycleCount || 0) / 500) * 0.1;
            const totalWh = voltage * capacityAh * Math.max(0.7, degradationFactor);
            
            const percentRemaining = Math.max(0, Math.round(100 - (energyWh / totalWh) * 100));
            setMetrics({ 
              batteryPercentUsed: percentRemaining,
              energyWh: energyWh.toFixed(1),
              estRangeRemaining: ((totalWh - energyWh) / (energyWh / (totalDistance / 1609.34))).toFixed(1),
              elevationGain: elevRes.gain?.toFixed(0),
              windInfo: `${weatherRes.wind_speed}mph ${headwindMps > 0 ? 'Headwind' : 'Tailwind'}`
            });
          } catch (e) {
             console.error("Advanced physics calculation failed:", e);
             setMetrics({ batteryPercentUsed: 75 });
          }
        } else {
          setMetrics({ batteryPercentUsed: 75 });
        }
    }
    setIsLoading(false);
  };

  if (!isLoaded) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Loading Maps...</div>;

  return (
    <div className="container" style={{ height: '100vh', background: '#121212', display: 'flex', flexDirection: 'column' }}>
      <SEO />
      <NavBar user={user} onShowInstall={() => {}} onShowAuth={() => setShowAuthModal(true)} />
      
      <div className="main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: '300px', padding: '20px', background: '#1a1a1a', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <h2 style={{ color: '#ff6600', fontSize: '1rem', marginBottom: '1.5rem' }}>RENTAL DASHBOARD</h2>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>Your Rental Unit</label>
            <select 
              value={selectedBikeId} 
              onChange={e => setSelectedBikeId(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', color: 'white', borderRadius: '8px', cursor: 'pointer' }}
            >
              {shopBikes.length === 0 ? <option>Loading units...</option> : shopBikes.map(b => (
                <option key={b.id} value={b.id}>{b.unitId} ({b.specs.voltage}V {b.specs.capacityAh}Ah)</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '2rem', padding: '1rem', background: isWorking ? 'rgba(52,168,83,0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '12px', border: `1px solid ${isWorking ? '#34a853' : '#444'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', color: 'white' }}>RENTAL STATUS</span>
              <button 
                onClick={() => setIsWorking(!isWorking)}
                style={{ background: isWorking ? '#34a853' : '#ff6600', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {isWorking ? 'ACTIVE' : 'START RIDE'}
              </button>
            </div>
            <p style={{ fontSize: '0.65rem', color: '#888', marginTop: '0.5rem' }}>
              {isWorking ? 'Rental is active. Shop manager is monitoring battery & location.' : 'Click START RIDE to begin your session.'}
            </p>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
             <button 
               onClick={handleFetchChargers} 
               style={{ width: '100%', padding: '0.8rem', background: showChargers ? '#ff6600' : '#222', border: '1px solid #333', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
             >
               {showChargers ? '🔌 HIDE CHARGERS' : '🔌 FIND CHARGERS'}
             </button>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Itinerary</label>
            {stops.map((stop, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input 
                  placeholder={i === 0 ? "First stop..." : "Next stop..."}
                  value={stop} 
                  onChange={e => {
                    const newStops = [...stops];
                    newStops[i] = e.target.value;
                    setStops(newStops);
                  }}
                  style={{ flex: 1, background: '#111', border: '1px solid #333', color: 'white', padding: '0.6rem', borderRadius: '8px', fontSize: '0.8rem' }} 
                />
                {stops.length > 1 && (
                  <button onClick={() => setStops(stops.filter((_, idx) => idx !== i))} style={{ background: '#222', border: '1px solid #333', color: '#ff4444', borderRadius: '8px', padding: '0 0.8rem', cursor: 'pointer' }}>×</button>
                )}
              </div>
            ))}
            <button 
              onClick={() => setStops([...stops, ''])}
              style={{ width: '100%', padding: '0.6rem', background: 'transparent', border: '1px dashed #444', color: '#888', borderRadius: '8px', marginTop: '0.8rem', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 'bold' }}
            >
              + ADD STOP
            </button>
            <button 
              onClick={() => setIsLoading(true)} 
              style={{ width: '100%', padding: '0.8rem', background: '#333', border: '1px solid #444', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer', marginTop: '1rem' }}
            >
              Update Range Estimates
            </button>
          </div>

          {suggestedRoutes.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Shop Recommendations</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {suggestedRoutes.map(r => (
                  <button 
                    key={r.id} 
                    onClick={() => { setStops(r.stops); setIsLoading(true); }}
                    style={{ textAlign: 'left', padding: '0.6rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    📍 {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {metrics && (
            <div style={{ marginTop: '2rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>ESTIMATED BATTERY AT DESTINATION</div>
              <h2 style={{ color: metrics.batteryPercentUsed < 20 ? '#ff3333' : '#34a853' }}>{metrics.batteryPercentUsed}% Left</h2>
              <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '0.5rem' }}>
                <div>⛰️ {metrics.elevationGain}ft Gain</div>
                <div>💨 {metrics.windInfo}</div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
            <button 
               onClick={() => { setStops([orgData?.address || 'Shop Location']); setIsLoading(true); }}
               style={{ width: '100%', padding: '0.8rem', background: 'transparent', border: '1px solid #ff6600', color: '#ff6600', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Return to Shop
            </button>
          </div>
        </aside>
        <main style={{ flex: 1 }}>
          <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={currentLocation || {lat: 40.71, lng: -74.00}} zoom={13} onLoad={m => {mapRef.current = m}}>
            {stops[stops.length - 1] && isLoading && (
              <DirectionsService 
                options={{ 
                  origin: currentLocation || 'current location', 
                  destination: stops[stops.length - 1], 
                  waypoints: stops.slice(0, -1).filter(s => s).map(s => ({ location: s, stopover: true })),
                  travelMode: google.maps.TravelMode.BICYCLING 
                }} 
                callback={directionsCallback} 
              />
            )}
            {response && <DirectionsRenderer options={{ directions: response }} />}
            
            {showChargers && chargers.map(c => (
              <Marker 
                key={c.id} 
                position={c.position} 
                icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: c.is110v ? '#34a853' : '#ff6600', fillOpacity: 1, scale: 6, strokeColor: 'white', strokeWeight: 2 }}
                title={`${c.name} (${c.chargerClass})`}
              />
            ))}
          </GoogleMap>
        </main>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
      {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}
    </div>
  );
}

export default MapHome;
