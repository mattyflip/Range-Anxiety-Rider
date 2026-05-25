import { useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer } from '@react-google-maps/api'
import { auth, db } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, setDoc, collection, onSnapshot, query, addDoc } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import SEO from '../components/SEO'
import ModernAutocomplete from '../components/ModernAutocomplete'
import AdvancedMarker from '../components/AdvancedMarker'

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

function MapHome() {
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", libraries: LIBRARIES });
  const mapRef = useRef<google.maps.Map | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [userRole, setUserRole] = useState<'rider' | 'fleet'>('rider');
  const [loading, setLoading] = useState(true);

  // Common Map State
  const [stops, setStops] = useState<string[]>(['']);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeOptions, setRouteOptions] = useState<any[]>([]);
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLngLiteral | null>(null);
  
  // Manager Specific State
  const [liveUnits, setLiveUnits] = useState<any[]>([]);
  const [newRouteName, setNewRouteName] = useState('');
  
  // Rider Specific State (Telemetry)
  const [telemetry, setTelemetry] = useState({
    speed: 0,
    windMph: 0,
    elevationFt: 0,
    milesRemaining: 0,
    batteryPercent: 100
  });
  const [shopBikes, setShopBikes] = useState<any[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<string>('');
  const [chargers, setChargers] = useState<any[]>([]);
  const [showChargers, setShowChargers] = useState(false);

  const [showAuthModal, setShowAuthModal] = useState(false);

  // Group Ride State
  const [isGroupRideActive, setIsGroupRideActive] = useState(false);
  const [groupRideId, setGroupRideId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [showHostPassModal, setShowHostPassModal] = useState(false);

  const canHost = userRole === 'fleet' || (userData?.canHostGroupRide && new Date(userData.groupRideExpiresAt?.seconds * 1000) > new Date());

  const handleStartGroupRide = async () => {
    if (!user || !userData) return;
    if (!canHost) {
      setShowHostPassModal(true);
      return;
    }

    try {
      const rid = `ride_${user.uid.substring(0, 5)}_${Date.now().toString().substring(8)}`;
      await setDoc(doc(db, "group_rides", rid), {
        hostId: user.uid,
        hostName: userData.username || user.email,
        active: true,
        createdAt: new Date().toISOString()
      });
      setGroupRideId(rid);
      setIsGroupRideActive(true);
      alert(`Group Ride Started! ID: ${rid}. Share this with your friends.`);
    } catch (e) { console.error(e); }
  };

  const handlePurchaseHostPass = async () => {
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user?.getIdToken()}`
        },
        body: JSON.stringify({ userId: user?.uid, email: user?.email, tier: 'group_ride' }),
      });
      const { url } = await response.json();
      if (url) window.location.href = url;
    } catch (e) { console.error(e); }
  };

  // 1. Auth & Data Init
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const userDocRef = doc(db, "users", u.uid);
        onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setUserData(d);
            const role = (u.email?.toLowerCase() === 'mattyfliptv@gmail.com') ? 'fleet' : (d.role || 'rider');
            setUserRole(role);
            
            if (d.orgId) {
              // Manager: Listen to all rented bikes
              if (role === 'fleet') {
                 const qLive = query(collection(db, `organizations/${d.orgId}/live_units`));
                 onSnapshot(qLive, (s) => setLiveUnits(s.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
              }
              
              // Both: Need bike specs for physics
              const qBikes = query(collection(db, `organizations/${d.orgId}/bikes`));
              onSnapshot(qBikes, (s) => {
                 const bikes = s.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                 setShopBikes(bikes);
                 if (bikes.length > 0 && !selectedBikeId) setSelectedBikeId(bikes[0].id);
              });
            }
          }
        });
      }
      setLoading(false);
    });
  }, [selectedBikeId]);

  // Listen to Group Ride Participants
  useEffect(() => {
    if (!groupRideId || !isGroupRideActive) return;
    const q = query(collection(db, `group_rides/${groupRideId}/participants`));
    const unsub = onSnapshot(q, (snap) => {
      setParticipants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [groupRideId, isGroupRideActive]);

  // 2. Rider Telemetry & Tracking
  useEffect(() => {
    if (!user || userRole !== 'rider') return;

    const watchId = navigator.geolocation.watchPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const speed = (pos.coords.speed || 0) * 2.23694; // m/s to mph
      setCurrentLocation({ lat, lng });

      try {
        const [wRes, eRes] = await Promise.all([
          fetch(`/api/weather?lat=${lat}&lng=${lng}`).then(r => r.json()),
          fetch('/api/elevation', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ points: [{ lat, lng }] })
          }).then(r => r.json())
        ]);

        const bike = shopBikes.find(b => b.id === selectedBikeId);
        let remainingMiles = 0;
        if (bike) {
          const { voltage, capacityAh, motorWatts } = bike.specs;
          const battery = bike.specs.currentBatteryPercent || 100;
          const totalWh = voltage * capacityAh * (battery / 100);
          const burnRate = (motorWatts || 750) / 20; 
          remainingMiles = totalWh / burnRate;
        }

        setTelemetry({
          speed,
          windMph: wRes.wind_speed || 0,
          elevationFt: eRes.results?.[0]?.elevation * 3.28084 || 0,
          milesRemaining: remainingMiles,
          batteryPercent: bike?.specs?.currentBatteryPercent || 100
        });

        // Sync to Shop Org if rented
        if (userData?.orgId) {
          await setDoc(doc(db, `organizations/${userData.orgId}/live_units`, user.uid), {
            unitName: userData.username || 'Rider',
            position: { lat, lng },
            battery: bike?.specs?.currentBatteryPercent || 100,
            lastSeen: Date.now(),
            status: 'rented'
          }, { merge: true });
        }

        // Sync to Group Ride if active
        if (isGroupRideActive && groupRideId) {
          await setDoc(doc(db, `group_rides/${groupRideId}/participants`, user.uid), {
            name: userData.username || 'Rider',
            position: { lat, lng },
            lastSeen: Date.now()
          }, { merge: true });
        }

      } catch (e) { console.error("Telemetry sync failed", e); }

    }, null, { enableHighAccuracy: true });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user, userRole, userData, selectedBikeId, shopBikes, isGroupRideActive, groupRideId]);

  const directionsCallback = async (res: any, status: any) => {
    if (status === 'OK' && res) {
      const bike = shopBikes.find(b => b.id === selectedBikeId);
      if (!bike) { setResponse(res); setIsLoading(false); return; }

      try {
        const results = await Promise.all(res.routes.map(async (route: any, index: number) => {
          const totalDistance = route.legs.reduce((acc: number, leg: any) => acc + leg.distance.value, 0);
          const totalDuration = route.legs.reduce((acc: number, leg: any) => acc + leg.duration.value, 0);
          
          const [elevRes, weatherRes] = await Promise.all([
            fetch('/api/elevation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ encodedPath: route.overview_polyline })
            }).then(r => r.json()),
            fetch(`/api/weather?lat=${route.legs[0].start_location.lat()}&lng=${route.legs[0].start_location.lng()}`).then(r => r.json())
          ]);

          const { voltage, capacityAh, motorWatts } = bike.specs;
          const energyWh = (motorWatts || 750) * (totalDuration / 3600);
          const totalWh = voltage * capacityAh;
          
          return {
            index,
            batteryPercentRemaining: Math.max(0, Math.round(100 - (energyWh / totalWh) * 100)),
            distanceMiles: (totalDistance / 1609.34).toFixed(1),
            durationMin: Math.round(totalDuration / 60),
            elevationGain: elevRes.gain?.toFixed(0),
            windInfo: `${weatherRes.wind_speed}mph`
          };
        }));

        const sorted = [...results].sort((a, b) => b.batteryPercentRemaining - a.batteryPercentRemaining);
        setRouteOptions(results);
        setSelectedRouteIndex(sorted[0].index);
        setResponse(res);
      } catch (e) { setResponse(res); }
    }
    setIsLoading(false);
  };

  const handleSaveSuggestedRoute = async () => {
    if (!newRouteName.trim() || stops.filter(s => s).length < 2 || !userData?.orgId) return;
    try {
      await addDoc(collection(db, `organizations/${userData.orgId}/suggested_routes`), {
        name: newRouteName,
        stops: stops.filter(s => s),
        createdAt: new Date().toISOString()
      });
      setNewRouteName('');
      alert("Route saved to shop profile!");
    } catch (e) { console.error(e); }
  };

  const handleFetchChargers = async () => {
    if (showChargers) { setShowChargers(false); return; }
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
    } catch (e) { console.error(e); setIsLoading(false); }
  };

  if (loading) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>Initializing Map Hub...</div>;

  return (
    <div className="container" style={{ height: '100vh', background: '#121212', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SEO title={userRole === 'fleet' ? "Fleet Map" : "Rider Map"} />
      <NavBar user={user} onShowInstall={() => {}} onShowAuth={() => setShowAuthModal(true)} />
      
      <div className="main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: '320px', padding: '20px', background: '#1a1a1a', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          
          <button 
            onClick={handleFetchChargers}
            style={{ width: '100%', padding: '0.8rem', background: showChargers ? '#ff6600' : '#222', border: '1px solid #333', borderRadius: '12px', color: 'white', fontWeight: 'bold', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            {showChargers ? '🔌 HIDE CHARGERS' : '🔌 FIND CHARGERS'}
          </button>

          {userRole === 'fleet' ? (
            /* MANAGER SIDEBAR */
            <>
              <h2 style={{ color: '#ff6600', fontSize: '1rem', textTransform: 'uppercase' }}>Fleet Map</h2>
              <p style={{ fontSize: '0.7rem', color: '#666', marginBottom: '1.5rem' }}>Track live rentals and curate routes.</p>
              
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ color: '#888', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Route Builder</label>
                <input 
                   placeholder="Route Name (e.g. Scenic Loop)" 
                   value={newRouteName}
                   onChange={e => setNewRouteName(e.target.value)}
                   style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', color: 'white', borderRadius: '8px', marginTop: '0.5rem', marginBottom: '0.5rem' }} 
                />
                {stops.map((_s, i) => (
                   <ModernAutocomplete key={i} placeholder={`Stop ${i+1}`} onPlaceSelected={(addr) => { const ns = [...stops]; ns[i] = addr; setStops(ns); }} style={{ marginBottom: '0.5rem' }} />
                ))}
                <button onClick={() => setStops([...stops, ''])} style={{ width: '100%', background: 'none', border: '1px dashed #444', color: '#666', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.7rem' }}>+ ADD STOP</button>
                <button onClick={handleSaveSuggestedRoute} style={{ width: '100%', background: '#ff6600', color: 'white', border: 'none', padding: '0.8rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '1rem' }}>SAVE SUGGESTED ROUTE</button>
              </div>

              <div style={{ borderTop: '1px solid #333', paddingTop: '1.5rem' }}>
                 <label style={{ color: '#888', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Live Unit Feed</label>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.8rem' }}>
                    {liveUnits.map(lu => (
                      <div key={lu.id} style={{ background: '#222', padding: '0.8rem', borderRadius: '12px' }}>
                         <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{lu.unitName}</div>
                         <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                            <span style={{ color: lu.battery < 30 ? '#ff4444' : '#34a853', fontSize: '0.75rem' }}>🔋 {lu.battery}%</span>
                            <span style={{ color: '#555', fontSize: '0.65rem' }}>{new Date(lu.lastSeen).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
            </>
          ) : (
            /* RIDER SIDEBAR */
            <>
              <div style={{ background: 'rgba(255,102,0,0.1)', padding: '1rem', borderRadius: '20px', border: '1px solid #ff6600', marginBottom: '1.5rem' }}>
                 <div style={{ color: '#ff6600', fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase' }}>Rider Telemetry</div>
                 <div style={{ fontSize: '2.5rem', fontWeight: 900 }}>{telemetry.speed.toFixed(0)} <span style={{ fontSize: '1rem', color: '#666' }}>MPH</span></div>
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div>
                       <div style={{ color: '#555', fontSize: '0.55rem', fontWeight: 'bold' }}>REMAINING</div>
                       <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{telemetry.milesRemaining.toFixed(1)} <span style={{ fontSize: '0.6rem' }}>MI</span></div>
                    </div>
                    <div>
                       <div style={{ color: '#555', fontSize: '0.55rem', fontWeight: 'bold' }}>ELEVATION</div>
                       <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{telemetry.elevationFt.toFixed(0)} <span style={{ fontSize: '0.6rem' }}>FT</span></div>
                    </div>
                 </div>
                 <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                       <div style={{ color: '#555', fontSize: '0.55rem', fontWeight: 'bold' }}>WIND</div>
                       <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>💨 {telemetry.windMph} MPH</div>
                    </div>
                    <div style={{ flex: 1 }}>
                       <div style={{ color: '#555', fontSize: '0.55rem', fontWeight: 'bold' }}>BATTERY</div>
                       <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: telemetry.batteryPercent < 30 ? '#ff4444' : '#34a853' }}>🔋 {telemetry.batteryPercent}%</div>
                    </div>
                 </div>
              </div>

              <label style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Your Rental</label>
              <select 
                value={selectedBikeId} 
                onChange={e => setSelectedBikeId(e.target.value)}
                style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', color: 'white', borderRadius: '12px', marginBottom: '1.5rem' }}
              >
                {shopBikes.map(b => <option key={b.id} value={b.id}>{b.unitId}</option>)}
              </select>

              <label style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Trip Planner</label>
              {stops.map((_s, i) => (
                 <ModernAutocomplete key={i} placeholder={i === 0 ? "First Stop" : "Next Stop"} onPlaceSelected={(addr) => { const ns = [...stops]; ns[i] = addr; setStops(ns); }} style={{ marginTop: '0.5rem' }} />
              ))}
              <button onClick={() => setStops([...stops, ''])} style={{ width: '100%', background: 'none', border: '1px dashed #444', color: '#666', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.7rem', marginTop: '0.5rem' }}>+ ADD STOP</button>
              <button onClick={() => setIsLoading(true)} style={{ width: '100%', background: '#333', color: 'white', border: 'none', padding: '0.8rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '1rem' }}>GET OPTIMIZED ROUTE</button>
              
              <div style={{ marginTop: '2rem', borderTop: '1px solid #333', paddingTop: '1.5rem' }}>
                <h3 style={{ color: '#ff6600', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '1rem' }}>Group Ride</h3>
                {isGroupRideActive ? (
                  <div style={{ background: '#222', padding: '1rem', borderRadius: '12px', border: '1px solid #ff6600' }}>
                     <div style={{ fontSize: '0.7rem', color: '#888' }}>ACTIVE RIDE ID</div>
                     <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>{groupRideId}</div>
                     <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {participants.map(p => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                            <span>👤 {p.name}</span>
                            <span style={{ color: '#34a853' }}>LIVE</span>
                          </div>
                        ))}
                     </div>
                     <button onClick={() => setIsGroupRideActive(false)} style={{ width: '100%', background: '#ff4444', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '8px', marginTop: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>END SESSION</button>
                  </div>
                ) : (
                  <button 
                    onClick={handleStartGroupRide}
                    style={{ width: '100%', padding: '1rem', background: 'linear-gradient(45deg, #ff6600, #ff9900)', border: 'none', borderRadius: '12px', color: 'white', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(255,102,0,0.3)' }}
                  >
                    🚀 HOST GROUP RIDE
                  </button>
                )}
                
                {userData?.canHostGroupRide && new Date(userData.groupRideExpiresAt?.seconds * 1000) > new Date() && (
                  <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                     <span style={{ fontSize: '0.6rem', color: '#ff6600', fontWeight: 'bold' }}>
                       HOST PASS ACTIVE: {Math.max(0, Math.floor((new Date(userData.groupRideExpiresAt.seconds * 1000).getTime() - new Date().getTime()) / 3600000))}h REMAINING
                     </span>
                  </div>
                )}
              </div>

              {routeOptions.length > 1 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <label style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase' }}>Alternatives</label>
                  {routeOptions.map((opt, i) => (
                    <button key={i} onClick={() => setSelectedRouteIndex(opt.index)} style={{ width: '100%', padding: '0.5rem', background: selectedRouteIndex === opt.index ? '#ff6600' : '#222', color: 'white', border: 'none', borderRadius: '8px', marginTop: '0.4rem', fontSize: '0.7rem', cursor: 'pointer' }}>
                      Option {i+1} ({opt.batteryPercentRemaining}%)
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>

        <main style={{ flex: 1 }}>
          {isLoaded && (
            <GoogleMap 
              mapContainerStyle={{ width: '100%', height: '100%' }} 
              center={currentLocation || {lat: 40.71, lng: -74.00}} 
              zoom={14}
              onLoad={m => { mapRef.current = m; }}
              options={{ mapId: import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID', disableDefaultUI: true }}
            >
              {userRole === 'fleet' && liveUnits.map(lu => (
                <AdvancedMarker key={lu.id} position={lu.position} title={lu.unitName} label={{ text: `${lu.battery}%`, color: 'white', fontSize: '10px' }} icon={{ fillColor: lu.battery < 30 ? '#ff4444' : '#34a853', scale: 8 }} />
              ))}
              {userRole === 'rider' && currentLocation && (
                <AdvancedMarker position={currentLocation} title="You" icon={{ url: '/app-icon.png', scaledSize: { width: 32, height: 32 } }} />
              )}
              {showChargers && chargers.map(c => (
                <AdvancedMarker key={c.id} position={c.position} icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: c.is110v ? '#34a853' : '#ff6600', fillOpacity: 1, scale: 6, strokeColor: 'white', strokeWeight: 2 }} title={`${c.name} (${c.chargerClass})`} />
              ))}
              {stops[stops.length-1] && isLoading && (
                <DirectionsService options={{ origin: currentLocation || 'current location', destination: stops[stops.length-1], waypoints: stops.slice(0, -1).filter(s => s).map(s => ({ location: s, stopover: true })), travelMode: google.maps.TravelMode.BICYCLING, provideRouteAlternatives: true }} callback={directionsCallback} />
              )}
              {response && <DirectionsRenderer options={{ directions: response, routeIndex: selectedRouteIndex }} />}
            </GoogleMap>
          )}
        </main>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {showHostPassModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '32px', border: '1px solid #ff6600', maxWidth: '450px', width: '100%', textAlign: 'center' }}>
             <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🛰️</div>
             <h2 style={{ color: 'white', margin: 0, fontSize: '1.8rem' }}>Host Group Ride</h2>
             <p style={{ color: '#888', marginTop: '1rem', lineHeight: '1.6' }}>
               Unlock live participant tracking for all riders in your group. See everyone's location and battery status real-time on one map.
             </p>
             
             <div style={{ background: '#111', padding: '1.5rem', borderRadius: '20px', margin: '2rem 0', border: '1px solid #333' }}>
                <div style={{ color: '#ff6600', fontWeight: 900, fontSize: '2rem' }}>$9.99</div>
                <div style={{ color: '#666', fontSize: '0.8rem', fontWeight: 'bold' }}>24-HOUR HOST PASS</div>
             </div>

             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button 
                  onClick={handlePurchaseHostPass}
                  style={{ width: '100%', padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem' }}
                >
                  GET PASS NOW
                </button>
                <button 
                  onClick={() => setShowHostPassModal(false)}
                  style={{ width: '100%', padding: '1rem', background: 'transparent', color: '#666', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  NOT NOW
                </button>
             </div>
             
             <p style={{ fontSize: '0.65rem', color: '#444', marginTop: '1.5rem' }}>
               *Shop Tier accounts include unlimited group ride hosting for $49.99/mo.
             </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapHome;
