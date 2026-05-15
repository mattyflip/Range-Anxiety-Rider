import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker, InfoWindow, Polyline } from '@react-google-maps/api'
import axios from 'axios'
import { toPng } from 'html-to-image'
import { auth, db, storage } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, collection, addDoc, serverTimestamp, updateDoc, deleteDoc, query, where, onSnapshot, setDoc, getDocs, arrayUnion } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import AdBanner from '../components/AdBanner'
import TermsOfService from '../components/TermsOfService'
import InstallTutorial from '../components/InstallTutorial'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import WelcomeModal from '../components/WelcomeModal'
import { STATE_COORDINATES } from '../utils/ebikeLaws'

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

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

interface Participant {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  lastUpdatedAt: number;
}

interface BikeSpecs {
  voltage: number | '';
  capacityAh: number | '';
  motorWatts: number | '';
  bikeWeightLbs: number | '';
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
  batteryPercentUsed: number;
  recommendedSpeedMph: number;
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
  const [riderWeightLbs, setRiderWeightLbs] = useState<number | ''>(200);
  const [ambientTempF, setAmbientTempF] = useState<number | ''>(70);
  const [tireType, setTireType] = useState<'road' | 'knobby'>('road');
  const [tirePressurePsi, setTirePressurePsi] = useState<number | ''>(''); 
  
  const [trip, setTrip] = useState<TripDetails>({ origin: '', destination: '', waypoints: [] });
  const [waypoint3, setWaypoint3] = useState('');
  const [waypoint4, setWaypoint4] = useState('');
  const [waypoint5, setWaypoint5] = useState('');
  const [mode, setMode] = useState<'eco' | 'normal' | 'sport'>('normal');
  const [pasLevel, setPasLevel] = useState<number>(3);
  const [controlType, setControlType] = useState<'switch' | 'pas'>('pas');
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [targetSpeedMph, setTargetSpeedMph] = useState<number | ''>(20);
  
  const [batteryInputMode, setBatteryInputMode] = useState<'percent' | 'voltage'>('percent'); 
  const [startBattery, setStartBattery] = useState<number | ''>(100);
  const [startVoltage, setStartVoltage] = useState<number | ''>(54.6);
  
  const [response, setResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pois, setPois] = useState<POI[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  
  const [showSharePreview, setShowSharePreview] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [isHostTier, setIsHostTier] = useState(false);
  const [hostTierExpiresAt, setHostTierExpiresAt] = useState<Date | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGroupRidePaywall, setShowGroupRidePaywall] = useState(false);
  const [paywallTier, setPaywallTier] = useState<'host' | 'pro'>('host');
  const [bikeSearchQuery, setBikeSearchQuery] = useState("");
  const [showBikeResults, setShowBikeResults] = useState(false);
  const [savedBikes, setSavedBikes] = useState<SavedBike[]>([]);
  const [newBikeName, setNewBikeName] = useState('');
  const [showToSPage, setShowToSPage] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [mapSnapshot, setMapSnapshot] = useState<string | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(true);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);

  // Group Ride State
  const [activeRide, setActiveRide] = useState<GroupRide | null>(null);
  const [publicRides, setPublicRides] = useState<GroupRide[]>([]);
  const [rideParticipants, setRideParticipants] = useState<Participant[]>([]);
  const [rideRoutePath, setRideRoutePath] = useState<google.maps.LatLngLiteral[]>([]);
  const [rideRouteStops, setRideRouteStops] = useState<{lat:number;lng:number;label:string}[]>([]);
  const [groupRideName, setGroupRideName] = useState('');
  const [isPublicRide, setIsPublicRide] = useState(true);
  const [joinPin, setJoinPin] = useState('');

  // Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distToNextStep, setNextStepDist] = useState<string | null>(null);
  const [hasAnnouncedNextStep, setHasAnnouncedNextStep] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u); setAuthInitialized(true);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, "users", u.uid));
          if (userDoc.exists()) {
            const data = userDoc.data(); setUserData(data);
            setIsPro(data.isPro || false);
            setIsHostTier(data.isHostTier || false);
            if (data.hostTierExpiresAt?.toDate) setHostTierExpiresAt(data.hostTierExpiresAt.toDate());
            if (data.bikes) setSavedBikes(data.bikes);
          }
          // Restore active ride from localStorage if user was in one
          const savedRideId = localStorage.getItem('active_ride_id');
          if (savedRideId && !activeRide) {
            const rideSnap = await getDoc(doc(db, "group_rides", savedRideId));
            if (rideSnap.exists() && rideSnap.data().status === 'active') {
              setActiveRide({ id: rideSnap.id, ...rideSnap.data() } as any);
            } else {
              localStorage.removeItem('active_ride_id');
            }
          }
        } catch (e) { console.error(e); }
      } else {
        setUserData(null); setIsPro(false); setIsHostTier(false); setHostTierExpiresAt(null);
        localStorage.removeItem('active_ride_id');
        const local = localStorage.getItem('ebike-saved-bikes');
        if (local) setSavedBikes(JSON.parse(local));
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (authInitialized && !user && !localStorage.getItem('ebike_portal_visited')) {
        // use setTimeout to jump out of synchronous render flow for modal state updates
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

  // Sync Public Rides (20mi radius)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "group_rides"), where("isPublic", "==", true), where("status", "==", "active"));
    const unsub = onSnapshot(q, (snap) => {
      const rides: GroupRide[] = [];
      snap.forEach(d => rides.push({ id: d.id, ...d.data() } as GroupRide));
      setPublicRides(rides);
    });
    return () => unsub();
  }, [user]);

  // Sync Participants
  useEffect(() => {
    if (!activeRide) return;
    const q = collection(db, `group_rides/${activeRide.id}/participants`);
    const unsub = onSnapshot(q, (snap) => {
      const parts: Participant[] = [];
      snap.forEach(d => parts.push(d.data() as Participant));
      setRideParticipants(parts);
    });
    return () => unsub();
  }, [activeRide?.id]);

  // Location Upload during Ride
  useEffect(() => {
    if (!activeRide || !user) return;
    const interval = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          await setDoc(doc(db, `group_rides/${activeRide.id}/participants`, user.uid), {
            userId: user.uid, name: userData?.username || 'Rider', lat: loc.lat, lng: loc.lng, lastUpdatedAt: Date.now()
          }, { merge: true });
          if (activeRide.leaderId === user.uid) {
            await updateDoc(doc(db, "group_rides", activeRide.id), { leaderTrail: arrayUnion(loc) });
          }
          // Auto-end check: if host and all participants near destination, end ride
          if (user.uid === activeRide.creatorId && rideRouteStops.length > 0 && rideParticipants.length > 0) {
            const dest = rideRouteStops[rideRouteStops.length - 1];
            const destLoc = new google.maps.LatLng(dest.lat, dest.lng);
            const allNear = rideParticipants.every(p => {
              const pLoc = new google.maps.LatLng(p.lat, p.lng);
              return google.maps.geometry.spherical.computeDistanceBetween(pLoc, destLoc) < 200;
            });
            if (allNear && rideParticipants.length > 0) {
              await updateDoc(doc(db, "group_rides", activeRide.id), { status: 'offline' });
              localStorage.removeItem('active_ride_id');
              setActiveRide(null); setRideParticipants([]); setRideRoutePath([]); setRideRouteStops([]);
            }
          }
        });
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [activeRide?.id, user, userData?.username, rideRouteStops, rideParticipants]);

  // Load host's route from Firestore (all participants see it)
  useEffect(() => {
    if (!activeRide) { 
        if (rideRoutePath.length > 0) setRideRoutePath([]); 
        if (rideRouteStops.length > 0) setRideRouteStops([]); 
        return; 
    }
    const unsub = onSnapshot(doc(db, "group_rides", activeRide.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.routePath?.length) setRideRoutePath(data.routePath);
        else setRideRoutePath([]);
        if (data.routeStops?.length) setRideRouteStops(data.routeStops);
        else setRideRouteStops([]);
      } else {
        setRideRoutePath([]);
        setRideRouteStops([]);
      }
    }, console.error);
    return () => unsub();
  }, [activeRide?.id]);

  // Navigation Logic
  const speak = (text: string) => {
    if (voiceEnabled && 'speechSynthesis' in window) {
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
      const userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const route = response.routes[selectedRouteIndex];
      const leg = route.legs[currentLegIndex];
      const step = leg.steps[currentStepIndex];
      
      if (mapRef.current) { mapRef.current.panTo(userLoc); }
      
      const endLoc = { lat: step.end_location.lat(), lng: step.end_location.lng() };
      const distMeters = google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(userLoc.lat, userLoc.lng), new google.maps.LatLng(endLoc.lat, endLoc.lng));
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
    const name = bike.name.toLowerCase();
    if (name.includes("surron") || name.includes("talaria") || name.includes("onyx") || name.includes("dualtron") || name.includes("nami") || Number(bike.specs.voltage) >= 60) setControlType('switch');
    else setControlType('pas');
    markDirty();
  };

  const handleCalculate = () => { 
    if (!trip.origin || !trip.destination) return;
    // Build waypoints from individual fields
    const wps = [waypoint3, waypoint4, waypoint5].filter(w => w.trim());
    setTrip(p => ({ ...p, waypoints: wps }));
    setIsLoading(true); setResponse(null); setMetrics(null); setPois([]); setSettingsDirty(false); 
  };

  const calculateMetrics = async (result: google.maps.DirectionsResult, routeIndex: number = 0) => {
    try {
      const route = result.routes[routeIndex];
      let distMeters = 0; route.legs.forEach(leg => distMeters += (leg.distance?.value || 0));
      const multiplier = isRoundTrip ? 2 : 1;
      const distMiles = (distMeters / 1609.34) * multiplier;
      const path = route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
      
      let gainFeet = 0, lossFeet = 0;
      try {
        const encodedPath = google.maps.geometry.encoding.encodePath(route.overview_path);
        const elevResp = await axios.post('/api/elevation', { encodedPath, samples: 100 });
        if (elevResp.data?.gain) { gainFeet = elevResp.data.gain * multiplier; lossFeet = (elevResp.data.loss || 0) * multiplier; }
      } catch (e) { console.error(e); }

      let windSpeed = 0, headwindMph = 0;
      try {
        const res = await axios.get(`/api/weather?lat=${path[0].lat}&lng=${path[0].lng}`);
        windSpeed = res.data.wind_speed; headwindMph = windSpeed * 0.5;
      } catch (e) { console.error(e); }

      const massKg = (Number(specs.bikeWeightLbs) + Number(riderWeightLbs)) * 0.453592;
      const velocityMps = Number(targetSpeedMph) * 0.44704;
      
      // Temperature adjustments
      const tempF = Number(ambientTempF) || 70;
      // Air density adjustment (baseline 1.225 at 59F/15C)
      const rho = 1.225 * (518.67 / (459.67 + tempF));
      
      // Tire pressure adjustment (Crr increases as PSI drops)
      let Crr = tireType === 'road' ? 0.007 : 0.015;
      if (tirePressurePsi && Number(tirePressurePsi) > 0) {
        const refPsi = tireType === 'road' ? 40 : 25;
        Crr = Crr * (refPsi / Number(tirePressurePsi));
      }

      const ForceRolling = Crr * massKg * 9.81;
      const ForceDrag = 0.5 * rho * 0.55 * Math.pow(Math.max(0.1, velocityMps + headwindMph * 0.44704), 2);
      
      // Motor and Battery efficiency adjustments
      let motorEff = mode === 'eco' ? 0.85 : 0.80;
      // Battery capacity drops in cold (approx 0.5% per degree F below 70)
      const tempEfficiency = tempF < 70 ? Math.max(0.7, 1 - (70 - tempF) * 0.005) : 1;
      
      const totalWhUsable = (Number(specs.voltage) * Number(specs.capacityAh)) * 0.92 * tempEfficiency;
      const WhPerMile = Math.max(10, ((ForceRolling + ForceDrag) * velocityMps / velocityMps) * (1609.34 / 3600) / motorEff);
      const estimatedWh = (distMiles * WhPerMile) + (gainFeet * 0.1);

      const { min, max } = getBatteryLevels(Number(specs.voltage));
      const startWh = batteryInputMode === 'percent' ? (totalWhUsable * (Number(startBattery)/100)) : (totalWhUsable * ((Number(startVoltage)-min)/(max-min)));
      const remaining = ((startWh - estimatedWh) / totalWhUsable) * 100;
      const endingVoltage = min + (Math.max(0, remaining / 100) * (max - min));
      
      let deathPoint; if (remaining <= 0) deathPoint = path[Math.floor(path.length * 0.8)];

      setMetrics({ distanceMiles: distMiles, durationMin: distMiles / (Number(targetSpeedMph) || 15) * 60, elevationGainFeet: gainFeet, elevationLossFeet: lossFeet, estimatedWh, batteryPercentUsed: Math.max(0, remaining), recommendedSpeedMph: 20, deathPoint, endingVoltage, windConditions: { speed: windSpeed, direction: 0, headwindComponent: headwindMph } });
      
      // If host is in an active ride, save route to Firestore so participants can see it
      if (activeRide && user?.uid === activeRide.creatorId) {
        // Build stop markers from DirectionsResult legs
        const stops: {lat:number;lng:number;label:string}[] = [];
        stops.push({ lat: route.legs[0].start_location.lat(), lng: route.legs[0].start_location.lng(), label: 'Start' });
        trip.waypoints.filter(w => w.trim()).forEach((_wp, i) => {
          if (route.legs[i + 1]) {
            stops.push({ lat: route.legs[i + 1].start_location.lat(), lng: route.legs[i + 1].start_location.lng(), label: `Stop ${i + 2}` });
          }
        });
        const lastLeg = route.legs[route.legs.length - 1];
        stops.push({ lat: lastLeg.end_location.lat(), lng: lastLeg.end_location.lng(), label: 'Stop 1' });
        
        updateDoc(doc(db, "group_rides", activeRide.id), {
          routePath: path,
          routeStops: stops,
          routeOrigin: trip.origin,
          routeDestination: trip.destination,
        }).catch(console.error);
      }
      
      setIsLoading(false);
    } catch (e) { console.error(e); setIsLoading(false); }
  };

  const directionsCallback = (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
    if (status === 'OK' && result) { setResponse(result); setSelectedRouteIndex(0); calculateMetrics(result, 0); }
    else { setIsLoading(false); }
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

  const checkoutProTier = async () => {
    if (!user) { setShowAuthModal(true); return; }
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: user.uid, email: user.email, tier: 'pro' })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('Checkout error:', data);
        alert(`Checkout failed: ${data.error || 'Please try again.'}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Checkout failed: ${e.message || 'Unknown error'}`);
    }
  };

  const checkoutHostTier = async () => {
    if (!user) { setShowAuthModal(true); return; }
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: user.uid, email: user.email, tier: 'host' })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('Checkout error:', data);
        alert(`Checkout failed: ${data.error || 'Please try again.'}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Checkout failed: ${e.message || 'Unknown error'}`);
    }
  };

  // We calculate timestamp offset on load once assuming stable clock over session logic, avoiding dynamic changing `Date.now` purity breaking in render.
  const [sessionTimeStart] = useState(() => new Date().getTime());

  const canHostRide = () => {
    if (!isHostTier || !hostTierExpiresAt) return false;
    return hostTierExpiresAt.getTime() > sessionTimeStart;
  };

  const canJoinRide = () => {
    return isPro || canHostRide();
  };

  const createRide = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!canHostRide()) { setPaywallTier('host'); setShowGroupRidePaywall(true); return; }
    if (!groupRideName) { alert("Name required."); return; }
    // Prevent duplicate hosting
    if (localStorage.getItem('active_ride_id')) {
      const existingSnap = await getDoc(doc(db, "group_rides", localStorage.getItem('active_ride_id')!));
      if (existingSnap.exists() && existingSnap.data().status === 'active') {
        alert("You already have an active group ride. End it before starting a new one.");
        return;
      }
      localStorage.removeItem('active_ride_id');
    }
    const pin = Math.floor(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] / 4294967295) * 9000).toString();
    const rideData = { name: groupRideName, isPublic: isPublicRide, pin, creatorId: user.uid, leaderId: user.uid, status: 'active', startLat: center.lat, startLng: center.lng };
    const rideRef = await addDoc(collection(db, "group_rides"), rideData);
    setActiveRide({ id: rideRef.id, ...rideData } as any);
    localStorage.setItem('active_ride_id', rideRef.id);
    await setDoc(doc(db, `group_rides/${rideRef.id}/participants`, user.uid), { userId: user.uid, name: userData?.username || 'Host', lat: center.lat, lng: center.lng, lastUpdatedAt: new Date().getTime() });
  };

  const joinRide = async (rideId?: string) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!canJoinRide()) { setPaywallTier('pro'); setShowGroupRidePaywall(true); return; }
    let targetRide;
    if (rideId) {
      const snap = await getDoc(doc(db, "group_rides", rideId));
      if (snap.exists()) targetRide = { id: snap.id, ...snap.data() };
    } else {
      const q = query(collection(db, "group_rides"), where("pin", "==", joinPin), where("status", "==", "active"));
      const snap = await getDocs(q);
      if (!snap.empty) targetRide = { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    if (targetRide) {
      await setDoc(doc(db, `group_rides/${targetRide.id}/participants`, user.uid), { userId: user.uid, name: userData?.username || 'Rider', lat: center.lat, lng: center.lng, lastUpdatedAt: new Date().getTime() });
      setActiveRide(targetRide as any);
      localStorage.setItem('active_ride_id', targetRide.id);
      setJoinPin('');
    } else { alert("Ride not found."); }
  };

  const leaveRide = async () => {
    if (!activeRide || !user) return;
    await deleteDoc(doc(db, `group_rides/${activeRide.id}/participants`, user.uid));
    localStorage.removeItem('active_ride_id');
    setActiveRide(null); setRideParticipants([]);
  };

  const endRide = async () => {
    if (!activeRide) return;
    await updateDoc(doc(db, "group_rides", activeRide.id), { status: 'offline' });
    localStorage.removeItem('active_ride_id');
    setActiveRide(null); setRideParticipants([]);
  };

  const setRideLeader = async (participantId: string) => {
    if (!activeRide || !user || user.uid !== activeRide.creatorId) return;
    await updateDoc(doc(db, "group_rides", activeRide.id), { leaderId: participantId });
    setActiveRide(prev => prev ? { ...prev, leaderId: participantId } : null);
  };

  const saveCurrentBike = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!newBikeName) return;
    const updated = [...savedBikes, { id: Date.now().toString(), name: newBikeName, specs }];
    setSavedBikes(updated);
    try { await updateDoc(doc(db, "users", user.uid), { bikes: updated }); } catch (e) { console.error(e); }
    setNewBikeName(''); alert("Bike saved!");
  };

  const useCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        if (mapRef.current) {
          mapRef.current.panTo(loc);
          mapRef.current.setZoom(15);
        }
        setTrip(p => ({ ...p, origin: `${loc.lat},${loc.lng}` }));
        markDirty();
      });
    }
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

  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);
  const filteredBikes = [...STANDARD_BIKES, ...savedBikes].filter(b => b.name.toLowerCase().includes(bikeSearchQuery.toLowerCase()));

  return (
    <div className="container">
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
      <div className="main-layout">
        <aside className={`sidebar ${showMobileMenu ? 'mobile-visible' : ''}`}>
          <div className="form-group"><label>Units</label><div className="mode-toggle">
            <button className={unitSystem === 'imperial' ? 'active' : ''} onClick={() => setUnitSystem('imperial')}>Imperial</button>
            <button className={unitSystem === 'metric' ? 'active' : ''} onClick={() => setUnitSystem('metric')}>Metric</button>
          </div></div>

          <div className="form-group"><label>Voice Navigation</label><div className="mode-toggle">
            <button className={voiceEnabled ? 'active' : ''} onClick={() => setVoiceEnabled(true)}>Enabled 🔊</button>
            <button className={!voiceEnabled ? 'active' : ''} onClick={() => setVoiceEnabled(false)}>Muted 🔇</button>
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

          <section className="form-group" style={{ borderTop: '1px solid #333', paddingTop: '1rem', paddingBottom: '2rem', marginTop: '1rem' }}>
            <label style={{ color: '#ff6600', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Group Ride {canHostRide() ? <span style={{ color: '#34a853', fontSize: '0.6rem', marginLeft: '0.5rem' }}>✓ HOST</span> : isPro ? <span style={{ color: '#ff9900', fontSize: '0.6rem', marginLeft: '0.5rem' }}>✓ JOIN</span> : <span style={{ color: '#888', fontSize: '0.6rem', marginLeft: '0.5rem' }}>🔒 FREE</span>}</span>
              {!isPro && !canHostRide() && (
                 <button onClick={() => { setPaywallTier('host'); setShowGroupRidePaywall(true); }} style={{ padding: '0.2rem 0.6rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}>Unlock 30 Days</button>
              )}
            </label>
            {canHostRide() && hostTierExpiresAt && (
              <div style={{ fontSize: '0.6rem', color: '#666', marginTop: '0.2rem' }}>
                Host access expires {hostTierExpiresAt.toLocaleDateString()}
              </div>
            )}
            {!isPro && !canHostRide() && (
              <div style={{ fontSize: '0.6rem', color: '#ff9900', marginTop: '0.2rem' }}>
                You can join rides. Upgrade to HOST to create your own.
              </div>
            )}
            {!activeRide ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '1rem' }}>
                {canJoinRide() || canHostRide() ? (
                  <>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="text" placeholder="Ride Name" value={groupRideName} onChange={e => setGroupRideName(e.target.value)} style={{ flex: 1 }} />
                      <button onClick={createRide} style={{ padding: '0.4rem 1rem', background: '#ff6600', border: 'none', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}>Host</button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', color: '#888' }}>
                      <input type="checkbox" checked={isPublicRide} onChange={e => setIsPublicRide(e.target.checked)} style={{ width: 'auto' }} />
                      Public Visibility
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="text" placeholder="PIN" value={joinPin} onChange={e => setJoinPin(e.target.value)} style={{ width: '80px', textAlign: 'center' }} />
                      <button onClick={() => joinRide()} style={{ flex: 1, background: '#222', border: '1px solid #333', color: 'white', borderRadius: '4px' }}>Join via PIN</button>
                    </div>
                    {publicRides.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <label style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Public Rides Nearby</label>
                        {publicRides.map(r => (
                          <div key={r.id} onClick={() => joinRide(r.id)} style={{ padding: '0.8rem', background: '#1a1a1a', borderRadius: '8px', marginBottom: '0.5rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #333' }}>
                            <span style={{ color: 'white', fontSize: '0.9rem' }}>{r.name}</span>
                            <span style={{ color: '#34a853', fontSize: '0.7rem' }}>Join</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
                    <div style={{ fontSize: '1.1rem', color: 'white', fontWeight: 'bold', marginBottom: '0.5rem' }}>Group Rides</div>
                    <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '1rem', lineHeight: 1.4 }}>Join live rides or host your own to see friends on the map in real-time.</div>
                    <button onClick={() => { setPaywallTier('host'); setShowGroupRidePaywall(true); }} style={{ width: '100%', padding: '0.8rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Start 30-Day Pass</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #ff6600', position: 'relative', marginTop: '1rem' }}>
                <div style={{ color: '#ff6600', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Active Ride</div>
                <div style={{ color: 'white', fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.2rem' }}>{activeRide.name}</div>
                <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1rem' }}>PIN: <span style={{ letterSpacing: '2px', color: 'white' }}>{activeRide.pin}</span></div>
                <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>Participants ({rideParticipants.length})</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {rideParticipants.map(p => (
                    <span key={p.userId} style={{ background: '#333', padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', color: 'white' }}>{p.name} {p.userId === activeRide.leaderId && '👑'}</span>
                  ))}
                </div>
                {user?.uid === activeRide.creatorId && rideParticipants.length > 1 && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.6rem', color: '#888' }}>LEADER</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {rideParticipants.map(p => (
                        <button
                          key={p.userId}
                          onClick={() => setRideLeader(p.userId)}
                          style={{
                            padding: '0.25rem 0.6rem',
                            background: activeRide.leaderId === p.userId ? '#ff6600' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '0.65rem',
                            cursor: 'pointer',
                            fontWeight: activeRide.leaderId === p.userId ? 'bold' : 'normal'
                          }}
                        >
                          {activeRide.leaderId === p.userId ? '⭐ ' : ''}{p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {user?.uid === activeRide.creatorId && (
                  <button onClick={endRide} style={{ width: '100%', background: 'transparent', border: '1px solid #ff3333', color: '#ff3333', padding: '0.6rem', borderRadius: '8px', marginTop: '0.5rem' }}>End Ride for Everyone</button>
                )}
                {user?.uid !== activeRide.creatorId && (
                  <button onClick={leaveRide} style={{ width: '100%', background: 'transparent', border: '1px solid #888', color: '#bbb', padding: '0.6rem', borderRadius: '8px', marginTop: '0.5rem' }}>Leave Ride</button>
                )}
              </div>
            )}
          </section>

          <section className="form-group">
            <label>Route</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" placeholder="Start" value={trip.origin} onChange={e => { setTrip(p => ({ ...p, origin: e.target.value })); markDirty(); }} style={{ flex: 1 }} />
              <button onClick={useCurrentLocation} style={{ background: 'none', border: 'none', fontSize: '1.2rem' }}>📍</button>
            </div>
            <input type="text" placeholder="Stop 1" value={trip.destination} onChange={e => { setTrip(p => ({ ...p, destination: e.target.value })); markDirty(); }} style={{ marginTop: '0.5rem' }} />
            {trip.destination.trim() && (
              <input type="text" placeholder="Stop 2 (optional)" value={waypoint3} onChange={e => { setWaypoint3(e.target.value); markDirty(); }} style={{ marginTop: '0.5rem' }} />
            )}
            {waypoint3.trim() && (
              <input type="text" placeholder="Stop 3 (optional)" value={waypoint4} onChange={e => { setWaypoint4(e.target.value); markDirty(); }} style={{ marginTop: '0.5rem' }} />
            )}
            {waypoint4.trim() && (
              <input type="text" placeholder="Stop 4 (optional)" value={waypoint5} onChange={e => { setWaypoint5(e.target.value); markDirty(); }} style={{ marginTop: '0.5rem' }} />
            )}
            <div className="mode-toggle" style={{ marginTop: '0.5rem' }}>
              <button className={!isRoundTrip ? 'active' : ''} onClick={() => { setIsRoundTrip(false); markDirty(); }}>One Way</button>
              <button className={isRoundTrip ? 'active' : ''} onClick={() => { setIsRoundTrip(true); markDirty(); }}>Round Trip</button>
            </div>
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <section className="form-group"><label>Voltage</label><input type="number" value={specs.voltage} onChange={e => { setSpecs(p => ({ ...p, voltage: parseFloat(e.target.value) || '' })); markDirty(); }} /></section>
            <section className="form-group"><label>Capacity (Ah)</label><input type="number" value={specs.capacityAh} onChange={e => { setSpecs(p => ({ ...p, capacityAh: parseFloat(e.target.value) || '' })); markDirty(); }} /></section>
          </div>
          <section className="form-group"><label>Rider Weight ({unitSystem === 'imperial' ? 'lbs' : 'kg'})</label><input type="number" value={riderWeightLbs} onChange={e => { setRiderWeightLbs(parseFloat(e.target.value) || ''); markDirty(); }} /></section>
          <section className="form-group"><label>Avg Speed ({unitSystem === 'imperial' ? 'mph' : 'km/h'})</label><input type="number" value={targetSpeedMph} onChange={e => { setTargetSpeedMph(parseFloat(e.target.value) || ''); markDirty(); }} /></section>
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.65rem', color: '#ff6600' }}>Environment</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
               <section className="form-group"><label>Temp</label><input type="number" value={ambientTempF} onChange={e => { setAmbientTempF(parseFloat(e.target.value) || ''); markDirty(); }} /></section>
               <section className="form-group"><label>Tire PSI</label><input type="number" placeholder="Auto" value={tirePressurePsi} onChange={e => { setTirePressurePsi(parseFloat(e.target.value) || ''); markDirty(); }} /></section>
            </div>
            <div className="mode-toggle" style={{ marginTop: '0.5rem' }}>
              <button className={tireType === 'road' ? 'active' : ''} onClick={() => { setTireType('road'); markDirty(); }}>Road</button>
              <button className={tireType === 'knobby' ? 'active' : ''} onClick={() => { setTireType('knobby'); markDirty(); }}>Knobby</button>
            </div>
          </div>
          <section className="form-group">
            <label>Drive Type</label>
            <div className="mode-toggle">
              <button className={controlType === 'pas' ? 'active' : ''} onClick={() => { setControlType('pas'); markDirty(); }}>PAS (1-5)</button>
              <button className={controlType === 'switch' ? 'active' : ''} onClick={() => { setControlType('switch'); markDirty(); }}>3 Speed Switch</button>
            </div>
          </section>
          {controlType === 'pas' ? (
            <section className="form-group"><label>PAS Level (1-5)</label><div className="mode-toggle">
              {[1, 2, 3, 4, 5].map(l => <button key={l} className={pasLevel === l ? 'active' : ''} onClick={() => { setPasLevel(l); markDirty(); }}>{l}</button>)}
            </div></section>
          ) : (
            <section className="form-group"><label>Speed Mode</label><div className="mode-toggle">
              <button className={mode === 'eco' ? 'active' : ''} onClick={() => { setMode('eco'); markDirty(); }}>Eco</button>
              <button className={mode === 'normal' ? 'active' : ''} onClick={() => { setMode('normal'); markDirty(); }}>Normal</button>
              <button className={mode === 'sport' ? 'active' : ''} onClick={() => { setMode('sport'); markDirty(); }}>Sport</button>
            </div></section>
          )}
          <section className="form-group">
            <label>Battery Entry</label>
            <div className="mode-toggle">
              <button className={batteryInputMode === 'percent' ? 'active' : ''} onClick={() => handleToggleBatteryMode('percent')}>%</button>
              <button className={batteryInputMode === 'voltage' ? 'active' : ''} onClick={() => handleToggleBatteryMode('voltage')}>V</button>
            </div>
            <input type="number" value={batteryInputMode === 'percent' ? startBattery : startVoltage} onChange={e => { if (batteryInputMode === 'percent') setStartBattery(parseFloat(e.target.value) || ''); else setStartVoltage(parseFloat(e.target.value) || ''); markDirty(); }} />
          </section>

          <section className="form-group" style={{ borderTop: '1px solid #333', paddingTop: '1rem', paddingBottom: '2rem', marginTop: '1rem' }}>
            <label style={{ color: '#ff6600', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Group Ride {canHostRide() ? <span style={{ color: '#34a853', fontSize: '0.6rem', marginLeft: '0.5rem' }}>✓ HOST</span> : isPro ? <span style={{ color: '#ff9900', fontSize: '0.6rem', marginLeft: '0.5rem' }}>✓ JOIN</span> : <span style={{ color: '#888', fontSize: '0.6rem', marginLeft: '0.5rem' }}>🔒 FREE</span>}</span>
              {!isPro && !canHostRide() && (
                 <button onClick={() => { setPaywallTier('host'); setShowGroupRidePaywall(true); }} style={{ padding: '0.2rem 0.6rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}>Unlock 30 Days</button>
              )}
            </label>
            {canHostRide() && hostTierExpiresAt && (
              <div style={{ fontSize: '0.6rem', color: '#666', marginTop: '0.2rem' }}>
                Host access expires {hostTierExpiresAt.toLocaleDateString()}
              </div>
            )}
            {!isPro && !canHostRide() && (
              <div style={{ fontSize: '0.6rem', color: '#ff9900', marginTop: '0.2rem' }}>
                You can join rides. Upgrade to HOST to create your own.
              </div>
            )}
            {!activeRide ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '1rem' }}>
                {canJoinRide() || canHostRide() ? (
                  <>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="text" placeholder="Ride Name" value={groupRideName} onChange={e => setGroupRideName(e.target.value)} style={{ flex: 1 }} />
                      <button onClick={createRide} style={{ padding: '0.4rem 1rem', background: '#ff6600', border: 'none', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}>Host</button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', color: '#888' }}>
                      <input type="checkbox" checked={isPublicRide} onChange={e => setIsPublicRide(e.target.checked)} style={{ width: 'auto' }} />
                      Public Visibility
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="text" placeholder="PIN" value={joinPin} onChange={e => setJoinPin(e.target.value)} style={{ width: '80px', textAlign: 'center' }} />
                      <button onClick={() => joinRide()} style={{ flex: 1, background: '#222', border: '1px solid #333', color: 'white', borderRadius: '4px' }}>Join via PIN</button>
                    </div>
                    {publicRides.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <label style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Public Rides Nearby</label>
                        {publicRides.map(r => (
                          <div key={r.id} onClick={() => joinRide(r.id)} style={{ padding: '0.8rem', background: '#1a1a1a', borderRadius: '8px', marginBottom: '0.5rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #333' }}>
                            <span style={{ color: 'white', fontSize: '0.9rem' }}>{r.name}</span>
                            <span style={{ color: '#34a853', fontSize: '0.7rem' }}>Join</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
                    <div style={{ fontSize: '1.1rem', color: 'white', fontWeight: 'bold', marginBottom: '0.5rem' }}>Group Rides</div>
                    <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '1rem', lineHeight: 1.4 }}>Join live rides or host your own to see friends on the map in real-time.</div>
                    <button onClick={() => { setPaywallTier('host'); setShowGroupRidePaywall(true); }} style={{ width: '100%', padding: '0.8rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Start 30-Day Pass</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #ff6600', position: 'relative', marginTop: '1rem' }}>
                <div style={{ color: '#ff6600', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Active Ride</div>
                <div style={{ color: 'white', fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.2rem' }}>{activeRide.name}</div>
                <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1rem' }}>PIN: <span style={{ letterSpacing: '2px', color: 'white' }}>{activeRide.pin}</span></div>
                <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>Participants ({rideParticipants.length})</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {rideParticipants.map(p => (
                    <span key={p.userId} style={{ background: '#333', padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', color: 'white' }}>{p.name} {p.userId === activeRide.leaderId && '👑'}</span>
                  ))}
                </div>
                {user?.uid === activeRide.creatorId && rideParticipants.length > 1 && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.6rem', color: '#888' }}>LEADER</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {rideParticipants.map(p => (
                        <button
                          key={p.userId}
                          onClick={() => setRideLeader(p.userId)}
                          style={{
                            padding: '0.25rem 0.6rem',
                            background: activeRide.leaderId === p.userId ? '#ff6600' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '0.65rem',
                            cursor: 'pointer',
                            fontWeight: activeRide.leaderId === p.userId ? 'bold' : 'normal'
                          }}
                        >
                          {activeRide.leaderId === p.userId ? '⭐ ' : ''}{p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {user?.uid === activeRide.creatorId && (
                  <button onClick={endRide} style={{ width: '100%', background: 'transparent', border: '1px solid #ff3333', color: '#ff3333', padding: '0.6rem', borderRadius: '8px', marginTop: '0.5rem' }}>End Ride for Everyone</button>
                )}
                {user?.uid !== activeRide.creatorId && (
                  <button onClick={leaveRide} style={{ width: '100%', background: 'transparent', border: '1px solid #888', color: '#bbb', padding: '0.6rem', borderRadius: '8px', marginTop: '0.5rem' }}>Leave Ride</button>
                )}
              </div>
            )}
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <button onClick={() => setPois([])} style={{ padding: '0.8rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '12px' }}>Clear Map</button>
            <button onClick={handleCalculate} style={{ padding: '0.8rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Update Route</button>
          </div>

          <section className="form-group" style={{ borderTop: '1px solid #333', paddingTop: '1rem', paddingBottom: '2rem', marginTop: '1rem' }}>
            <label style={{ color: '#ff6600', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Group Ride {canHostRide() ? <span style={{ color: '#34a853', fontSize: '0.6rem', marginLeft: '0.5rem' }}>✓ HOST</span> : isPro ? <span style={{ color: '#ff9900', fontSize: '0.6rem', marginLeft: '0.5rem' }}>✓ JOIN</span> : <span style={{ color: '#888', fontSize: '0.6rem', marginLeft: '0.5rem' }}>🔒 FREE</span>}</span>
              {!isPro && !canHostRide() && (
                 <button onClick={() => { setPaywallTier('host'); setShowGroupRidePaywall(true); }} style={{ padding: '0.2rem 0.6rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}>Unlock 30 Days</button>
              )}
            </label>
            {canHostRide() && hostTierExpiresAt && (
              <div style={{ fontSize: '0.6rem', color: '#666', marginTop: '0.2rem' }}>
                Host access expires {hostTierExpiresAt.toLocaleDateString()}
              </div>
            )}
            {!isPro && !canHostRide() && (
              <div style={{ fontSize: '0.6rem', color: '#ff9900', marginTop: '0.2rem' }}>
                You can join rides. Upgrade to HOST to create your own.
              </div>
            )}
            {!activeRide ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '1rem' }}>
                {canJoinRide() || canHostRide() ? (
                  <>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="text" placeholder="Ride Name" value={groupRideName} onChange={e => setGroupRideName(e.target.value)} style={{ flex: 1 }} />
                      <button onClick={createRide} style={{ padding: '0.4rem 1rem', background: '#ff6600', border: 'none', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}>Host</button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', color: '#888' }}>
                      <input type="checkbox" checked={isPublicRide} onChange={e => setIsPublicRide(e.target.checked)} style={{ width: 'auto' }} />
                      Public Visibility
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="text" placeholder="PIN" value={joinPin} onChange={e => setJoinPin(e.target.value)} style={{ width: '80px', textAlign: 'center' }} />
                      <button onClick={() => joinRide()} style={{ flex: 1, background: '#222', border: '1px solid #333', color: 'white', borderRadius: '4px' }}>Join via PIN</button>
                    </div>
                    {publicRides.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <label style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Public Rides Nearby</label>
                        {publicRides.map(r => (
                          <div key={r.id} onClick={() => joinRide(r.id)} style={{ padding: '0.8rem', background: '#1a1a1a', borderRadius: '8px', marginBottom: '0.5rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #333' }}>
                            <span style={{ color: 'white', fontSize: '0.9rem' }}>{r.name}</span>
                            <span style={{ color: '#34a853', fontSize: '0.7rem' }}>Join</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
                    <div style={{ fontSize: '1.1rem', color: 'white', fontWeight: 'bold', marginBottom: '0.5rem' }}>Group Rides</div>
                    <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '1rem', lineHeight: 1.4 }}>Join live rides or host your own to see friends on the map in real-time.</div>
                    <button onClick={() => { setPaywallTier('host'); setShowGroupRidePaywall(true); }} style={{ width: '100%', padding: '0.8rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Start 30-Day Pass</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #ff6600', position: 'relative', marginTop: '1rem' }}>
                <div style={{ color: '#ff6600', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Active Ride</div>
                <div style={{ color: 'white', fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.2rem' }}>{activeRide.name}</div>
                <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1rem' }}>PIN: <span style={{ letterSpacing: '2px', color: 'white' }}>{activeRide.pin}</span></div>
                <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>Participants ({rideParticipants.length})</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {rideParticipants.map(p => (
                    <span key={p.userId} style={{ background: '#333', padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', color: 'white' }}>{p.name} {p.userId === activeRide.leaderId && '👑'}</span>
                  ))}
                </div>
                {user?.uid === activeRide.creatorId && rideParticipants.length > 1 && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.6rem', color: '#888' }}>LEADER</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {rideParticipants.map(p => (
                        <button
                          key={p.userId}
                          onClick={() => setRideLeader(p.userId)}
                          style={{
                            padding: '0.25rem 0.6rem',
                            background: activeRide.leaderId === p.userId ? '#ff6600' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '0.65rem',
                            cursor: 'pointer',
                            fontWeight: activeRide.leaderId === p.userId ? 'bold' : 'normal'
                          }}
                        >
                          {activeRide.leaderId === p.userId ? '⭐ ' : ''}{p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {user?.uid === activeRide.creatorId && (
                  <button onClick={endRide} style={{ width: '100%', background: 'transparent', border: '1px solid #ff3333', color: '#ff3333', padding: '0.6rem', borderRadius: '8px', marginTop: '0.5rem' }}>End Ride for Everyone</button>
                )}
                {user?.uid !== activeRide.creatorId && (
                  <button onClick={leaveRide} style={{ width: '100%', background: 'transparent', border: '1px solid #888', color: '#bbb', padding: '0.6rem', borderRadius: '8px', marginTop: '0.5rem' }}>Leave Ride</button>
                )}
              </div>
            )}
          </section>

          {metrics && (
            <div ref={metricsCardRef} className="card metrics-card" style={{ marginTop: '1.5rem', borderLeft: '4px solid #ff6600', padding: '1.5rem', background: '#1a1a1a', borderRadius: '16px' }}>
              <div style={{ color: '#ff6600', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase' }}>Estimated Metrics</div>
              <div style={{ color: '#666', fontSize: '0.7rem', marginBottom: '1rem' }}>SELECT ROUTE</div>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {response!.routes.map((_r, idx) => {
                  const routeColors = ['#ff6600', '#34a853', '#9c27b0'];
                  return (
                    <button 
                      key={idx} 
                      onClick={() => { setSelectedRouteIndex(idx); calculateMetrics(response!, idx); }}
                      style={{ 
                        flex: 1, padding: '0.6rem', borderRadius: '8px', border: selectedRouteIndex === idx ? `2px solid ${routeColors[idx]}` : '1px solid #444',
                        background: selectedRouteIndex === idx ? routeColors[idx] : '#222',
                        color: 'white', fontWeight: 'bold', fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Route {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white' }}>Battery Left: {metrics.batteryPercentUsed.toFixed(1)}%</div>
              <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Est. End Voltage: {metrics.endingVoltage?.toFixed(1)}V</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>Travel Time:</span><span style={{ fontWeight: 'bold' }}>{Math.floor(metrics.durationMin/60)}h {Math.round(metrics.durationMin%60)}m</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>Distance:</span><span style={{ fontWeight: 'bold' }}>{metrics.distanceMiles.toFixed(1)} mi</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>Elevation Gain:</span><span style={{ fontWeight: 'bold' }}>{metrics.elevationGainFeet.toFixed(0)} ft</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>🌬️ Wind:</span>
                  <span style={{ color: '#4caf50', fontWeight: 'bold' }}>
                    {metrics.windConditions?.speed.toFixed(1)} mph ({metrics.windConditions && metrics.windConditions.headwindComponent > 0 ? 'Headwind' : 'Tailwind'})
                  </span>
                </div>
              </div>

              <div style={{ textAlign: 'center', color: '#666', fontSize: '0.8rem', margin: '1rem 0' }}>Wh/mile: {(metrics.estimatedWh / metrics.distanceMiles).toFixed(1)}</div>

              <button 
                onClick={() => {
                   const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(trip.origin)}&destination=${encodeURIComponent(trip.destination)}&travelmode=bicycling`;
                   window.open(url, '_blank');
                }} 
                style={{ width: '100%', padding: '1rem', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 900, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                🚀 Open Maps
              </button>
              
              <button onClick={() => {
                if (isPro) {
                  setShowSharePreview(true);
                } else {
                  setPaywallTier('pro');
                  setShowGroupRidePaywall(true);
                }
              }} style={{ width: '100%', padding: '1rem', background: isPro ? '#333' : '#444', color: isPro ? 'white' : '#888', border: 'none', borderRadius: '12px', fontWeight: 900, marginBottom: '1.5rem', cursor: 'pointer' }}>
                Save Image {isPro ? '' : '🔒 (PRO)'}
              </button>

              <button onClick={startNavigation} style={{ width: '100%', padding: '1.2rem', background: 'linear-gradient(to bottom, #ff8800, #ff6600)', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 900, fontSize: '1.2rem', boxShadow: '0 4px 15px rgba(255,102,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                🏁 START TRIP
              </button>
            </div>
          )}
          <AdBanner isPro={isPro} />
        </aside>

        <main style={{ flex: 1, position: 'relative' }}>
          {isNavigating && response && (
            <div style={{ position: 'fixed', top: '5.5rem', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '500px', zIndex: 10000, background: '#1a1a1a', border: '2px solid #ff6600', borderRadius: '20px', padding: '1.2rem', boxShadow: '0 10px 40px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                  <div style={{ background: '#333', padding: '0.6rem', borderRadius: '12px', fontSize: '1.5rem' }}>
                    {response.routes[selectedRouteIndex].legs[currentLegIndex].steps[currentStepIndex].instructions.toLowerCase().includes('left') ? '⬅️' : 
                     response.routes[selectedRouteIndex].legs[currentLegIndex].steps[currentStepIndex].instructions.toLowerCase().includes('right') ? '➡️' : '⬆️'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#ff6600', fontWeight: 900, textTransform: 'uppercase' }}>In {distToNextStep || '---'}</div>
                    <div style={{ color: 'white', fontSize: '1.1rem', fontWeight: 'bold', lineHeight: '1.2' }} dangerouslySetInnerHTML={{ __html: response.routes[selectedRouteIndex].legs[currentLegIndex].steps[currentStepIndex].instructions }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => setVoiceEnabled(!voiceEnabled)} style={{ background: '#333', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.2rem' }}>{voiceEnabled ? '🔊' : '🔇'}</button>
                  <button onClick={stopNavigation} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                </div>
              </div>
              {metrics && (
                <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid #333', paddingTop: '0.8rem' }}>
                   <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '0.6rem', color: '#888' }}>BATTERY</div><div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#34a853' }}>{metrics.batteryPercentUsed.toFixed(0)}%</div></div>
                   <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '0.6rem', color: '#888' }}>SPEED</div><div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white' }}>{targetSpeedMph}mph</div></div>
                   <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '0.6rem', color: '#888' }}>REMAINING</div><div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white' }}>{Math.round(metrics.durationMin)}min</div></div>
                </div>
              )}
            </div>
          )}

          <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <button onClick={() => searchPOIs('charging')} style={{ padding: '1rem 1.5rem', background: 'rgba(20,20,20,0.95)', color: 'white', border: '1px solid #333', borderRadius: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.6rem', boxShadow: '0 8px 30px rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)' }}><span style={{ color: '#ff6600', fontSize: '1.2rem' }}>⚡</span> Chargers</button>
            <button onClick={() => searchPOIs('cafe')} style={{ padding: '1rem 1.5rem', background: 'rgba(20,20,20,0.95)', color: 'white', border: '1px solid #333', borderRadius: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.6rem', boxShadow: '0 8px 30px rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)' }}><span style={{ color: '#ffcc00', fontSize: '1.2rem' }}>☕</span> Cafes</button>
          </div>
          {isLoaded ? (
            <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={center} zoom={10} onLoad={onMapLoad}>
              {trip.origin && trip.destination && isLoading && !response && (() => {
                const wps = trip.waypoints?.filter(w => w.trim()).map(w => ({ location: w, stopover: true } as google.maps.DirectionsWaypoint)) || [];
                const travelMode = wps.length > 0 ? google.maps.TravelMode.DRIVING : google.maps.TravelMode.BICYCLING;
                return <DirectionsService options={{ origin: trip.origin, destination: trip.destination, waypoints: wps.length > 0 ? wps : undefined, travelMode, provideRouteAlternatives: true }} callback={directionsCallback} />
              })()}
              {response && (
                <>
                  <DirectionsRenderer options={{ directions: response, routeIndex: selectedRouteIndex }} />
                  {/* Alternative route polylines (clickable) */}
                  {(() => {
                    const res = response!;
                    return res.routes.map((r, i) => {
                      if (i === selectedRouteIndex) return null;
                      const routeColors = ['#34a853', '#9c27b0'];
                      return (
                        <Polyline
                          key={`alt-route-${i}`}
                          path={r.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }))}
                          options={{
                            strokeColor: routeColors[i - (i > selectedRouteIndex ? 1 : 0)],
                            strokeOpacity: 0.7,
                            strokeWeight: 4,
                            clickable: true,
                            zIndex: 1,
                          }}
                          onClick={() => {
                            setSelectedRouteIndex(i);
                            calculateMetrics(res, i);
                          }}
                        />
                      );
                    });
                  })()}
                </>
              )}
              {metrics?.deathPoint && <Marker position={metrics.deathPoint} label="☠️" />}
              {pois.map(p => (
                <Marker key={p.id} position={p.position} onClick={() => setSelectedPoi(p)} label={p.type === 'charging' ? { text: '⚡', color: 'white', fontWeight: 'bold' } : undefined} icon={{ url: p.type === 'charging' ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }} />
              ))}
              
              {/* Ride Participants */}
              {rideParticipants.map(p => (
                <Marker key={p.userId} position={{ lat: p.lat, lng: p.lng }} label={{ text: p.name, color: 'white', fontSize: '12px', fontWeight: 'bold', className: 'rider-label' }} icon={{ path: google.maps.SymbolPath.CIRCLE, fillColor: activeRide?.leaderId === p.userId ? '#34a853' : '#ff6600', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2, scale: 8 }} />
              ))}

              {/* Host's planned route (visible to all participants) */}
              {rideRoutePath.length > 1 && (
                <Polyline path={rideRoutePath} options={{ strokeColor: '#4285F4', strokeOpacity: 0.8, strokeWeight: 5 }} />
              )}

              {/* Route stop markers (Start, Stop 3, Stop 4, Stop 5, End) */}
              {rideRouteStops.map((s, i) => (
                <Marker
                  key={`stop-${i}`}
                  position={{ lat: s.lat, lng: s.lng }}
                  label={{ text: s.label, color: '#4285F4', fontSize: '11px', fontWeight: 'bold', className: 'rider-label' }}
                  icon={{ path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, fillColor: '#4285F4', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2, scale: 5 }}
                />
              ))}

              {activeRide?.leaderTrail && activeRide.leaderTrail.length > 1 && (
                <Polyline path={activeRide.leaderTrail} options={{ strokeColor: '#ff6600', strokeOpacity: 0.9, strokeWeight: 6 }} />
              )}

              {userLocation && (
                <Marker 
                  position={userLocation} 
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: "#4285F4",
                    fillOpacity: 1,
                    strokeColor: "white",
                    strokeWeight: 2,
                  }}
                />
              )}
              {selectedPoi && <InfoWindow position={selectedPoi.position} onCloseClick={() => setSelectedPoi(null)}><div style={{ color: 'black' }}><strong>{selectedPoi.name}</strong><br/>{selectedPoi.address}</div></InfoWindow>}
            </GoogleMap>
          ) : <div style={{ color: 'white', padding: '2rem' }}>Loading Maps...</div>}
        </main>
      </div>
      <div className="persistent-controls" style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 2000, display: 'flex', gap: '1rem', background: 'rgba(20,20,20,0.9)', padding: '0.8rem 1.5rem', borderRadius: '40px', border: '1px solid #333' }}>
        <button onClick={useCurrentLocation} style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: 'none', width: '45px', height: '45px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', cursor: 'pointer' }}>
          📍
        </button>
        <button 
          onClick={() => { 
            if (showMobileMenu) {
              if (settingsDirty && trip.origin && trip.destination) {
                handleCalculate();
                setShowMobileMenu(false);
              } else {
                setShowMobileMenu(false);
              }
            } else {
              setShowMobileMenu(true);
            }
          }} 
          style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '25px', fontWeight: 'bold' }}
        >
          {!showMobileMenu ? (metrics && !settingsDirty ? '📊 Stats' : '🏁 Start Here') : (settingsDirty ? (metrics ? '🔄 Update Trip' : '🚀 Find Route') : '🗺️ Map')}
        </button>
      </div>
      {showSharePreview && metrics && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', padding: '10px', overflow: 'auto' }}>
          <div style={{ transform: 'scale(0.6)', transformOrigin: 'top center', marginBottom: '-280px' }}>
          <div ref={shareCardRef} style={{ width: '500px', height: '800px', background: '#0a0a0a', padding: '2.5rem', display: 'flex', flexDirection: 'column', borderRadius: '40px', border: '1px solid #333', position: 'relative' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><h2 style={{ color: '#ff6600', fontStyle: 'italic', fontSize: '2.1rem', fontWeight: 900, margin: 0 }}>RANGE ANXIETY</h2><p style={{ color: '#666', fontSize: '0.75rem', fontWeight: 'bold' }}>Trip Report • {new Date().toLocaleDateString()}</p></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white' }}>{specs.voltage}V {specs.capacityAh}Ah</div><div style={{ fontSize: '0.8rem', color: '#ff6600', fontWeight: 'bold' }}>{bikeSearchQuery || "Custom"}</div></div>
             </div>
             {mapSnapshot && <div style={{ flex: 1, margin: '1.5rem 0', borderRadius: '24px', overflow: 'hidden', border: '1px solid #333' }}><img src={mapSnapshot} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Map" /></div>}
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
                <div style={{ background: '#111', padding: '1rem', borderRadius: '20px', border: '1px solid #222', textAlign: 'center' }}><div style={{ fontSize: '0.55rem', color: '#ff6600', fontWeight: 800, textTransform: 'uppercase' }}>Battery Left</div><div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'white' }}>{metrics.batteryPercentUsed.toFixed(0)}%</div><div style={{ fontSize: '0.8rem', color: '#ff6600', fontWeight: 700 }}>{metrics.endingVoltage?.toFixed(1)}V</div></div>
                <div style={{ background: '#111', padding: '1rem', borderRadius: '20px', border: '1px solid #222', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}><div style={{ fontSize: '0.55rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Distance</div><div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'white' }}>{metrics.distanceMiles.toFixed(1)}mi</div></div>
                <div style={{ background: '#111', padding: '1rem', borderRadius: '20px', border: '1px solid #222', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}><div style={{ fontSize: '0.55rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Efficiency</div><div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'white' }}>{(metrics.estimatedWh / metrics.distanceMiles).toFixed(0)}<span style={{ fontSize: '0.8rem' }}>Wh/mi</span></div></div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '15px', border: '1px solid #222', textAlign: 'center' }}><div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Start Battery</div><div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>{startBattery}% • {startVoltage}V</div></div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '15px', border: '1px solid #222', textAlign: 'center' }}><div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Elevation</div><div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>+{metrics.elevationGainFeet.toFixed(0)}ft</div></div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '15px', border: '1px solid #222', textAlign: 'center' }}><div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Wind</div><div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>{Math.abs(Math.round(metrics.windConditions?.speed || 0))}mph 🌬️</div></div>
             </div>
             <div style={{ fontSize: '1.1rem', color: 'white', textAlign: 'center', margin: '1rem 0' }}>{trip.origin.split(',')[0]} <span style={{ color: '#ff6600' }}>➔</span> {trip.destination.split(',')[0]}</div>
             <div style={{ textAlign: 'center', marginTop: 'auto' }}><div style={{ color: '#ff6600', fontWeight: 900, fontSize: '1.3rem' }}>rangeanxiety.app</div><p style={{ color: '#444', fontSize: '0.6rem' }}>* Estimates only. Actual range may vary.</p></div>
          </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => setShowSharePreview(false)} style={{ padding: '1rem 2rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Cancel</button>
            <button onClick={downloadShareCard} style={{ padding: '1rem 2rem', background: '#444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Save PNG</button>
            <button onClick={shareToCommunity} style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>Post Feed</button>
          </div>
        </div>
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}
      {showGroupRidePaywall && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #ff6600', borderRadius: '24px', padding: '2.5rem', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{paywallTier === 'host' ? '🏍️' : '👥'}</div>
            <h2 style={{ color: '#ff6600', fontSize: '1.4rem', marginBottom: '0.5rem' }}>
              {paywallTier === 'host' ? 'Host Group Rides' : 'Join Group Rides'}
            </h2>
            <p style={{ color: '#aaa', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              {paywallTier === 'host'
                ? 'Create and host group rides with live rider tracking. Includes all PRO features.'
                : 'Join live group rides and see riders on the map in real time.'}
            </p>
            <div style={{ background: '#222', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'white' }}>{paywallTier === 'host' ? '$9.99' : '$4.99'}</div>
              <div style={{ color: '#888', fontSize: '0.7rem' }}>{paywallTier === 'host' ? '30 days of host access' : 'one-time · lifetime access'}</div>
              <div style={{ color: '#888', fontSize: '0.7rem', marginTop: '0.3rem' }}>• Join live group rides</div>
              {paywallTier === 'host' && <div style={{ color: '#888', fontSize: '0.7rem' }}>• Host your own rides</div>}
              {paywallTier === 'host' && <div style={{ color: '#888', fontSize: '0.7rem' }}>• Live rider map tracking</div>}
              {paywallTier === 'host' && <div style={{ color: '#888', fontSize: '0.7rem' }}>• All PRO features included</div>}
              {paywallTier === 'pro' && <div style={{ color: '#888', fontSize: '0.7rem' }}>• Remove all ads</div>}
              {paywallTier === 'pro' && <div style={{ color: '#888', fontSize: '0.7rem' }}>• Charger search on map</div>}
            </div>
            {isPro && paywallTier === 'host' && (
              <div style={{ background: 'rgba(255,153,0,0.1)', padding: '0.6rem', borderRadius: '8px', marginBottom: '1rem', color: '#ff9900', fontSize: '0.75rem' }}>
                You're already PRO! Upgrade to HOST for just $9.99.
              </div>
            )}
            <button onClick={paywallTier === 'host' ? checkoutHostTier : checkoutProTier} style={{ width: '100%', padding: '1rem', background: 'linear-gradient(45deg, #ff6600, #ff9900)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', marginBottom: '0.8rem' }}>
              {paywallTier === 'host' ? 'Unlock Host — $9.99' : 'Get PRO — $4.99'}
            </button>
            {paywallTier === 'host' && !isPro && (
              <button onClick={() => { setPaywallTier('pro'); }} style={{ width: '100%', padding: '0.8rem', background: '#333', color: '#ff9900', border: '1px solid #ff9900', borderRadius: '12px', cursor: 'pointer', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                Just want to join rides? PRO — $4.99
              </button>
            )}
            {paywallTier === 'pro' && (
              <button onClick={() => { setPaywallTier('host'); }} style={{ width: '100%', padding: '0.8rem', background: '#333', color: '#ff6600', border: '1px solid #ff6600', borderRadius: '12px', cursor: 'pointer', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                Want to host rides? HOST — $9.99
              </button>
            )}
            <button onClick={() => setShowGroupRidePaywall(false)} style={{ width: '100%', padding: '0.8rem', background: 'none', color: '#888', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '0.8rem' }}>
              Maybe Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapHome;
