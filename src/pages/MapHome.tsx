import { useState, useCallback, useRef, useEffect } from 'react'
import ReactGA from "react-ga4"
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker, InfoWindow, Polyline } from '@react-google-maps/api'
import axios from 'axios'
import { toPng } from 'html-to-image'
import { auth, db, storage } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, onSnapshot, query, where, deleteDoc, getDocs, updateDoc, arrayUnion } from 'firebase/firestore'
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
  returnWaypoints: string[];
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
  image?: string;
}

const STANDARD_BIKES: SavedBike[] = [
  // --- High Performance E-Motos & Motorcycles ---
  { name: "Surron Light Bee X (2025)", specs: { voltage: 60, capacityAh: 40, motorWatts: 8000, bikeWeightLbs: 125 } },
  { name: "Surron Ultra Bee", specs: { voltage: 74, capacityAh: 55, motorWatts: 12500, bikeWeightLbs: 187 } },
  { name: "Surron Storm Bee", specs: { voltage: 90, capacityAh: 55, motorWatts: 22500, bikeWeightLbs: 280 } },
  { name: "Talaria Sting R MX4", specs: { voltage: 60, capacityAh: 45, motorWatts: 8000, bikeWeightLbs: 145 } },
  { name: "Talaria Sting MX5 Pro", specs: { voltage: 72, capacityAh: 40, motorWatts: 13400, bikeWeightLbs: 167 } },
  { name: "Talaria X3 (XXX)", specs: { voltage: 60, capacityAh: 40, motorWatts: 6500, bikeWeightLbs: 125 } },
  { name: "Talaria Dragon", specs: { voltage: 88, capacityAh: 60, motorWatts: 28000, bikeWeightLbs: 220 } },
  { name: "Stark Varg Alpha", specs: { voltage: 360, capacityAh: 18, motorWatts: 60000, bikeWeightLbs: 260 } },
  { name: "Zero SR/F", specs: { voltage: 102, capacityAh: 170, motorWatts: 82000, bikeWeightLbs: 500 } },
  { name: "Zero DSR/X", specs: { voltage: 102, capacityAh: 170, motorWatts: 75000, bikeWeightLbs: 545 } },
  { name: "LiveWire One", specs: { voltage: 350, capacityAh: 44, motorWatts: 75000, bikeWeightLbs: 562 } },
  { name: "Onyx RCR", specs: { voltage: 72, capacityAh: 41, motorWatts: 5000, bikeWeightLbs: 145 } },

  // --- Premium & Lightweight E-Bikes ---
  { name: "Specialized Turbo Levo (Gen 3)", specs: { voltage: 36, capacityAh: 19.4, motorWatts: 565, bikeWeightLbs: 50 } },
  { name: "Specialized Turbo Vado 5.0", specs: { voltage: 36, capacityAh: 19.7, motorWatts: 565, bikeWeightLbs: 58 } },
  { name: "Trek Fuel EXe", specs: { voltage: 50, capacityAh: 7.2, motorWatts: 250, bikeWeightLbs: 41 } },
  { name: "Giant Reign E+", specs: { voltage: 36, capacityAh: 22.2, motorWatts: 250, bikeWeightLbs: 54 } },

  // --- Commuter & Everyday Utility ---
  { name: "Aventon Aventure.3", specs: { voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 77 } },
  { name: "Rad Power Radster Road", specs: { voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 75 } },
  { name: "Lectric XP 3.0", specs: { voltage: 48, capacityAh: 10.4, motorWatts: 500, bikeWeightLbs: 64 } },
  { name: "Ride1Up Revv 1 DRT", specs: { voltage: 52, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 93 } },
  { name: "Super73-S2 Legacy", specs: { voltage: 48, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 73 } },

  // --- ELECTRIC SCOOTERS ---
  { name: "Segway Ninebot Max G2", specs: { voltage: 36, capacityAh: 15.3, motorWatts: 450, bikeWeightLbs: 53 } },
  { name: "Apollo City Pro 2024", specs: { voltage: 48, capacityAh: 20, motorWatts: 1000, bikeWeightLbs: 65 } },
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
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const metricsCardRef = useRef<HTMLDivElement>(null);

  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [specs, setSpecs] = useState<BikeSpecs>({ voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 65 });
  const [riderWeightLbs, setRiderWeightLbs] = useState<number | ''>(200);
  const [ambientTempF, setAmbientTempF] = useState<number | ''>(70);
  const [tireType, setTireType] = useState<'road' | 'knobby'>('road');
  const [tirePressurePsi, setTirePressurePsi] = useState<number | ''>(''); 

  const [trip, setTrip] = useState<TripDetails>({ origin: '', destination: '', waypoints: [], returnWaypoints: [] });
  const [mode, setMode] = useState<'eco' | 'normal' | 'sport'>('normal');
  const [pasLevel, setPasLevel] = useState<number>(3);
  const [ridingStyle, setRidingStyle] = useState<'relaxed' | 'aggressive'>('relaxed');
  const [controlType, setControlType] = useState<'switch' | 'pas'>('pas');
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [isCustomReturn, setIsCustomReturn] = useState(false);
  const [targetSpeedMph, setTargetSpeedMph] = useState<number | ''>(20);
  
  const [batteryInputMode, setBatteryInputMode] = useState<'percent' | 'voltage'>('percent'); 
  const [capacityInputMode, setCapacityInputMode] = useState<'ah' | 'wh'>('ah');
  const [startBattery, setStartBattery] = useState<number | ''>(100);
  const [startVoltage, setStartVoltage] = useState<number | ''>(54.6);
  
  const [response, setResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rideError, setRideError] = useState<string | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [poiCategory, setPoiCategory] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  
  const [showSharePreview, setShowSharePreview] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [isHostTier, setIsHostTier] = useState(false);
  const [hostTierExpiresAt, setHostTierExpiresAt] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

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
  const [pendingBikeAutoSelect, setPendingBikeAutoSelect] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(true);

  // Group Rides
  const [activeRide, setActiveRide] = useState<GroupRide | null>(null);
  const [publicRides, setPublicRides] = useState<GroupRide[]>([]);
  const [selectedPublicRide, setSelectedPublicRide] = useState<GroupRide | null>(null);
  const [rideParticipants, setRideParticipants] = useState<Participant[]>([]);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [groupRideName, setGroupRideName] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [isPublicRide, setIsPublicRide] = useState(true);
  const [lastUploadedLocation, setLastUploadedLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const lastUploadedLocRef = useRef<google.maps.LatLngLiteral | null>(null);

  // Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthInitialized(true);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserData(data);
            setIsPro(data.isPro || false);
            setIsHostTier(data.isHostTier || false);
            setHostTierExpiresAt(data.hostTierExpiresAt?.toMillis() || null);
            setUsername(data.username || '');
            if (data.bikes) setSavedBikes(data.bikes);
          }
        } catch (e) { console.error("Firestore error:", e); }
      } else {
        setUserData(null);
        setIsPro(false);
        setIsHostTier(false);
        const local = localStorage.getItem('ebike-saved-bikes');
        if (local) setSavedBikes(JSON.parse(local));
      }
    });
    return () => unsubscribe();
  }, []);

  // Onboarding
  useEffect(() => {
    if (authInitialized) {
      const hasVisited = localStorage.getItem('ebike_portal_visited');
      if (!hasVisited && !user) setShowWelcomeModal(true);
      if (user || hasVisited) localStorage.setItem('ebike_portal_visited', 'true');
    }
  }, [authInitialized, user]);

  // Default Map to Home
  useEffect(() => {
    if (userData?.homeRegion && mapRef.current) {
      const coords = STATE_COORDINATES[userData.homeRegion];
      if (coords) {
        mapRef.current.panTo(coords);
        mapRef.current.setZoom(8);
      }
    }
  }, [userData?.homeRegion]);

  // Auto-scroll to Stats
  useEffect(() => {
    if (showMobileMenu && metrics && metricsCardRef.current) {
      setTimeout(() => {
        metricsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [showMobileMenu, metrics]);

  // Load Route from External
  useEffect(() => {
    const savedRoute = localStorage.getItem('ebike_load_route');
    if (savedRoute) {
      try {
        const data = JSON.parse(savedRoute);
        setTrip({ origin: data.origin || "", destination: data.destination || "", waypoints: data.waypoints || [], returnWaypoints: data.returnWaypoints || [] });
        setIsRoundTrip(data.isRoundTrip || false);
        setIsCustomReturn(data.isCustomReturn || false);
        setShowMobileMenu(true);
        setPendingBikeAutoSelect(true);
        localStorage.removeItem('ebike_load_route');
        if (data.origin && data.destination) setTimeout(() => handleCalculate(), 1000);
      } catch (e) { console.error("Failed to load external route", e); }
    }
  }, []);

  // Bike Auto-Selection
  useEffect(() => {
    if (pendingBikeAutoSelect && authInitialized) {
      if (savedBikes.length > 0) {
        loadBike(savedBikes[0]);
        setPendingBikeAutoSelect(false);
        setTimeout(() => handleCalculate(), 500);
      } else if (authInitialized) {
        setPendingBikeAutoSelect(false);
      }
    }
  }, [pendingBikeAutoSelect, savedBikes, authInitialized]);

  // Map Snapshot
  useEffect(() => {
    if (!response || !response.routes[selectedRouteIndex]) return;
    const polyline = response.routes[selectedRouteIndex].overview_polyline;
    const points = (polyline as any).points || polyline;
    const proxyUrl = `/api/static-map?polyline=${encodeURIComponent(points)}`;
    const fetchSnapshot = async () => {
      try {
        const resp = await fetch(proxyUrl);
        if (!resp.ok) return;
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onloadend = () => setMapSnapshot(reader.result as string);
        reader.readAsDataURL(blob);
      } catch (e) { console.error("Static Map fetch failed", e); }
    };
    fetchSnapshot();
  }, [response, selectedRouteIndex]);

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
    if (newMode === 'voltage') {
      const p = Number(startBattery) / 100;
      const v = min + (p * (max - min));
      setStartVoltage(Number(v.toFixed(1)));
    } else {
      const v = Number(startVoltage);
      const p = ((v - min) / (max - min)) * 100;
      setStartBattery(Math.min(100, Math.max(0, Number(p.toFixed(0)))));
    }
    setBatteryInputMode(newMode);
  };

  const markDirty = () => { if (!settingsDirty) setSettingsDirty(true); };

  const handleCalculate = () => { 
    if (!trip.origin || !trip.destination) return; 
    setIsLoading(true); setResponse(null); setMetrics(null); setError(null); setPois([]); 
    setSettingsDirty(false); 
  };

  const loadBike = (bike: SavedBike) => {
    setSpecs(bike.specs);
    setBikeSearchQuery(bike.name);
    setShowBikeResults(false);
    if (bike.specs.voltage) setStartVoltage(getBatteryLevels(Number(bike.specs.voltage)).max);
    setControlType(Number(bike.specs.voltage) >= 60 || bike.name.includes("Surron") || bike.name.includes("Talaria") || bike.name.includes("Onyx") ? 'switch' : 'pas');
    markDirty();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTrip(prev => ({ ...prev, [name]: value }));
    markDirty();
  };

  const handleSpecChange = (name: keyof BikeSpecs, value: string) => {
    const val = value === '' ? '' : parseFloat(value);
    setSpecs(prev => ({ ...prev, [name]: isNaN(Number(val)) ? '' : val }));
    markDirty();
  };

  const useCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setTrip(prev => ({ ...prev, origin: `${pos.coords.latitude},${pos.coords.longitude}` }));
        markDirty();
      });
    }
  };

  const directionsCallback = (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
    if (status === 'OK' && result) { 
      setResponse(result); 
      setSelectedRouteIndex(0);
      calculateMetrics(result, 0); 
    } else { setError(`Maps Error: ${status}`); setIsLoading(false); }
  };

  const calculateMetrics = async (result: google.maps.DirectionsResult, routeIndex: number = 0) => {
    try {
      const route = result.routes[routeIndex];
      let totalDistMeters = 0;
      route.legs.forEach(leg => totalDistMeters += (leg.distance?.value || 0));
      const distMiles = totalDistMeters / 1609.34;
      const path = route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
      
      let gainFeet = 0;
      let lossFeet = 0;
      try {
        const encodedPath = google.maps.geometry.encoding.encodePath(route.overview_path);
        const elevResp = await axios.post('/api/elevation', { encodedPath, samples: 100 });
        if (elevResp.data?.gain) { gainFeet = elevResp.data.gain; lossFeet = elevResp.data.loss || 0; }
      } catch (e) { console.warn("Elevation API failed", e); }

      let windSpeed = 0, windDir = 0, headwindMph = 0;
      try {
        const weatherResp = await axios.get(`/api/weather?lat=${path[0].lat}&lng=${path[0].lng}`);
        windSpeed = weatherResp.data.wind_speed;
        windDir = weatherResp.data.wind_deg;
        // Simple bearing calculation
        const y = Math.sin((path[path.length-1].lng - path[0].lng) * Math.PI / 180) * Math.cos(path[path.length-1].lat * Math.PI / 180);
        const x = Math.cos(path[0].lat * Math.PI / 180) * Math.sin(path[path.length-1].lat * Math.PI / 180) - Math.sin(path[0].lat * Math.PI / 180) * Math.cos(path[path.length-1].lat * Math.PI / 180) * Math.cos((path[path.length-1].lng - path[0].lng) * Math.PI / 180);
        const routeBearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        headwindMph = windSpeed * Math.cos((windDir - routeBearing) * Math.PI / 180);
      } catch (e) { console.warn("Weather API failed", e); }

      // Core Physics Calculation
      const bikeWeight = Number(specs.bikeWeightLbs), riderWeight = Number(riderWeightLbs), targetSpeed = Number(targetSpeedMph);
      const massKg = (bikeWeight + riderWeight) * 0.453592;
      const velocityMps = targetSpeed * 0.44704;
      const Crr = tireType === 'road' ? 0.007 : 0.015;
      const ForceRolling = Crr * massKg * 9.81;
      const ForceDrag = 0.5 * 1.2 * 0.55 * Math.pow(Math.max(0.1, velocityMps + headwindMph * 0.44704), 2);
      
      const motorEff = controlType === 'switch' ? (mode === 'eco' ? 0.85 : 0.80) : 0.82;
      const totalWhRaw = capacityInputMode === 'ah' ? (Number(specs.voltage) * Number(specs.capacityAh)) : Number(specs.capacityAh);
      const totalWhUsable = totalWhRaw * 0.92;
      
      const TotalPowerWatts = (ForceRolling + ForceDrag) * velocityMps;
      const MotorPowerWatts = Math.max(0, TotalPowerWatts - (controlType === 'pas' ? (150 - (pasLevel-1)*30) : 0));
      const WhPerMile = (MotorPowerWatts / velocityMps) * (1609.34 / 3600) / motorEff;
      const estimatedWh = (distMiles * WhPerMile) + ((massKg * 9.81 * gainFeet * 0.3048) / 3600 / motorEff);

      const minV = getBatteryLevels(Number(specs.voltage)).min, maxV = getBatteryLevels(Number(specs.voltage)).max;
      const startWh = batteryInputMode === 'percent' ? (totalWhUsable * (Number(startBattery)/100)) : (totalWhUsable * ((Number(startVoltage)-minV)/(maxV-minV)));
      const batteryPercentRemaining = ((startWh - estimatedWh) / totalWhUsable) * 100;

      let deathPoint: google.maps.LatLngLiteral | undefined = undefined;
      if (batteryPercentRemaining <= 0) {
        const avgWhPerMile = estimatedWh / distMiles;
        let cumulativeWh = 0;
        for (let i = 1; i < path.length; i++) {
          const d = google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(path[i-1]), new google.maps.LatLng(path[i])) / 1609.34;
          cumulativeWh += d * avgWhPerMile;
          if (cumulativeWh >= startWh) { deathPoint = path[i]; break; }
        }
      }

      setMetrics({
        distanceMiles: distMiles,
        durationMin: distMiles / (targetSpeed || 15) * 60,
        elevationGainFeet: gainFeet, elevationLossFeet: lossFeet,
        estimatedWh, batteryPercentUsed: Math.max(0, batteryPercentRemaining),
        recommendedSpeedMph: 20, deathPoint,
        windConditions: { speed: windSpeed, direction: windDir, headwindComponent: headwindMph }
      });
      setIsLoading(false);
    } catch (e) { console.error("Calc error", e); setIsLoading(false); }
  };

  const recenterMap = () => {
    if (mapRef.current) {
      if (lastUploadedLocation) mapRef.current.panTo(lastUploadedLocation);
      else if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => mapRef.current?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
    }
  };

  const downloadShareCard = async () => {
    if (!shareCardRef.current || !metrics || !mapSnapshot) return;
    try {
      setIsLoading(true); shareCardRef.current.style.opacity = '1';
      await new Promise(r => setTimeout(r, 1500));
      const dataUrl = await toPng(shareCardRef.current, { cacheBust: true, backgroundColor: "#121212", pixelRatio: 2 });
      shareCardRef.current.style.opacity = '0';
      const link = document.createElement('a'); link.download = `trip-${Date.now()}.png`; link.href = dataUrl; link.click();
      setIsLoading(false);
    } catch (e) { setIsLoading(false); }
  };

  const shareToCommunity = async () => {
    if (!shareCardRef.current || !metrics || !user || !mapSnapshot) return;
    setIsLoading(true);
    try {
      shareCardRef.current.style.opacity = '1';
      await new Promise(r => setTimeout(r, 1500));
      const dataUrl = await toPng(shareCardRef.current, { cacheBust: true, backgroundColor: "#121212", pixelRatio: 2 });
      shareCardRef.current.style.opacity = '0';
      const blob = await (await fetch(dataUrl)).blob();
      const imageRef = ref(storage, `trips/${user.uid}/${Date.now()}.png`);
      await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(imageRef);
      await addDoc(collection(db, "posts"), {
        authorId: user.uid, authorUsername: userData.username, authorProfilePic: userData.profilePic,
        imageUrl, caption: `Rode ${metrics.distanceMiles.toFixed(1)} miles!`,
        likes: [], commentsEnabled: true, createdAt: serverTimestamp(),
        city: userData.city || "", homeRegion: userData.homeRegion || "",
        tripData: { origin: trip.origin, destination: trip.destination, waypoints: trip.waypoints, isRoundTrip }
      });
      alert("Shared!"); setIsLoading(false); setShowSharePreview(false);
    } catch (e) { setIsLoading(false); }
  };

  const filteredBikes = [...STANDARD_BIKES, ...savedBikes].filter(b => b.name.toLowerCase().includes(bikeSearchQuery.toLowerCase()));

  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);

  return (
    <div className="container">
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
      <div className="main-layout">
        <aside className={`sidebar ${showMobileMenu ? 'mobile-visible' : ''}`}>
          <div className="form-group">
            <label>Unit System</label>
            <div className="mode-toggle">
              <button className={unitSystem === 'imperial' ? 'active' : ''} onClick={() => setUnitSystem('imperial')}>Imperial</button>
              <button className={unitSystem === 'metric' ? 'active' : ''} onClick={() => setUnitSystem('metric')}>Metric</button>
            </div>
          </div>
          <section className="form-group" style={{ position: 'relative' }}>
            <label>Bike Model</label>
            <input type="text" placeholder="Search..." value={bikeSearchQuery} onFocus={() => setShowBikeResults(true)} onChange={e => setBikeSearchQuery(e.target.value)} />
            {showBikeResults && bikeSearchQuery && (
              <div className="bike-results-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', zIndex: 100, maxHeight: '200px', overflowY: 'auto', border: '1px solid #333' }}>
                {filteredBikes.map(b => <div key={b.name} onClick={() => loadBike(b)} style={{ padding: '0.8rem', borderBottom: '1px solid #222', cursor: 'pointer' }}>{b.name}</div>)}
              </div>
            )}
          </section>
          <section className="form-group">
            <label>Origin</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" name="origin" value={trip.origin} onChange={handleInputChange} style={{ flex: 1 }} />
              <button onClick={useCurrentLocation} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>📍</button>
            </div>
          </section>
          <section className="form-group">
            <label>Destination</label>
            <input type="text" name="destination" value={trip.destination} onChange={handleInputChange} />
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <section className="form-group"><label>Volts</label><input type="number" value={specs.voltage} onChange={e => handleSpecChange('voltage', e.target.value)} /></section>
            <section className="form-group"><label>Ah/Wh</label><input type="number" value={specs.capacityAh} onChange={e => handleSpecChange('capacityAh', e.target.value)} /></section>
          </div>
          
          {metrics && (
            <div ref={metricsCardRef} className="card metrics-card" style={{ marginTop: '1.5rem', borderLeft: '4px solid #ff6600', padding: '1rem' }}>
              {metrics.batteryPercentUsed <= 0 && (
                <div style={{ background: 'rgba(217,48,37,0.2)', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem', color: '#ff4444', fontSize: '0.8rem', textAlign: 'center' }}>
                  ⚠️ RANGE WARNING: Depletion point marked on map.
                </div>
              )}
              <h3 style={{ fontSize: '0.8rem', color: '#ff6600', margin: '0 0 1rem 0' }}>TRIP STATS</h3>
              <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{metrics.batteryPercentUsed.toFixed(1)}% Left</div>
              <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
                {metrics.distanceMiles.toFixed(1)} miles • {Math.round(metrics.durationMin)} min
              </div>
              <button onClick={() => setShowSharePreview(true)} style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', background: '#ff6600', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Share Trip</button>
            </div>
          )}
          <div style={{ marginTop: '2rem' }}><AdBanner isPro={isPro} /></div>
        </aside>

        <main style={{ position: 'relative', flex: 1 }}>
          {isLoaded ? (
            <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={center} zoom={10} onLoad={onMapLoad}>
              {trip.origin && trip.destination && isLoading && !response && (
                <DirectionsService 
                  options={{ origin: trip.origin, destination: isRoundTrip ? trip.origin : trip.destination, travelMode: google.maps.TravelMode.BICYCLING, waypoints: trip.waypoints.map(w => ({ location: w, stopover: true })) }} 
                  callback={directionsCallback} 
                />
              )}
              {response && <DirectionsRenderer options={{ directions: response, routeIndex: selectedRouteIndex }} />}
              {metrics?.deathPoint && (
                <Marker position={metrics.deathPoint} label={{ text: '☠️', color: 'white' }} />
              )}
            </GoogleMap>
          ) : <div>Loading Maps...</div>}
        </main>
      </div>

      <div className="persistent-controls" style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', gap: '1rem', background: 'rgba(20,20,20,0.9)', padding: '0.8rem 1.5rem', borderRadius: '40px', border: '1px solid #333' }}>
        <button 
          onClick={() => {
            if (showMobileMenu && trip.origin && trip.destination && settingsDirty) {
              handleCalculate(); setShowMobileMenu(false);
            } else {
              setShowMobileMenu(!showMobileMenu);
            }
          }}
          style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '25px', fontWeight: 'bold', cursor: 'pointer', textTransform: 'uppercase', fontSize: '0.75rem' }}
        >
          {showMobileMenu ? (trip.origin && trip.destination && settingsDirty ? '🚀 Find Route' : '🗺️ Map') : (metrics && !settingsDirty ? '📊 Trip Stats' : '🏁 Start Here')}
        </button>
        <button onClick={recenterMap} style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#333', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🎯</button>
      </div>

      {showSharePreview && metrics && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', padding: '20px' }}>
          <div ref={shareCardRef} style={{ width: '500px', height: '800px', background: '#0a0a0a', padding: '2rem', display: 'flex', flexDirection: 'column', borderRadius: '40px', border: '1px solid #333', position: 'relative' }}>
             <h2 style={{ color: '#ff6600', fontStyle: 'italic', margin: 0 }}>RANGE ANXIETY</h2>
             {mapSnapshot && <div style={{ flex: 1, margin: '1.5rem 0', borderRadius: '20px', overflow: 'hidden' }}><img src={mapSnapshot} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '15px', textAlign: 'center' }}>
                  <div style={{ color: '#ff6600', fontSize: '0.6rem' }}>BATTERY LEFT</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900 }}>{metrics.batteryPercentUsed.toFixed(0)}%</div>
                </div>
                <div style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '15px', textAlign: 'center' }}>
                  <div style={{ color: '#666', fontSize: '0.6rem' }}>DISTANCE</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900 }}>{metrics.distanceMiles.toFixed(1)}mi</div>
                </div>
             </div>
             <div style={{ textAlign: 'center', marginTop: 'auto', color: '#ff6600', fontWeight: 'bold' }}>rangeanxiety.app</div>
          </div>
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => setShowSharePreview(false)} style={{ padding: '1rem 2rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={downloadShareCard} style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Download PNG</button>
          </div>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
    </div>
  );
}

export default MapHome;
