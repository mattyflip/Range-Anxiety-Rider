import React, { useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker } from '@react-google-maps/api';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import AuthModal from '../components/AuthModal';
import InstallTutorial from '../components/InstallTutorial';
import SEO from '../components/SEO';

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

    // Fetch initial location for centering
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!isTracking && path.length === 0) {
          // Set a "starting point" for the map center if not tracking yet
          setPath([loc]);
        }
      });
    }

    return () => unsub();
  }, []);

  // Idle detection
  useEffect(() => {
    if (!isTracking) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const idleTime = (now - lastMovementTime) / 1000 / 60; // in minutes

      if (idleTime >= 15) {
        stopTracking();
        alert("Your ride has been paused due to 15 minutes of inactivity.");
      }
    }, 60000); // Check every minute

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
            
            if (d > 5) { // Only add points if moved > 5 meters
              setDistance((prevDist) => prevDist + d);
              setLastMovementTime(Date.now());
              return [...prevPath, newPoint];
            }
            return prevPath;
          }
          return [newPoint];
        });

        if (speed !== null) {
          setCurrentSpeed(speed * 2.23694); // convert m/s to mph
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
    const confirmRestart = window.confirm("Are you sure you want to restart? Current session data will be lost.");
    if (!confirmRestart) return;

    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    
    setPath([]);
    setDistance(0);
    setStartTime(Date.now());
    setLastMovementTime(Date.now());
    setCurrentSpeed(0);
    
    if (isTracking) {
      // Re-start if it was already tracking
      startTracking();
    }
  };

  const saveRide = async () => {
    if (path.length < 2) {
      alert("Not enough data to save ride.");
      return;
    }

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
      alert("Ride saved successfully!");
      navigate('/shop-profile');
    } catch (e) {
      console.error("Save failed", e);
      alert("Failed to save ride.");
    }
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
          <p style={{ fontSize: '1.2rem', color: '#888', maxWidth: '500px', margin: '0 auto 2rem' }}>
            Live tracking and ride recording are exclusive features for Pro users. 
            Conquer your range anxiety and document your adventures.
          </p>
          <button 
            onClick={() => navigate('/shop-profile')}
            style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}
          >
            Upgrade to Pro
          </button>
        </main>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  return (
    <div className="container" style={{ height: '100vh', background: '#121212', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SEO title="Explore Mode | Live Ride Tracking" description="Track your e-bike ride in real-time and save your routes." />
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
      
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
        {!isLoaded ? (
          <div style={{ height: '100%', width: '100%', background: '#121212', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
             Loading Maps...
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={path.length > 0 ? path[path.length - 1] : { lat: 40.7128, lng: -74.0060 }}
            zoom={15}
            onLoad={map => { mapRef.current = map; }}
            options={{
              disableDefaultUI: true,
              styles: [
                { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
                { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
                { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
                { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
                { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
                { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
                { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
                { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] }
              ]
            }}
          >
            {path.length > 1 && (
              <Polyline 
                path={path}
                options={{ strokeColor: '#ff6600', strokeOpacity: 1, strokeWeight: 5 }}
              />
            )}
            {path.length > 0 && <Marker position={path[path.length - 1]} icon={{ url: '/app-icon.png', scaledSize: new google.maps.Size(32, 32) }} />}
          </GoogleMap>
        )}

        {/* HUD Overlay */}
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', right: '1rem', pointerEvents: 'none' }}>
           <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ background: 'rgba(26,26,26,0.9)', padding: '1rem', borderRadius: '16px', border: '1px solid #333', flex: 1 }}>
                 <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Current Speed</div>
                 <div style={{ color: 'white', fontSize: '1.8rem', fontWeight: 900 }}>{currentSpeed.toFixed(1)} <span style={{ fontSize: '0.8rem', color: '#666' }}>MPH</span></div>
              </div>
              <div style={{ background: 'rgba(26,26,26,0.9)', padding: '1rem', borderRadius: '16px', border: '1px solid #333', flex: 1 }}>
                 <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Distance</div>
                 <div style={{ color: 'white', fontSize: '1.8rem', fontWeight: 900 }}>{(distance / 1609.34).toFixed(2)} <span style={{ fontSize: '0.8rem', color: '#666' }}>MI</span></div>
              </div>
           </div>
        </div>

        {/* Controls */}
        <div style={{ position: 'absolute', bottom: '2rem', left: '1rem', right: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
          {(isTracking || path.length > 1) && (
            <button 
              onClick={restartTracking}
              style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid #444', color: 'white', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Restart Trip"
            >
              🔄
            </button>
          )}

          {!isTracking ? (
            <button 
              onClick={startTracking}
              style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#ff6600', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', boxShadow: '0 10px 30px rgba(255,102,0,0.4)' }}
            >
              ▶️
            </button>
          ) : (
            <>
              <button 
                onClick={stopTracking}
                style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#333', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ⏸️
              </button>
              <button 
                onClick={saveRide}
                style={{ height: '70px', padding: '0 2rem', borderRadius: '35px', background: '#34a853', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 10px 30px rgba(52,168,83,0.4)' }}
              >
                SAVE RIDE
              </button>
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
