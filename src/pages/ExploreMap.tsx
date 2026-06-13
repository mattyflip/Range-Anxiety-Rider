import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Polyline } from '@react-google-maps/api';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import NavBar from '../shared/ui/NavBar';
import AuthModal from '../features/auth/AuthModal';
import TermsOfService from '../features/legal/TermsOfService';
import PrivacyPolicy from '../features/legal/PrivacyPolicy';
import InstallTutorial from '../shared/ui/InstallTutorial';
import SEO from '../shared/ui/SEO';
import AdvancedMarker from '../features/map/AdvancedMarker';
import ConfirmationModal from '../shared/ui/ConfirmationModal';

import { useUserData } from '../hooks/useUserData';

const LIBRARIES: ("places" | "geometry" | "marker")[] = ["places", "geometry", "marker"];

const ExploreMap: React.FC = () => {
  const navigate = useNavigate();
  const { user, userData, loading: authLoading } = useUserData();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  
  const [showToS, setShowToS] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Tracking states
  const [isTracking, setIsTracking] = useState(false);
  const [path, setPath] = useState<google.maps.LatLngLiteral[]>([]);
  const [distance, setDistance] = useState(0); // in meters
  const [startTime, setStartTime] = useState<number | null>(null);
  const [lastMovementTime, setLastMovementTime] = useState<number>(Date.now());
  const [currentSpeed, setCurrentSpeed] = useState(0);
  
  // UI Notification state
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'warning' } | null>(null);

  // Confirmation state
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const watchId = useRef<number | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  useEffect(() => {
    if (navigator.geolocation && !isTracking && path.length === 0) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPath([loc]);
      });
    }
  }, [isTracking, path.length]);

  useEffect(() => {
    if (!isTracking) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const idleTime = (now - lastMovementTime) / 1000 / 60;
      if (idleTime >= 15) {
        stopTracking();
        setNotification({ message: "Your ride has been paused due to 15 minutes of inactivity.", type: 'warning' });
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [isTracking, lastMovementTime]);

  const startTracking = () => {
    if (!navigator.geolocation) {
      setNotification({ message: "Geolocation is not supported by your browser.", type: 'warning' });
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
    setConfirmation({
      title: "Restart Ride?",
      message: "This will clear your current path and distance. Are you sure?",
      onConfirm: () => {
        setConfirmation(null);
        stopTracking();
        setPath([]);
        setDistance(0);
        setStartTime(Date.now());
        setLastMovementTime(Date.now());
        setCurrentSpeed(0);
        startTracking();
      }
    });
  };

  const saveRide = async () => {
    if (path.length < 2) { 
      setNotification({ message: "Not enough ride data to save.", type: 'info' });
      return; 
    }
    const rideName = window.prompt("Name your ride:", `Ride on ${new Date().toLocaleDateString()}`);
    if (!rideName) return;
    try {
      if (!user) return;
      await addDoc(collection(db, `users/${user.uid}/recorded_routes`), {
        name: rideName,
        path,
        distanceMiles: (distance / 1609.34).toFixed(2),
        durationMin: startTime ? Math.round((Date.now() - startTime) / 60000) : 0,
        createdAt: serverTimestamp()
      });
      setNotification({ message: "Ride saved successfully!", type: 'info' });
      setTimeout(() => navigate('/profile/me'), 1500);
    } catch (e) { 
      setNotification({ message: "Failed to save ride. Please try again.", type: 'warning' });
    }
  };

  const checkoutExploreTier = async () => {
    if (!user) { setShowAuthModal(true); return; }
    try {
      const token = await user.getIdToken();
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch('/api/create-checkout-session', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
        body: JSON.stringify({ userId: user.uid, email: user.email, tier: 'explore', idempotencyKey }) 
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setNotification({ message: `Checkout failed: ${data.error || 'Please try again.'}`, type: 'warning' });
    } catch (e: any) { setNotification({ message: `Checkout failed: ${e.message || 'Unknown error'}`, type: 'warning' }); }
  };

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    // Force a resize calculation after a short delay to ensure DOM is settled for WebView
    setTimeout(() => {
      if (window.google) {
        google.maps.event.trigger(map, 'resize');
      }
    }, 300);
  }, []);

  // Use ResizeObserver to catch any container size changes (especially on mobile)
  useEffect(() => {
    if (isLoaded && mapRef.current) {
      const map = mapRef.current;
      const container = map.getDiv();
      if (!container) return;

      const observer = new ResizeObserver(() => {
        if (window.google) {
          google.maps.event.trigger(map, 'resize');
        }
      });
      
      observer.observe(container);
      return () => observer.disconnect();
    }
  }, [isLoaded]);

  if (authLoading) return <div style={{ minHeight: '100vh', background: '#121212' }} />;

  const canExplore = userData?.isShopTier || userData?.isExploreTier || (userData?.canHostGroupRide && userData.groupRideExpiresAt && new Date(userData.groupRideExpiresAt.seconds * 1000) > new Date());

  if (!canExplore) {
    return (
      <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
        <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
        <main style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', color: '#ff6600' }}>Explore Mode</h1>
          <div style={{ fontSize: '4rem', margin: '2rem 0' }}>🧭</div>
          <p style={{ fontSize: '1.2rem', color: '#888', maxWidth: '500px', margin: '0 auto 2rem' }}>Experience the full potential of Range Anxiety. Unlock live route recording, terrain analysis, and community sharing.</p>
          <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #ff6600', display: 'inline-block', minWidth: '300px' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.5rem' }}>$3.99<span style={{ fontSize: '1rem', color: '#666' }}>/mo</span></div>
            <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '2rem' }}>Cancel anytime. Supports independent development.</p>
            <button onClick={checkoutExploreTier} style={{ width: '100%', padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem' }}>Get Explore Mode</button>
          </div>
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
            mapContainerStyle={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            center={path.length > 0 ? path[path.length - 1] : { lat: 40.7128, lng: -74.0060 }}
            zoom={15}
            onLoad={onMapLoad}
            options={{ mapId: import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID', disableDefaultUI: true }}
          >
            {path.length > 1 && <Polyline path={path} options={{ strokeColor: '#ff6600', strokeOpacity: 1, strokeWeight: 5 }} />}
            {path.length > 0 && (
              <AdvancedMarker position={path[path.length - 1]}>
                 <img src="/app-icon.png" style={{ width: '32px', height: '32px' }} />
              </AdvancedMarker>
            )}
          </GoogleMap>
        )}

        {notification && (
          <div style={{ position: 'fixed', top: '5.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 250000, background: notification.type === 'warning' ? '#ff4444' : '#34a853', color: 'white', padding: '1rem 2rem', borderRadius: '12px', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.4)', textAlign: 'center', minWidth: '300px' }}>
            {notification.message}
            <button onClick={() => setNotification(null)} style={{ marginLeft: '1rem', background: 'none', border: 'none', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
          </div>
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

        <div style={{
          position: 'absolute',
          bottom: '0.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0,0,0,0.85)',
          color: '#888',
          fontSize: '0.65rem',
          padding: '8px 16px',
          borderRadius: '20px',
          zIndex: 1000,
          whiteSpace: 'nowrap',
          border: '1px solid #333',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(5px)'
        }}>
          <span>⚡ Estimates only. Actual data varies. Never ride beyond your limits.</span>
          <div style={{ display: 'flex', gap: '8px', borderLeft: '1px solid #444', paddingLeft: '12px' }}>
            <span 
              onClick={() => setShowToS(true)} 
              style={{ color: '#ff6600', cursor: 'pointer', textDecoration: 'underline' }}
            >
              TOS
            </span>
            <span 
              onClick={() => setShowPrivacy(true)} 
              style={{ color: '#ff6600', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Privacy
            </span>
          </div>
        </div>
      </div>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      {showToS && <TermsOfService onClose={() => setShowToS(false)} />}
      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
      {confirmation && (
        <ConfirmationModal
          title={confirmation.title}
          message={confirmation.message}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </div>
  );
};

export default ExploreMap;
