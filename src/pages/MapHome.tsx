import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, InfoWindowF, Autocomplete } from '@react-google-maps/api'
import { toPng } from 'html-to-image'
import { decode } from '@googlemaps/polyline-codec'
import { auth, db, storage } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, collection, addDoc, serverTimestamp, updateDoc, query, onSnapshot, setDoc, arrayUnion, type DocumentSnapshot } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import TermsOfService from '../features/legal/TermsOfService'
import PrivacyPolicy from '../features/legal/PrivacyPolicy'
import InstallTutorial from '../shared/ui/InstallTutorial'
import NavBar from '../shared/ui/NavBar'
import AuthModal from '../features/auth/AuthModal'
import WelcomeModal from '../shared/ui/WelcomeModal'
import RouteReplay3D from '../features/map/RouteReplay3D'
import AdvancedMarker from '../features/map/AdvancedMarker'
import orangePin from '../assets/orange-pin.png'
import { createNotification } from '../utils/notifications'
import { STATE_COORDINATES } from '../utils/ebikeLaws'
import SEO from '../shared/ui/SEO'

const LIBRARIES: ("places" | "geometry" | "marker")[] = ["places", "geometry", "marker"];

interface GroupRide {
  id: string;
  name: string;
  isPublic: boolean;
  pin: string;
  creatorId: string;
  origin: string;
  startLat: number;
  startLng: number;
  status: string;
  leaderId?: string;
  leaderTrail?: google.maps.LatLngLiteral[];
}

interface BikeSpecs {
  voltage: number | '';
  capacityAh: number | '';
  motorWatts: number | '';
  bikeWeightLbs: number | '';
  tirePSI?: number | '';
  tireType?: 'slick' | 'knobby' | 'all-terrain';
  driveMode?: 'throttle_only' | 'pas_only' | 'both';
  currentBatteryPercent?: number;
}

interface TripDetails {
  origin: string;
  destination: string;
  waypoints: string[];
}

interface RouteMetrics {
  distanceMiles: number;
  durationMin: number;
  elevationGainFeet: number;
  elevationLossFeet: number;
  estimatedWh: number;
  batteryPercentRemaining: number;
  recommendedSpeedMph: number;
  efficiencyWhMi: number;
  label?: string; // e.g. "Most Efficient"
  deathPoint?: google.maps.LatLngLiteral;
  endingVoltage?: number;
  windConditions?: {
    speed: number;
    direction: number;
    headwindComponent: number;
  };
}

interface SavedBike {
  id?: string;
  name: string;
  specs: BikeSpecs;
}

const STANDARD_BIKES: SavedBike[] = [
  { name: "Surron Light Bee X (2025)", specs: { voltage: 60, capacityAh: 40, motorWatts: 8000, bikeWeightLbs: 125 } },
  { name: "Talaria Sting MX5 Pro", specs: { voltage: 72, capacityAh: 40, motorWatts: 13400, bikeWeightLbs: 167 } },
  { name: "Onyx RCR", specs: { voltage: 72, capacityAh: 41, motorWatts: 5000, bikeWeightLbs: 145 } },
  { name: "Stark Varg Alpha", specs: { voltage: 360, capacityAh: 18, motorWatts: 60000, bikeWeightLbs: 260 } },
  { name: "Specialized Turbo Levo", specs: { voltage: 36, capacityAh: 19.4, motorWatts: 565, bikeWeightLbs: 50 } },
  { name: "Trek Fuel EXe", specs: { voltage: 50, capacityAh: 7.2, motorWatts: 250, bikeWeightLbs: 41 } },
  { name: "Segway Ninebot Max G2", specs: { voltage: 36, capacityAh: 15.3, motorWatts: 450, bikeWeightLbs: 53 } },
  { name: "Dualtron Thunder 3", specs: { voltage: 72, capacityAh: 40, motorWatts: 2500, bikeWeightLbs: 126 } },
  { name: "Nami Burn-E 2 Max", specs: { voltage: 72, capacityAh: 40, motorWatts: 1500, bikeWeightLbs: 103 } },
  { name: "Inmotion RS", specs: { voltage: 72, capacityAh: 40, motorWatts: 2000, bikeWeightLbs: 128 } }
];

interface POI {
  id: string;
  name: string;
  address: string;
  position: google.maps.LatLngLiteral;
  type: string;
}

const center = { lat: 40.7128, lng: -74.0060 };

function MapHome() {
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", libraries: LIBRARIES });
  const mapRef = useRef<google.maps.Map | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const metricsCardRef = useRef<HTMLDivElement>(null);

  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [specs, setSpecs] = useState<BikeSpecs>({ voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 65 });
  
  const [trip, setTrip] = useState<TripDetails>({ origin: '', destination: '', waypoints: [] });
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  
  const [batteryInputMode, setBatteryInputMode] = useState<'percent' | 'voltage'>('percent'); 
  const [startBattery, setStartBattery] = useState<number | ''>(100);
  const [startVoltage, setStartVoltage] = useState<number | ''>(54.6);
  
  const [riderWeight, setRiderWeight] = useState<number | ''>(180);
  const [driveMode, setDriveMode] = useState<'throttle' | 'pas'>('throttle');
  const [pedalAssistLevel, setPedalAssistLevel] = useState<number>(3);
  const [throttleMode, setThrottleMode] = useState<'eco' | 'normal' | 'sport'>('normal');
  
  const [response, setResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [selectedRouteIndex] = useState(0);
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [, setIsLoading] = useState(false);
  const [pois, setPois] = useState<POI[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  
  const [showSharePreview, setShowSharePreview] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [userRole, setUserRole] = useState<'rider' | 'fleet'>('rider');
  const [isPro, setIsPro] = useState(false);
  const [isExploreTier, setIsExploreTier] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGroupRidePaywall, setShowGroupRidePaywall] = useState(false);
  const [bikeSearchQuery, setBikeSearchQuery] = useState("");
  const [showBikeResults, setShowBikeResults] = useState(false);
  const [savedBikes, setSavedBikes] = useState<SavedBike[]>([]);
  const [newBikeName, setNewBikeName] = useState('');
  const [showToSPage, setShowToSPage] = useState(false);
  const [showPrivacyPage, setShowPrivacyPage] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [mapSnapshot, setMapSnapshot] = useState<string | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(true);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRouteReplay, setShowRouteReplay] = useState(false);

  // --- FLEET / B2B SPECIFIC STATE ---
  const [liveUnits, setLiveUnits] = useState<any[]>([]);
  const [shopBikes, setShopBikes] = useState<any[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<string>('');
  const [shopLocation, setShopLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [orgOwnerId, setOrgOwnerId] = useState<string | null>(null);
  const lastAlertTime = useRef<{ [key: string]: number }>({});
  // ----------------------------------

  // Reorderable locations state
  const [locations, setLocations] = useState<string[]>(['', '', '', '', '']);
  const autocompleteRefs = useRef<(google.maps.places.Autocomplete | null)[]>([]);

  const onAutocompleteLoad = (index: number, autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRefs.current[index] = autocomplete;
  };

  const onPlaceChanged = (index: number) => {
    const autocomplete = autocompleteRefs.current[index];
    if (autocomplete) {
      const place = autocomplete.getPlace();
      const addr = place.formatted_address || place.name;
      if (addr) updateLocation(index, addr);
    }
  };

  const syncLocationsToStates = (locs: string[]) => {
    const filtered = locs.filter(l => l.trim() !== '');
    if (filtered.length === 0) {
      setTrip({ origin: '', destination: '', waypoints: [] });
      return;
    }
    
    if (filtered.length === 1) {
      setTrip(p => ({ ...p, origin: filtered[0], destination: '', waypoints: [] }));
      return;
    }

    const origin = filtered[0];
    const destination = filtered[filtered.length - 1];
    const waypoints = filtered.slice(1, filtered.length - 1);

    setTrip({ origin, destination, waypoints });
  };

  const updateLocation = (index: number, value: string) => {
    const newLocs = [...locations];
    newLocs[index] = value;
    setLocations(newLocs);
    syncLocationsToStates(newLocs);
    markDirty();
  };

  // Group Ride State
  const [activeRide, setActiveRide] = useState<GroupRide | null>(null);

  // Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distToNextStep, setNextStepDist] = useState<string | null>(null);
  const [hasAnnouncedNextStep, setHasAnnouncedNextStep] = useState(false);

  // 1. Auth & Data Initialization
  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubLive: (() => void) | null = null;
    let unsubBikes: (() => void) | null = null;
    let unsubOrg: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setAuthInitialized(true);
      if (u) {
        setUser(u);
        if (unsubUser) unsubUser();
        if (unsubLive) unsubLive();
        if (unsubBikes) unsubBikes();
        if (unsubOrg) unsubOrg();

        const userDocRef = doc(db, "users", u.uid);
        unsubUser = onSnapshot(userDocRef, (snap: DocumentSnapshot) => {
          if (snap.exists()) {
            const d = snap.data();
            setUserData(d);
            setIsPro(d.isPro || false);
            setIsExploreTier(d.isExploreTier || false);
            if (d.bikes) setSavedBikes(d.bikes);

            const isAdmin = u.email?.toLowerCase() === 'mattyfliptv@gmail.com';
            const role = d.role || (isAdmin ? 'fleet' : 'rider');
            setUserRole(role);
            
            if (d.orgId) {
              unsubOrg = onSnapshot(doc(db, "organizations", d.orgId), (oSnap) => {
                if (oSnap.exists()) {
                  const oData = oSnap.data();
                  setOrgOwnerId(oData.ownerId);
                  if (oData.location?.lat && oData.location?.lng) {
                    setShopLocation({ lat: oData.location.lat, lng: oData.location.lng });
                  }
                }
              });

              unsubBikes = onSnapshot(query(collection(db, `organizations/${d.orgId}/bikes`)), (s) => {
                 const bikes = s.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
                 setShopBikes(bikes);
                 if (role === 'rider') {
                   const assigned = bikes.find(b => b.currentRiderId === u.uid && b.status === 'rented');
                   if (assigned) {
                     setSelectedBikeId(assigned.id);
                     if (assigned.specs && !settingsDirty) {
                       setSpecs({
                         voltage: assigned.specs.voltage || 48,
                         capacityAh: assigned.specs.capacityAh || 15,
                         motorWatts: assigned.specs.motorWatts || 750,
                         bikeWeightLbs: assigned.specs.bikeWeightLbs || 65,
                         tirePSI: assigned.specs.tirePSI || 30,
                         tireType: assigned.specs.tireType || 'all-terrain'
                       });
                       setStartBattery(assigned.specs.currentBatteryPercent || 100);
                     }
                   } else {
                     setSelectedBikeId('');
                   }
                 } else if (bikes.length > 0 && !selectedBikeId) {
                   setSelectedBikeId(bikes[0].id);
                 }
              });

              if (role === 'fleet') {
                unsubLive = onSnapshot(query(collection(db, `organizations/${d.orgId}/live_units`)), (s) => {
                  setLiveUnits(s.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                });
              }
            }
          }
          setLoading(false);
        });

        const savedRideId = localStorage.getItem('active_ride_id');
        if (savedRideId && !activeRide) {
          const rideSnap = await getDoc(doc(db, "group_rides", savedRideId));
          if (rideSnap.exists() && rideSnap.data().status === 'active') {
            setActiveRide({ id: rideSnap.id, ...rideSnap.data() } as any);
          } else {
            localStorage.removeItem('active_ride_id');
          }
        }
      } else {
        setUserData(null); setIsPro(false); setIsExploreTier(false);
        localStorage.removeItem('active_ride_id');
        const local = localStorage.getItem('ebike-saved-bikes');
        if (local) {
          try {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed)) setSavedBikes(parsed);
          } catch { }
        }
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
      if (unsubLive) unsubLive();
      if (unsubBikes) unsubBikes();
      if (unsubOrg) unsubOrg();
    };
  }, []);

  useEffect(() => {
    if (userRole === 'fleet' && mapRef.current && (shopLocation || liveUnits.length > 0)) {
      const bounds = new google.maps.LatLngBounds();
      let hasPoints = false;
      if (shopLocation) { bounds.extend(shopLocation); hasPoints = true; }
      liveUnits.forEach(unit => {
        if (unit.position?.lat && unit.position?.lng) {
          bounds.extend(unit.position);
          hasPoints = true;
        }
      });
      if (hasPoints) {
        mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 350 });
      }
    }
  }, [userRole, shopLocation, liveUnits.length]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    const savedRoute = localStorage.getItem('ebike_load_route');
    if (savedRoute) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        if (mapRef.current && userRole !== 'fleet') {
          mapRef.current.panTo(loc);
          mapRef.current.setZoom(13);
        }
      }, (err) => {
        console.warn("Initial auto-centering failed:", err.message);
      }, { enableHighAccuracy: false, timeout: 5000 });
    }
  }, [isLoaded, userRole]);

  useEffect(() => {
    if (!isLoaded) return;
    const loadRoute = () => {
      const raw = localStorage.getItem('ebike_load_route');
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        if (data.isRecorded && Array.isArray(data.path)) {
           setTrip({ origin: 'Recorded Ride Start', destination: 'Recorded Ride End', waypoints: [] });
           setLocations(['Recorded Ride Start', 'Recorded Ride End', '', '', '']);
           setPois([]);
           localStorage.removeItem('ebike_load_route');
           if (mapRef.current && data.path.length > 0) {
              mapRef.current.panTo(data.path[0]);
              mapRef.current.setZoom(14);
           }
        } else if (data && typeof data.origin === 'string' && data.origin.trim()) {
          setTrip({ origin: data.origin, destination: data.destination, waypoints: data.waypoints });
          const wps = data.waypoints?.filter((w: any) => typeof w === 'string') || [];
          setLocations([data.origin, data.destination, wps[0] || '', wps[1] || '', wps[2] || '']);
          if (typeof data.isRoundTrip === 'boolean') setIsRoundTrip(data.isRoundTrip);
          setIsLoading(true);
          setResponse(null);
          setMetrics(null);
          setPois([]);
          localStorage.removeItem('ebike_load_route');
        }
      } catch { }
    };
    loadRoute();
    const handleEvent = () => loadRoute();
    window.addEventListener('ebike-route-loaded', handleEvent);
    return () => window.removeEventListener('ebike-route-loaded', handleEvent);
  }, [isLoaded]);

  useEffect(() => {
    if (authInitialized && !user && !localStorage.getItem('ebike_portal_visited')) {
        setTimeout(() => setShowWelcomeModal(true), 0);
    }
  }, [authInitialized, user]);

  useEffect(() => {
    if (userData?.homeRegion && mapRef.current) {
      const coords = STATE_COORDINATES[userData.homeRegion];
      if (coords) { mapRef.current.panTo(coords); mapRef.current.setZoom(8); }
    }
  }, [userData?.homeRegion]);

  useEffect(() => {
    if (!response || !response.routes[selectedRouteIndex]) return;
    const polyline = response.routes[selectedRouteIndex].overview_polyline;
    const points = (polyline as any).points || polyline;
    fetch(`/api/static-map?polyline=${encodeURIComponent(points)}`).then(r => r.blob()).then(blob => {
      const reader = new FileReader(); reader.onloadend = () => setMapSnapshot(reader.result as string); reader.readAsDataURL(blob);
    }).catch(console.error);
  }, [response, selectedRouteIndex]);

  useEffect(() => {
    if (!user) return;
    const watchId = navigator.geolocation.watchPosition(async (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(loc);
      const speed = (pos.coords.speed || 0) * 2.23694;
      if (userData?.orgId && selectedBikeId) {
        try {
          const bike = shopBikes.find(b => b.id === selectedBikeId);
          if (bike && bike.status === 'rented' && bike.currentRiderId === user.uid) {
             const [eRes, wRes] = await Promise.all([
               fetch('/api/elevation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `${loc.lat},${loc.lng}` }) }).then(r => r.json()),
               fetch(`/api/weather?lat=${loc.lat}&lng=${loc.lng}`).then(r => r.json())
             ]);
             const calcRes = await fetch('/api/calculate-range', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'telemetry',
                  specs: bike.specs,
                  batteryPercent: bike.specs.currentBatteryPercent || 100,
                  speedMph: speed,
                  riderWeightLbs: riderWeight,
                  headingDeg: pos.coords.heading || 0,
                  windMph: wRes.wind_speed || 0,
                  windDirDeg: wRes.wind_degree || 0,
                  driveMode,
                  pedalAssistLevel,
                  throttleMode
                })
             }).then(r => r.json());
             await setDoc(doc(db, `organizations/${userData.orgId}/live_units`, user.uid), {
                unitName: bike.unitId, riderName: userData.username || 'Rider', bikeId: bike.id, position: loc,
                battery: bike.specs?.currentBatteryPercent || 100, milesRemaining: calcRes.remainingMiles || 0,
                speed: speed, elevationFt: eRes.results?.[0]?.elevation * 3.28084 || 0, windMph: wRes.wind_speed || 0,
                lastSeen: Date.now(), status: 'rented'
             }, { merge: true });
             if (orgOwnerId) {
               const now = Date.now();
               if (speed > 28 && (!lastAlertTime.current['speed'] || now - lastAlertTime.current['speed'] > 300000)) {
                  createNotification(orgOwnerId, user.uid, userData.username || "Rider", 'fleet_alert', user.uid, `🚨 SPEED ALERT: ${bike.unitId} at ${speed.toFixed(0)} MPH! Rider: ${userData.username || user.email} (${user.email})`);
                  lastAlertTime.current['speed'] = now;
               }
               const bat = bike.specs?.currentBatteryPercent || 100;
               if (bat < 15 && (!lastAlertTime.current['battery'] || now - lastAlertTime.current['battery'] > 1800000)) {
                  createNotification(orgOwnerId, user.uid, userData.username || "Rider", 'fleet_alert', user.uid, `🪫 LOW BATTERY: ${bike.unitId} is at ${bat}%! Rider: ${userData.username || user.email} (${user.email})`);
                  lastAlertTime.current['battery'] = now;
               }
             }
          }
        } catch (e) { }
      }
      if (activeRide) {
        await setDoc(doc(db, `group_rides/${activeRide.id}/participants`, user.uid), {
          userId: user.uid, name: userData?.username || 'Rider', lat: loc.lat, lng: loc.lng, lastUpdatedAt: Date.now()
        }, { merge: true });
        if (activeRide.leaderId === user.uid) {
          await updateDoc(doc(db, "group_rides", activeRide.id), { leaderTrail: arrayUnion(loc) });
        }
      }
    }, null, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [user, userData, selectedBikeId, shopBikes, activeRide, orgOwnerId]);

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const startNavigation = () => {
    if (!response) return;
    setIsNavigating(true); setCurrentLegIndex(0); setCurrentStepIndex(0); setHasAnnouncedNextStep(false); setShowMobileMenu(false);
    const firstStep = response.routes[selectedRouteIndex].legs[0].steps[0];
    speak(`Starting trip. ${firstStep.instructions.replace(/<[^>]*>?/gm, '')}`);
    if (mapRef.current) { mapRef.current.setZoom(18); mapRef.current.setTilt(45); }
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    if (mapRef.current) { mapRef.current.setTilt(0); }
  };

  useEffect(() => {
    if (!isNavigating || !response) return;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const uLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const route = response.routes[selectedRouteIndex];
      const leg = route.legs[currentLegIndex];
      const step = leg.steps[currentStepIndex];
      if (mapRef.current) { mapRef.current.panTo(uLoc); }
      const endLoc = { lat: step.end_location.lat(), lng: step.end_location.lng() };
      const distMeters = google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(uLoc.lat, uLoc.lng), new google.maps.LatLng(endLoc.lat, endLoc.lng));
      const distFeet = distMeters * 3.28084;
      setNextStepDist(distFeet > 528 ? `${(distFeet/5280).toFixed(1)} mi` : `${Math.round(distFeet)} ft`);
      if (distFeet < 300 && !hasAnnouncedNextStep) {
        speak(`In 300 feet, ${step.instructions.replace(/<[^>]*>?/gm, '')}`);
        setHasAnnouncedNextStep(true);
      }
      if (distFeet < 60) {
        if (currentStepIndex < leg.steps.length - 1) {
          setCurrentStepIndex(currentStepIndex + 1); setHasAnnouncedNextStep(false);
          speak(leg.steps[currentStepIndex+1].instructions.replace(/<[^>]*>?/gm, ''));
        } else if (currentLegIndex < route.legs.length - 1) {
          setCurrentLegIndex(currentLegIndex + 1); setCurrentStepIndex(0); setHasAnnouncedNextStep(false);
        } else {
          speak("You have arrived at your destination."); stopNavigation();
        }
      }
    }, null, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isNavigating, response, currentLegIndex, currentStepIndex, hasAnnouncedNextStep, selectedRouteIndex]);

  const markDirty = () => { if (!settingsDirty) setSettingsDirty(true); };
  
  const getBatteryLevels = (v: number) => {
    if (v >= 72) return { min: 60, max: 84 };
    if (v >= 60) return { min: 50, max: 70 };
    if (v >= 52) return { min: 42, max: 58.8 };
    if (v >= 48) return { min: 39, max: 54.6 };
    if (v >= 36) return { min: 30, max: 42 };
    return { min: v * 0.8, max: v * 1.15 };
  };

  const handleToggleBatteryMode = (newMode: 'percent' | 'voltage') => {
    if (newMode === batteryInputMode) return;
    const { min, max } = getBatteryLevels(Number(specs.voltage));
    if (newMode === 'voltage') setStartVoltage(Number((min + (Number(startBattery)/100)*(max-min)).toFixed(1)));
    else setStartBattery(Math.min(100, Math.max(0, Number((((Number(startVoltage)-min)/(max-min))*100).toFixed(0)))));
    setBatteryInputMode(newMode);
  };

  const loadBike = (bike: SavedBike) => {
    setSpecs(bike.specs); setBikeSearchQuery(bike.name); setShowBikeResults(false);
    if (bike.specs.voltage) setStartVoltage(getBatteryLevels(Number(bike.specs.voltage)).max);
    markDirty();
  };

  const handleCalculate = async () => { 
    let currentOrigin = trip.origin;
    let currentDest = trip.destination;
    const nonAt = locations.filter(l => l.trim() !== '');
    if (nonAt.length === 0) { alert("Please enter a destination."); return; }
    if (nonAt.length === 1 && userLocation) {
       const origin = `${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}`;
       const destination = nonAt[0];
       const newLocs = [origin, destination, '', '', ''];
       setLocations(newLocs);
       setTrip({ origin, destination, waypoints: [] });
       currentOrigin = origin; currentDest = destination;
    } else if (!locations[0].trim() && userLocation) {
       const origin = `${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}`;
       const newLocs = [...locations];
       newLocs[0] = origin;
       setLocations(newLocs);
       syncLocationsToStates(newLocs);
       currentOrigin = origin;
    }
    if (!currentOrigin || !currentDest) {
       if (!userLocation) alert("Please enter both start and end points, or enable location services.");
       return;
    }
    setIsLoading(true); setResponse(null); setMetrics(null); setPois([]); setSettingsDirty(false); 
    setShowMobileMenu(false); // Automated switch to map view for mobile users

    try {
      // Modern Google Routes API with Multi-Route support
      const body: any = {
        origin: { address: currentOrigin },
        travelMode: 'BICYCLE',
        units: unitSystem === 'imperial' ? 'IMPERIAL' : 'METRIC',
        computeAlternativeRoutes: !isRoundTrip // Alternatives usually limited with many waypoints
      };

      if (isRoundTrip) {
        // In Round Trip mode, we return to the start. 
        // Every other non-empty stop (including the final destination) becomes an intermediate point.
        body.destination = { address: currentOrigin };
        const stops = locations.slice(1).filter(l => l.trim() !== '');
        body.intermediates = stops.map(s => ({ address: s }));
      } else {
        // Standard One Way route
        body.destination = { address: currentDest };
        body.intermediates = trip.waypoints.map(wp => ({ address: wp }));
      }

      const routesRes = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs'
        },
        body: JSON.stringify(body)
      });

      if (!routesRes.ok) {
        const errorData = await routesRes.json();
        console.error('Google Routes API Full Error:', JSON.stringify(errorData, null, 2));
        throw new Error(`Routes API Error: ${errorData.error?.message || errorData.message || routesRes.statusText}`);
      }

      const routesData = await routesRes.json();
      if (!routesData.routes || routesData.routes.length === 0) {
        throw new Error("No routes found for these locations.");
      }

      // Process ALL returned routes through the physics engine to find the most efficient one
      const analyzedRoutes = await Promise.all(routesData.routes.map(async (route: any) => {
        const encodedPolyline = route.polyline.encodedPolyline;
        const totalDistanceMeters = route.distanceMeters || 0;
        const totalDurationSeconds = parseInt(route.duration) || 0;
        const distanceMiles = totalDistanceMeters * 0.000621371;
        
        // E-Bike speed adjustment: Surrons/Talarias ride much faster than standard bikes.
        // Google's bicycle duration is very slow (~10-12mph). 
        // We apply a multiplier (1.5x - 2x) for high-power bikes to get a realistic Wh/mi.
        const speedMultiplier = (Number(specs.motorWatts) || 0) > 1000 ? 1.8 : 1.2;
        const realisticDurationSeconds = totalDurationSeconds / speedMultiplier;
        const speedMph = distanceMiles / (realisticDurationSeconds / 3600);

        const [eRes, wRes] = await Promise.all([
          fetch('/api/elevation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: encodedPolyline }) }).then(r => r.json()),
          fetch(`/api/weather?lat=${route.legs[0].startLocation.latLng.latitude}&lng=${route.legs[0].startLocation.latLng.longitude}`).then(r => r.json())
        ]);

        const elevationGainFt = eRes.gain || 0;
        const windSpeed = wRes.wind_speed || 0;

        let heading = 0;
        if (window.google?.maps?.geometry?.spherical) {
          const start = new google.maps.LatLng(route.legs[0].startLocation.latLng.latitude, route.legs[0].startLocation.latLng.longitude);
          const end = new google.maps.LatLng(route.legs[0].endLocation.latLng.latitude, route.legs[0].endLocation.latLng.longitude);
          heading = google.maps.geometry.spherical.computeHeading(start, end);
        }

        const calcRes = await fetch('/api/calculate-range', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'route',
            specs, riderWeightLbs: riderWeight, throttleMode, batteryPercent: startBattery,
            durationSeconds: realisticDurationSeconds, speedMph: speedMph, elevationChangeFt: elevationGainFt,
            windMph: windSpeed, windDirDeg: wRes.wind_degree || 0, headingDeg: heading, driveMode, pedalAssistLevel
          })
        }).then(r => r.json());

        return {
          originalRoute: route,
          metrics: {
            distanceMiles,
            durationMin: realisticDurationSeconds / 60,
            elevationGainFeet: elevationGainFt,
            elevationLossFeet: eRes.loss || 0,
            estimatedWh: calcRes.energyWh || 0,
            efficiencyWhMi: calcRes.efficiencyWhMi || 0,
            batteryPercentRemaining: calcRes.batteryPercentRemaining || 0,
            endingVoltage: calcRes.endingVoltage,
            recommendedSpeedMph: speedMph,
            windConditions: { speed: windSpeed, direction: wRes.wind_degree || 0, headwindComponent: 0 }
          }
        };
      }));

      // Sort routes: 1. Most Battery Left, 2. Shortest Distance
      analyzedRoutes.sort((a, b) => {
        if (b.metrics.batteryPercentRemaining !== a.metrics.batteryPercentRemaining) {
          return b.metrics.batteryPercentRemaining - a.metrics.batteryPercentRemaining;
        }
        return a.metrics.distanceMiles - b.metrics.distanceMiles;
      });

      // Label the top routes
      analyzedRoutes[0].metrics.label = "Most Efficient";
      if (analyzedRoutes.length > 1) analyzedRoutes[1].metrics.label = "Alternative 1";
      if (analyzedRoutes.length > 2) analyzedRoutes[2].metrics.label = "Alternative 2";

      const topRoute = analyzedRoutes[0];
      const encodedPolyline = topRoute.originalRoute.polyline.encodedPolyline;
      const decodedPath = decode(encodedPolyline).map(([lat, lng]) => ({ lat, lng }));
      
      const mockResult: any = {
        request: { travelMode: 'BICYCLING' },
        routes: [{
          overview_path: decodedPath.map(p => new google.maps.LatLng(p.lat, p.lng)),
          overview_polyline: { points: encodedPolyline },
          legs: topRoute.originalRoute.legs.map((leg: any) => ({
            distance: { value: leg.distanceMeters, text: `${(leg.distanceMeters * 0.000621371).toFixed(1)} mi` },
            duration: { value: parseInt(leg.duration), text: leg.duration },
            start_location: new google.maps.LatLng(leg.startLocation.latLng.latitude, leg.startLocation.latLng.longitude),
            end_location: new google.maps.LatLng(leg.endLocation.latLng.latitude, leg.endLocation.latLng.longitude),
            steps: [] 
          }))
        }]
      };

      setResponse(mockResult);
      setMetrics(topRoute.metrics);

    } catch (e: any) {
      console.error("Route calculation failed:", e);
      alert("Could not calculate route. Please try different locations.");
    } finally {
      setIsLoading(false);
    }
  };

  const checkoutExploreTier = async () => {
    if (!user) { setShowAuthModal(true); return; }
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/create-checkout-session', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
        body: JSON.stringify({ userId: user.uid, email: user.email, tier: 'explore' }) 
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(`Checkout failed: ${data.error || 'Please try again.'}`);
    } catch (e: any) { alert(`Checkout failed: ${e.message || 'Unknown error'}`); }
  };

  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);

  const locateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        if (mapRef.current) {
          mapRef.current.panTo(loc);
          mapRef.current.setZoom(15);
        }
      }, (err) => {
        alert("Location error: " + err.message);
      }, { enableHighAccuracy: true });
    }
  };

  const searchPOIs = async (category: string) => {
    if (!isLoaded || !mapRef.current) return;
    if (category === 'charging' && !isPro) { alert("PRO required."); return; }
    const service = new google.maps.places.PlacesService(mapRef.current!);
    service.textSearch({ location: mapRef.current!.getCenter()!, radius: 5000, query: category }, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        setPois(results.map(p => ({ id: p.place_id!, name: p.name!, address: p.formatted_address!, position: { lat: p.geometry!.location!.lat(), lng: p.geometry!.location!.lng() }, type: category })));
      }
    });
  };

  const saveCurrentBike = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!newBikeName) return;
    const updated = [...savedBikes, { id: Date.now().toString(), name: newBikeName, specs }];
    setSavedBikes(updated);
    try { await updateDoc(doc(db, "users", user.uid), { bikes: updated }); } catch (e) { }
    setNewBikeName(''); alert("Bike saved!");
  };

  const shareToCommunity = async () => {
    if (!shareCardRef.current || !metrics || !user || !mapSnapshot) return;
    setIsLoading(true);
    try {
      shareCardRef.current.style.opacity = '1';
      await new Promise(r => setTimeout(r, 1500));
      const dataUrl = await toPng(shareCardRef.current, { backgroundColor: "#121212", pixelRatio: 2 });
      shareCardRef.current.style.opacity = '0';
      const blob = await (await fetch(dataUrl)).blob();
      const imageRef = ref(storage, `trips/${user.uid}/${Date.now()}.png`);
      await uploadBytes(imageRef, blob);
      const url = await getDownloadURL(imageRef);
      await addDoc(collection(db, "posts"), { 
        authorId: user.uid, authorUsername: userData?.username || 'Rider', authorProfilePic: userData?.profilePic || '', imageUrl: url, 
        caption: `Rode ${metrics.distanceMiles.toFixed(1)} miles!`, likes: [], commentsEnabled: true, createdAt: serverTimestamp(),
        tripData: { origin: trip.origin, destination: trip.destination, waypoints: trip.waypoints, isRoundTrip }
      });
      alert("Shared!"); setIsLoading(false); setShowSharePreview(false);
    } catch (e) { setIsLoading(false); }
  };

  const downloadShareCard = async () => {
    if (!shareCardRef.current || !metrics || !mapSnapshot) return;
    try {
      setIsLoading(true); shareCardRef.current.style.opacity = '1';
      await new Promise(r => setTimeout(r, 1500));
      const dataUrl = await toPng(shareCardRef.current, { backgroundColor: "#121212", pixelRatio: 2 });
      shareCardRef.current.style.opacity = '0';
      const link = document.createElement('a'); link.download = `trip.png`; link.href = dataUrl; link.click();
      setIsLoading(false);
    } catch (e) { setIsLoading(false); }
  };

  const filteredBikes = [...STANDARD_BIKES, ...savedBikes].filter(b => b.name.toLowerCase().includes(bikeSearchQuery.toLowerCase()));
  const isRenting = userRole === 'rider' && !!selectedBikeId;

  // Dynamic Mobile Label Logic
  const getMobileToggleLabel = () => {
    if (showMobileMenu) return 'MAP';
    if (!response) return 'START HERE';
    if (settingsDirty) return 'UPDATE TRIP';
    return 'TRIP SETTINGS';
  };

  if (loading || !isLoaded) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>Initializing Map Hub...</div>;

  return (
    <div className="container" style={{ height: '100vh', background: '#121212', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SEO title={userRole === 'fleet' ? "Fleet Map" : "Rider Map"} />
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
      
      {/* Persistent Mobile Controls - Always on Top */}
      <div style={{ position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 100001, display: 'flex', flexDirection: 'row', gap: '0.8rem', background: 'rgba(0,0,0,0.5)', padding: '0.6rem 1rem', borderRadius: '40px', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <button 
          onClick={locateMe}
          style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          title="Locate Me"
        >
          <img src={orangePin} alt="Locate" style={{ width: '45px', height: '45px', objectFit: 'contain' }} />
        </button>
        <button 
          className="mobile-toggle-btn" 
          onClick={() => setShowMobileMenu(!showMobileMenu)} 
          style={{ height: '50px', padding: '0 1.5rem', borderRadius: '40px', background: '#ff6600', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
        >
          {getMobileToggleLabel()}
        </button>
        <button onClick={() => searchPOIs('charging')} className="desktop-only" style={{ padding: '0.8rem 1.2rem', background: 'rgba(20,20,20,0.9)', color: 'white', border: '1px solid #333', borderRadius: '12px', fontWeight: 900 }}>⚡ Chargers</button>
        <button onClick={() => searchPOIs('cafe')} className="desktop-only" style={{ padding: '0.8rem 1.2rem', background: 'rgba(20,20,20,0.9)', color: 'white', border: '1px solid #333', borderRadius: '12px', fontWeight: 900 }}>☕ Cafes</button>
      </div>

      <div className="main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside className={`sidebar ${showMobileMenu ? 'mobile-visible' : ''}`} style={{ width: '350px', padding: '20px', background: '#1a1a1a', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          
          {userRole === 'rider' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#666', fontSize: '0.65rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>Rental Status</label>
              {selectedBikeId ? (
                <div style={{ background: 'rgba(52,168,83,0.1)', padding: '1rem', borderRadius: '12px', border: '1px solid #34a853' }}>
                  <div style={{ fontWeight: 'bold', color: 'white' }}>{shopBikes.find(b => b.id === selectedBikeId)?.unitId || 'Assigned Bike'}</div>
                  <div style={{ fontSize: '0.6rem', color: '#34a853', marginTop: '0.2rem' }}>✓ AUTHORIZED BY SHOP</div>
                </div>
              ) : (
                <div style={{ background: '#111', padding: '1rem', borderRadius: '12px', border: '1px solid #333', color: '#666', fontSize: '0.75rem', textAlign: 'center' }}>
                  Waiting for shop assignment...
                </div>
              )}
            </div>
          )}

          {userRole === 'fleet' && (
            <div style={{ marginBottom: '1.5rem', background: '#222', padding: '1rem', borderRadius: '16px', border: '1px solid #ff6600' }}>
               <div style={{ color: '#ff6600', fontWeight: 900, fontSize: '0.8rem', textTransform: 'uppercase' }}>Fleet Overview</div>
               <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.4rem' }}>Tracking {liveUnits.length} active rentals in the field.</div>
            </div>
          )}

          <div className="form-group"><label>Units</label><div className="mode-toggle">
            <button className={unitSystem === 'imperial' ? 'active' : ''} onClick={() => setUnitSystem('imperial')}>Imperial</button>
            <button className={unitSystem === 'metric' ? 'active' : ''} onClick={() => setUnitSystem('metric')}>Metric</button>
          </div></div>
          
          <section className="form-group" style={{ position: 'relative' }}>
            <label>Bike Library</label>
            <input type="text" placeholder="Search..." value={bikeSearchQuery} onFocus={() => setShowBikeResults(true)} onChange={e => setBikeSearchQuery(e.target.value)} />
            {showBikeResults && bikeSearchQuery && (
              <div className="bike-results-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', zIndex: 100, border: '1px solid #333', maxHeight: '200px', overflowY: 'auto' }}>
                {filteredBikes.map(b => <div key={b.name} onClick={() => loadBike(b)} style={{ padding: '0.8rem', borderBottom: '1px solid #222', cursor: 'pointer' }}>{b.name}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input type="text" placeholder="Nickname" value={newBikeName} onChange={e => setNewBikeName(e.target.value)} style={{ padding: '0.4rem' }} />
              <button onClick={saveCurrentBike} style={{ padding: '0.4rem 0.8rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '4px' }}>Save</button>
            </div>
          </section>

          <section className="form-group">
            <label>Route</label>
            {locations.map((loc, index) => {
              if (index >= 2 && locations[index - 1].trim() === '') return null;
              return (
                <div key={index} style={{ display: 'flex', gap: '0.4rem', marginTop: index > 0 ? '0.5rem' : '0', alignItems: 'center' }}>
                  <div style={{ flex: 1, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <Autocomplete onLoad={(auto) => onAutocompleteLoad(index, auto)} onPlaceChanged={() => onPlaceChanged(index)}>
                        <input type="text" placeholder={index === 0 ? "Start" : `Stop ${index}`} value={loc} onChange={e => updateLocation(index, e.target.value)} style={{ flex: 1 }} />
                    </Autocomplete>
                  </div>
                </div>
              );
            })}
            <div className="mode-toggle" style={{ marginTop: '1rem' }}>
              <button className={!isRoundTrip ? 'active' : ''} onClick={() => { setIsRoundTrip(false); markDirty(); }}>One Way</button>
              <button className={isRoundTrip ? 'active' : ''} onClick={() => { setIsRoundTrip(true); markDirty(); }}>Round Trip</button>
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <section className="form-group"><label>Voltage</label><input type="number" disabled={isRenting} style={{ opacity: isRenting ? 0.5 : 1 }} value={specs.voltage} onChange={e => { setSpecs(p => ({ ...p, voltage: parseFloat(e.target.value) || '' })); markDirty(); }} /></section>
            <section className="form-group"><label>Capacity (Ah)</label><input type="number" disabled={isRenting} style={{ opacity: isRenting ? 0.5 : 1 }} value={specs.capacityAh} onChange={e => { setSpecs(p => ({ ...p, capacityAh: parseFloat(e.target.value) || '' })); markDirty(); }} /></section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <section className="form-group"><label>Bike Weight (lbs)</label><input type="number" disabled={isRenting} style={{ opacity: isRenting ? 0.5 : 1 }} value={specs.bikeWeightLbs} onChange={e => { setSpecs(p => ({ ...p, bikeWeightLbs: parseFloat(e.target.value) || '' })); markDirty(); }} /></section>
            <section className="form-group"><label>Rider Weight (lbs)</label><input type="number" value={riderWeight} onChange={e => { setRiderWeight(parseFloat(e.target.value) || ''); markDirty(); }} /></section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <section className="form-group"><label>Nominal Motor Rating (Watts)</label><input type="number" disabled={isRenting} style={{ opacity: isRenting ? 0.5 : 1 }} value={specs.motorWatts} onChange={e => { setSpecs(p => ({ ...p, motorWatts: parseFloat(e.target.value) || '' })); markDirty(); }} /></section>
            <section className="form-group"><label>Tire PSI</label><input type="number" disabled={isRenting} style={{ opacity: isRenting ? 0.5 : 1 }} value={specs.tirePSI || 30} onChange={e => { setSpecs(p => ({ ...p, tirePSI: parseFloat(e.target.value) || '' })); markDirty(); }} /></section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1rem' }}>
            <section className="form-group"><label>Tire Type</label>
              <select disabled={isRenting} value={specs.tireType || 'road'} onChange={e => { setSpecs(p => ({ ...p, tireType: e.target.value as any })); markDirty(); }} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white', opacity: isRenting ? 0.5 : 1 }}>
                <option value="road">Road</option>
                <option value="knobby">Knobby</option>
              </select>
            </section>
          </div>

          <section className="form-group" style={{ marginTop: '1rem' }}>
            <label>Drive Mode</label>
            <div className="mode-toggle">
              {(!isRenting || specs.driveMode !== 'pas_only') && (
                <button className={driveMode === 'throttle' ? 'active' : ''} onClick={() => { setDriveMode('throttle'); markDirty(); }}>Throttle Only</button>
              )}
              {(!isRenting || specs.driveMode !== 'throttle_only') && (
                <button className={driveMode === 'pas' ? 'active' : ''} onClick={() => { setDriveMode('pas'); markDirty(); }}>Pedal Assist</button>
              )}
            </div>
            {driveMode === 'pas' && (
              <div style={{ marginTop: '0.5rem' }}>
                <label style={{ fontSize: '0.7rem', color: '#666' }}>Assist Level (0-5)</label>
                <input type="range" min="0" max="5" value={pedalAssistLevel} onChange={e => { setPedalAssistLevel(parseInt(e.target.value)); markDirty(); }} style={{ width: '100%' }} />
                <div style={{ textAlign: 'center', color: '#ff6600', fontWeight: 'bold' }}>Level {pedalAssistLevel}</div>
              </div>
            )}
            {driveMode === 'throttle' && (
              <div style={{ marginTop: '0.5rem' }}>
                <label style={{ fontSize: '0.7rem', color: '#666' }}>Throttle Mode</label>
                <div className="mode-toggle">
                  <button className={throttleMode === 'eco' ? 'active' : ''} onClick={() => { setThrottleMode('eco'); markDirty(); }}>Eco</button>
                  <button className={throttleMode === 'normal' ? 'active' : ''} onClick={() => { setThrottleMode('normal'); markDirty(); }}>Normal</button>
                  <button className={throttleMode === 'sport' ? 'active' : ''} onClick={() => { setThrottleMode('sport'); markDirty(); }}>Sport</button>
                </div>
              </div>
            )}
          </section>

          <section className="form-group" style={{ marginTop: '1rem' }}>
            <label>Battery Entry</label>
            <div className="mode-toggle">
              <button className={batteryInputMode === 'percent' ? 'active' : ''} onClick={() => handleToggleBatteryMode('percent')}>%</button>
              <button className={batteryInputMode === 'voltage' ? 'active' : ''} onClick={() => handleToggleBatteryMode('voltage')}>V</button>
            </div>
            <input type="number" value={batteryInputMode === 'percent' ? startBattery : startVoltage} onChange={e => { if (batteryInputMode === 'percent') setStartBattery(parseFloat(e.target.value) || ''); else setStartVoltage(parseFloat(e.target.value) || ''); markDirty(); }} />
          </section>

          <button onClick={handleCalculate} style={{ width: '100%', padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', marginTop: '1rem' }}>UPDATE ROUTE</button>

          {metrics && (
            <div ref={metricsCardRef} className="card metrics-card" style={{ marginTop: '1.5rem', borderLeft: '4px solid #ff6600', padding: '1.5rem', background: '#1a1a1a', borderRadius: '16px' }}>
              <div style={{ color: '#ff6600', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase' }}>Estimated Metrics ({metrics.label || 'Optimal Route'})</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white' }}>Battery Left: {metrics.batteryPercentRemaining.toFixed(1)}%</div>
              <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Est. End Voltage: {metrics.endingVoltage?.toFixed(1)}V</div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>Travel Time:</span><span style={{ fontWeight: 'bold', color: 'white' }}>{Math.floor(metrics.durationMin/60)}h {Math.round(metrics.durationMin%60)}m</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>Distance:</span><span style={{ fontWeight: 'bold', color: 'white' }}>{metrics.distanceMiles.toFixed(1)} mi</span></div>
                <div style={{ borderTop: '1px solid #333', margin: '0.5rem 0' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>⛰️ Elevation Gain:</span><span style={{ color: '#ffbb33', fontWeight: 'bold' }}>{Math.round(metrics.elevationGainFeet)} ft</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>🔋 Efficiency:</span><span style={{ color: '#00ccff', fontWeight: 'bold' }}>{metrics.efficiencyWhMi.toFixed(1)} Wh/mi</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>🌬️ Wind:</span><span style={{ color: '#4caf50', fontWeight: 'bold' }}>{metrics.windConditions?.speed.toFixed(1)} mph</span></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button onClick={() => { if (isExploreTier) setShowSharePreview(true); else setShowGroupRidePaywall(true); }} style={{ width: '100%', padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 900 }}>Share {isExploreTier ? '' : '🔒'}</button>
                <button onClick={() => setShowRouteReplay(true)} style={{ width: '100%', padding: '1rem', background: '#333', color: '#ff6600', border: '1px solid #ff6600', borderRadius: '12px', fontWeight: 900 }}>3D VIEW</button>
              </div>
              <button onClick={startNavigation} style={{ width: '100%', padding: '1.2rem', background: 'linear-gradient(to bottom, #ff8800, #ff6600)', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 900, fontSize: '1.2rem', boxShadow: '0 4px 15px rgba(255,102,0,0.4)' }}>🏁 START TRIP</button>
            </div>
          )}
        </aside>

        <main style={{ flex: 1, position: 'relative' }}>
          {isNavigating && response && (
            <div style={{ position: 'fixed', top: '5.5rem', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '500px', zIndex: 10000, background: '#1a1a1a', border: '2px solid #ff6600', borderRadius: '20px', padding: '1.2rem', boxShadow: '0 10px 40px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: 'white', fontWeight: 'bold' }}>{distToNextStep || 'Navigating...'}</div>
                  <button onClick={stopNavigation} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}>✕</button>
                </div>
            </div>
          )}

          <div style={{ position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 100001, display: 'flex', flexDirection: 'row', gap: '0.8rem', background: 'rgba(0,0,0,0.5)', padding: '0.6rem 1rem', borderRadius: '40px', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button 
              onClick={locateMe}
              style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title="Locate Me"
            >
              <img src={orangePin} alt="Locate" style={{ width: '45px', height: '45px', objectFit: 'contain' }} />
            </button>
            <button 
              className="mobile-toggle-btn" 
              onClick={() => setShowMobileMenu(!showMobileMenu)} 
              style={{ height: '50px', padding: '0 1.5rem', borderRadius: '40px', background: '#ff6600', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
            >
              {getMobileToggleLabel()}
            </button>
            <button onClick={() => searchPOIs('charging')} className="desktop-only" style={{ padding: '0.8rem 1.2rem', background: 'rgba(20,20,20,0.9)', color: 'white', border: '1px solid #333', borderRadius: '12px', fontWeight: 900 }}>⚡ Chargers</button>
            <button onClick={() => searchPOIs('cafe')} className="desktop-only" style={{ padding: '0.8rem 1.2rem', background: 'rgba(20,20,20,0.9)', color: 'white', border: '1px solid #333', borderRadius: '12px', fontWeight: 900 }}>☕ Cafes</button>
          </div>

          <GoogleMap 
            mapContainerStyle={{ width: '100%', height: '100%' }} 
            center={userRole === 'fleet' ? (shopLocation || center) : (userLocation || center)} 
            zoom={12} 
            onLoad={onMapLoad}
            options={{ mapId: import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID', disableDefaultUI: true }}
          >
            {/* Robust Route Rendering with Polyline */}
            {response && response.routes[0]?.overview_path && (
              <>
                <Polyline
                  path={response.routes[0].overview_path}
                  options={{
                    strokeColor: '#ff6600',
                    strokeOpacity: 0.8,
                    strokeWeight: 6,
                    geodesic: true,
                  }}
                />
                {/* Start Marker */}
                <AdvancedMarker position={{ lat: response.routes[0].overview_path[0].lat(), lng: response.routes[0].overview_path[0].lng() }}>
                   <div style={{ background: '#34a853', padding: '6px', borderRadius: '50%', border: '2px solid white', width: '20px', height: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}></div>
                </AdvancedMarker>
                {/* End Marker */}
                <AdvancedMarker position={{ lat: response.routes[0].overview_path[response.routes[0].overview_path.length - 1].lat(), lng: response.routes[0].overview_path[response.routes[0].overview_path.length - 1].lng() }}>
                   <div style={{ background: '#ff4444', padding: '6px', borderRadius: '50%', border: '2px solid white', width: '20px', height: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}></div>
                </AdvancedMarker>
              </>
            )}
            
            {userLocation && (
              <AdvancedMarker position={userLocation} title="Your Location">
                <img src={orangePin} alt="You" style={{ width: '35px', height: '35px', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }} />
              </AdvancedMarker>
            )}

            {userRole === 'fleet' && shopLocation && (
                <AdvancedMarker position={shopLocation} title={userData?.orgName || "Shop HQ"}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ background: '#ff6600', padding: '4px 8px', borderRadius: '8px', color: 'white', fontSize: '0.6rem', fontWeight: 900, marginBottom: '2px' }}>HQ</div>
                    <div style={{ background: 'white', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', border: '2px solid #ff6600' }}>🏢</div>
                  </div>
                </AdvancedMarker>
            )}

            {userRole === 'fleet' && liveUnits.filter(lu => lu.id !== user?.uid).map(lu => {
                const bubbleColor = lu.battery < 15 ? '#ff4444' : (lu.battery < 30 ? '#ffbb33' : '#34a853');
                return (
                  <AdvancedMarker key={lu.id} position={lu.position}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ background: bubbleColor, color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', border: '2px solid white', marginBottom: '4px', whiteSpace: 'nowrap' }}>
                        {lu.unitName}: {lu.battery}%
                      </div>
                      <div style={{ background: 'white', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${bubbleColor}` }}>🚲</div>
                    </div>
                  </AdvancedMarker>
                );
            })}

            {pois.map(p => (
                <AdvancedMarker key={p.id} position={p.position} onClick={() => setSelectedPoi(p)}>
                  <div style={{ background: p.type === 'charging' ? '#34a853' : '#4285F4', padding: '4px', borderRadius: '50%', border: '2px solid white', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>{p.type === 'charging' ? '⚡' : '📍'}</div>
                </AdvancedMarker>
            ))}

            {selectedPoi && (
                <InfoWindowF position={selectedPoi.position} onCloseClick={() => setSelectedPoi(null)}>
                  <div style={{ color: 'black', padding: '0.4rem' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{selectedPoi.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#444' }}>{selectedPoi.address}</div>
                  </div>
                </InfoWindowF>
            )}
          </GoogleMap>

          <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0,0,0,0.85)', color: '#888', fontSize: '0.65rem', padding: '8px 16px', borderRadius: '20px', zIndex: 1000, whiteSpace: 'nowrap', border: '1px solid #333', display: 'flex', gap: '12px', alignItems: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)' }}>
            <span>⚡ Estimates only. Actual range varies with conditions. Never ride beyond your physical limits.</span>
            <div style={{ display: 'flex', gap: '8px', borderLeft: '1px solid #444', paddingLeft: '12px' }}>
              <span onClick={() => setShowToSPage(true)} style={{ color: '#ff6600', cursor: 'pointer', textDecoration: 'underline' }}>TOS</span>
              <span onClick={() => setShowPrivacyPage(true)} style={{ color: '#ff6600', cursor: 'pointer', textDecoration: 'underline' }}>Privacy</span>
            </div>
          </div>
        </main>
      </div>

      {showSharePreview && metrics && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', padding: '10px', overflow: 'auto' }}>
          <div ref={shareCardRef} style={{ width: '400px', background: '#0a0a0a', padding: '2rem', borderRadius: '40px', border: '1px solid #333' }}>
             <h2 style={{ color: '#ff6600', margin: 0 }}>RANGE ANXIETY</h2>
             <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', margin: '1rem 0' }}>{metrics.batteryPercentRemaining.toFixed(0)}% Left</div>
             <p style={{ color: '#888' }}>Rode {metrics.distanceMiles.toFixed(1)} miles!</p>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => setShowSharePreview(false)} style={{ padding: '1rem 2rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px' }}>Cancel</button>
            <button onClick={downloadShareCard} style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px' }}>Download</button>
            <button onClick={shareToCommunity} style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px' }}>Post</button>
          </div>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}
      {showPrivacyPage && <PrivacyPolicy onClose={() => setShowPrivacyPage(false)} />}
      {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      
      {showRouteReplay && response && response.routes[selectedRouteIndex] && (
        <RouteReplay3D 
          polyline={response.routes[selectedRouteIndex].overview_polyline as any} 
          onClose={() => setShowRouteReplay(false)}
          maptilerKey={import.meta.env.VITE_MAPTILER_KEY}
        />
      )}

      {showGroupRidePaywall && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #ff6600', borderRadius: '24px', padding: '2.5rem', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🧭</div>
            <h2 style={{ color: '#ff6600', fontSize: '1.4rem', marginBottom: '0.5rem' }}>Unlock Explore Mode</h2>
            <p style={{ color: '#aaa', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>Unlock live route recording, terrain analysis, and community sharing.</p>
            <div style={{ background: '#222', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'white' }}>$3.99</div>
              <div style={{ color: '#888', fontSize: '0.7rem' }}>monthly subscription · cancel anytime</div>
            </div>
            <button onClick={checkoutExploreTier} style={{ width: '100%', padding: '1rem', background: 'linear-gradient(45deg, #ff6600, #ff9900)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer' }}>Activate Explore Mode</button>
            <button onClick={() => setShowGroupRidePaywall(false)} style={{ width: '100%', padding: '0.8rem', background: 'none', color: '#888', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '0.8rem', marginTop: '1rem' }}>Maybe Later</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapHome;
