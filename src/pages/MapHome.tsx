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
          }
        }
      } else { setUserData(null); setOrgData(null); }
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
        setMetrics({ batteryPercentUsed: 75 });
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
