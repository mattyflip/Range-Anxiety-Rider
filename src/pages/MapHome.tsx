import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, InfoWindowF, PolygonF } from '@react-google-maps/api'
import ModernAutocomplete from '../features/map/ModernAutocomplete'
import { toPng } from 'html-to-image'
import { decode } from '@googlemaps/polyline-codec'
import { db, storage } from '../firebase'
import { doc, getDoc, collection, addDoc, serverTimestamp, updateDoc, query, onSnapshot, setDoc, arrayUnion, deleteDoc, where, getDocs } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { Suspense, lazy } from 'react';
import InstallTutorial from '../shared/ui/InstallTutorial';
import NavBar from '../shared/ui/NavBar';
import AdvancedMarker from '../features/map/AdvancedMarker';

const TermsOfService = lazy(() => import('../features/legal/TermsOfService'));
const PrivacyPolicy = lazy(() => import('../features/legal/PrivacyPolicy'));
const AuthModal = lazy(() => import('../features/auth/AuthModal'));
const WelcomeModal = lazy(() => import('../shared/ui/WelcomeModal'));
const RouteReplay3D = lazy(() => import('../features/map/RouteReplay3D'));
const CalibrationModal = lazy(() => import('../features/map/CalibrationModal'));
const OpportunityChargingModal = lazy(() => import('../features/map/OpportunityChargingModal'));
const ShareCard = lazy(() => import('../components/ShareCard').then(m => ({ default: m.ShareCard })));
import orangePin from '../assets/orange-pin.png'
import { createNotification } from '../utils/notifications'
import { STATE_COORDINATES } from '../utils/ebikeLaws'
import SEO from '../shared/ui/SEO'
import type { Bike, LiveUnit, Organization, SavedBike, BikeSpecs } from '../types';
import { useUserData } from '../hooks/useUserData';
import { useBikeLibrary } from '../hooks/useBikeLibrary';
import { calculateRangePolygon, calculateBurnRate, calculateHeadwind } from '../utils/physics';
import Toast, { type ToastType } from '../shared/ui/Toast';
import LocationDisclosureModal from '../shared/ui/LocationDisclosureModal';
import UpgradeModal from '../shared/ui/UpgradeModal';
import styles from './MapHome.module.css';


interface GoogleRouteStep {
  navigationInstruction?: { instructions: string };
  startLocation?: { latLng: { latitude: number; longitude: number } };
  endLocation?: { latLng: { latitude: number; longitude: number } };
  distanceMeters?: number;
  staticDuration?: string;
}

interface GoogleRouteLeg {
  duration: string;
  distanceMeters: number;
  startLocation: { latLng: { latitude: number; longitude: number } };
  endLocation: { latLng: { latitude: number; longitude: number } };
  steps: GoogleRouteStep[];
}

interface GoogleRoute {
  polyline: { encodedPolyline: string };
  distanceMeters: number;
  legs: GoogleRouteLeg[];
}

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

interface Participant {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  lastUpdatedAt: number;
}

interface TripDetails {
  origin: string;
  destination: string;
  waypoints: string[];
}

export interface RouteMetrics {
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

interface POI {
  id: string;
  name: string;
  address: string;
  position: google.maps.LatLngLiteral;
  type: string;
}

const center = { lat: 40.7128, lng: -74.0060 };

const HelpBubble = ({ text }: { text: string }) => (
  <div style={{ marginTop: '0.2rem', marginBottom: '0.5rem', padding: '0.5rem', background: '#333', color: '#ff6600', fontSize: '0.75rem', borderRadius: '4px', borderLeft: '3px solid #ff6600', animation: 'fadeIn 0.3s ease', lineHeight: '1.4' }}>
    {text}
  </div>
);

function MapHome() {
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", libraries: LIBRARIES });
  const { user, userData, loading: authLoading } = useUserData();
  const { bikes: globalBikes } = useBikeLibrary();
  const [authInitialized, setAuthInitialized] = useState(false);
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(() => {
    return localStorage.getItem('location_disclosure_accepted') !== 'true';
  });

  const handleLocationAccept = () => {
    localStorage.setItem('location_disclosure_accepted', 'true');
    setShowLocationDisclosure(false);
    // After accepting, we might want to trigger the first location fetch
    locateMe();
  };

  // Sync authInitialized with hook loading
  useEffect(() => {
    if (!authLoading) setAuthInitialized(true);
  }, [authLoading]);

  const mapRef = useRef<google.maps.Map | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [specs, setSpecs] = useState<BikeSpecs>({ voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 65 });
  
  // Group Ride State
  const [activeRide, setActiveRide] = useState<GroupRide | null>(null);
  const [publicRides, setPublicRides] = useState<GroupRide[]>([]);
  const [rideParticipants, setRideParticipants] = useState<Participant[]>([]);
  const [groupRideName, setGroupRideName] = useState('');
  const [isPublicRide, setIsPublicRide] = useState(true);
  const [joinPin, setJoinPin] = useState('');

  const [isRoundTrip, setIsRoundTrip] = useState(false);
  
  const [batteryInputMode, setBatteryInputMode] = useState<'percent' | 'voltage'>('percent'); 
  const [startBattery, setStartBattery] = useState<number | ''>(100);
  const [startVoltage, setStartVoltage] = useState<number | ''>(54.6);
  
  const [riderWeight, setRiderWeight] = useState<number | ''>(180);

  // Initialize rider weight from user profile if available
  useEffect(() => {
    if (userData?.riderWeight) {
      setRiderWeight(userData.riderWeight);
    }
  }, [userData?.riderWeight]);

  const [targetSpeed, setTargetSpeed] = useState<number | ''>(18);
  const [driveMode, setDriveMode] = useState<'throttle' | 'pas'>('throttle');
  const [pedalAssistLevel, setPedalAssistLevel] = useState<number>(3);
  const [throttleMode, setThrottleMode] = useState<'eco' | 'normal' | 'sport'>('normal');
  
  const [response, setResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [allAnalyzedRoutes, setAllAnalyzedRoutes] = useState<Array<{ mockResult: google.maps.DirectionsResult & { decodedPath: {lat: number, lng: number}[] }; metrics: RouteMetrics }>>([]);
  const [pois, setPois] = useState<POI[]>([]);
  
  const [showSharePreview, setShowSharePreview] = useState(false);
  const [userRole, setUserRole] = useState<'rider' | 'fleet'>('rider');
  const [isPro, setIsPro] = useState(false);
  const [isExploreTier, setIsExploreTier] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGroupRidePaywall, setShowGroupRidePaywall] = useState(false);
  const [bikeSearchQuery, setBikeSearchQuery] = useState("");
  const [showBikeResults, setShowBikeResults] = useState(false);
  const [pendingActionAfterCalibration, setPendingActionAfterCalibration] = useState<'share' | null>(null);
  interface POIDetails {
    name?: string;
    rating?: number;
    user_ratings_total?: number;
    website?: string;
    formatted_phone_number?: string;
    isOpen?: boolean;
    photoUrl?: string;
  }
  const [clickedMapLocation, setClickedMapLocation] = useState<{ lat: number, lng: number, placeId?: string, address?: string, details?: POIDetails } | null>(null);

  const handleAddLocationToRoute = (addr: string) => {
    const newLocs = [...locations];
    if (newLocs[0].trim() === '') {
      newLocs[0] = "Current Location";
      newLocs[1] = addr;
    } else {
      const firstEmpty = newLocs.findIndex(l => l.trim() === '');
      if (firstEmpty !== -1) {
        newLocs[firstEmpty] = addr;
      } else {
        newLocs.push(addr);
      }
    }
    setLocations(newLocs);
    setTripMode('plan');
    setShowMobileMenu(true);
    markDirty();
    setClickedMapLocation(null);
  };

  const moveLocation = (index: number, direction: -1 | 1) => {
    const newLocs = [...locations];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newLocs.length || newLocs[index].trim() === '' || newLocs[targetIndex].trim() === '') return;
    
    const temp = newLocs[index];
    newLocs[index] = newLocs[targetIndex];
    newLocs[targetIndex] = temp;
    
    setLocations(newLocs);
    markDirty();
  };
  const [savedBikes, setSavedBikes] = useState<SavedBike[]>([]);
  const [newBikeName, setNewBikeName] = useState('');
  const [showToSPage, setShowToSPage] = useState(false);
  const [showPrivacyPage, setShowPrivacyPage] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [showChargingRescue, setShowChargingRescue] = useState(false);
  const [suggestedStops, setSuggestedStops] = useState<any[]>([]);
  const [isFindingRescue, setIsFindingRescue] = useState(false);
  const [mapSnapshot, setMapSnapshot] = useState<string | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(true);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>(center);
  const [loading, setLoading] = useState(true);
  const [showRouteReplay, setShowRouteReplay] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<ToastType>('info');
  const showToast = useCallback((msg: string, type: ToastType = 'error') => {
    setToastMessage(msg);
    setToastType(type);
  }, []);

  // Trip Tracking for Calibration
  const [tripStartBattery, setTripStartBattery] = useState<number>(100);
  const [tripPredictedWh, setTripPredictedWh] = useState<number>(0);
  const [actualDistanceMiles, setActualDistanceMiles] = useState<number>(0);
  const [tripElevationGain, setTripElevationGain] = useState<number>(0);
  const [tripTemperatureC, setTripTemperatureC] = useState<number>(20);
  const [tripWindSpeedMs, setTripWindSpeedMs] = useState<number>(0);
  const [lastNavLocation, setLastNavLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [currentTripBike, setCurrentTripBike] = useState<SavedBike | null>(null);
  const [stopCount, setStopCount] = useState<number>(0);
  const [isCurrentlyStopped, setIsCurrentlyStopped] = useState<boolean>(false);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const [realTimeSpeedMph, setRealTimeSpeedMph] = useState<number>(0);
  const [realTimeWhMi, setRealTimeWhMi] = useState<number>(0);
  const [realTimeRemainingMiles, setRealTimeRemainingMiles] = useState<number>(0);
  const [lastActivityTimestamp, setLastActivityTimestamp] = useState<number>(Date.now());

  // Range Polygon State
  const [rangePolygonPoints, setRangePolygonPoints] = useState<google.maps.LatLngLiteral[] | null>(null);

  // Free Ride Tracking State
  const [tripMode, setTripMode] = useState<'plan' | 'track'>('plan');
  const [isTrackingFreeRide, setIsTrackingFreeRide] = useState(false);
  const [breadcrumbTrail, setBreadcrumbTrail] = useState<google.maps.LatLngLiteral[]>([]);

  // --- FLEET / B2B SPECIFIC STATE ---
  const [liveUnits, setLiveUnits] = useState<LiveUnit[]>([]);
  const [shopBikes, setShopBikes] = useState<Bike[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<string>('');
  const [shopLocation, setShopLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [orgOwnerId, setOrgOwnerId] = useState<string | null>(null);
  const [shopPerimeter, setShopPerimeter] = useState<google.maps.LatLngLiteral[] | null>(null);
  const [isDrawingPerimeter, setIsDrawingPerimeter] = useState(false);
  const [drawingPerimeterPoints, setDrawingPerimeterPoints] = useState<google.maps.LatLngLiteral[]>([]);
  
  // Help Mode State
  const [showHelpMode, setShowHelpMode] = useState(false);

  const toggleHelpMode = () => {
    setShowHelpMode(prev => !prev);
    setTripMode('plan');
    setShowMobileMenu(true);
  };
  const [messageRiderTarget, setMessageRiderTarget] = useState<LiveUnit | null>(null);
  const lastAlertTime = useRef<{ [key: string]: number }>({});
  // Reorderable locations state - The SINGLE source of truth for the trip
  const [locations, setLocations] = useState<string[]>(['', '', '', '', '']);

  // Derived Trip Details
  const trip = useMemo<TripDetails>(() => {
    const filtered = locations.filter(l => l.trim() !== '');
    if (filtered.length === 0) return { origin: '', destination: '', waypoints: [] };
    if (filtered.length === 1) return { origin: filtered[0], destination: '', waypoints: [] };
    return {
      origin: filtered[0],
      destination: filtered[filtered.length - 1],
      waypoints: filtered.slice(1, filtered.length - 1)
    };
  }, [locations]);

  const updateLocation = (index: number, value: string) => {
    const newLocs = [...locations];
    newLocs[index] = value;
    setLocations(newLocs);
    markDirty();
  };

  
  // Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState({ title: '', message: '', feature: '' });
  
  

  const handleOpenRouteReplay = () => {
    if (!(userData?.isBetaTester || userData?.isAdmin)) {
      setUpgradeContext({
        title: "Beta Feature",
        message: "3D Route Flyover is currently only available for beta testers.",
        feature: "3D Route Flyover"
      });
      setShowUpgradeModal(true);
      return;
    }
    setShowRouteReplay(true);
  };

  const handleStartUpgrade = async () => {
    setShowUpgradeModal(false);
    if (!user) { setShowAuthModal(true); return; }
    try {
      showToast("Forwarding to secure checkout...", "info");
      const token = await user.getIdToken();
      const res = await fetch('/api/create-checkout-session', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
        body: JSON.stringify({ userId: user.uid, email: user.email, tier: 'pro' }) 
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) { console.error(e); }
  };
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distToNextStep, setNextStepDist] = useState<string | null>(null);
  const [hasAnnouncedNextStep, setHasAnnouncedNextStep] = useState(false);
  const [isCameraLocked, setIsCameraLocked] = useState(false);
  const [rideCount, setRideCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('rideCount') || '0', 10);
  });

  // 1. Auth & Data Initialization
  useEffect(() => {
    let unsubLive: (() => void) | null = null;
    let unsubBikes: (() => void) | null = null;
    let unsubOrg: (() => void) | null = null;

    if (user && userData) {
        const d = userData;
        setIsPro(d.isPro || false);
        setIsExploreTier(d.isExploreTier || false);
        if (d.bikes) setSavedBikes(d.bikes);

        const isAdmin = d.isAdmin === true;
        const role = d.role || (isAdmin ? 'fleet' : 'rider');
        setUserRole(role);
        
        if (d.orgId) {
          unsubOrg = onSnapshot(doc(db, "organizations", d.orgId), (oSnap) => {
            if (oSnap.exists()) {
              const oData = oSnap.data() as Organization;
              setOrgOwnerId(oData.ownerId);
              if (oData.location?.lat && oData.location?.lng) {
                setShopLocation({ lat: oData.location.lat, lng: oData.location.lng });
              }
              if (oData.perimeter) {
                setShopPerimeter(oData.perimeter);
              }
            }
          }, (err) => console.error("Firestore unsubOrg error:", err));

          unsubBikes = onSnapshot(query(collection(db, `organizations/${d.orgId}/bikes`)), (s) => {
             const bikes = s.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bike));
             setShopBikes(bikes);
             if (role === 'rider') {
               const assigned = bikes.find(b => b.currentRiderId === user.uid && b.status === 'rented');
               if (assigned) {
                 setSelectedBikeId(assigned.id);
                 if (assigned.specs && !settingsDirty) {
                   setSpecs({
                     voltage: assigned.specs.voltage || 48,
                     capacityAh: assigned.specs.capacityAh || 15,
                     motorWatts: assigned.specs.motorWatts || 750,
                     bikeWeightLbs: assigned.specs.bikeWeightLbs || 65,
                     tirePSI: assigned.specs.tirePSI || 30,
                     tireType: (assigned.specs.tireType as any) || 'all-terrain'
                   });
                   setStartBattery(assigned.specs.currentBatteryPercent || 100);
                 }
               } else {
                 setSelectedBikeId('');
               }
             } else if (bikes.length > 0 && !selectedBikeId) {
               setSelectedBikeId(bikes[0].id);
             }
          }, (err) => console.error("Firestore unsubBikes error:", err));

          if (role === 'fleet') {
            unsubLive = onSnapshot(query(collection(db, `organizations/${d.orgId}/live_units`)), (s) => {
              setLiveUnits(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiveUnit)));
            }, (err) => console.error("Firestore unsubLive error:", err));
          }
        } else if (d.activeRental?.shopId) {
          // Rider without an org, but has an active rental
          unsubOrg = onSnapshot(doc(db, "organizations", d.activeRental.shopId), (oSnap) => {
            if (oSnap.exists()) {
              const oData = oSnap.data() as Organization;
              setOrgOwnerId(oData.ownerId);
              if (oData.perimeter) {
                setShopPerimeter(oData.perimeter);
              }
            }
          }, (err) => console.error("Firestore unsubOrg rental error:", err));

          unsubBikes = onSnapshot(query(collection(db, `organizations/${d.activeRental.shopId}/bikes`)), (s) => {
             const bikes = s.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bike));
             setShopBikes(bikes);
             const assigned = bikes.find(b => b.currentRiderId === user.uid && b.status === 'rented');
             if (assigned) {
               setSelectedBikeId(assigned.id);
               if (assigned.specs && !settingsDirty) {
                 setSpecs({
                   voltage: assigned.specs.voltage || 48,
                   capacityAh: assigned.specs.capacityAh || 15,
                   motorWatts: assigned.specs.motorWatts || 750,
                   bikeWeightLbs: assigned.specs.bikeWeightLbs || 65,
                   tirePSI: assigned.specs.tirePSI || 30,
                   tireType: (assigned.specs.tireType as any) || 'all-terrain'
                 });
                 setStartBattery(assigned.specs.currentBatteryPercent || 100);
               }
             } else {
               setSelectedBikeId('');
             }
          }, (err) => console.error("Firestore unsubBikes rental error:", err));
        }
        setLoading(false);

        const savedRideId = localStorage.getItem('active_ride_id');
        if (savedRideId && !activeRide) {
          getDoc(doc(db, "group_rides", savedRideId)).then(rideSnap => {
            if (rideSnap.exists() && rideSnap.data()?.status === 'active') {
              setActiveRide({ id: rideSnap.id, ...rideSnap.data() } as GroupRide);
            } else {
              localStorage.removeItem('active_ride_id');
            }
          });
        }
    } else if (!authLoading && !user) {
        setIsPro(false); setIsExploreTier(false);
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

    return () => {
      if (unsubLive) unsubLive();
      if (unsubBikes) unsubBikes();
      if (unsubOrg) unsubOrg();
    };
  }, [user, userData, authLoading]);

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
        mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: window.innerWidth > 768 ? 350 : 50 });
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
        if (userRole !== 'fleet') {
          // Imperatively pan — do NOT call setMapCenter here or the re-render will reset zoom to 12
          if (mapRef.current) mapRef.current.panTo(loc);
          if (mapRef.current) mapRef.current.setZoom(11);
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
           setLocations(['Recorded Ride Start', 'Recorded Ride End', '', '', '']);
           setPois([]);
           localStorage.removeItem('ebike_load_route');
           if (data.path.length > 0 && mapRef.current) {
              mapRef.current.panTo(data.path[0]);
              mapRef.current.setZoom(14);
           }
        } else if (data && typeof data.origin === 'string' && data.origin.trim()) {
          const wps = data.waypoints?.filter((w: any) => typeof w === 'string') || [];
          setLocations([data.origin, data.destination, wps[0] || '', wps[1] || '', wps[2] || '']);
          if (typeof data.isRoundTrip === 'boolean') setIsRoundTrip(data.isRoundTrip);
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
      // Imperatively pan — do NOT call setMapCenter or next re-render resets zoom
      if (coords) { mapRef.current.panTo(coords); mapRef.current.setZoom(8); }
    }
  }, [userData?.homeRegion]);

  useEffect(() => {
    if (!response || !response.routes[0]) return;
    const polyline = response.routes[0].overview_polyline;
    const points = (polyline as { points?: string }).points || polyline;
    fetch(`/api/static-map?polyline=${encodeURIComponent(points)}`).then(r => r.blob()).then(blob => {
      const reader = new FileReader(); reader.onloadend = () => setMapSnapshot(reader.result as string); reader.readAsDataURL(blob);
    }).catch(console.error);
  }, [response, selectedRouteIndex]);

  useEffect(() => {
    if (!user || localStorage.getItem('location_disclosure_accepted') !== 'true') return;
    const watchId = navigator.geolocation.watchPosition(async (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(loc);
      const speed = (pos.coords.speed || 0) * 2.23694;
      const targetShopId = userData?.orgId || userData?.activeRental?.shopId;
      if (targetShopId && selectedBikeId) {
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
             await setDoc(doc(db, `organizations/${targetShopId}/live_units`, user.uid), {
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
               if (shopPerimeter && shopPerimeter.length > 2) {
                 const googlePoly = new google.maps.Polygon({ paths: shopPerimeter });
                 const googleLoc = new google.maps.LatLng(loc.lat, loc.lng);
                 const isInside = google.maps.geometry.poly.containsLocation(googleLoc, googlePoly);
                 if (!isInside && (!lastAlertTime.current['geofence'] || now - lastAlertTime.current['geofence'] > 300000)) {
                   showToast("🚨 You are outside the shop's allowed riding zone!");
                   createNotification(orgOwnerId, user.uid, userData.username || "Rider", 'fleet_alert', user.uid, `🚨 BOUNDARY ALERT: ${bike.unitId} is outside the allowed riding zone! Rider: ${userData.username || user.email}`);
                   lastAlertTime.current['geofence'] = now;
                 }
               }
             }
          }
        } catch (e) { console.error('Non-critical map/telemetry error:', e); }
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
  }, [user, userData, selectedBikeId, shopBikes, activeRide, orgOwnerId, riderWeight, driveMode, pedalAssistLevel, throttleMode, shopPerimeter]);

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const startNavigation = () => {
    if (!response || !metrics) return;
    setIsNavigating(true); setCurrentLegIndex(0); setCurrentStepIndex(0); setHasAnnouncedNextStep(false); setShowMobileMenu(false);
    setIsTrackingFreeRide(false);
    setIsCameraLocked(true);
    
    // TRACKING FOR CALIBRATION
    setTripStartBattery(Number(startBattery) || 100);
    setTripPredictedWh(metrics.estimatedWh || 0);
    setActualDistanceMiles(0);
    setTripElevationGain(metrics.elevationGainFeet || 0);
    setTripTemperatureC(20); // Default, could be refined if weather state is expanded
    setTripWindSpeedMs((metrics.windConditions?.speed || 0) * 0.44704); // mph to m/s
    setLastNavLocation(userLocation);
    setStopCount(0);
    setIsCurrentlyStopped(false);
    setSpeedHistory([]);

    const firstStep = response.routes[0].legs[0].steps[0];
    speak(`Starting trip. ${firstStep.instructions.replace(/<[^>]*>?/gm, '')}`);
    if (mapRef.current) { mapRef.current.setZoom(18); mapRef.current.setTilt(45); }
  };

  const startFreeTracking = () => {
    setIsTrackingFreeRide(true);
    setIsNavigating(false);
    setShowMobileMenu(false);
    setIsCameraLocked(true);
    setBreadcrumbTrail(userLocation ? [userLocation] : []);
    setActualDistanceMiles(0);
    setLastNavLocation(userLocation);
    setRealTimeSpeedMph(0);
    if (mapRef.current) {
       mapRef.current.setZoom(18);
       mapRef.current.setTilt(45);
       if (userLocation) mapRef.current.panTo(userLocation);
    }
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setIsCameraLocked(false);
    if (mapRef.current) { mapRef.current.setTilt(0); }
    
    // Trigger Calibration if trip was significant (> 0.2 miles)
    if (user && actualDistanceMiles > 0.2 && currentTripBike) {
      const newCount = rideCount + 1;
      setRideCount(newCount);
      localStorage.setItem('rideCount', newCount.toString());
      if (newCount <= 10 || newCount % 10 === 0) {
        setShowCalibrationModal(true);
      }
    }
  };

  const stopFreeTracking = () => {
    setIsTrackingFreeRide(false);
    setIsCameraLocked(false);
    if (mapRef.current) { mapRef.current.setTilt(0); }
    // Prepare mock metrics for share
    setMetrics({
        distanceMiles: actualDistanceMiles,
        durationMin: 0, elevationGainFeet: 0, elevationLossFeet: 0, estimatedWh: 0, efficiencyWhMi: realTimeWhMi,
        batteryPercentRemaining: startBattery ? Number(startBattery) - (startBattery * 0.1) : 0, // Mock for share card
        recommendedSpeedMph: realTimeSpeedMph
    });
    
    // Trigger Calibration if trip was significant (> 0.2 miles)
    if (user && actualDistanceMiles > 0.2 && currentTripBike) {
      const newCount = rideCount + 1;
      setRideCount(newCount);
      localStorage.setItem('rideCount', newCount.toString());
      if (newCount <= 10 || newCount % 10 === 0) {
        setPendingActionAfterCalibration('share');
        setShowCalibrationModal(true);
      } else {
        setShowSharePreview(true);
      }
    } else {
      setShowSharePreview(true);
    }
  };

  useEffect(() => {
    if (!isNavigating && !isTrackingFreeRide) return;
    const watchId = navigator.geolocation.watchPosition((pos) => {
      const uLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      // Track Distance for Calibration
      if (lastNavLocation) {
        const dMeters = google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(lastNavLocation.lat, lastNavLocation.lng),
          new google.maps.LatLng(uLoc.lat, uLoc.lng)
        );
        setActualDistanceMiles(prev => prev + (dMeters * 0.000621371));
      }
      setLastNavLocation(uLoc);

      // --- STOP TRACKING & SPEED VARIANCE ---
      const currentSpeedMph = (pos.coords.speed || 0) * 2.23694;
      setSpeedHistory(prev => [...prev, currentSpeedMph]);

      if (currentSpeedMph < 2 && !isCurrentlyStopped) {
        setIsCurrentlyStopped(true);
        setStopCount(prev => prev + 1);
      } else if (currentSpeedMph > 5 && isCurrentlyStopped) {
        setIsCurrentlyStopped(false);
      }

      // --- REAL-TIME TELEMETRY ---
      setRealTimeSpeedMph(currentSpeedMph);
      if (currentSpeedMph > 2) {
        setLastActivityTimestamp(Date.now());
        const instantaneousBurnRate = calculateBurnRate({
          speedMph: currentSpeedMph,
          slope: 0, // Instantaneous slope hard to get without high-res elevation map, assume flat for real-time
          headwindMph: 0, // Assume no wind for real-time overlay simplicity
          riderWeightLbs: riderWeight || 180,
          pedalAssistLevel,
          driveMode,
          throttleMode,
          specs: mapToPhysicsSpecs(specs)
        });
        setRealTimeWhMi(instantaneousBurnRate / currentSpeedMph);
        
        const totalWh = (Number(specs.voltage)||48) * (Number(specs.capacityAh)||15);
        const currentWh = totalWh * ((Number(startBattery)||100)/100);
        setRealTimeRemainingMiles(currentWh / instantaneousBurnRate * currentSpeedMph);
      }

      if (isTrackingFreeRide) {
         setBreadcrumbTrail(prev => {
             if (prev.length === 0) return [uLoc];
             const lastP = prev[prev.length - 1];
             if (google.maps.geometry.spherical.computeDistanceBetween(
                new google.maps.LatLng(lastP.lat, lastP.lng),
                new google.maps.LatLng(uLoc.lat, uLoc.lng)
             ) > 5) return [...prev, uLoc];
             return prev;
         });
         if (mapRef.current && isCameraLocked) mapRef.current.panTo(uLoc);
      }

      if (isNavigating && response) {
        const route = response.routes[0];
        const leg = route.legs[currentLegIndex];
        const step = leg.steps[currentStepIndex];
        // If navigating and locked, pan to user
        if (mapRef.current && isCameraLocked) {
           mapRef.current.panTo(uLoc);
        }
        const endLoc = { lat: step.end_location.lat(), lng: step.end_location.lng() };
        const distMeters = google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(uLoc.lat, uLoc.lng), new google.maps.LatLng(endLoc.lat, endLoc.lng));
        const distFeet = distMeters * 3.28084;
        if (unitSystem === 'metric') {
          setNextStepDist(distMeters > 500 ? `${(distMeters/1000).toFixed(1)} km` : `${Math.round(distMeters)} m`);
        } else {
          setNextStepDist(distFeet > 528 ? `${(distFeet/5280).toFixed(1)} mi` : `${Math.round(distFeet)} ft`);
        }
        if (distFeet < 300 && !hasAnnouncedNextStep) {
          speak(`In ${unitSystem === 'metric' ? Math.round(distMeters) + ' meters' : '300 feet'}, ${step.instructions.replace(/<[^>]*>?/gm, '')}`);
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
      }
    }, null, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isNavigating, isTrackingFreeRide, response, currentLegIndex, currentStepIndex, hasAnnouncedNextStep, selectedRouteIndex, lastNavLocation, unitSystem]);

  // --- AUTO-STOP INACTIVITY TIMER ---
  useEffect(() => {
    if (!isNavigating) return;
    const interval = setInterval(() => {
      const tenMinutesInMs = 10 * 60 * 1000;
      if (Date.now() - lastActivityTimestamp > tenMinutesInMs) {
        console.log("Inactivity detected (10 mins). Stopping navigation.");
        stopNavigation();
        speak("Navigation stopped due to inactivity.");
      }
    }, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [isNavigating, lastActivityTimestamp]);

  const markDirty = () => { if (!settingsDirty) setSettingsDirty(true); };
  
  const mapToPhysicsSpecs = (s: BikeSpecs): any => ({
    voltage: Number(s.voltage) || 48,
    capacityAh: Number(s.capacityAh) || 15,
    motorWatts: Number(s.motorWatts) || 750,
    bikeWeightLbs: Number(s.bikeWeightLbs) || 65,
    tirePSI: Number(s.tirePSI) || 30,
    tireType: s.tireType || 'all-terrain',
    controllerAmps: s.controllerAmps,
    controllerType: s.controllerType,
    currentBatteryPercent: s.currentBatteryPercent || (typeof startBattery === 'number' ? startBattery : 100)
  });

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
    setCurrentTripBike(bike);
    if (bike.specs.voltage) setStartVoltage(getBatteryLevels(Number(bike.specs.voltage)).max);
    markDirty();
  };

  const handleRangeRescue = async () => {
    if (!metrics?.deathPoint || !mapRef.current) return;
    setIsFindingRescue(true);
    
    try {
      // 1. Search for Charging POIs near the "Stranded" point
      const res = await fetch(`/api/charging?lat=${metrics.deathPoint.lat}&lng=${metrics.deathPoint.lng}&distance=5`);
      const chargingPois = await res.json();
      
      if (chargingPois.length === 0) {
        showToast("No charging stations found within 5 miles of your depletion point.");
        setIsFindingRescue(false);
        return;
      }

      // 2. Map to local structure and show modal
      setSuggestedStops(chargingPois);
      setShowChargingRescue(true);
    } catch (err) {
      console.error("Rescue search failed:", err);
      showToast("Failed to find nearby charging stations.");
    } finally {
      setIsFindingRescue(false);
    }
  };

  const addRescueStop = (stop: any) => {
    setShowChargingRescue(false);
    
    // Add the stop as an intermediate waypoint (Stop 1)
    const newLocs = [...locations];
    // Find the first empty slot or replace the destination if needed?
    // Better: insert it between start and finish.
    const origin = newLocs[0];
    const destination = newLocs.filter(l => l.trim() !== '').pop();
    
    setLocations([
      origin || '', 
      stop.address || stop.name, 
      destination || '', 
      '', ''
    ]);
    
    // Auto-recalculate
    setTimeout(() => handleCalculate(true), 500);
  };

  // Fleet Bike Range Calculator
  useEffect(() => {
    if (userRole !== 'fleet') return;
    
    if (!messageRiderTarget) {
      setRangePolygonPoints(null);
      return;
    }

    const calcBikeRange = async () => {
      try {
        const originCoords = messageRiderTarget.position;
        const wRes = await fetch(`/api/weather?lat=${originCoords.lat}&lng=${originCoords.lng}`).then(r => r.json());
        const wind = { speed: wRes.wind_speed || 0, direction: wRes.wind_degree || 0 };
        
        const matchedBike = shopBikes.find(b => b.id === messageRiderTarget.bikeId);
        const bikeSpecs = matchedBike?.specs || specs;
        
        const physicsSpecs = mapToPhysicsSpecs(bikeSpecs as any);
        physicsSpecs.currentBatteryPercent = messageRiderTarget.battery;

        const initialPoints = calculateRangePolygon(
          originCoords,
          wind,
          { 
            specs: physicsSpecs, 
            riderWeightLbs: riderWeight || 180, 
            throttleMode, 
            speedMph: targetSpeed ? Number(targetSpeed) : 18, 
            slope: 0, 
            headwindMph: 0, 
            driveMode, 
            pedalAssistLevel 
          },
          false
        );

        const elevator = new window.google.maps.ElevationService();
        const elevationRes = await elevator.getElevationForLocations({
          locations: initialPoints.map(p => new window.google.maps.LatLng(p.lat, p.lng))
        });

        const validatedPoints = initialPoints.map((p, i) => {
          const elev = elevationRes.results[i]?.elevation || 0;
          if (elev <= 0) {
            return {
              lat: p.lat * 0.3 + originCoords.lat * 0.7,
              lng: p.lng * 0.3 + originCoords.lng * 0.7
            };
          }
          return p;
        });

        setRangePolygonPoints(validatedPoints);
      } catch (err) {
        console.error("Failed to calc bike range", err);
      }
    };

    calcBikeRange();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageRiderTarget, userRole]);

  const handleCalculate = async (forceHideMenu: boolean | React.MouseEvent = false) => { 
    let currentOrigin = trip.origin;
    const currentDest = trip.destination;
    
    // Determine actual origin
    if (!currentOrigin && userLocation) {
       currentOrigin = `${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}`;
    }

    if (!currentOrigin) {
       showToast("Please enable location services or enter a starting point.");
       return;
    }

    const shouldHideMenu = forceHideMenu === true || response === null;

    setIsCalculating(true);
    setResponse(null); 
    setMetrics(null); 
    setPois([]); 
    setAllAnalyzedRoutes([]);
    setSelectedRouteIndex(0);
    setSettingsDirty(false); 
    if (shouldHideMenu) setShowMobileMenu(false);

    const calcSpeed = Number(targetSpeed) || 18;

    // --- RANGE POLYGON LOGIC (No Destination Entered) ---
    if (!currentDest.trim()) {
       let originCoords = userLocation || center;
       const parts = currentOrigin.split(',');
       const parsedLat = parseFloat(parts[0]);
       const parsedLng = parts.length > 1 ? parseFloat(parts[1]) : NaN;
       
       if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
         originCoords = { lat: parsedLat, lng: parsedLng };
       } else {
         try {
           const geocoder = new window.google.maps.Geocoder();
           const res = await geocoder.geocode({ address: currentOrigin });
           if (res.results[0]) {
             originCoords = { lat: res.results[0].geometry.location.lat(), lng: res.results[0].geometry.location.lng() };
           }
         } catch (e) {
           console.error("Geocoding failed:", e);
           showToast("Could not locate the starting address.");
           setIsCalculating(false);
           return;
         }
       }

       try {
         // 1. Fetch Local Weather for Wind
         const wRes = await fetch(`/api/weather?lat=${originCoords.lat}&lng=${originCoords.lng}`).then(r => r.json());
         const wind = { speed: wRes.wind_speed || 0, direction: wRes.wind_degree || 0 };

         // 2. Generate Initial Physics-Aware Points
         const initialPoints = calculateRangePolygon(
           originCoords,
           wind,
           { specs: mapToPhysicsSpecs(specs), riderWeightLbs: riderWeight || 180, throttleMode, speedMph: calcSpeed, slope: 0, headwindMph: 0, driveMode, pedalAssistLevel },
           isRoundTrip
         );

         // 3. Landmass Validation (Sample Elevation)
         const elevator = new google.maps.ElevationService();
         const elevationRes = await elevator.getElevationForLocations({
           locations: initialPoints.map(p => new google.maps.LatLng(p.lat, p.lng))
         });

         // 4. Filter/Pull back points in "Oceans" (Elevation <= 0)
         const validatedPoints = initialPoints.map((p, i) => {
           const elev = elevationRes.results[i]?.elevation || 0;
           if (elev <= 0) {
             // Ocean detected! Pull back 70% towards origin to avoid showing range over deep water
             return {
               lat: p.lat * 0.3 + originCoords.lat * 0.7,
               lng: p.lng * 0.3 + originCoords.lng * 0.7
             };
           }
           return p;
         });

         setRangePolygonPoints(validatedPoints);
         
         // Set metrics based on average radius
         const avgDist = validatedPoints.reduce((acc, p) => {
            const d = google.maps.geometry.spherical.computeDistanceBetween(
              new google.maps.LatLng(originCoords.lat, originCoords.lng),
              new google.maps.LatLng(p.lat, p.lng)
            );
            return acc + d;
         }, 0) / validatedPoints.length / 1609.34;

         setMetrics({
            distanceMiles: avgDist,
            durationMin: (avgDist / calcSpeed) * 60,
            elevationGainFeet: 0,
            elevationLossFeet: 0,
            estimatedWh: 0,
            efficiencyWhMi: 0,
            batteryPercentRemaining: 0,
            recommendedSpeedMph: calcSpeed,
            label: isRoundTrip ? "Est. Return Zone" : "Est. Range Zone",
            windConditions: { speed: wind.speed, direction: wind.direction, headwindComponent: 0 }
         } as RouteMetrics);

         if (mapRef.current) {
            mapRef.current.panTo(originCoords);
            const bounds = new google.maps.LatLngBounds();
            validatedPoints.forEach(p => bounds.extend(p));
            mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: window.innerWidth > 768 ? 350 : 50 });
         }
       } catch (err) {
         console.error("Polygon generation failed:", err);
         showToast("Could not generate range polygon. Check your connection.");
       } finally {
         setIsCalculating(false);
       }
       return;
    }

    // --- STANDARD ROUTE CALCULATION ---
    setRangePolygonPoints(null);

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
          'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs',
          'Cache-Control': 'no-cache'
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
      const analyzedRoutes = (await Promise.all(routesData.routes.map(async (route: GoogleRoute) => {
        try {
          const encodedPolyline = route.polyline.encodedPolyline;
          const totalDistanceMeters = route.distanceMeters || 0;
          const distanceMiles = totalDistanceMeters * 0.000621371;
          
          // Use user's target speed for realistic pace
          const speedMph = calcSpeed;
          const realisticDurationSeconds = (distanceMiles / speedMph) * 3600;

          const [eRes, wRes] = await Promise.all([
            fetch('/api/elevation', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ path: encodedPolyline }) 
            }).then(async r => {
              if (!r.ok) return { gain: 0, loss: 0 };
              return r.json();
            }),
            fetch(`/api/weather?lat=${route.legs[0].startLocation.latLng.latitude}&lng=${route.legs[0].startLocation.latLng.longitude}`).then(async r => {
              if (!r.ok) return { wind_speed: 0, wind_degree: 0 };
              return r.json();
            })
          ]);

          const elevationGainFt = eRes.gain || 0;
          const windSpeed = wRes.wind_speed || 0;

          // --- SEGMENTED BATTERY SIMULATION (Death Point Detection) ---
          let deathPoint: google.maps.LatLngLiteral | undefined = undefined;
          const decodedPath = decode(encodedPolyline).map(([lat, lng]) => ({ lat, lng }));
          
          // PAS 0 Bypass: If motor isn't helping, battery won't "die" (from a mobility standpoint)
          const isMotorActive = driveMode === 'throttle' || (driveMode === 'pas' && pedalAssistLevel > 0);

          if (decodedPath.length > 1 && isMotorActive) {
            const totalWh = (Number(specs.voltage) || 48) * (Number(specs.capacityAh) || 15);
            let remainingWh = totalWh * ((startBattery || 100) / 100);
            const physicsSpecs = mapToPhysicsSpecs(specs);

            // Elevation samples from API (80 samples)
            const elevSamples = eRes.results || [];
            
            for (let i = 0; i < decodedPath.length - 1; i++) {
              const p1 = decodedPath[i];
              const p2 = decodedPath[i + 1];
              
              const distMeters = google.maps.geometry.spherical.computeDistanceBetween(
                new google.maps.LatLng(p1.lat, p1.lng),
                new google.maps.LatLng(p2.lat, p2.lng)
              );
              const distMiles = distMeters * 0.000621371;
              const heading = google.maps.geometry.spherical.computeHeading(
                new google.maps.LatLng(p1.lat, p1.lng),
                new google.maps.LatLng(p2.lat, p2.lng)
              );

              // Interpolate elevation for this segment from the 80 samples
              const sampleIdx = Math.floor((i / decodedPath.length) * elevSamples.length);
              const nextSampleIdx = Math.min(sampleIdx + 1, elevSamples.length - 1);
              const elev1 = elevSamples[sampleIdx]?.elevation || 0;
              const elev2 = elevSamples[nextSampleIdx]?.elevation || 0;
              const slope = (elev2 - elev1) / Math.max(1, distMeters);

              const headwind = calculateHeadwind(windSpeed, wRes.wind_degree || 0, heading);
              
              const burnRateW = calculateBurnRate({
                speedMph: speedMph,
                slope,
                headwindMph: headwind,
                riderWeightLbs: riderWeight || 180,
                pedalAssistLevel,
                driveMode,
                throttleMode,
                specs: physicsSpecs
              });

              // Subtract motor consumption. 
              // We subtract the difference between burn rate and idle draw if PAS 0 (though loop is skipped)
              const energyUsedWh = burnRateW * (distMiles / speedMph);
              remainingWh -= energyUsedWh;

              if (remainingWh <= 0 && !deathPoint) {
                deathPoint = { lat: p2.lat, lng: p2.lng };
                break; 
              }
            }
          }

          let heading = 0;
          if (window.google?.maps?.geometry?.spherical) {
            const start = new google.maps.LatLng(route.legs[0].startLocation.latLng.latitude, route.legs[0].startLocation.latLng.longitude);
            const end = new google.maps.LatLng(route.legs[0].endLocation.latLng.latitude, route.legs[0].endLocation.latLng.longitude);
            heading = google.maps.geometry.spherical.computeHeading(start, end);
          }

          const calcRes = await fetch(`/api/calculate-range?_t=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
            body: JSON.stringify({
              type: 'route',
              specs, riderWeightLbs: riderWeight, throttleMode, batteryPercent: startBattery,
              durationSeconds: realisticDurationSeconds, speedMph: speedMph, elevationChangeFt: elevationGainFt,
              windMph: windSpeed, windDirDeg: wRes.wind_degree || 0, headingDeg: heading, driveMode, pedalAssistLevel
            })
          }).then(async r => {
            if (!r.ok) return { batteryPercentRemaining: 0, energyWh: 0 };
            return r.json();
          });

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
              deathPoint,
              windConditions: { speed: windSpeed, direction: wRes.wind_degree || 0, headwindComponent: 0 }
            }
          };
        } catch (err) {
          console.error("Single route analysis failed:", err);
          return null;
        }
      }))).filter(r => r !== null);

      if (analyzedRoutes.length === 0) {
        throw new Error("Failed to analyze any of the suggested routes.");
      }

      // Sort routes: 1. Most Battery Left, 2. Shortest Distance
      analyzedRoutes.sort((a: { metrics: RouteMetrics }, b: { metrics: RouteMetrics }) => {
        if (b.metrics.batteryPercentRemaining !== a.metrics.batteryPercentRemaining) {
          return b.metrics.batteryPercentRemaining - a.metrics.batteryPercentRemaining;
        }
        return a.metrics.distanceMiles - b.metrics.distanceMiles;
      });

      // Label the top routes
      analyzedRoutes[0].metrics.label = "Most Efficient";
      if (analyzedRoutes.length > 1) analyzedRoutes[1].metrics.label = "Alternative 1";
      if (analyzedRoutes.length > 2) analyzedRoutes[2].metrics.label = "Alternative 2";

      // Build a mockResult for every analyzed route
      const buildMockResult = (route: { originalRoute: GoogleRoute }): (google.maps.DirectionsResult & { decodedPath?: {lat: number, lng: number}[] }) | null => {
        const encodedPolyline = route.originalRoute.polyline.encodedPolyline;
        let decodedPath: { lat: number, lng: number }[] = [];
        try {
          decodedPath = decode(encodedPolyline).map(([lat, lng]) => ({ lat, lng }));
        } catch (e) {
          console.error("Polyline decoding failed:", e);
          return null;
        }
        const result: any = {
          request: { travelMode: 'BICYCLING' },
          decodedPath,
          routes: [{
            overview_path: decodedPath.map(p => new google.maps.LatLng(p.lat, p.lng)),
            overview_polyline: { points: encodedPolyline },
            legs: route.originalRoute.legs.map((leg: GoogleRouteLeg) => {
              const durationSec = parseInt(leg.duration) || 0;
              const durationMin = Math.round(durationSec / 60);
              const durationText = durationMin >= 60
                ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
                : `${durationMin} min`;
              const mappedSteps = (leg.steps || []).map((step: GoogleRouteStep) => ({
                instructions: step.navigationInstruction?.instructions || '',
                start_location: new google.maps.LatLng(
                  step.startLocation?.latLng?.latitude || 0,
                  step.startLocation?.latLng?.longitude || 0
                ),
                end_location: new google.maps.LatLng(
                  step.endLocation?.latLng?.latitude || 0,
                  step.endLocation?.latLng?.longitude || 0
                ),
                distance: {
                  value: step.distanceMeters || 0,
                  text: `${((step.distanceMeters || 0) * 0.000621371).toFixed(1)} mi`
                },
                duration: {
                  value: parseInt(step.staticDuration || '0'),
                  text: ''
                }
              }));
              return {
                distance: { value: leg.distanceMeters, text: `${(leg.distanceMeters * 0.000621371).toFixed(1)} mi` },
                duration: { value: durationSec, text: durationText },
                start_location: new google.maps.LatLng(leg.startLocation.latLng.latitude, leg.startLocation.latLng.longitude),
                end_location: new google.maps.LatLng(leg.endLocation.latLng.latitude, leg.endLocation.latLng.longitude),
                steps: mappedSteps
              };
            })
          }]
        };
        return result as (google.maps.DirectionsResult & { decodedPath: {lat: number, lng: number}[] });
      };

      const builtRoutes = analyzedRoutes
        .map((r: { mockResult: google.maps.DirectionsResult & { decodedPath?: {lat: number, lng: number}[] }, metrics: RouteMetrics }) => ({ mockResult: buildMockResult(r as any), metrics: r.metrics }))
        .filter((r): r is { mockResult: google.maps.DirectionsResult & { decodedPath: {lat: number, lng: number}[] }, metrics: RouteMetrics } => r.mockResult !== null);

      if (builtRoutes.length === 0) {
        throw new Error("Could not display any routes.");
      }

      setAllAnalyzedRoutes(builtRoutes);
      setSelectedRouteIndex(0);
      setResponse(builtRoutes[0].mockResult);
      setMetrics(builtRoutes[0].metrics);

      // Focus the map on the best route
      const topDecodedPath = builtRoutes[0].mockResult.decodedPath;
      if (mapRef.current && topDecodedPath.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        (topDecodedPath || []).forEach((p: { lat: number, lng: number }) => bounds.extend(p));
        mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: window.innerWidth > 768 ? 350 : 50 });
      }

    } catch (err: any) { const e = err as Error;
      console.error("Route calculation failed:", e);
      showToast("Could not calculate route. Please try different locations.");
    } finally {
      setIsCalculating(false);
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
      else showToast(`Checkout failed: ${data.error || 'Please try again.'}`);
    } catch (e: any) { showToast(`Checkout failed: ${e instanceof Error ? e.message : 'Unknown error'}`); }
  };

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
        });
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [activeRide?.id, user, userData?.username]);

  const createRide = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!groupRideName) { alert("Name required."); return; }
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const rideData = { name: groupRideName, isPublic: isPublicRide, pin, creatorId: user.uid, status: 'active', startLat: center.lat, startLng: center.lng, leaderId: user.uid };
    const rideRef = await addDoc(collection(db, "group_rides"), rideData);
    setActiveRide({ id: rideRef.id, ...rideData } as any);
    await setDoc(doc(db, `group_rides/${rideRef.id}/participants`, user.uid), { userId: user.uid, name: userData?.username || 'Host', lat: center.lat, lng: center.lng, lastUpdatedAt: Date.now() });
  };

  const joinRide = async (rideId?: string) => {
    if (!user) { setShowAuthModal(true); return; }
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
      await setDoc(doc(db, `group_rides/${targetRide.id}/participants`, user.uid), { userId: user.uid, name: userData?.username || 'Rider', lat: center.lat, lng: center.lng, lastUpdatedAt: Date.now() });
      setActiveRide(targetRide as any);
      setJoinPin('');
    } else { alert("Ride not found."); }
  };

  const leaveRide = async () => {
    if (!activeRide || !user) return;
    await deleteDoc(doc(db, `group_rides/${activeRide.id}/participants`, user.uid));
    setActiveRide(null); setRideParticipants([]);
  };

  const endRide = async () => {
    if (!activeRide) return;
    await updateDoc(doc(db, "group_rides", activeRide.id), { status: 'offline' });
    setActiveRide(null); setRideParticipants([]);
  };

  const setRideLeader = async (participantId: string) => {
    if (!activeRide || user?.uid !== activeRide.creatorId) return;
    await updateDoc(doc(db, "group_rides", activeRide.id), { leaderId: participantId });
    setActiveRide({ ...activeRide, leaderId: participantId } as any);
  };

  const onMapLoad = useCallback((map: google.maps.Map) => { 
    mapRef.current = map; 
    // Force a resize calculation after a short delay
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

  const locateMe = () => {
    if (localStorage.getItem('location_disclosure_accepted') !== 'true') {
      setShowLocationDisclosure(true);
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      showToast("Location services require a secure connection (HTTPS). Please ensure you are using a secure URL.");
      return;
    }

    showToast("Finding your location...", "info");

    if (navigator.geolocation) {
      const handleSuccess = (pos: GeolocationPosition) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        // Imperatively pan+zoom — do NOT call setMapCenter or the re-render resets zoom={12}
        if (mapRef.current) {
          mapRef.current.panTo(loc);
          mapRef.current.setZoom(16);
          // Another resize check after panning
          google.maps.event.trigger(mapRef.current, 'resize');
        }
      };

      // Try High Accuracy First
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        (err) => {
          if (err.code === 1) { // PERMISSION_DENIED
            showToast("Location access denied. Please check your browser settings and ensure you've granted permission for this site to access your location.");
          } else if (err.code === 3) { // TIMEOUT
            // Fallback to low accuracy
            console.warn("High accuracy location timed out, falling back to low accuracy...");
            navigator.geolocation.getCurrentPosition(
              handleSuccess,
              (fallbackErr) => {
                 if (fallbackErr.code === 3) {
                   showToast("Location request timed out. Please ensure you have a clear view of the sky or try again later.");
                 } else {
                   showToast("Failed to get location. " + fallbackErr.message);
                 }
              },
              { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
            );
          } else {
             showToast("Failed to get location. " + err.message);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      showToast("Geolocation is not supported by your browser.");
    }
  };

  const searchPOIs = async (category: string) => {
    if (!isLoaded || !mapRef.current) return;
    if (category === 'charging' && !isPro) { showToast("PRO required."); return; }
    const service = new google.maps.places.PlacesService(mapRef.current!);
    service.textSearch({ location: mapRef.current!.getCenter()!, radius: 5000, query: category }, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        setPois(results.map(p => ({ id: p.place_id!, name: p.name!, address: p.formatted_address!, position: { lat: p.geometry!.location!.lat(), lng: p.geometry!.location!.lng() }, type: category })));
      }
    });
  };

  const handlePoiClick = (p: POI) => {
    if (!mapRef.current) return;
    const service = new google.maps.places.PlacesService(mapRef.current);
    service.getDetails({ placeId: p.id, fields: ['name', 'formatted_address', 'rating', 'user_ratings_total', 'website', 'formatted_phone_number', 'opening_hours', 'photos'] }, (place, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && place) {
        setClickedMapLocation({
          lat: p.position.lat, 
          lng: p.position.lng, 
          placeId: p.id, 
          address: place.formatted_address || p.address,
          details: {
            name: place.name,
            rating: place.rating,
            user_ratings_total: place.user_ratings_total,
            website: place.website,
            formatted_phone_number: place.formatted_phone_number,
            isOpen: place.opening_hours?.isOpen ? place.opening_hours.isOpen() : undefined,
            photoUrl: place.photos && place.photos.length > 0 ? place.photos[0].getUrl({ maxWidth: 200, maxHeight: 150 }) : undefined
          }
        });
      } else {
        setClickedMapLocation({ lat: p.position.lat, lng: p.position.lng, placeId: p.id, address: p.address, details: { name: p.name } });
      }
    });
  };

  const saveCurrentBike = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!newBikeName) return;
    const newBike: SavedBike = { id: Date.now().toString(), name: newBikeName, specs: specs as any };
    const updated = [...savedBikes, newBike];
    setSavedBikes(updated);
    try { await updateDoc(doc(db, "users", user.uid), { bikes: updated }); } catch (e) { console.error('Non-critical map/telemetry error:', e); }
    setNewBikeName(''); showToast("Bike saved!", "success");
  };

  const shareToCommunity = async () => {
    if (!shareCardRef.current || !metrics || !user || !mapSnapshot) return;
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
        authorId: user.uid, authorUsername: userData?.username || 'Rider', authorProfilePic: userData?.profilePic || '', 
        authorIsAdmin: userData?.isAdmin || false,
        imageUrl: url, 
        caption: `Rode ${metrics.distanceMiles.toFixed(1)} miles!`, likes: [], commentsEnabled: true, createdAt: serverTimestamp(),
        tripData: { origin: trip.origin, destination: trip.destination, waypoints: trip.waypoints, isRoundTrip }
      });
      showToast("Shared!", "success"); setShowSharePreview(false);
    } catch (e) { console.error('Non-critical map/telemetry error:', e); }
  };

  const downloadShareCard = async () => {
    if (!shareCardRef.current || !metrics || !mapSnapshot) return;
    try {
      shareCardRef.current.style.opacity = '1';
      await new Promise(r => setTimeout(r, 1500));
      const dataUrl = await toPng(shareCardRef.current, { backgroundColor: "#121212", pixelRatio: 2 });
      shareCardRef.current.style.opacity = '0';
      const link = document.createElement('a'); link.download = `trip.png`; link.href = dataUrl; link.click();
    } catch (e) { console.error('Non-critical map/telemetry error:', e); }
  };

  const filteredBikes = [...globalBikes, ...savedBikes].filter(b => b.name.toLowerCase().includes(bikeSearchQuery.toLowerCase()));
  const isRenting = userRole === 'rider' && !!selectedBikeId;

  // Dynamic Mobile Label Logic
  const getMobileToggleLabel = () => {
    if (showMobileMenu) return 'MAP';
    if (!response) return 'START HERE';
    if (settingsDirty) return 'UPDATE TRIP';
    return 'TRIP METRICS';
  };

  if (loading || !isLoaded) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>Initializing Map Hub...</div>;

  return (
    <div className={styles.container}>
      <SEO title={userRole === 'fleet' ? "Fleet Map" : "Rider Map"} />
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />
      
      {/* Persistent Controls - Split so POI stays behind sidebar, but Toggle stays on top */}
      {/* POI Fast Search Bar (Behind Sidebar) */}
      <div className={styles.poiBar}>
        {[
          { label: '⚡ CHARGERS', cat: 'charging' },
          { label: '☕ CAFES', cat: 'cafe' },
          { label: '🍔 FOOD', cat: 'restaurant' },
          { label: '🌳 PARKS', cat: 'park' }
        ].map(poi => (
          <button 
            key={poi.cat}
            onClick={() => searchPOIs(poi.cat)} 
            className={styles.poiButton}
          >
            {poi.label}
          </button>
        ))}
      </div>

      {/* Locate Me + Map Toggle (Above Sidebar) */}
      <div className={styles.mapControlsOverlay}>
        <button 
          onClick={locateMe}
          className={styles.locateBtn}
          title="Locate Me"
        >
          <img src={orangePin} alt="Locate" style={{ width: '45px', height: '45px', objectFit: 'contain' }} />
        </button>
        <button 
          className={styles.mobileToggleBtn} 
          onClick={() => {
            if (showMobileMenu && settingsDirty) handleCalculate(true);
            else setShowMobileMenu(!showMobileMenu);
          }} 
        >
          {getMobileToggleLabel()}
        </button>
        <button onClick={toggleHelpMode} className={`${styles.helpBtn} ${showHelpMode ? styles.helpBtnActive : styles.helpBtnInactive}`}>?</button>
      </div>

      <div className={styles.mainLayout}>
        <aside className={`${styles.sidebar} sidebar ${showMobileMenu ? 'mobile-visible' : ''}`}>
          
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

          {userRole === 'fleet' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: '#222', padding: '1rem', borderRadius: '16px', border: '1px solid #ff6600' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <div style={{ color: '#ff6600', fontWeight: 900, fontSize: '0.8rem', textTransform: 'uppercase' }}>Fleet Overview</div>
                   {isDrawingPerimeter ? (
                     <div style={{ display: 'flex', gap: '0.4rem' }}>
                       <button onClick={() => setDrawingPerimeterPoints(drawingPerimeterPoints.slice(0, -1))} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '4px', padding: '0.3rem', fontSize: '0.7rem', cursor: 'pointer' }}>Undo</button>
                       <button onClick={() => {
                          setIsDrawingPerimeter(false);
                          setDrawingPerimeterPoints([]);
                       }} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '4px', padding: '0.3rem', fontSize: '0.7rem', cursor: 'pointer' }}>Cancel</button>
                       <button onClick={() => {
                          if (drawingPerimeterPoints.length > 2) {
                            setShopPerimeter(drawingPerimeterPoints);
                            setIsDrawingPerimeter(false);
                            if (userData?.orgId) {
                              updateDoc(doc(db, "organizations", userData.orgId), { perimeter: drawingPerimeterPoints })
                                .then(() => showToast("Perimeter saved successfully", "success"))
                                .catch((err) => showToast("Failed to save perimeter: " + err.message, "error"));
                            }
                          } else {
                            showToast("Draw at least 3 points");
                          }
                       }} style={{ background: '#34a853', color: 'white', border: 'none', borderRadius: '4px', padding: '0.3rem', fontSize: '0.7rem', cursor: 'pointer' }}>Save</button>
                     </div>
                   ) : (
                     <button 
                       onClick={() => { setIsDrawingPerimeter(true); setDrawingPerimeterPoints(shopPerimeter || []); }}
                       style={{ background: 'transparent', color: '#ff6600', border: '1px solid #ff6600', borderRadius: '8px', padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                     >
                       Draw Perimeter
                     </button>
                   )}
                 </div>
                 {isDrawingPerimeter && (
                   <div style={{ fontSize: '0.7rem', color: '#ff6600', marginTop: '0.5rem' }}>Click on the map to draw your shop's allowed riding boundaries.</div>
                 )}
                 <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.4rem' }}>Tracking {liveUnits.length} active rentals.</div>
              </div>

              <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333', overflow: 'hidden' }}>
                <div style={{ background: '#222', padding: '0.8rem', fontWeight: 'bold', fontSize: '0.85rem', borderBottom: '1px solid #333' }}>
                  Live Units Feed
                </div>
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  {liveUnits.length === 0 ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: '#666', fontSize: '0.8rem' }}>No active units.</div>
                  ) : (
                    liveUnits.map(lu => (
                      <div 
                        key={lu.id} 
                        onClick={() => {
                           if (mapRef.current) {
                             mapRef.current.panTo(lu.position);
                             mapRef.current.setZoom(15);
                             setMessageRiderTarget(lu);
                           }
                        }}
                        style={{ padding: '0.8rem', borderBottom: '1px solid #222', cursor: 'pointer', transition: 'background 0.2s' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                          <span style={{ fontWeight: 'bold', color: 'white' }}>{lu.unitName}</span>
                          <span style={{ color: lu.battery < 20 ? '#ff4444' : '#34a853', fontWeight: 'bold' }}>{lu.battery}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#888' }}>
                          <span>Rider: {lu.riderName || 'Unknown'}</span>
                          <span>{lu.speed ? lu.speed.toFixed(0) : 0} mph</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>

          <div style={{ display: 'flex', background: '#111', borderRadius: '12px', padding: '4px', marginBottom: '1.5rem', border: '1px solid #333' }}>
            <button
              onClick={() => setTripMode('plan')}
              style={{ flex: 1, padding: '0.6rem', border: 'none', background: tripMode === 'plan' ? '#ff6600' : 'transparent', color: tripMode === 'plan' ? 'white' : '#888', borderRadius: '8px', fontWeight: 900, fontSize: '0.8rem', transition: 'all 0.2s' }}
            >
              🗺️ PLAN MY TRIP
            </button>
            <button
              onClick={() => setTripMode('track')}
              style={{ flex: 1, padding: '0.6rem', border: 'none', background: tripMode === 'track' ? '#34a853' : 'transparent', color: tripMode === 'track' ? 'white' : '#888', borderRadius: '8px', fontWeight: 900, fontSize: '0.8rem', transition: 'all 0.2s' }}
            >
              ⏱️ TRACK MY RIDE
            </button>
          </div>

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


          {tripMode === 'plan' && (
            <section className="form-group tour-route">
              <label>Route</label>
              {showHelpMode && <HelpBubble text="Start by planning your route. Enter your starting location, any stops, and your destination." />}
              {locations.map((loc, index) => {
                if (index >= 2 && locations[index - 1].trim() === '') return null;
                return (
                  <div key={index} style={{ display: 'flex', gap: '0.4rem', marginTop: index > 0 ? '0.5rem' : '0', alignItems: 'center' }}>
                    <div style={{ flex: 1, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <ModernAutocomplete 
                        placeholder={index === 0 ? "Start" : `Stop ${index}`} 
                        value={loc} 
                        onPlaceSelected={(addr) => updateLocation(index, addr)} 
                      />
                      {index === 0 && (
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            const pos = userLocation || mapCenter;
                            if (!pos) return;
                            const geocoder = new google.maps.Geocoder();
                            geocoder.geocode({ location: pos }, (results, status) => {
                              if (status === 'OK' && results && results[0]) {
                                updateLocation(0, results[0].formatted_address);
                              } else {
                                updateLocation(0, `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`);
                              }
                            });
                          }}
                          style={{ background: '#222', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, height: '40px', width: '40px' }}
                          title="Use Current Location"
                        >
                          <img src={orangePin} alt="Current Location" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                        </button>
                      )}
                      {loc.trim() !== '' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: '2px' }}>
                          <button 
                            onClick={(e) => { e.preventDefault(); moveLocation(index, -1); }}
                            disabled={index === 0}
                            style={{ background: 'none', border: 'none', color: index === 0 ? '#444' : '#bbb', cursor: index === 0 ? 'default' : 'pointer', padding: 0, fontSize: '1rem', lineHeight: '1' }}
                            title="Move Up"
                          >▲</button>
                          <button 
                            onClick={(e) => { e.preventDefault(); moveLocation(index, 1); }}
                            disabled={index === locations.length - 1 || locations[index + 1].trim() === ''}
                            style={{ background: 'none', border: 'none', color: index === locations.length - 1 || locations[index + 1].trim() === '' ? '#444' : '#bbb', cursor: index === locations.length - 1 || locations[index + 1].trim() === '' ? 'default' : 'pointer', padding: 0, fontSize: '1rem', lineHeight: '1' }}
                            title="Move Down"
                          >▼</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="mode-toggle" style={{ marginTop: '1rem' }}>
                <button className={!isRoundTrip ? 'active' : ''} onClick={() => { setIsRoundTrip(false); markDirty(); }}>One Way</button>
                <button className={isRoundTrip ? 'active' : ''} onClick={() => { setIsRoundTrip(true); markDirty(); }}>Round Trip</button>
              </div>
            </section>
          )}

          <div className="tour-battery-specs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <section className="form-group">
              <label>Voltage</label>
              {showHelpMode && <HelpBubble text="These are the most important fields! Your battery voltage and capacity determine the total energy available." />}
              <input type="number" disabled={isRenting} style={{ opacity: isRenting ? 0.5 : 1 }} value={specs.voltage} onChange={e => { setSpecs(p => ({ ...p, voltage: e.target.value === '' ? '' : parseFloat(e.target.value) })); markDirty(); }} />
            </section>
            <section className="form-group">
              <label>Capacity (Ah)</label>
              {showHelpMode && <HelpBubble text="These are the most important fields! Your battery voltage and capacity determine the total energy available." />}
              <input type="number" disabled={isRenting} style={{ opacity: isRenting ? 0.5 : 1 }} value={specs.capacityAh} onChange={e => { setSpecs(p => ({ ...p, capacityAh: e.target.value === '' ? '' : parseFloat(e.target.value) })); markDirty(); }} />
            </section>
          </div>

          <div className="tour-weights" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <section className="form-group">
              <label>Bike Weight (lbs)</label>
              {showHelpMode && <HelpBubble text="Gravity and rolling resistance depend heavily on weight. Accurate weights mean accurate range estimates." />}
              <input type="number" disabled={isRenting} style={{ opacity: isRenting ? 0.5 : 1 }} value={specs.bikeWeightLbs} onChange={e => { setSpecs(p => ({ ...p, bikeWeightLbs: e.target.value === '' ? '' : parseFloat(e.target.value) })); markDirty(); }} />
            </section>
            <section className="form-group">
              <label>Rider Weight (lbs)</label>
              {showHelpMode && <HelpBubble text="Gravity and rolling resistance depend heavily on weight. Accurate weights mean accurate range estimates." />}
              <input type="number" value={riderWeight} onChange={e => { setRiderWeight(e.target.value === '' ? '' : parseFloat(e.target.value)); markDirty(); }} />
            </section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <section className="form-group tour-motor">
              <label>Nominal Motor Rating (Watts)</label>
              {showHelpMode && <HelpBubble text="Your motor rating helps the physics engine understand your bike's power constraints on hills." />}
              <input type="number" disabled={isRenting} style={{ opacity: isRenting ? 0.5 : 1 }} value={specs.motorWatts} onChange={e => { setSpecs(p => ({ ...p, motorWatts: e.target.value === '' ? '' : parseFloat(e.target.value) })); markDirty(); }} />
            </section>
            <section className="form-group"><label>Tire PSI</label><input type="number" disabled={isRenting} style={{ opacity: isRenting ? 0.5 : 1 }} value={specs.tirePSI || 30} onChange={e => { setSpecs(p => ({ ...p, tirePSI: e.target.value === '' ? '' : parseFloat(e.target.value) })); markDirty(); }} /></section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1rem' }}>
            <section className="form-group"><label>Tire Type</label>
              <select disabled={isRenting} value={specs.tireType || 'road'} onChange={e => { setSpecs(p => ({ ...p, tireType: e.target.value as any })); markDirty(); }} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white', opacity: isRenting ? 0.5 : 1 }}>
                <option value="road">Road</option>
                <option value="knobby">Knobby</option>
              </select>
            </section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1rem' }}>
            <section className="form-group tour-speed"><label>Target Average Speed (mph)</label>
              {showHelpMode && <HelpBubble text="Wind resistance increases exponentially with speed. Tell us how fast you plan to ride." />}
              <input type="number" min="1" max="100" value={targetSpeed} onChange={e => { setTargetSpeed(e.target.value === '' ? '' : parseFloat(e.target.value)); markDirty(); }} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: '#ff6600', fontWeight: 'bold', fontSize: '1.2rem', textAlign: 'center' }} />
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

          <section className="form-group tour-current-battery" style={{ marginTop: '1rem' }}>
            <label>Current Battery Level</label>
            {showHelpMode && <HelpBubble text="Set your starting battery percentage or voltage here." />}
            <div className="mode-toggle">
              <button className={batteryInputMode === 'percent' ? 'active' : ''} onClick={() => handleToggleBatteryMode('percent')}>%</button>
              <button className={batteryInputMode === 'voltage' ? 'active' : ''} onClick={() => handleToggleBatteryMode('voltage')}>V</button>
            </div>
            <input type="number" value={batteryInputMode === 'percent' ? startBattery : startVoltage} onChange={e => {
              const valStr = e.target.value;
              const val = valStr === '' ? '' : parseFloat(valStr);
              const { min, max } = getBatteryLevels(Number(specs.voltage));
              if (batteryInputMode === 'percent') {
                setStartBattery(val);
                if (val !== '') setStartVoltage(Number((min + (val / 100) * (max - min)).toFixed(1)));
                else setStartVoltage('');
              } else {
                setStartVoltage(val);
                if (val !== '') setStartBattery(Math.min(100, Math.max(0, Number((((val - min) / (max - min)) * 100).toFixed(0)))));
                else setStartBattery('');
              }
              markDirty(); 
            }} />
          </section>

          {tripMode === 'plan' ? (
            <div style={{ marginTop: '1rem' }}>
              {showHelpMode && <HelpBubble text="Once everything is set, calculate your route to see your remaining battery, efficiency, and trip details!" />}
              <button className="tour-calculate" onClick={handleCalculate} disabled={isCalculating} style={{ width: '100%', padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', opacity: isCalculating ? 0.5 : 1 }}>
                {isCalculating ? 'CALCULATING...' : 'UPDATE ROUTE'}
              </button>
            </div>
          ) : (
            <button onClick={startFreeTracking} style={{ width: '100%', padding: '1.2rem', background: 'linear-gradient(to bottom, #34a853, #2e9148)', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 900, fontSize: '1.2rem', marginTop: '1rem', boxShadow: '0 4px 15px rgba(52,168,83,0.4)' }}>
              🏁 START TRACKING
            </button>
          )}

          {(userData?.isBetaTester || userData?.isAdmin) && (
            <section className="form-group" style={{ borderTop: '1px solid #333', paddingTop: '1rem', marginTop: '1rem' }}>
              <label style={{ color: '#ff6600' }}>Group Ride</label>
              {!activeRide ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingBottom: '0.5rem', borderBottom: '1px solid #333' }}>
                    <input type="text" placeholder="Ride Name" value={groupRideName} onChange={e => setGroupRideName(e.target.value)} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8rem' }}>
                        <input type="checkbox" checked={isPublicRide} onChange={e => setIsPublicRide(e.target.checked)} style={{ marginRight: '0.4rem' }} />
                        Public Ride
                      </label>
                      <button onClick={createRide} style={{ padding: '0.4rem 1rem', background: '#ff6600', border: 'none', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}>Create</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="text" placeholder="PIN" value={joinPin} onChange={e => setJoinPin(e.target.value)} />
                    <button onClick={() => joinRide()} style={{ padding: '0.4rem 1rem', background: '#444', border: 'none', borderRadius: '4px', color: 'white' }}>Join</button>
                  </div>
                  {publicRides.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <label style={{ fontSize: '0.6rem', color: '#888' }}>NEARBY RIDES</label>
                      {publicRides.map(r => (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', padding: '0.5rem', borderRadius: '8px', marginTop: '0.4rem' }}>
                          <span style={{ fontSize: '0.75rem' }}>{r.name}</span>
                          <button onClick={() => joinRide(r.id)} style={{ padding: '0.2rem 0.5rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.6rem' }}>Join</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: 'rgba(52,168,83,0.1)', padding: '1rem', borderRadius: '12px', border: '1px solid #34a853' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{activeRide.name}</strong> <span>PIN: {activeRide.pin}</span></div>
                  <div style={{ margin: '0.5rem 0', fontSize: '0.8rem' }}>{rideParticipants.length} Participants</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.8rem', maxHeight: '150px', overflowY: 'auto' }}>
                    {rideParticipants.map(p => (
                      <div key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.4rem', borderRadius: '4px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          {p.name} 
                          {activeRide.leaderId === p.userId && <span style={{ color: '#34a853', fontSize: '0.7rem', fontWeight: 'bold' }}>★ LEADER</span>}
                        </span>
                        {user?.uid === activeRide.creatorId && activeRide.leaderId !== p.userId && (
                          <button onClick={() => setRideLeader(p.userId)} style={{ padding: '0.2rem 0.5rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.6rem', cursor: 'pointer' }}>Make Leader</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={leaveRide} style={{ flex: 1, padding: '0.5rem', background: '#444', border: 'none', borderRadius: '4px', color: 'white' }}>Leave</button>
                    {user?.uid === activeRide.creatorId && <button onClick={endRide} style={{ flex: 1, padding: '0.5rem', background: '#d93025', border: 'none', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}>End</button>}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Route Alternatives Picker */}
          {allAnalyzedRoutes.length > 1 && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ color: '#666', fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '0.6rem', letterSpacing: '0.08em' }}>Route Options</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {allAnalyzedRoutes.map((r, i) => {
                  const isSelected = i === selectedRouteIndex;
                  const routeColors = ['#ff6600', '#4285F4', '#34a853'];
                  const routeIcons = ['⚡', '🔵', '🟢'];
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedRouteIndex(i);
                        setResponse(r.mockResult);
                        setMetrics(r.metrics);
                        // Re-fit bounds for the newly selected route
                        if (mapRef.current && r.mockResult.decodedPath && r.mockResult.decodedPath.length > 0) {
                          const bounds = new google.maps.LatLngBounds();
                          (r.mockResult.decodedPath || []).forEach((p: { lat: number, lng: number }) => bounds.extend(p));
                          mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: window.innerWidth > 768 ? 350 : 50 });
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '0.8rem 1rem',
                        background: isSelected ? `rgba(${i === 0 ? '255,102,0' : i === 1 ? '66,133,244' : '52,168,83'},0.12)` : '#111',
                        border: isSelected ? `1.5px solid ${routeColors[i] || '#888'}` : '1px solid #2a2a2a',
                        borderRadius: '12px',
                        color: 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem' }}>{routeIcons[i] || '📍'}</span>
                          <span style={{ fontWeight: 700, fontSize: '0.75rem', color: isSelected ? routeColors[i] : '#aaa' }}>
                            {r.metrics.label || `Route ${i + 1}`}
                          </span>
                        </div>
                        <span style={{ fontWeight: 900, fontSize: '0.85rem', color: r.metrics.deathPoint ? '#ff4444' : (isSelected ? routeColors[i] : '#ccc') }}>
                          {r.metrics.deathPoint ? '🪫 Dead' : `${r.metrics.batteryPercentRemaining.toFixed(0)}% left`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.3rem' }}>
                        <span style={{ color: '#666', fontSize: '0.65rem' }}>{(unitSystem === 'imperial' ? r.metrics.distanceMiles : r.metrics.distanceMiles * 1.60934).toFixed(1)} {unitSystem === 'imperial' ? 'mi' : 'km'}</span>
                        <span style={{ color: '#666', fontSize: '0.65rem' }}>⛰️ {Math.round(unitSystem === 'imperial' ? r.metrics.elevationGainFeet : r.metrics.elevationGainFeet * 0.3048)} {unitSystem === 'imperial' ? 'ft' : 'm'}</span>
                        <span style={{ color: '#666', fontSize: '0.65rem' }}>{Math.floor(r.metrics.durationMin/60)}h {Math.round(r.metrics.durationMin%60)}m</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {metrics && (
            <div className="card metrics-card" style={{ marginTop: '1.5rem', borderLeft: metrics.deathPoint ? '4px solid #ff4444' : '4px solid #ff6600', padding: '1.5rem', background: '#1a1a1a', borderRadius: '16px' }}>
              <div style={{ color: metrics.deathPoint ? '#ff4444' : '#ff6600', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase' }}>
                {metrics.deathPoint ? '⚠️ INSUFFICIENT ENERGY' : `Estimated Metrics (${metrics.label || 'Optimal Route'})`}
              </div>
              
              {metrics.deathPoint ? (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ff4444' }}>Battery Dies Early</div>
                  <p style={{ color: '#888', fontSize: '0.75rem', lineHeight: '1.4', margin: '0.5rem 0 1rem 0' }}>The physics engine predicts you will run out of power at the location marked 🪫 on the map.</p>
                  <button 
                    onClick={handleRangeRescue} 
                    disabled={isFindingRescue}
                    style={{ width: '100%', padding: '0.8rem', background: '#ff4444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', marginBottom: '1.5rem', opacity: isFindingRescue ? 0.5 : 1 }}
                  >
                    {isFindingRescue ? 'SEARCHING...' : '⚡ FIND RANGE RESCUE'}
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white' }}>
                    Battery Left: {metrics.batteryPercentRemaining.toFixed(1)}%
                    {userData?.isAdmin && (
                      <span style={{ fontSize: '0.9rem', color: '#888', marginLeft: '0.5rem', fontWeight: 400 }}>
                        (±{specs.correctionFactors?.confidence_interval_pct || 25}%)
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Est. End Voltage: {metrics.endingVoltage?.toFixed(1)}V</div>
                </>
              )}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>Travel Time:</span><span style={{ fontWeight: 'bold', color: 'white' }}>{Math.floor(metrics.durationMin/60)}h {Math.round(metrics.durationMin%60)}m</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>Distance:</span><span style={{ fontWeight: 'bold', color: 'white' }}>{(unitSystem === 'imperial' ? metrics.distanceMiles : metrics.distanceMiles * 1.60934).toFixed(1)} {unitSystem === 'imperial' ? 'mi' : 'km'}</span></div>
                <div style={{ borderTop: '1px solid #333', margin: '0.5rem 0' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>⛰️ Elevation Gain:</span><span style={{ color: '#ffbb33', fontWeight: 'bold' }}>{Math.round(unitSystem === 'imperial' ? metrics.elevationGainFeet : metrics.elevationGainFeet * 0.3048)} {unitSystem === 'imperial' ? 'ft' : 'm'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>🔋 Efficiency:</span><span style={{ color: '#00ccff', fontWeight: 'bold' }}>{(unitSystem === 'imperial' ? metrics.efficiencyWhMi : metrics.efficiencyWhMi / 1.60934).toFixed(1)} Wh/{unitSystem === 'imperial' ? 'mi' : 'km'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666' }}>🌬️ Wind:</span><span style={{ color: '#4caf50', fontWeight: 'bold' }}>{(unitSystem === 'imperial' ? metrics.windConditions?.speed : (metrics.windConditions?.speed || 0) * 1.60934)?.toFixed(1)} {unitSystem === 'imperial' ? 'mph' : 'km/h'}</span></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button onClick={() => { if (isExploreTier) setShowSharePreview(true); else setShowGroupRidePaywall(true); }} style={{ width: '100%', padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 900 }}>Share {isExploreTier ? '' : '🔒'}</button>
                {metrics.distanceMiles > 0.0062 && (
                  <button onClick={handleOpenRouteReplay} style={{ width: '100%', padding: '1rem', background: '#333', color: '#ff6600', border: '1px solid #ff6600', borderRadius: '12px', fontWeight: 900 }}>3D VIEW {(userData?.isBetaTester || userData?.isAdmin) ? '' : '🔒'}</button>
                )}
              </div>
              <button onClick={startNavigation} style={{ width: '100%', padding: '1.2rem', background: 'linear-gradient(to bottom, #ff8800, #ff6600)', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 900, fontSize: '1.2rem', boxShadow: '0 4px 15px rgba(255,102,0,0.4)' }}>🏁 START TRIP</button>
            </div>
          )}
          </>
          )}
        </aside>

        <main style={{ flex: 1, position: 'relative', minHeight: 0, minWidth: 0 }}>
          <div style={{ position: 'absolute', top: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: '90%', maxWidth: '400px' }}>
            <ModernAutocomplete 
              placeholder="Search map..." 
              onPlaceSelected={(addr) => handleAddLocationToRoute(addr)} 
            />
          </div>
          {isTrackingFreeRide && (
            <div className="nav-overlay" style={{ background: '#1a1a1a', border: '2px solid #34a853', borderRadius: '20px', padding: '1.2rem', boxShadow: '0 10px 40px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: 'white', fontWeight: 'bold' }}>Free Ride Tracking</div>
                  <button onClick={stopFreeTracking} style={{ background: '#ff4444', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>⏹</button>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', borderTop: '1px solid #333', paddingTop: '1rem', marginTop: '0.4rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#888', fontSize: '0.6rem', textTransform: 'uppercase' }}>Speed</div>
                    <div style={{ color: '#34a853', fontSize: '1.5rem', fontWeight: 900 }}>{(unitSystem === 'imperial' ? realTimeSpeedMph : realTimeSpeedMph * 1.60934).toFixed(0)} <span style={{ fontSize: '0.6rem', fontWeight: 400 }}>{unitSystem === 'imperial' ? 'MPH' : 'KMH'}</span></div>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid #333', borderRight: '1px solid #333' }}>
                    <div style={{ color: '#888', fontSize: '0.6rem', textTransform: 'uppercase' }}>Distance</div>
                    <div style={{ color: '#00ccff', fontSize: '1.2rem', fontWeight: 900 }}>{(unitSystem === 'imperial' ? actualDistanceMiles : actualDistanceMiles * 1.60934).toFixed(1)} <span style={{ fontSize: '0.6rem', fontWeight: 400 }}>{unitSystem === 'imperial' ? 'mi' : 'km'}</span></div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#888', fontSize: '0.6rem', textTransform: 'uppercase' }}>Remaining</div>
                    <div style={{ color: '#ff6600', fontSize: '1.2rem', fontWeight: 900 }}>{(unitSystem === 'imperial' ? realTimeRemainingMiles : realTimeRemainingMiles * 1.60934).toFixed(1)} <span style={{ fontSize: '0.6rem', fontWeight: 400 }}>{unitSystem === 'imperial' ? 'mi' : 'km'}</span></div>
                  </div>
                </div>
            </div>
          )}

          {isNavigating && response && (
            <div className="nav-overlay" style={{ background: '#1a1a1a', border: '2px solid #ff6600', borderRadius: '20px', padding: '1.2rem', boxShadow: '0 10px 40px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: 'white', fontWeight: 'bold' }}>{distToNextStep || 'Navigating...'}</div>
                  <button onClick={stopNavigation} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}>✕</button>
                </div>
                
                {/* REAL-TIME TELEMETRY OVERLAY */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', borderTop: '1px solid #333', paddingTop: '1rem', marginTop: '0.4rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#888', fontSize: '0.6rem', textTransform: 'uppercase' }}>Speed</div>
                    <div style={{ color: '#ff6600', fontSize: '1.5rem', fontWeight: 900 }}>{(unitSystem === 'imperial' ? realTimeSpeedMph : realTimeSpeedMph * 1.60934).toFixed(0)} <span style={{ fontSize: '0.6rem', fontWeight: 400 }}>{unitSystem === 'imperial' ? 'MPH' : 'KMH'}</span></div>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid #333', borderRight: '1px solid #333' }}>
                    <div style={{ color: '#888', fontSize: '0.6rem', textTransform: 'uppercase' }}>Efficiency</div>
                    <div style={{ color: '#00ccff', fontSize: '1.2rem', fontWeight: 900 }}>{(unitSystem === 'imperial' ? realTimeWhMi : realTimeWhMi / 1.60934).toFixed(1)} <span style={{ fontSize: '0.6rem', fontWeight: 400 }}>Wh/{unitSystem === 'imperial' ? 'mi' : 'km'}</span></div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#888', fontSize: '0.6rem', textTransform: 'uppercase' }}>Remaining</div>
                    <div style={{ color: '#34a853', fontSize: '1.2rem', fontWeight: 900 }}>{(unitSystem === 'imperial' ? realTimeRemainingMiles : realTimeRemainingMiles * 1.60934).toFixed(1)} <span style={{ fontSize: '0.6rem', fontWeight: 400 }}>{unitSystem === 'imperial' ? 'mi' : 'km'}</span></div>
                  </div>
                </div>
            </div>
          )}

          <div className="bottom-map-controls">
            {(isNavigating || isTrackingFreeRide) && !isCameraLocked && (
              <button 
                onClick={() => {
                  setIsCameraLocked(true);
                  if (mapRef.current && userLocation) {
                    mapRef.current.panTo(userLocation);
                  }
                }}
                style={{ position: 'absolute', bottom: '120px', left: '50%', transform: 'translateX(-50%)', padding: '0.8rem 1.2rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '24px', fontWeight: 900, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 10 }}
              >
                🎯 RECENTER
              </button>
            )}
            <button 
              onClick={locateMe}
              style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title="Locate Me"
            >
              <img src={orangePin} alt="Locate" style={{ width: '45px', height: '45px', objectFit: 'contain' }} />
            </button>
            <button 
              className="mobile-toggle-btn" 
              onClick={() => {
                if (showMobileMenu && settingsDirty) handleCalculate(true);
                else setShowMobileMenu(!showMobileMenu);
              }} 
              style={{ height: '50px', padding: '0 1.5rem', borderRadius: '40px', background: '#ff6600', color: 'white', border: 'none', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
            >
              {getMobileToggleLabel()}
            </button>
            <button onClick={() => searchPOIs('charging')} className="desktop-only" style={{ padding: '0.8rem 1.2rem', background: 'rgba(20,20,20,0.9)', color: 'white', border: '1px solid #333', borderRadius: '12px', fontWeight: 900 }}>⚡ Chargers</button>
            <button onClick={() => searchPOIs('cafe')} className="desktop-only" style={{ padding: '0.8rem 1.2rem', background: 'rgba(20,20,20,0.9)', color: 'white', border: '1px solid #333', borderRadius: '12px', fontWeight: 900 }}>☕ Cafes</button>
            <button onClick={toggleHelpMode} className="desktop-only" style={{ padding: '0.8rem 1.2rem', background: showHelpMode ? '#ff6600' : 'rgba(20,20,20,0.9)', color: 'white', border: '1px solid #333', borderRadius: '12px', fontWeight: 900 }}>❔ Help</button>
          </div>

          <GoogleMap 
            mapContainerStyle={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} 
            center={userRole === 'fleet' ? (shopLocation || center) : mapCenter}
            zoom={12}
            onClick={(e) => {
              if (userRole === 'fleet' && isDrawingPerimeter) {
                if (e.latLng) {
                   setDrawingPerimeterPoints([...drawingPerimeterPoints, { lat: e.latLng.lat(), lng: e.latLng.lng() }]);
                }
                return;
              }
              if (e.stop) e.stop(); // Prevent default POI popup from Google
              setClickedMapLocation(null);
              if (userRole === 'fleet') {
                setMessageRiderTarget(null);
              }
              if (e.latLng) {
                const lat = e.latLng.lat();
                const lng = e.latLng.lng();
                const placeId = (e as any).placeId;
                
                if (placeId && mapRef.current) {
                  const service = new google.maps.places.PlacesService(mapRef.current);
                  service.getDetails({ placeId, fields: ['name', 'formatted_address', 'rating', 'user_ratings_total', 'website', 'formatted_phone_number', 'opening_hours', 'photos'] }, (place, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                      setClickedMapLocation({
                        lat, lng, placeId, 
                        address: place.formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                        details: {
                          name: place.name,
                          rating: place.rating,
                          user_ratings_total: place.user_ratings_total,
                          website: place.website,
                          formatted_phone_number: place.formatted_phone_number,
                          isOpen: place.opening_hours?.isOpen ? place.opening_hours.isOpen() : undefined,
                          photoUrl: place.photos && place.photos.length > 0 ? place.photos[0].getUrl({ maxWidth: 200, maxHeight: 150 }) : undefined
                        }
                      });
                    } else {
                      const geocoder = new google.maps.Geocoder();
                      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                        if (status === 'OK' && results && results[0]) {
                          setClickedMapLocation({ lat, lng, placeId, address: results[0].formatted_address });
                        } else {
                          setClickedMapLocation({ lat, lng, placeId, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
                        }
                      });
                    }
                  });
                } else {
                  const geocoder = new google.maps.Geocoder();
                  geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                    if (status === 'OK' && results && results[0]) {
                      setClickedMapLocation({ lat, lng, placeId, address: results[0].formatted_address });
                    } else {
                      setClickedMapLocation({ lat, lng, placeId, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
                    }
                  });
                }
              }
            }}
            onLoad={onMapLoad}
            onDragStart={() => setIsCameraLocked(false)}
            onIdle={() => {
              if (mapRef.current && userRole !== 'fleet') {
                const newCenter = mapRef.current.getCenter();
                if (newCenter) {
                  const lat = newCenter.lat();
                  const lng = newCenter.lng();
                  // Only update if it's different enough to avoid unnecessary re-renders
                  if (Math.abs(mapCenter.lat - lat) > 0.0001 || Math.abs(mapCenter.lng - lng) > 0.0001) {
                    setMapCenter({ lat, lng });
                  }
                }
              }
            }}
            options={{ mapId: import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID', disableDefaultUI: true }}
          >
            {rangePolygonPoints && !trip.destination && (userRole !== 'fleet' || messageRiderTarget) && (
              <PolygonF
                paths={rangePolygonPoints}
                options={{
                  strokeColor: '#ff6600',
                  strokeOpacity: 0.8,
                  strokeWeight: 2,
                  fillColor: '#ff6600',
                  fillOpacity: 0.35,
                  clickable: false,
                  zIndex: 1
                }}
              />
            )}

            {/* Free Ride Breadcrumb Trail */}
            {breadcrumbTrail.length > 0 && (
              <Polyline
                path={breadcrumbTrail}
                options={{ strokeColor: '#34a853', strokeOpacity: 0.8, strokeWeight: 6, zIndex: 5 }}
              />
            )}

            {/* Dead Battery Marker */}
            {metrics?.deathPoint && (
              <AdvancedMarker position={metrics.deathPoint} title="Battery Depleted">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ background: '#ff4444', color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', border: '2px solid white', marginBottom: '4px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                    STRANDED HERE
                  </div>
                  <div style={{ background: 'white', width: '35px', height: '35px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', border: '3px solid #ff4444', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>🪫</div>
                </div>
              </AdvancedMarker>
            )}

            {/* Alternative Routes (rendered behind the selected route) */}
            {allAnalyzedRoutes.map((r, i) => {
              if (i === selectedRouteIndex) return null; // skip selected — rendered below
              const altColors = ['#4285F4', '#34a853', '#aa44ff'];
              const path = r.mockResult?.routes[0]?.overview_path;
              if (!path) return null;
              return (
                <Polyline
                  key={`alt-${i}`}
                  path={path}
                  onClick={() => {
                    setSelectedRouteIndex(i);
                    setResponse(allAnalyzedRoutes[i].mockResult);
                    setMetrics(allAnalyzedRoutes[i].metrics);
                  }}
                  options={{
                    strokeColor: altColors[i] || '#888',
                    strokeOpacity: 0.6,
                    strokeWeight: 7,
                    geodesic: true,
                    clickable: true,
                    zIndex: 5
                  }}
                />
              );
            })}

            {/* Selected Route Rendering */}
            {response && response.routes[0]?.overview_path && (
              <>
                {/* Dark outline for contrast */}
                <Polyline 
                  path={response.routes[0].overview_path} 
                  options={{ strokeColor: '#000000', strokeOpacity: 0.6, strokeWeight: 8, geodesic: true, zIndex: 10, clickable: false }} 
                />
                <Polyline 
                  path={response.routes[0].overview_path} 
                  options={{ strokeColor: '#ff6600', strokeOpacity: 1.0, strokeWeight: 5, geodesic: true, zIndex: 11, clickable: false }} 
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
                <AdvancedMarker key={p.id} position={p.position} onClick={() => handlePoiClick(p)}>
                  <div style={{ background: p.type === 'charging' ? '#34a853' : '#4285F4', padding: '4px', borderRadius: '50%', border: '2px solid white', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>{p.type === 'charging' ? '⚡' : '📍'}</div>
                </AdvancedMarker>
            ))}
              {/* Ride Participants */}
              {rideParticipants.map(p => (
                <AdvancedMarker key={p.userId} position={{ lat: p.lat, lng: p.lng }} title={p.name}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ background: activeRide?.leaderId === p.userId ? '#34a853' : (activeRide?.creatorId === p.userId ? '#ff6600' : '#444'), color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', border: '2px solid white', marginBottom: '4px', whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                      {p.name} {activeRide?.leaderId === p.userId && ' ★'}
                    </div>
                    <div style={{ background: 'white', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${activeRide?.leaderId === p.userId ? '#34a853' : (activeRide?.creatorId === p.userId ? '#ff6600' : '#444')}`, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>🚴</div>
                  </div>
                </AdvancedMarker>
              ))}

              {activeRide?.leaderTrail && activeRide.leaderTrail.length > 1 && (
                <Polyline path={activeRide.leaderTrail} options={{ strokeColor: '#ff6600', strokeOpacity: 0.9, strokeWeight: 6, zIndex: 10, geodesic: true }} />
              )}

              {clickedMapLocation && (
              <InfoWindowF
                key={clickedMapLocation.placeId || `${clickedMapLocation.lat}-${clickedMapLocation.lng}`}
                position={{ lat: clickedMapLocation.lat, lng: clickedMapLocation.lng }}
                onCloseClick={() => setClickedMapLocation(null)}
              >
                <div style={{ padding: '0.5rem', maxWidth: '200px', color: '#111' }}>
                  {clickedMapLocation.details?.photoUrl && (
                    <img 
                      src={clickedMapLocation.details.photoUrl} 
                      alt="POI" 
                      style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '8px', marginBottom: '0.5rem' }}
                    />
                  )}
                  <p style={{ margin: '0 0 0.2rem 0', fontWeight: 'bold', fontSize: '1rem', lineHeight: '1.2' }}>
                    {clickedMapLocation.details?.name || clickedMapLocation.address || 'Selected Location'}
                  </p>
                  
                  {clickedMapLocation.details?.rating && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.4rem', fontSize: '0.8rem' }}>
                      <span style={{ color: '#ffcc00' }}>★</span>
                      <span style={{ fontWeight: 'bold' }}>{clickedMapLocation.details.rating}</span>
                      <span style={{ color: '#666' }}>({clickedMapLocation.details.user_ratings_total})</span>
                    </div>
                  )}

                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#555', lineHeight: '1.3' }}>
                    {clickedMapLocation.details?.name ? clickedMapLocation.address : ''}
                  </p>

                  {clickedMapLocation.details?.isOpen !== undefined && (
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', fontWeight: 'bold', color: clickedMapLocation.details.isOpen ? '#34a853' : '#ea4335' }}>
                      {clickedMapLocation.details.isOpen ? 'Open Now' : 'Closed'}
                    </p>
                  )}

                  <button
                    onClick={() => {
                      if (clickedMapLocation.address) {
                        handleAddLocationToRoute(clickedMapLocation.details?.name ? `${clickedMapLocation.details.name}, ${clickedMapLocation.address}` : clickedMapLocation.address);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      background: '#ff6600',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      marginTop: '0.2rem'
                    }}
                  >
                    Add to Route
                  </button>
                </div>
              </InfoWindowF>
            )}

            {shopPerimeter && !isDrawingPerimeter && (
              <PolygonF
                paths={shopPerimeter}
                options={{
                  fillColor: '#ff6600',
                  fillOpacity: 0.1,
                  strokeColor: '#ff6600',
                  strokeOpacity: 0.8,
                  strokeWeight: 2,
                  clickable: false,
                  zIndex: 1
                }}
              />
            )}
            
            {userRole === 'fleet' && isDrawingPerimeter && drawingPerimeterPoints.length > 0 && (
              <>
                <Polyline 
                  path={drawingPerimeterPoints}
                  options={{ strokeColor: '#ff6600', strokeWeight: 3, zIndex: 2 }}
                />
                {drawingPerimeterPoints.length > 2 && (
                  <PolygonF
                    paths={drawingPerimeterPoints}
                    options={{ fillColor: '#ff6600', fillOpacity: 0.3, strokeColor: '#ff6600', strokeWeight: 2, clickable: false, zIndex: 1 }}
                  />
                )}
              </>
            )}

            {userRole === 'fleet' && messageRiderTarget && (
              <InfoWindowF
                position={messageRiderTarget.position}
                onCloseClick={() => setMessageRiderTarget(null)}
              >
                <div style={{ color: 'black', padding: '0.4rem', minWidth: '150px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '4px' }}>{messageRiderTarget.unitName}</div>
                  <div style={{ fontSize: '0.8rem', color: '#444', marginBottom: '8px' }}>Rider: {messageRiderTarget.riderName || 'Unknown'}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: messageRiderTarget.battery < 20 ? '#ff4444' : '#34a853' }}>Battery: {messageRiderTarget.battery}%</div>
                  <div style={{ fontSize: '0.8rem', marginBottom: '8px' }}>Speed: {messageRiderTarget.speed?.toFixed(0) || 0} mph</div>
                  <button
                    onClick={() => {
                      const msg = window.prompt("Enter message to send to rider:");
                      if (msg && msg.trim() && user) {
                         createNotification(messageRiderTarget.id, user.uid, userData?.orgName || "Shop HQ", 'fleet_alert', user.uid, `Message from Shop: ${msg}`);
                         showToast("Message sent to rider!");
                      }
                    }}
                    style={{ width: '100%', padding: '0.4rem', background: '#4285F4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Send Message
                  </button>
                </div>
              </InfoWindowF>
            )}
          </GoogleMap>

          <div style={{ 
            position: 'absolute', 
            bottom: '10px', 
            left: '50%', 
            transform: 'translateX(-50%)', 
            backgroundColor: 'rgba(0,0,0,0.85)', 
            color: '#888', 
            fontSize: '0.65rem', 
            padding: '8px 16px', 
            borderRadius: '20px', 
            zIndex: 1000, 
            width: '90%',
            maxWidth: '500px',
            border: '1px solid #333', 
            display: 'flex', 
            gap: '12px', 
            alignItems: 'center', 
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)', 
            backdropFilter: 'blur(5px)' 
          }}>
            <span style={{ flex: 1 }}>⚡ Estimates only. Actual range varies with conditions. Never ride beyond your physical limits.</span>
            <div style={{ display: 'flex', gap: '8px', borderLeft: '1px solid #444', paddingLeft: '12px' }}>
              <span onClick={() => setShowToSPage(true)} style={{ color: '#ff6600', cursor: 'pointer', textDecoration: 'underline' }}>TOS</span>
              <span onClick={() => setShowPrivacyPage(true)} style={{ color: '#ff6600', cursor: 'pointer', textDecoration: 'underline' }}>Privacy</span>
            </div>
          </div>
        </main>
      </div>

      <Suspense fallback={null}>
        {showSharePreview && metrics && (
          <ShareCard 
            metrics={metrics}
            shareCardRef={shareCardRef}
            setShowRouteReplay={handleOpenRouteReplay}
            setShowSharePreview={setShowSharePreview}
            downloadShareCard={downloadShareCard}
            shareToCommunity={shareToCommunity}
          />
        )}

        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}
        {showPrivacyPage && <PrivacyPolicy onClose={() => setShowPrivacyPage(false)} />}
        {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
        {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
        
        {showChargingRescue && metrics && (
          <OpportunityChargingModal
            bikeSpecs={specs}
            currentBatteryWh={((Number(specs.voltage)||48) * (Number(specs.capacityAh)||15)) * ((Number(startBattery)||100)/100)}
            neededWh={metrics.estimatedWh}
            chargingStops={suggestedStops}
            onClose={() => setShowChargingRescue(false)}
            onSelectStop={(stop) => addRescueStop(stop)}
          />
        )}

        {showCalibrationModal && currentTripBike && (
          <CalibrationModal 
            user={user}
            userData={userData}
            bike={currentTripBike}
            predictedWh={tripPredictedWh}
            distanceMiles={actualDistanceMiles}
            avgSpeedMph={Number(targetSpeed) || 18}
            startBattery={tripStartBattery}
            elevationGainFt={tripElevationGain}
            temperatureC={tripTemperatureC}
            windSpeedMs={tripWindSpeedMs}
            riderWeightLbs={Number(riderWeight) || 180}
            stopCount={stopCount}
            speedHistory={speedHistory}
            orgId={userData?.orgId}
            onClose={() => {
              setShowCalibrationModal(false);
              if (pendingActionAfterCalibration === 'share') {
                setShowSharePreview(true);
                setPendingActionAfterCalibration(null);
              }
            }}
            onComplete={(newFactor) => {
              setShowCalibrationModal(false);
              // Update local state to reflect the new factor immediately
              setSpecs(p => ({ ...p, calibrationFactor: newFactor }));
              setCurrentTripBike(prev => prev ? {
                ...prev,
                specs: { ...prev.specs, calibrationFactor: newFactor }
              } : null);
              if (pendingActionAfterCalibration === 'share') {
                setShowSharePreview(true);
                setPendingActionAfterCalibration(null);
              }
            }}
          />
        )}

        {showRouteReplay && (response?.routes[0] || breadcrumbTrail.length > 0) && (
          <RouteReplay3D 
            polyline={breadcrumbTrail.length > 0 ? breadcrumbTrail : response!.routes[0].overview_polyline} 
            onClose={() => setShowRouteReplay(false)}
            maptilerKey={import.meta.env.VITE_MAPTILER_KEY}
            userPhotoURL={userData?.profilePic || ''}
          />
        )}
      </Suspense>

      {toastMessage && <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} />}

      {showLocationDisclosure && (
        <LocationDisclosureModal 
          onAccept={handleLocationAccept}
          onCancel={() => setShowLocationDisclosure(false)}
        />
      )}

      {showUpgradeModal && (
        <UpgradeModal
          title={upgradeContext.title}
          message={upgradeContext.message}
          featureName={upgradeContext.feature}
          onUpgrade={handleStartUpgrade}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      {showGroupRidePaywall && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 200000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
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
