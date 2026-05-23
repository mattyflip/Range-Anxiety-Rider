import { useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker } from '@react-google-maps/api'
import { auth, db } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, collection, onSnapshot, query, setDoc, updateDoc } from 'firebase/firestore'
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
  const [userRole, setUserRole] = useState<'rider' | 'fleet'>('rider');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showToSPage, setShowToSPage] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [fleetRiders, setFleetRiders] = useState<any[]>([]);

  // 1. Auth & Org Initialization
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const d = snap.data();
          setUserData(d);
          const isAdmin = u.email?.toLowerCase() === 'mattyfliptv@gmail.com';
          setUserRole(isAdmin ? 'fleet' : (d.role || 'rider'));
          
          // Auto-setup test org for admin
          if (isAdmin && !d.orgId) {
            await updateDoc(doc(db, "users", u.uid), { orgId: 'default_fleet' });
            setUserData({ ...d, orgId: 'default_fleet' });
          }
        }
      } else { setUserData(null); setUserRole('rider'); }
    });
  }, []);

  // 2. Fleet Manager: Listen to live updates
  useEffect(() => {
    if (userRole !== 'fleet' || !userData?.orgId) return;
    const q = query(collection(db, `organizations/${userData.orgId}/active_tracking`));
    return onSnapshot(q, (snapshot) => {
      setFleetRiders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [userRole, userData?.orgId]);

  // 3. Professional Rider: Push GPS updates
  useEffect(() => {
    if (userRole !== 'rider' || !isWorking || !user || !userData?.orgId) return;

    const watchId = navigator.geolocation.watchPosition(async (pos) => {
      await setDoc(doc(db, `organizations/${userData.orgId}/active_tracking`, user.uid), {
        name: userData.displayName || 'Pro Rider',
        position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        battery: 100, // Placeholder
        lastSeen: Date.now(),
        status: response ? 'delivering' : 'available'
      }, { merge: true });
    }, null, { enableHighAccuracy: true });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isWorking, user, userData?.orgId, userRole, response]);

  const directionsCallback = (res: any, status: any) => {
    if (status === 'OK' && res) { 
        setResponse(res); 
        setMetrics({ batteryPercentUsed: 75 });
    }
    setIsLoading(false);
  };

  const RiderView = () => (
    <div className="main-layout" style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: '300px', padding: '20px', background: '#1a1a1a', borderRight: '1px solid #333' }}>
        <h2 style={{ color: '#ff6600', fontSize: '1rem', marginBottom: '1.5rem' }}>PROFESSIONAL RIDER</h2>
        
        <div style={{ marginBottom: '2rem', padding: '1rem', background: isWorking ? 'rgba(52,168,83,0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '12px', border: `1px solid ${isWorking ? '#34a853' : '#444'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', color: 'white' }}>WORK MODE</span>
            <button 
              onClick={() => setIsWorking(!isWorking)}
              style={{ background: isWorking ? '#34a853' : '#666', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {isWorking ? 'ON DUTY' : 'OFF DUTY'}
            </button>
          </div>
          <p style={{ fontSize: '0.65rem', color: '#888', marginTop: '0.5rem' }}>
            {isWorking ? 'GPS tracking is active. Fleet managers can see your location.' : 'GPS tracking is disabled.'}
          </p>
        </div>

        <input placeholder="Origin" style={{ width: '100%', marginBottom: '0.5rem' }} onChange={e => setTrip({...trip, origin: e.target.value})} />
        <input placeholder="Dest" style={{ width: '100%', marginBottom: '1rem' }} onChange={e => setTrip({...trip, destination: e.target.value})} />
        <button onClick={() => setIsLoading(true)} style={{ width: '100%', padding: '0.8rem', background: '#ff6600', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold' }}>Find Route</button>
        
        {metrics && (
          <div style={{ marginTop: '2rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>ESTIMATED RANGE</div>
            <h2 style={{ color: 'white' }}>{metrics.batteryPercentUsed}% Left</h2>
          </div>
        )}
      </aside>
      <main style={{ flex: 1 }}>
        <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={{lat: 40.71, lng: -74.00}} zoom={13} onLoad={m => {mapRef.current = m}}>
          {trip.origin && trip.destination && isLoading && <DirectionsService options={{ origin: trip.origin, destination: trip.destination, travelMode: google.maps.TravelMode.BICYCLING }} callback={directionsCallback} />}
          {response && <DirectionsRenderer options={{ directions: response }} />}
        </GoogleMap>
      </main>
    </div>
  );

  const FleetView = () => (
    <div className="main-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '1rem 2rem', background: '#111', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: '#ff6600', margin: 0, fontSize: '1.2rem' }}>FLEET DASHBOARD</h1>
          <div style={{ color: '#888', fontSize: '0.7rem' }}>Live oversight • {fleetRiders.length} active units</div>
        </div>
        <div style={{ display: 'flex', gap: '2rem' }}>
           <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.6rem', color: '#666' }}>ACTIVE</div><div style={{ fontWeight: '900', color: 'white' }}>{fleetRiders.length}</div></div>
           <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.6rem', color: '#666' }}>IDLE</div><div style={{ fontWeight: '900', color: '#ffcc00' }}>0</div></div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        <aside style={{ width: '300px', padding: '1.5rem', background: '#111', borderRight: '1px solid #333', overflowY: 'auto' }}>
          <h2 style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase', marginBottom: '1rem' }}>Rider Status</h2>
          {fleetRiders.length === 0 ? (
            <div style={{ color: '#444', textAlign: 'center', marginTop: '2rem' }}>Waiting for riders to clock in...</div>
          ) : (
            fleetRiders.map(r => (
              <div key={r.id} style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '12px', marginBottom: '0.8rem', border: '1px solid #222' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 'bold', color: 'white' }}>{r.name}</div>
                  <div style={{ fontSize: '0.6rem', padding: '2px 6px', background: r.status === 'delivering' ? '#ff6600' : '#34a853', borderRadius: '4px', color: 'white', textTransform: 'uppercase' }}>{r.status}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: r.battery < 20 ? '#ff3333' : '#34a853' }}>Battery: {r.battery}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#666' }}>{new Date(r.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))
          )}
        </aside>
        <main style={{ flex: 1 }}>
          <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={{lat: 40.71, lng: -74.00}} zoom={12}>
            {fleetRiders.map(r => (
              <Marker 
                key={r.id} 
                position={r.position} 
                label={{ text: `${r.name}`, color: 'white', fontSize: '11px', fontWeight: 'bold' }} 
                icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: r.battery < 20 ? '#ff3333' : '#34a853', fillOpacity: 1, scale: 8, strokeColor: 'white', strokeWeight: 2 }}
              />
            ))}
          </GoogleMap>
        </main>
      </div>
    </div>
  );

  return (
    <div className="container">
      {!isLoaded ? <div>Loading Maps...</div> : (
        <>
          <SEO />
          <NavBar user={user} onShowInstall={() => {}} onShowAuth={() => setShowAuthModal(true)} />
          {userRole === 'fleet' ? <FleetView /> : <RiderView />}
          {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
          {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
          {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}
        </>
      )}
    </div>
  );
}

export default MapHome;
