import { useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api'
import { useLocation } from 'react-router-dom';
import { auth, db } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, collection, onSnapshot, query, updateDoc } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import SEO from '../components/SEO'

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

const FleetDashboard = () => {
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", libraries: LIBRARIES });
  const mapRef = useRef<google.maps.Map | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [userRole, setUserRole] = useState<'rider' | 'fleet'>('rider');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [fleetBikes, setFleetBikes] = useState<any[]>([]);
  const [chargers, setChargers] = useState<any[]>([]);
  const [showChargers, setShowChargers] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLngLiteral | null>(null);
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
          const isAdmin = u.email?.toLowerCase() === 'mattyfliptv@gmail.com';
          setUserRole(isAdmin ? 'fleet' : (d.role || 'rider'));

          // Auto-setup test org for admin
          if (isAdmin && !d.orgId) {
            await updateDoc(doc(db, "users", u.uid), { orgId: 'rental_shop_test' });
            setUserData({ ...d, orgId: 'rental_shop_test' });
          }
        }
      } else { setUserData(null); setUserRole('rider'); }
    });
  }, []);

  // Fetch Chargers near current location
  const handleFetchChargers = async () => {
    if (showChargers) {
      setShowChargers(false);
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const res = await fetch(`/api/charging?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&distance=15`);
        const data = await res.json();
        setChargers(data);
        setShowChargers(true);
      }, (err) => {
        console.error(err);
        alert("Enable location to find chargers.");
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Fleet Manager: Listen to live bike updates
  useEffect(() => {
    if (userRole !== 'fleet' || !userData?.orgId) return;
    const q = query(collection(db, `organizations/${userData.orgId}/live_units`));       
    return onSnapshot(q, (snapshot) => {
      setFleetBikes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [userRole, userData?.orgId]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, []);

  if (!isLoaded) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Loading Maps...</div>;

  return (
    <div className="container" style={{ height: '100vh', background: '#121212', display: 'flex', flexDirection: 'column' }}>
      <SEO title="Fleet Dashboard" />
      <NavBar user={user} onShowInstall={() => {}} onShowAuth={() => setShowAuthModal(true)} />
      
      <div className="main-layout" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ padding: '1rem 2rem', background: '#111', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ color: '#ff6600', margin: 0, fontSize: '1.2rem' }}>FLEET DASHBOARD</h1>
            <div style={{ color: '#888', fontSize: '0.7rem' }}>Live oversight • {fleetBikes.length} active units</div>
          </div>
          <div style={{ display: 'flex', gap: '2rem' }}>
             <button onClick={handleFetchChargers} style={{ background: showChargers ? '#ff6600' : '#222', color: 'white', border: '1px solid #333', padding: '0.4rem 1rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>🔌 {showChargers ? 'HIDE CHARGERS' : 'SHOW CHARGERS'}</button>
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
            <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={currentLocation || {lat: 40.71, lng: -74.00}} zoom={12} onLoad={m => {mapRef.current = m}}>
              {fleetBikes.map(b => (
                <Marker 
                  key={b.id} 
                  position={b.position} 
                  label={{ text: `${b.unitName}`, color: 'white', fontSize: '11px', fontWeight: 'bold' }} 
                  icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: b.battery < 20 ? '#ff3333' : '#34a853', fillOpacity: 1, scale: 8, strokeColor: 'white', strokeWeight: 2 }}
                />
              ))}
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
      </div>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default FleetDashboard;
