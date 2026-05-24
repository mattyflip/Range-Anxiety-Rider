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

  const [trip, setTrip] = useState({ origin: '', destination: '' });
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
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
            return () => bUnsub();
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

  const directionsCallback = (res: any, status: any) => {
    if (status === 'OK' && res) { 
        setResponse(res); 
        
        // Physics Engine Calculation
        const route = res.routes[0].legs[0];
        const distanceMeters = route.distance.value;
        const durationSeconds = route.duration.value;
        const bike = shopBikes.find(b => b.id === selectedBikeId) || shopBikes[0];

        if (bike && bike.specs) {
          const { voltage, capacityAh, motorWatts, tirePSI, bikeWeightLbs, targetSpeedMph, cycleCount, controllerAmps } = bike.specs;
          
          // 1. Constants & Basic Metrics
          const riderWeightLbs = 180;
          const totalMassKg = (bikeWeightLbs + riderWeightLbs) * 0.453592;
          const speedMps = Math.min(distanceMeters / durationSeconds, targetSpeedMph * 0.44704);
          const gravity = 9.81;
          
          // 2. Rolling Resistance (Crr increases as PSI decreases)
          // Rough approximation: Crr = 0.005 + (50 / PSI) * 0.0001
          const crr = 0.005 + (50 / (tirePSI || 30)) * 0.0005;
          const fRoll = crr * totalMassKg * gravity;
          
          // 3. Aerodynamic Drag (F_aero = 0.5 * rho * Cd * A * v^2)
          const rho = 1.225; // Air density kg/m3
          const cdA = 0.5;   // Drag coefficient * frontal area
          const fAero = 0.5 * rho * cdA * Math.pow(speedMps, 2);
          
          // 4. Total Power (Watts)
          let powerWatts = (fRoll + fAero) * speedMps;
          powerWatts = powerWatts / 0.85; // 85% motor/controller efficiency
          
          // Power limit based on controller amps (if provided) or motor watts
          const maxPowerAmps = controllerAmps ? (controllerAmps * voltage) : (motorWatts || 750);
          powerWatts = Math.min(powerWatts, maxPowerAmps);
          
          // 5. Total Energy Consumed (Watt-hours)
          const energyWh = powerWatts * (durationSeconds / 3600);
          
          // 6. Battery Capacity with Degradation
          // Approximation: 10% loss per 500 cycles
          const degradationFactor = 1 - ((cycleCount || 0) / 500) * 0.1;
          const totalWh = voltage * capacityAh * Math.max(0.7, degradationFactor);
          
          const percentUsed = Math.min(Math.round((energyWh / totalWh) * 100), 100);
          setMetrics({ 
            batteryPercentUsed: 100 - percentUsed,
            energyWh: energyWh.toFixed(1),
            estRangeRemaining: ((totalWh - energyWh) / (energyWh / (distanceMeters / 1609.34))).toFixed(1)
          });
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

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Plan Your Route</label>
            <input placeholder="Where to?" style={{ width: '100%', marginTop: '0.5rem', marginBottom: '1rem', background: '#111', border: '1px solid #333', color: 'white', padding: '0.8rem', borderRadius: '8px' }} onChange={e => setTrip({...trip, destination: e.target.value})} />
            <button onClick={() => setIsLoading(true)} style={{ width: '100%', padding: '0.8rem', background: '#333', border: '1px solid #444', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Check Range</button>
          </div>
          
          {metrics && (
            <div style={{ marginTop: '2rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>ESTIMATED BATTERY AT DESTINATION</div>
              <h2 style={{ color: metrics.batteryPercentUsed < 20 ? '#ff3333' : '#34a853' }}>{metrics.batteryPercentUsed}% Left</h2>
              <p style={{ fontSize: '0.65rem', color: '#666' }}>*Based on current wind and elevation.</p>
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
            <button 
               onClick={() => { setTrip({ origin: '', destination: orgData?.address || 'Shop Location' }); setIsLoading(true); }}
               style={{ width: '100%', padding: '0.8rem', background: 'transparent', border: '1px solid #ff6600', color: '#ff6600', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Return to Shop
            </button>
          </div>
        </aside>
        <main style={{ flex: 1 }}>
          <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={currentLocation || {lat: 40.71, lng: -74.00}} zoom={13} onLoad={m => {mapRef.current = m}}>
            {trip.destination && isLoading && <DirectionsService options={{ origin: currentLocation || 'current location', destination: trip.destination, travelMode: google.maps.TravelMode.BICYCLING }} callback={directionsCallback} />}
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
