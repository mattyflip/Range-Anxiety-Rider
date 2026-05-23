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
  const [fleetBikes, setFleetBikes] = useState<any[]>([]);
  const [orgData, setOrgData] = useState<any>(null);

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
            await updateDoc(doc(db, "users", u.uid), { orgId: 'rental_shop_test' });
            setUserData({ ...d, orgId: 'rental_shop_test' });
          }

          // Fetch Org Data
          if (d.orgId) {
            const oSnap = await getDoc(doc(db, "organizations", d.orgId));
            if (oSnap.exists()) setOrgData(oSnap.data());
          }
        }
      } else { setUserData(null); setUserRole('rider'); setOrgData(null); }
    });
  }, []);

  // 2. Fleet Manager: Listen to live bike updates
  useEffect(() => {
    if (userRole !== 'fleet' || !userData?.orgId) return;
    const q = query(collection(db, `organizations/${userData.orgId}/live_units`));       
    return onSnapshot(q, (snapshot) => {
      setFleetBikes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [userRole, userData?.orgId]);

  // 3. Rental Bike Tracking Simulation (Mock GPS updates from bikes)
  useEffect(() => {
    if (userRole !== 'rider' || !isWorking || !user || !userData?.orgId) return;

    const watchId = navigator.geolocation.watchPosition(async (pos) => {
      await setDoc(doc(db, `organizations/${userData.orgId}/live_units`, user.uid), {    
        unitName: userData.displayName || 'Bike #1',
        position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        battery: 100, 
        lastSeen: Date.now(),
        status: response ? 'rented' : 'available'
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

  const CustomerView = () => (
    <div className="main-layout" style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: '300px', padding: '20px', background: '#1a1a1a', borderRight: '1px solid #333' }}>
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

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Plan Your Route</label>
          <input placeholder="Where to?" style={{ width: '100%', marginTop: '0.5rem', marginBottom: '1rem' }} onChange={e => setTrip({...trip, destination: e.target.value})} />
          <button onClick={() => setIsLoading(true)} style={{ width: '100%', padding: '0.8rem', background: '#333', border: '1px solid #444', borderRadius: '8px', color: 'white', fontWeight: 'bold' }}>Check Range</button>
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
             style={{ width: '100%', padding: '0.8rem', background: 'transparent', border: '1px solid #ff6600', color: '#ff6600', borderRadius: '8px', fontWeight: 'bold' }}
          >
            Return to Shop
          </button>
        </div>
      </aside>
      <main style={{ flex: 1 }}>
        <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={{lat: 40.71, lng: -74.00}} zoom={13} onLoad={m => {mapRef.current = m}}>
          {trip.destination && isLoading && <DirectionsService options={{ origin: 'current location', destination: trip.destination, travelMode: google.maps.TravelMode.BICYCLING }} callback={directionsCallback} />}
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
          <div style={{ color: '#888', fontSize: '0.7rem' }}>Live oversight • {fleetBikes.length} active units</div>
        </div>
        <div style={{ display: 'flex', gap: '2rem' }}>
           <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.6rem', color: '#666' }}>ACTIVE</div><div style={{ fontWeight: '900', color: 'white' }}>{fleetBikes.filter(b => b.status === 'rented').length}</div></div>
           <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.6rem', color: '#666' }}>AVAILABLE</div><div style={{ fontWeight: '900', color: '#34a853' }}>{fleetBikes.filter(b => b.status === 'available').length}</div></div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        <aside style={{ width: '300px', padding: '1.5rem', background: '#111', borderRight: '1px solid #333', overflowY: 'auto' }}>
          <h2 style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase', marginBottom: '1rem' }}>Unit Status</h2>
          {fleetBikes.length === 0 ? (
            <div style={{ color: '#444', textAlign: 'center', marginTop: '2rem' }}>No bikes connected to fleet.</div>
          ) : (
            fleetBikes.map(b => (
              <div key={b.id} style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '12px', marginBottom: '0.8rem', border: '1px solid #222' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 'bold', color: 'white' }}>{b.unitName}</div>
                  <div style={{ fontSize: '0.6rem', padding: '2px 6px', background: b.status === 'rented' ? '#ff6600' : '#34a853', borderRadius: '4px', color: 'white', textTransform: 'uppercase' }}>{b.status}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: b.battery < 20 ? '#ff3333' : '#34a853' }}>Battery: {b.battery}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#666' }}>{new Date(b.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))
          )}
        </aside>
        <main style={{ flex: 1 }}>
          <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={{lat: 40.71, lng: -74.00}} zoom={12}>
            {fleetBikes.map(b => (
              <Marker 
                key={b.id} 
                position={b.position} 
                label={{ text: `${b.unitName}`, color: 'white', fontSize: '11px', fontWeight: 'bold' }} 
                icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: b.battery < 20 ? '#ff3333' : '#34a853', fillOpacity: 1, scale: 8, strokeColor: 'white', strokeWeight: 2 }}
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
          {userRole === 'fleet' ? <FleetView /> : <CustomerView />}
          {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
          {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
          {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}
        </>
      )}
    </div>
  );
}

export default MapHome;
