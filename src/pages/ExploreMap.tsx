import React, { useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Polyline } from '@react-google-maps/api';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import AuthModal from '../components/AuthModal';
import InstallTutorial from '../components/InstallTutorial';
import SEO from '../components/SEO';
import AdvancedMarker from '../components/AdvancedMarker';

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

const ExploreMap: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  // Tracking states
  const [isTracking, setIsTracking] = useState(false);
  const [path, setPath] = useState<google.maps.LatLngLiteral[]>([]);
  const [distance, setDistance] = useState(0); // in meters
  const [startTime, setStartTime] = useState<number | null>(null);
  const [lastMovementTime, setLastMovementTime] = useState<number>(Date.now());
  const [currentSpeed, setCurrentSpeed] = useState(0);
  
  const watchId = useRef<number | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          setUserData(snap.data());
        }
      }
      setLoading(false);
    });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!isTracking && path.length === 0) {
          setPath([loc]);
        }
      });
    }

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isTracking) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const idleTime = (now - lastMovementTime) / 1000 / 60;
      if (idleTime >= 15) {
        stopTracking();
        alert("Your ride has been paused due to 15 minutes of inactivity.");
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [isTracking, lastMovementTime]);

  const startTracking = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsTracking(true);
    setPath([]);
    setDistance(0);
    setStartTime(Date.now());
    setLastMovementTime(Date.now());

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed } = position.coords;
        const newPoint = { lat: latitude, lng: longitude };
        setPath((prevPath) => {
          if (prevPath.length > 0) {
            const lastPoint = prevPath[prevPath.length - 1];
            const d = google.maps.geometry.spherical.computeDistanceBetween(
              new google.maps.LatLng(lastPoint),
              new google.maps.LatLng(newPoint)
            );
            if (d > 5) {
              setDistance((prevDist) => prevDist + d);
              setLastMovementTime(Date.now());
              return [...prevPath, newPoint];
            }
            return prevPath;
          }
          return [newPoint];
        });
        if (speed !== null) {
          setCurrentSpeed(speed * 2.23694);
        }
      },
      (error) => console.error("Tracking error:", error),
      { enableHighAccuracy: true }
    );
  };

  const stopTracking = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
  };

  const restartTracking = () => {
    if (!window.confirm("Are you sure?")) return;
    stopTracking();
    setPath([]);
    setDistance(0);
    setStartTime(Date.now());
    setLastMovementTime(Date.now());
    setCurrentSpeed(0);
    if (isTracking) startTracking();
  };

  const saveRide = async () => {
    if (path.length < 2) { alert("Not enough data."); return; }
    const rideName = window.prompt("Name your ride:", `Ride on ${new Date().toLocaleDateString()}`);
    if (!rideName) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/recorded_routes`), {
        name: rideName,
        path,
        distanceMiles: (distance / 1609.34).toFixed(2),
        durationMin: startTime ? Math.round((Date.now() - startTime) / 60000) : 0,
        createdAt: serverTimestamp()
      });
      alert("Ride saved!");
      navigate('/shop-profile');
    } catch (e) { alert("Failed to save."); }
  };

  if (loading) return <div style={{ minHeight: '100vh', background: '#121212' }} />;

  const isPro = userData?.isPro === true;

  if (!isPro) {
    return (
      <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
        <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
        <main style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', color: '#ff6600' }}>Explore Mode</h1>
          <div style={{ fontSize: '4rem', margin: '2rem 0' }}>🏆</div>
          <p style={{ fontSize: '1.2rem', color: '#888', maxWidth: '500px', margin: '0 auto 2rem' }}>Exclusive Pro Feature.</p>
          <button onClick={() => navigate('/shop-profile')} style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Upgrade</button>
        </main>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  return (
    <div className="container" style={{ height: '100vh', background: '#121212', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SEO title="Explore Mode" />
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
      
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
        {!isLoaded ? (
          <div style={{ height: '100%', width: '100%', background: '#121212', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Loading...</div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={path.length > 0 ? path[path.length - 1] : { lat: 40.7128, lng: -74.0060 }}
            zoom={15}
            onLoad={map => { mapRef.current = map; }}
            options={{ mapId: import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID', disableDefaultUI: true }}
          >
            {path.length > 1 && <Polyline path={path} options={{ strokeColor: '#ff6600', strokeOpacity: 1, strokeWeight: 5 }} />}
            {path.length > 0 && <AdvancedMarker position={path[path.length - 1]} icon={{ url: '/app-icon.png', scaledSize: { width: 32, height: 32 } }} />}
          </GoogleMap>
        )}

        <div style={{ position: 'absolute', top: '1rem', left: '1rem', right: '1rem', pointerEvents: 'none' }}>
           <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ background: 'rgba(26,26,26,0.9)', padding: '1rem', borderRadius: '16px', border: '1px solid #333', flex: 1 }}>
                 <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: 'bold' }}>Current Speed</div>
                 <div style={{ color: 'white', fontSize: '1.8rem', fontWeight: 900 }}>{currentSpeed.toFixed(1)} <span style={{ fontSize: '0.8rem', color: '#666' }}>MPH</span></div>
              </div>
              <div style={{ background: 'rgba(26,26,26,0.9)', padding: '1rem', borderRadius: '16px', border: '1px solid #333', flex: 1 }}>
                 <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: 'bold' }}>Distance</div>
                 <div style={{ color: 'white', fontSize: '1.8rem', fontWeight: 900 }}>{(distance / 1609.34).toFixed(2)} <span style={{ fontSize: '0.8rem', color: '#666' }}>MI</span></div>
              </div>
           </div>
        </div>

        <div style={{ position: 'absolute', bottom: '2rem', left: '1rem', right: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
          {(isTracking || path.length > 1) && <button onClick={restartTracking} style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid #444', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}>🔄</button>}
          {!isTracking ? <button onClick={startTracking} style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#ff6600', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>▶️</button> : (
            <>
              <button onClick={stopTracking} style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#333', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>⏸️</button>
              <button onClick={saveRide} style={{ height: '70px', padding: '0 2rem', borderRadius: '35px', background: '#34a853', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}>SAVE</button>
            </>
          )}
        </div>
      </div>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
    </div>
  );
};

export default ExploreMap;
