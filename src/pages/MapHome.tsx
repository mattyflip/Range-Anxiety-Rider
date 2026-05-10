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
  { name: "Zero FX", specs: { voltage: 102, capacityAh: 70, motorWatts: 34000, bikeWeightLbs: 289 } },
  { name: "Energica Ego+ RS", specs: { voltage: 300, capacityAh: 72, motorWatts: 126000, bikeWeightLbs: 573 } },
  { name: "Energica Experia", specs: { voltage: 300, capacityAh: 75, motorWatts: 75000, bikeWeightLbs: 573 } },
  { name: "LiveWire One", specs: { voltage: 350, capacityAh: 44, motorWatts: 75000, bikeWeightLbs: 562 } },
  { name: "LiveWire S2 Del Mar", specs: { voltage: 102, capacityAh: 103, motorWatts: 63000, bikeWeightLbs: 436 } },
  { name: "E Ride Pro SS", specs: { voltage: 72, capacityAh: 40, motorWatts: 12000, bikeWeightLbs: 139 } },
  { name: "Cake Bukk", specs: { voltage: 72, capacityAh: 40, motorWatts: 16000, bikeWeightLbs: 196 } },
  { name: "Cake Kalk OR", specs: { voltage: 52, capacityAh: 50, motorWatts: 11000, bikeWeightLbs: 165 } },
  { name: "UBCO 2x2 Adventure", specs: { voltage: 50, capacityAh: 62, motorWatts: 2000, bikeWeightLbs: 156 } },
  { name: "Onyx RCR", specs: { voltage: 72, capacityAh: 41, motorWatts: 5000, bikeWeightLbs: 145 } },

  // --- Premium & Lightweight E-Bikes ---
  { name: "Specialized Turbo Levo (Gen 3)", specs: { voltage: 36, capacityAh: 19.4, motorWatts: 565, bikeWeightLbs: 50 } },
  { name: "Specialized Turbo Levo SL 2", specs: { voltage: 48, capacityAh: 6.6, motorWatts: 320, bikeWeightLbs: 39 } },
  { name: "Specialized Turbo Vado 5.0", specs: { voltage: 36, capacityAh: 19.7, motorWatts: 565, bikeWeightLbs: 58 } },
  { name: "Specialized Turbo Creo 2", specs: { voltage: 48, capacityAh: 6.6, motorWatts: 320, bikeWeightLbs: 30 } },
  { name: "Specialized Turbo Porto", specs: { voltage: 36, capacityAh: 19.7, motorWatts: 565, bikeWeightLbs: 85 } },
  { name: "Trek Fuel EXe", specs: { voltage: 50, capacityAh: 7.2, motorWatts: 250, bikeWeightLbs: 41 } },
  { name: "Trek Rail 9.9", specs: { voltage: 36, capacityAh: 20.8, motorWatts: 250, bikeWeightLbs: 49 } },
  { name: "Trek Allant+ 9.9s", specs: { voltage: 36, capacityAh: 17.3, motorWatts: 250, bikeWeightLbs: 51 } },
  { name: "Giant Trance X Advanced E+ Elite", specs: { voltage: 36, capacityAh: 11.1, motorWatts: 250, bikeWeightLbs: 42 } },
  { name: "Giant Reign E+", specs: { voltage: 36, capacityAh: 22.2, motorWatts: 250, bikeWeightLbs: 54 } },
  { name: "Giant Revolt E+", specs: { voltage: 36, capacityAh: 13.8, motorWatts: 250, bikeWeightLbs: 40 } },
  { name: "Santa Cruz Heckler", specs: { voltage: 36, capacityAh: 20, motorWatts: 250, bikeWeightLbs: 48 } },
  { name: "Yeti 160E", specs: { voltage: 36, capacityAh: 17.5, motorWatts: 250, bikeWeightLbs: 52 } },
  { name: "Gazelle Eclipse C380", specs: { voltage: 36, capacityAh: 20.8, motorWatts: 250, bikeWeightLbs: 59 } },
  { name: "Tern Orox", specs: { voltage: 36, capacityAh: 22.2, motorWatts: 250, bikeWeightLbs: 74 } },
  { name: "Tern GSD S00", specs: { voltage: 36, capacityAh: 13.8, motorWatts: 250, bikeWeightLbs: 82 } },
  { name: "Canyon Strive:ON", specs: { voltage: 36, capacityAh: 20.8, motorWatts: 600, bikeWeightLbs: 53 } },
  { name: "Orbea Rise LT", specs: { voltage: 36, capacityAh: 11.6, motorWatts: 250, bikeWeightLbs: 37 } },
  { name: "Rocky Mountain Altitude Powerplay", specs: { voltage: 48, capacityAh: 15, motorWatts: 700, bikeWeightLbs: 54 } },
  { name: "Cannondale Moterra Neo", specs: { voltage: 36, capacityAh: 20.8, motorWatts: 250, bikeWeightLbs: 55 } },

  // --- Commuter & Everyday Utility ---
  { name: "Aventon Aventure.3", specs: { voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 77 } },
  { name: "Aventon Level.2", specs: { voltage: 48, capacityAh: 14, motorWatts: 500, bikeWeightLbs: 62 } },
  { name: "Aventon Soltera.2", specs: { voltage: 36, capacityAh: 9.6, motorWatts: 350, bikeWeightLbs: 46 } },
  { name: "Aventon Abound", specs: { voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 81 } },
  { name: "Rad Power Radster Road", specs: { voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 75 } },
  { name: "Rad Power RadWagon 5", specs: { voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 86 } },
  { name: "Rad Power RadRunner 3 Plus", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 75 } },
  { name: "Rad Power RadExpand 5 Plus", specs: { voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 72 } },
  { name: "Lectric XP 3.0", specs: { voltage: 48, capacityAh: 10.4, motorWatts: 500, bikeWeightLbs: 64 } },
  { name: "Lectric ONE", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 55 } },
  { name: "Lectric XPeak", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 71 } },
  { name: "Ride1Up Revv 1 DRT", specs: { voltage: 52, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 93 } },
  { name: "Ride1Up Portola", specs: { voltage: 48, capacityAh: 13.4, motorWatts: 750, bikeWeightLbs: 59 } },
  { name: "Juiced Scrambler FS", specs: { voltage: 52, capacityAh: 19.2, motorWatts: 750, bikeWeightLbs: 78 } },
  { name: "Juiced Scorpion X2", specs: { voltage: 52, capacityAh: 15.6, motorWatts: 1000, bikeWeightLbs: 77 } },
  { name: "Super73-S2 Legacy", specs: { voltage: 48, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 73 } },
  { name: "Super73-R Adventure", specs: { voltage: 48, capacityAh: 20, motorWatts: 1000, bikeWeightLbs: 88 } },
  { name: "Himiway A7 Pro", specs: { voltage: 48, capacityAh: 15, motorWatts: 500, bikeWeightLbs: 65 } },
  { name: "Engwe X26", specs: { voltage: 48, capacityAh: 29.2, motorWatts: 1000, bikeWeightLbs: 90 } },
  { name: "Velotric Nomad 1", specs: { voltage: 48, capacityAh: 14.7, motorWatts: 750, bikeWeightLbs: 72 } },

  // --- Specialized & High Torque ---
  { name: "Wired Freedom", specs: { voltage: 60, capacityAh: 20, motorWatts: 2400, bikeWeightLbs: 88 } },
  { name: "Solar Eclipse 2.0", specs: { voltage: 72, capacityAh: 45, motorWatts: 10000, bikeWeightLbs: 130 } },
  { name: "Roadrunner Pro", specs: { voltage: 60, capacityAh: 30, motorWatts: 4000, bikeWeightLbs: 105 } },
  { name: "QuietKat Apex Pro", specs: { voltage: 48, capacityAh: 16, motorWatts: 1000, bikeWeightLbs: 70 } },
  { name: "Bakcou Mule", specs: { voltage: 48, capacityAh: 21, motorWatts: 1000, bikeWeightLbs: 68 } },
  { name: "VanMoof S5", specs: { voltage: 42, capacityAh: 11, motorWatts: 250, bikeWeightLbs: 50 } },
  { name: "Cowboy Cruiser", specs: { voltage: 36, capacityAh: 10, motorWatts: 250, bikeWeightLbs: 42 } },
  { name: "Propella 7S v4", specs: { voltage: 36, capacityAh: 7, motorWatts: 250, bikeWeightLbs: 37 } },
  { name: "Tenways CGO600 Pro", specs: { voltage: 36, capacityAh: 10, motorWatts: 250, bikeWeightLbs: 35 } },
  { name: "Blix Dubbel", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 70 } },
  { name: "Riese & Müller Load 75", specs: { voltage: 36, capacityAh: 27.7, motorWatts: 250, bikeWeightLbs: 84 } },
  { name: "Flyer L885 (Radio Flyer)", specs: { voltage: 48, capacityAh: 15, motorWatts: 500, bikeWeightLbs: 73 } },
  { name: "Biktrix Juggernaut", specs: { voltage: 52, capacityAh: 17.5, motorWatts: 1000, bikeWeightLbs: 75 } },
  { name: "Luna Sur-Ron X", specs: { voltage: 60, capacityAh: 32, motorWatts: 6000, bikeWeightLbs: 110 } },
  { name: "Fiido Titan", specs: { voltage: 48, capacityAh: 14.5, motorWatts: 750, bikeWeightLbs: 65 } },
  { name: "Heybike Mars 2.0", specs: { voltage: 48, capacityAh: 12.5, motorWatts: 750, bikeWeightLbs: 66 } },
  { name: "Gotrax Tundra", specs: { voltage: 48, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 75 } },
  { name: "Mokwheel Basalt", specs: { voltage: 48, capacityAh: 19.6, motorWatts: 750, bikeWeightLbs: 79 } },
  { name: "Denago Commute 1", specs: { voltage: 48, capacityAh: 13.6, motorWatts: 500, bikeWeightLbs: 62 } },
  { name: "Wallke H6", specs: { voltage: 48, capacityAh: 35, motorWatts: 750, bikeWeightLbs: 90 } },

  // --- Utility & Value ---
  { name: "Bafang BBSHD Custom Build", specs: { voltage: 52, capacityAh: 17.5, motorWatts: 1000, bikeWeightLbs: 65 } },
  { name: "Vvolt Centauri", specs: { voltage: 36, capacityAh: 10.4, motorWatts: 250, bikeWeightLbs: 48 } },
  { name: "Priority Current", specs: { voltage: 48, capacityAh: 10.4, motorWatts: 500, bikeWeightLbs: 53 } },
  { name: "FLX Baby Maker II", specs: { voltage: 36, capacityAh: 10, motorWatts: 350, bikeWeightLbs: 35 } },
  { name: "Ariel Rider Kepler", specs: { voltage: 52, capacityAh: 20, motorWatts: 1000, bikeWeightLbs: 73 } },
  { name: "Ariel Rider Grizzly", specs: { voltage: 52, capacityAh: 35, motorWatts: 2000, bikeWeightLbs: 105 } },
  { name: "Ride1Up LMT'D", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 53 } },
  { name: "Sondors MadMod (2024)", specs: { voltage: 48, capacityAh: 21, motorWatts: 750, bikeWeightLbs: 80 } },
  { name: "Wing Freedom 2", specs: { voltage: 36, capacityAh: 14, motorWatts: 350, bikeWeightLbs: 39 } },
  { name: "Eurowheel X1", specs: { voltage: 48, capacityAh: 15, motorWatts: 750, bikeWeightLbs: 65 } },
  { name: "Trojan Horse", specs: { voltage: 72, capacityAh: 30, motorWatts: 5000, bikeWeightLbs: 135 } },
  { name: "Monday Motorbikes Anza", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 65 } },
  { name: "Super73-Z1", specs: { voltage: 36, capacityAh: 11.6, motorWatts: 500, bikeWeightLbs: 56 } },
  { name: "Lectric XP Lite 2.0", specs: { voltage: 48, capacityAh: 7.8, motorWatts: 300, bikeWeightLbs: 47 } },
  { name: "Aventon Sinch.2", specs: { voltage: 48, capacityAh: 14, motorWatts: 500, bikeWeightLbs: 68 } },
  { name: "Eunorau Fat-HS", specs: { voltage: 48, capacityAh: 14, motorWatts: 1000, bikeWeightLbs: 80 } },
  { name: "Magicycle Deer", specs: { voltage: 52, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 92 } },
  { name: "KBO Breeze", specs: { voltage: 48, capacityAh: 16, motorWatts: 500, bikeWeightLbs: 62 } },
  { name: "Himiway Zebra", specs: { voltage: 48, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 79 } },
  { name: "Rad Power RadRover 6 Plus", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 73 } }
];

interface POI {
  id: string;
  name: string;
  address: string;
  position: google.maps.LatLngLiteral;
  type: string;
  details?: string;
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
  
  // Advanced Factors
  const [ambientTempF, setAmbientTempF] = useState<number | ''>(70);
  const [tireType, setTireType] = useState<'road' | 'knobby'>('road');
  const [tirePressurePsi, setTirePressurePsi] = useState<number | ''>(''); // Empty assumes optimal

  const [trip, setTrip] = useState<TripDetails>({ origin: '', destination: '', waypoints: [], returnWaypoints: [] });
  const [controlType, setControlType] = useState<'switch' | 'pas'>('pas');
  const [mode, setMode] = useState<'eco' | 'normal' | 'sport'>('normal');
  const [pasLevel, setPasLevel] = useState<number>(3); // 1-5 default

  const [ridingStyle, setRidingStyle] = useState<'relaxed' | 'aggressive'>('relaxed');        
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

  // Group Rides State
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

  // Sync Public Rides
  useEffect(() => {
    if (!user || !isPro) return;
    const q = query(collection(db, "group_rides"), where("isPublic", "==", true), where("status", "==", "active"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const rides: GroupRide[] = [];
      const userLat = center.lat;
      const userLng = center.lng;

      snap.forEach(docSnap => {
        const data = docSnap.data();
        // Haversine formula for 20-mile radius
        const R = 3958.8; // Miles
        const dLat = (data.startLat - userLat) * Math.PI / 180;
        const dLon = (data.startLng - userLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(userLat * Math.PI / 180) * Math.cos(data.startLat * Math.PI / 180) * 
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        if (distance <= 20) {
          rides.push({ id: docSnap.id, ...data } as GroupRide);
        }
      });
      setPublicRides(rides);
    });
    return () => unsubscribe();
  }, [user, isPro, center]);

  // Sync Participants and Auto-End Logic
  useEffect(() => {
    if (!activeRide || !user) return;
    const q = collection(db, `group_rides/${activeRide.id}/participants`);
    const unsubscribe = onSnapshot(q, (snap) => {
      const parts: Participant[] = [];
      snap.forEach(docSnap => parts.push(docSnap.data() as Participant));
      setRideParticipants(parts);

      // Auto-End Check: Only the host monitors this
      if (user.uid === activeRide.creatorId && parts.length > 0 && response) {
        const dest = response.routes[0].legs[0].end_location;
        const everyoneReached = parts.every(p => {
          const dist = Math.sqrt(Math.pow(p.lat - dest.lat(), 2) + Math.pow(p.lng - dest.lng(), 2));
          return dist < 0.001; // Approx 100 meters
        });

        if (everyoneReached && activeRide.status === 'active') {
          console.log("Everyone reached destination. Ending ride...");
          endRide();
        }
      }
    });

    // Listen to the RIDE itself to detect when it ends or if leader changes
    const rideUnsub = onSnapshot(doc(db, "group_rides", activeRide.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'offline') {
          alert(`The ride has ended. Thank you for joining ${activeRide.name}!`);
          setActiveRide(null);
          setRideParticipants([]);
        } else {
          setActiveRide({ id: snap.id, ...data } as GroupRide);
        }
      }
    });

    // Host Only: Listen for Join Requests
    let requestsUnsub: (() => void) | undefined;
    if (user.uid === activeRide.creatorId) {
      const qReq = collection(db, `group_rides/${activeRide.id}/requests`);
      requestsUnsub = onSnapshot(qReq, (snap) => {
        const reqs: any[] = [];
        snap.forEach(docSnap => reqs.push({ id: docSnap.id, ...docSnap.data() }));
        setJoinRequests(reqs);
      });
    }

    return () => { unsubscribe(); rideUnsub(); if (requestsUnsub) requestsUnsub(); };
  }, [activeRide?.id, user?.uid, response]);

  const handleJoinRequest = async (request: any, action: 'accept' | 'decline') => {
    if (!activeRide) return;
    try {
      if (action === 'accept') {
        // Move to participants
        await setDoc(doc(db, `group_rides/${activeRide.id}/participants`, request.userId), {
          userId: request.userId,
          name: request.name,
          lat: request.lat || center.lat,
          lng: request.lng || center.lng,
          lastUpdatedAt: Date.now()
        });
      }
      // Delete request in both cases
      await deleteDoc(doc(db, `group_rides/${activeRide.id}/requests`, request.id));
    } catch (e) { console.error("Join request handling failed", e); }
  };

  // Upload Location every 15s - ONLY ACTIVE DURING A RIDE
  useEffect(() => {
    if (!activeRide || !user) {
      lastUploadedLocRef.current = null;
      return;
    }

    const updateLocation = async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const lastLoc = lastUploadedLocRef.current;
          
          const hasMoved = !lastLoc || 
            Math.abs(newLoc.lat - lastLoc.lat) > 0.0001 || 
            Math.abs(newLoc.lng - lastLoc.lng) > 0.0001;

          if (hasMoved) {
            try {
              // Standard location update
              await setDoc(doc(db, `group_rides/${activeRide.id}/participants`, user.uid), {
                userId: user.uid,
                name: username || user.email?.split('@')[0] || "Rider",
                lat: newLoc.lat,
                lng: newLoc.lng,
                lastUpdatedAt: Date.now()
              }, { merge: true });

              // If user is the leader, add to the trail
              if (activeRide.leaderId === user.uid) {
                await updateDoc(doc(db, "group_rides", activeRide.id), {
                  leaderTrail: arrayUnion(newLoc)
                });
              }

              lastUploadedLocRef.current = newLoc;
              setLastUploadedLocation(newLoc);
            } catch (e) { console.error("Location upload failed:", e); }
          }
        });
      }
    };

    updateLocation();
    const interval = setInterval(updateLocation, 15000);
    return () => clearInterval(interval);
  }, [activeRide?.id, user?.uid, username]);

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
            
            // Auto-sync/Self-heal: Prohibit spaces in usernames
            if (data.username && data.username.includes(' ')) {
              const fixedName = data.username.replace(/\s+/g, '_');
              updateDoc(doc(db, "users", currentUser.uid), {
                username: fixedName,
                usernameLowercase: fixedName.toLowerCase()
              }).catch(e => console.error("Username space fix failed", e));
              setUsername(fixedName);
            } else if (data.username && !data.usernameLowercase) {
              // Auto-sync lowercase username for search functionality
              updateDoc(doc(db, "users", currentUser.uid), {
                usernameLowercase: data.username.toLowerCase()
              }).catch(e => console.error("Lowercase sync failed", e));
            }

            if (data.bikes) setSavedBikes(data.bikes);
          } else {
            const newUser = { email: currentUser.email, isPro: false, createdAt: new Date(), uid: currentUser.uid };
            await setDoc(doc(db, "users", currentUser.uid), newUser);
            setUserData(newUser);
            setIsPro(false);
            setIsHostTier(false);
          }
        } catch (e) { console.error("Firestore error:", e); }
      } else {
        setUserData(null);
        setIsPro(false);
        setIsHostTier(false);
        setHostTierExpiresAt(null);
        setActiveRide(null);
        setRideParticipants([]);
        const local = localStorage.getItem('ebike-saved-bikes');
        if (local) setSavedBikes(JSON.parse(local));
      }
    });
    return () => unsubscribe();
  }, []);

  // Onboarding Popup Logic
  useEffect(() => {
    if (authInitialized) {
      const hasVisited = localStorage.getItem('ebike_portal_visited');
      if (!hasVisited && !user) {
        setShowWelcomeModal(true);
      }
      // Mark as visited if they are logged in OR have the flag
      if (user || hasVisited) {
        localStorage.setItem('ebike_portal_visited', 'true');
      }
    }
  }, [authInitialized, user]);

  // Default Map to Home State
  useEffect(() => {
    if (userData?.homeRegion && mapRef.current) {
      const coords = STATE_COORDINATES[userData.homeRegion];
      if (coords) {
        mapRef.current.panTo(coords);
        mapRef.current.setZoom(8); // Zoom out a bit to show the state area
      }
    }
  }, [userData?.homeRegion]);

  // Auto-scroll to stats when opening menu with results
  useEffect(() => {
    if (showMobileMenu && metrics && metricsCardRef.current) {
      setTimeout(() => {
        metricsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [showMobileMenu, metrics]);

  // Load Route from External Source (Community Feed)
  useEffect(() => {
    const savedRoute = localStorage.getItem('ebike_load_route');
    if (savedRoute) {
      try {
        const data = JSON.parse(savedRoute);
        setTrip({
          origin: data.origin || "",
          destination: data.destination || "",
          waypoints: data.waypoints || [],
          returnWaypoints: data.returnWaypoints || []
        });
        setIsRoundTrip(data.isRoundTrip || false);
        setIsCustomReturn(data.isCustomReturn || false);
        
        // Open Trip Settings automatically
        setShowMobileMenu(true);
        // Flag for bike auto-selection
        setPendingBikeAutoSelect(true);

        // Remove from storage so it doesn't reload on every refresh
        localStorage.removeItem('ebike_load_route');
        
        // Trigger calculation if origin and destination are present
        if (data.origin && data.destination) {
          setTimeout(() => {
            handleCalculate();
          }, 1000);
        }
      } catch (e) {
        console.error("Failed to load external route", e);
      }
    }
  }, []);

  // Intelligent Bike Auto-Selection after Loading Route
  useEffect(() => {
    if (pendingBikeAutoSelect && authInitialized) {
      if (savedBikes.length > 0) {
        // Automatically load the first bike from their garage
        loadBike(savedBikes[0]);
        setPendingBikeAutoSelect(false);
        // Trigger calculation with the new bike specs
        setTimeout(() => {
          handleCalculate();
        }, 500);
      } else if (authInitialized) {
        // If they have no bikes or aren't logged in, just clear the flag
        setPendingBikeAutoSelect(false);
      }
    }
  }, [pendingBikeAutoSelect, savedBikes, authInitialized, user]);

  // Generate Map Snapshot for Share Card
  useEffect(() => {
    if (!response || !response.routes[selectedRouteIndex]) return;

    const polyline = response.routes[selectedRouteIndex].overview_polyline;
    const points = (polyline as any).points || polyline;
    
    // Use our server-side proxy to avoid CORS issues with html-to-image
    const proxyUrl = `/api/static-map?polyline=${encodeURIComponent(points)}`;

    const fetchSnapshot = async () => {
      try {
        const resp = await fetch(proxyUrl);
        if (!resp.ok) throw new Error("Proxy failed");
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          setMapSnapshot(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        console.error("Static Map fetch failed", e);
      }
    };

    fetchSnapshot();
  }, [response, selectedRouteIndex]);

  const handleUpgrade = async (tier: 'pro' | 'host' = 'pro') => {
    console.log(`Initiating upgrade to ${tier}...`);
    ReactGA.event({ category: "Conversion", action: "Initiate Upgrade", label: tier });
    if (!user) { setShowAuthModal(true); return; }
    try {
      const resp = await axios.post('/api/create-checkout-session', { userId: user.uid, email: user.email, tier });
      if (resp.data.url) { window.location.href = resp.data.url; }
      else { throw new Error("No checkout URL returned from server."); }
    } catch (err: any) {
      console.error("Upgrade error:", err);
      setError(`Checkout Error: ${err.response?.data?.error || err.message}`);
    }
  };

  const endRide = async () => {
    if (!user || !activeRide) return;
    try {
      await setDoc(doc(db, "group_rides", activeRide.id), { status: 'offline' }, { merge: true });
      setActiveRide(null);
      setRideParticipants([]);
    } catch (e) { console.error("End ride failed:", e); }
  };

  const endAllPublicRides = async () => {
    if (!user || user.email !== 'mattyfliptv@gmail.com') return;
    if (!window.confirm("Are you sure you want to end ALL public group rides?")) return;
    
    try {
      const q = query(collection(db, "group_rides"), where("isPublic", "==", true), where("status", "==", "active"));
      const snap = await getDocs(q);
      const batchPromises = snap.docs.map(rideDoc => 
        setDoc(doc(db, "group_rides", rideDoc.id), { status: 'offline' }, { merge: true })
      );
      await Promise.all(batchPromises);
      alert(`Successfully ended ${snap.size} public rides.`);
    } catch (e) { console.error("End all rides failed:", e); setError("Failed to end all public rides."); }
  };

  const createRide = async () => {
    setRideError(null);
    if (!user) { setShowAuthModal(true); return; }
    if (!isHostTier) { setRideError("Only HOST TIER users can create rides."); return; }
    
    // Enforce single active ride
    const activeCheckQ = query(collection(db, "group_rides"), where("creatorId", "==", user.uid), where("status", "==", "active"));
    const activeSnap = await getDocs(activeCheckQ);
    if (!activeSnap.empty) {
      setRideError("You already have an active ride. Please end it before starting a new one.");
      return;
    }

    if (!groupRideName) { setRideError("Please name your ride."); return; }
    
    try {
      ReactGA.event({ category: "Engagement", action: "Create Group Ride", label: groupRideName });
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      const rideData = {
        name: groupRideName,
        isPublic: isPublicRide,
        pin,
        creatorId: user.uid,
        createdAt: serverTimestamp(),
        origin: trip.origin || "Current Location",
        startLat: center.lat,
        startLng: center.lng,
        status: 'active'
      };

      const rideRef = await addDoc(collection(db, "group_rides"), rideData);
      setActiveRide({ id: rideRef.id, ...rideData } as any);
      setGroupRideName('');
      await setDoc(doc(db, `group_rides/${rideRef.id}/participants`, user.uid), {
        userId: user.uid,
        name: username || "Host",
        lat: center.lat,
        lng: center.lng,
        lastUpdatedAt: Date.now()
      });
    } catch (e: any) { 
      setRideError(`Create ride failed: ${e.message}`); 
    }
  };

  const joinRide = async (rideId?: string) => {
    setRideError(null);
    if (!user) { setShowAuthModal(true); return; }
    if (!isPro) { setRideError("You must be at least a PRO user to join group rides."); return; }

    try {
      let rideDoc;
      let targetRideId = rideId;
      if (targetRideId) {
        rideDoc = await getDoc(doc(db, "group_rides", targetRideId));
      } else {
        if (!joinPin) return;
        const q = query(collection(db, "group_rides"), where("pin", "==", joinPin), where("status", "==", "active"));
        const snap = await getDocs(q);
        if (!snap.empty) {
          rideDoc = snap.docs[0];
          targetRideId = rideDoc.id;
        }
      }

      if (rideDoc && rideDoc.exists() && targetRideId) {
        const data = rideDoc.data();
        
        // Check if already a participant
        const partSnap = await getDoc(doc(db, `group_rides/${targetRideId}/participants`, user.uid));
        if (partSnap.exists()) {
           setActiveRide({ id: targetRideId, ...data } as any);
           setJoinPin('');
           return;
        }

        // Submit Join Request with Rating Info
        await setDoc(doc(db, `group_rides/${targetRideId}/requests`, user.uid), {
          userId: user.uid,
          name: username || user.email?.split('@')[0] || "Rider",
          rating: userData?.averageRating || 0,
          lat: center.lat,
          lng: center.lng,
          requestedAt: Date.now()
        });

        alert("Join request sent to the host! You'll be added once they approve you.");
        setJoinPin('');
      } else {
        setRideError("Ride not found or invalid PIN.");
      }
    } catch (e) { console.error("Join request failed:", e); setRideError("Failed to send join request."); }
  };

  const setLeader = async (participantId: string) => {
    if (!user || !activeRide || user.uid !== activeRide.creatorId) return;
    try {
      await updateDoc(doc(db, "group_rides", activeRide.id), { leaderId: participantId, leaderTrail: [] });
    } catch (e) { console.error("Set leader failed:", e); }
  };

  const leaveRide = async () => {
    if (!user || !activeRide) return;
    try {
      await deleteDoc(doc(db, `group_rides/${activeRide.id}/participants`, user.uid));
      setActiveRide(null);
      setRideParticipants([]);
    } catch (e) { console.error("Leave ride failed:", e); }
  };

  const saveCurrentBike = async () => {
    if (!user) {
      setError("You must be signed in to save bikes to your library.");
      setShowAuthModal(true);
      return;
    }
    if (!newBikeName) return;
    ReactGA.event({ category: "Engagement", action: "Save Bike", label: newBikeName });
    const newBike = { 
      id: Date.now().toString(), // Unique ID for reliable updates/matching
      name: newBikeName, 
      specs 
    };
    const updated = [...savedBikes, newBike];
    setSavedBikes(updated);
    
    // 1. Save to personal list (cloud)
    try { 
      await setDoc(doc(db, "users", user.uid), { bikes: updated }, { merge: true }); 
    } catch (e) { 
      console.error("Cloud save failed:", e); 
      setError("Failed to sync bike to the cloud."); 
    }

    // 2. Submit to Global Review List for Admin
    try {
      await addDoc(collection(db, "bike_submissions"), {
        ...newBike,
        submittedBy: user.email || "Unknown",
        submittedAt: new Date().toISOString(),
        status: "pending"
      });
    } catch (e) {
      console.error("Global submission failed:", e);
    }

    setNewBikeName('');
    alert(`"${newBikeName}" saved to your list and submitted for official review!`);
  };

  const getBatteryLevels = (v: number) => {
    if (v >= 72) return { min: 60, max: 84 };
    if (v >= 60) return { min: 50, max: 70 };
    if (v >= 52) return { min: 42, max: 58.8 };
    if (v >= 48) return { min: 39, max: 54.6 };
    if (v >= 36) return { min: 30, max: 42 };
    return { min: v * 0.8, max: v * 1.15 };
  };

  const convertBattery = (mode: 'percent' | 'voltage', target: 'percent' | 'voltage') => {
    if (mode === target) return;
    const { min, max } = getBatteryLevels(Number(specs.voltage));
    if (target === 'voltage') {
      // Percent to Voltage
      const p = Number(startBattery) / 100;
      const v = min + (p * (max - min));
      setStartVoltage(Number(v.toFixed(1)));
    } else {
      // Voltage to Percent
      const v = Number(startVoltage);
      const p = ((v - min) / (max - min)) * 100;
      setStartBattery(Math.min(100, Math.max(0, Number(p.toFixed(0)))));
    }
  };

  const handleToggleBatteryMode = (newMode: 'percent' | 'voltage') => {
    if (newMode === batteryInputMode) return;
    convertBattery(batteryInputMode, newMode);
    setBatteryInputMode(newMode);
  };

  const loadBike = (bike: SavedBike) => {
    ReactGA.event({ category: "Engagement", action: "Load Bike", label: bike.name });
    setSpecs(bike.specs);
    setBikeSearchQuery(bike.name);
    setShowBikeResults(false);
    if (bike.specs.voltage) {
      setStartVoltage(getBatteryLevels(Number(bike.specs.voltage)).max);
    }
    // Simple heuristic to set control type
    if (Number(bike.specs.voltage) >= 60 || (bike.name && (bike.name.includes("Onyx") || bike.name.includes("Sur-Ron") || bike.name.includes("Talaria")))) {
      setControlType('switch');
    } else {
      setControlType('pas');
    }
  };

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTrip(prev => ({ ...prev, [name]: value }));
  };

  const handleSpecChange = (name: keyof BikeSpecs, value: string) => {
    const val = value === '' ? '' : parseFloat(value);
    setSpecs(prev => ({ ...prev, [name]: isNaN(Number(val)) ? '' : val }));
  };

  const directionsCallback = (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
    if (status === 'OK' && result) { 
      setResponse(result); 
      setSelectedRouteIndex(0);
      calculateMetrics(result, 0); 
    }
    else { console.error('Directions error:', status); setError(`Google Maps Directions Error: ${status}`); setIsLoading(false); }
  };

  const calculateBearing = (start: {lat: number, lng: number}, end: {lat: number, lng: number}) => {
    const startLat = (start.lat * Math.PI) / 180;
    const startLng = (start.lng * Math.PI) / 180;
    const endLat = (end.lat * Math.PI) / 180;
    const endLng = (end.lng * Math.PI) / 180;
    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };

  const calculateMetrics = async (result: google.maps.DirectionsResult, routeIndex: number = 0) => {
    try {
      let totalDistMeters = 0;
      const route = result.routes[routeIndex];
      route.legs.forEach(leg => {
        totalDistMeters += (leg.distance?.value || 0);
      });

      const distMiles = totalDistMeters / 1609.34;
      const path = route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
      const routeBearing = calculateBearing(path[0], path[path.length - 1]);

      let gainFeet = 0;
      let lossFeet = 0;
      try { 
        // Use encoded polyline for high-resolution elevation sampling (100+ points)
        const encodedPath = google.maps.geometry.encoding.encodePath(route.overview_path);
        const elevResp = await axios.post('/api/elevation', { encodedPath, samples: 100 }); 
        
        if (elevResp.data && typeof elevResp.data.gain === 'number') {
          gainFeet = elevResp.data.gain;
          lossFeet = elevResp.data.loss || 0; 
        } else {
          console.warn("Elevation API returned unexpected data:", elevResp.data);
        }
      } catch (e: any) { 
        const errorData = e.response?.data;
        const errorMessage = errorData?.message || e.message;
        console.error("Elevation API call failed:", errorMessage); 
        if (errorData?.error?.includes("REQUEST_DENIED") || e.message?.includes("referer restrictions")) {
           alert(`Google Elevation API Error: Referer restrictions or disabled API. Please ensure the Elevation API is enabled and use a backend-dedicated API key in Vercel.`);
        }
      }

      let headwindMph = 0;
      let windSpeed = 0;
      let windDir = 0;
      try {
        const weatherResp = await axios.get(`/api/weather?lat=${path[0].lat}&lng=${path[0].lng}`);
        windSpeed = weatherResp.data.wind_speed;
        windDir = weatherResp.data.wind_deg;
        const angleDiff = (windDir - routeBearing + 360) % 360;
        headwindMph = windSpeed * Math.cos((angleDiff * Math.PI) / 180);
      } catch (e) { console.warn("Weather API failed", e); }

      // --- PHYSICS-BASED MODEL (Internally uses Imperial/SI) ---
      const isMetric = unitSystem === 'metric';
      
      // Convert inputs to Imperial if they are provided in Metric
      const bikeWeightLbs = isMetric ? (Number(specs.bikeWeightLbs) * 2.20462) : Number(specs.bikeWeightLbs);
      const riderWeightLbsActual = isMetric ? (Number(riderWeightLbs) * 2.20462) : Number(riderWeightLbs);
      const targetSpeedMphActual = isMetric ? (Number(targetSpeedMph) * 0.621371) : Number(targetSpeedMph);
      const tempF = isMetric ? (Number(ambientTempF) * 9/5 + 32) : Number(ambientTempF);

      const massKg = (bikeWeightLbs + riderWeightLbsActual) * 0.453592;
      const velocityMps = targetSpeedMphActual * 0.44704;
      
      let Crr = tireType === 'road' ? 0.007 : 0.015;
      if (tirePressurePsi !== '' && tirePressurePsi < 35) {
        Crr += (35 - tirePressurePsi) / 5 * 0.002;
      }
      const ForceRolling = Crr * massKg * 9.81;

      const tempC = (tempF - 32) * 5 / 9;
      const rho = 1.225 * (288.15 / (273.15 + tempC));
      const CdA = 0.55;
      const relativeVelocityMps = Math.max(0.1, velocityMps + (headwindMph * 0.44704));
      const ForceDrag = 0.5 * rho * CdA * Math.pow(relativeVelocityMps, 2);

      const gainMeters = gainFeet * 0.3048;
      let thermalEfficiency = 1.0;
      if (tempF < 60) thermalEfficiency -= (60 - tempF) * 0.003;
      
      let motorEfficiency = 0.80;
      let modeStyleMultiplier = 1.0;
      let humanPowerWatts = 0;

      if (controlType === 'switch') {
        if (mode === 'eco') { motorEfficiency = 0.85; modeStyleMultiplier = 0.95; }
        else if (mode === 'sport') { motorEfficiency = 0.75; modeStyleMultiplier = 1.25; }
      } else {
        humanPowerWatts = Math.max(0, 150 - (pasLevel - 1) * 37.5);
        motorEfficiency = 0.82;
      }
      
      const combinedEfficiency = motorEfficiency * thermalEfficiency;
      const WorkClimbJoules = massKg * 9.81 * gainMeters;
      const WhClimb = (WorkClimbJoules / 3600) / combinedEfficiency;

      const TotalPowerWatts = (ForceRolling + ForceDrag) * velocityMps;
      const MotorPowerWatts = Math.max(0, TotalPowerWatts - humanPowerWatts);
      
      const WhPerMileFlat = (MotorPowerWatts / velocityMps) * (1609.34 / 3600) / combinedEfficiency;

      const styleMultiplier = ridingStyle === 'aggressive' ? 1.2 : 1.0;
      const estimatedWh = (distMiles * WhPerMileFlat * styleMultiplier * modeStyleMultiplier) + WhClimb;
      
      const totalWhRaw = (capacityInputMode === 'ah') ? (Number(specs.voltage) * Number(specs.capacityAh)) : Number(specs.capacityAh);
      const totalWhUsable = totalWhRaw * 0.92;
      
      const minV = getBatteryLevels(Number(specs.voltage)).min;
      const maxV = getBatteryLevels(Number(specs.voltage)).max;
      
      const startWh = (batteryInputMode === 'percent')
        ? (totalWhUsable * (Number(startBattery) / 100))
        : (totalWhUsable * ((Number(startVoltage) - minV) / (maxV - minV)));

      const batteryPercentRemaining = ((startWh - estimatedWh) / totalWhUsable) * 100;

      setMetrics({
        distanceMiles: distMiles,
        durationMin: distMiles / (targetSpeedMphActual || 15) * 60,
        elevationGainFeet: gainFeet,
        elevationLossFeet: lossFeet,
        estimatedWh,
        batteryPercentUsed: Math.max(0, batteryPercentRemaining),
        recommendedSpeedMph: mode === 'eco' || pasLevel <= 2 ? 18 : 25,
        windConditions: { speed: windSpeed, direction: windDir, headwindComponent: headwindMph }
      });
      ReactGA.event({ category: "Engagement", action: "Calculation Success", label: `${distMiles.toFixed(1)} miles` });
      setIsLoading(false);
    } catch (e: any) { console.error("Calculation error", e); setError("Failed to calculate metrics."); setIsLoading(false); }
  };

  const handleCalculate = () => { 
    if (!trip.origin || !trip.destination) return; 
    ReactGA.event({ category: "Engagement", action: "Calculate Route", label: `${trip.origin} to ${trip.destination}` });
    setIsLoading(true); setResponse(null); setMetrics(null); setError(null); setPois([]); 
  };
  const useCurrentLocation = () => { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition((pos) => { setTrip(prev => ({ ...prev, origin: `${pos.coords.latitude},${pos.coords.longitude}` })); }); } };

  const searchPOIs = async (category: string) => {
    if (!response || !isLoaded) return;

    if (category === 'charging' && !isPro && !isHostTier) {
      alert("Charging station discovery is a PRO feature. Upgrade to unlock!");
      handleUpgrade('pro');
      return;
    }

    setPoiCategory(category);
    
    if (category === 'charging') {
      const path = response.routes[0].overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
      try {
        const resp = await axios.post('/api/charging', { path, category });
        if (resp.data.pois) setPois(resp.data.pois);
      } catch (e) { console.error("POI search failed", e); }
    } else {
      // Use Google Places for other amenities
      const service = new google.maps.places.PlacesService(mapRef.current!);
      const request = {
        location: mapRef.current!.getCenter()!,
        radius: 5000, // 5km
        query: category
      };
      
      service.textSearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          const formatted = results.map(place => ({
            id: place.place_id || Math.random().toString(),
            name: place.name || 'Unknown',
            address: place.formatted_address || '',
            position: { lat: place.geometry!.location!.lat(), lng: place.geometry!.location!.lng() },
            type: category
          }));
          setPois(formatted);
        }
      });
    }
  };

  const searchByMapCenter = async () => {
    if (!mapRef.current || !poiCategory) return;
    const c = mapRef.current.getCenter(); if (!c) return;
    
    if (poiCategory === 'charging' && !isPro && !isHostTier) {
      alert("Charging station discovery is a PRO feature. Upgrade to unlock!");
      handleUpgrade('pro');
      return;
    }

    if (poiCategory === 'charging') {
      try {
        const resp = await axios.post('/api/charging', { lat: c.lat(), lng: c.lng(), category: poiCategory });
        if (resp.data.pois) setPois(resp.data.pois);
      } catch (e) { console.error("Radius search failed", e); }
    } else {
      searchPOIs(poiCategory);
    }
  };

  const addPOIAsWaypoint = (poi: POI) => { 
    setTrip(prev => ({ ...prev, waypoints: [...prev.waypoints, poi.address] })); 
    setResponse(null); 
    setMetrics(null); 
    setIsLoading(true); // Trigger recalculation immediately
  };

  const recenterMap = () => {
    if (mapRef.current) {
      if (lastUploadedLocation) {
        mapRef.current.panTo(lastUploadedLocation);
        mapRef.current.setZoom(15);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          mapRef.current?.panTo(loc);
          mapRef.current?.setZoom(15);
        });
      }
    }
  };

  const downloadShareCard = async () => {
    if (!shareCardRef.current || !metrics || !mapSnapshot) {
      alert("Map data is still loading. Please wait a moment.");
      return;
    }
    try {
      setIsLoading(true);
      const el = shareCardRef.current;
      el.style.opacity = '1';
      
      // Wait longer for rendering and image decoding
      await new Promise(resolve => setTimeout(resolve, 1500));

      const dataUrl = await toPng(el, { 
        cacheBust: true,
        backgroundColor: "#121212",
        pixelRatio: 2,
        style: {
          opacity: '1',
          visibility: 'visible',
        }
      });

      el.style.opacity = '0';
      
      if (!dataUrl) throw new Error("Generated image is empty");

      const link = document.createElement('a');
      link.download = `range-anxiety-trip-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      setIsLoading(false);
    } catch (err) {
      console.error('Error sharing:', err);
      setError("Failed to generate image report.");
      setIsLoading(false);
      if (shareCardRef.current) shareCardRef.current.style.opacity = '0';
    }
  };

  const shareToCommunity = async () => {
    if (!shareCardRef.current || !metrics || !user || !mapSnapshot) {
      alert("Preparing share card data... please wait a second and try again.");
      return;
    }
    
    // Enforce profile completeness
    if (!userData?.username || !userData?.profilePic) {
      alert("Please complete your profile (set a username and upload a profile picture) before sharing to the community!");
      return;
    }

    try {
      setIsLoading(true);
      const el = shareCardRef.current;
      el.style.opacity = '1';
      
      // Wait longer for map snapshot to be fully rendered in the DOM
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Generate the high-res PNG
      const dataUrl = await toPng(el, { 
        cacheBust: true, 
        backgroundColor: "#121212", 
        pixelRatio: 2,
        style: {
          opacity: '1',
          visibility: 'visible',
        }
      });
      el.style.opacity = '0';

      // Professional Storage upload for high-res images (Blaze Plan)
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      const imageRef = ref(storage, `trips/${user.uid}/${Date.now()}.png`);
      await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(imageRef);

      // Save the post with the Storage URL (text), not the image data
      await addDoc(collection(db, "posts"), {
        authorId: user.uid,
        authorUsername: userData.username,
        authorProfilePic: userData.profilePic,
        imageUrl, // Now a small URL string
        caption: `Rode from ${trip.origin || 'Current Location'} to ${trip.destination}. ${metrics.distanceMiles.toFixed(1)} miles with ${metrics.batteryPercentUsed.toFixed(1)}% battery remaining!`,
        likes: [],
        commentsEnabled: commentsEnabled,
        createdAt: serverTimestamp(),
        // Location Metadata for Search
        city: userData.city || "",
        homeRegion: userData.homeRegion || "",
        // Raw Trip Data for "Load Route" functionality
        tripData: {
          origin: trip.origin,
          destination: trip.destination,
          waypoints: trip.waypoints,
          returnWaypoints: trip.returnWaypoints,
          isRoundTrip,
          isCustomReturn
        }
      });

      alert("Successfully posted to the community feed!");
      setIsLoading(false);
      setShowSharePreview(false);
    } catch (err: any) {
      console.error('Sharing error:', err);
      alert(`Failed to post: ${err.message}. Check your Cloud Shell CORS settings.`);
      setIsLoading(false);
    }
  };

  const filteredBikes = [...STANDARD_BIKES, ...savedBikes].filter(b => 
    b.name.toLowerCase().includes(bikeSearchQuery.toLowerCase())
  );

  return (
    <div className="container">
      <NavBar 
        user={user} 
        onShowInstall={() => setShowInstallTutorial(true)} 
      />

      <div className="main-layout">
        <aside className={`sidebar ${showMobileMenu ? 'mobile-visible' : ''}`}>
          {error && <div style={{ background: 'rgba(217,48,37,0.1)', color: '#d93025', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem' }}>{error}</div>}
          
          <div className="form-group">
            <label style={{ color: 'var(--accent-color)', fontSize: '0.65rem' }}>Unit System</label>
            <div className="mode-toggle">
              <button className={unitSystem === 'imperial' ? 'active' : ''} onClick={() => {
                if (unitSystem === 'metric' && targetSpeedMph !== '') {
                  setTargetSpeedMph(parseFloat((targetSpeedMph * 0.621371).toFixed(1)));
                }
                setUnitSystem('imperial');
              }}>Imperial (mi/lb)</button>
              <button className={unitSystem === 'metric' ? 'active' : ''} onClick={() => {
                if (unitSystem === 'imperial' && targetSpeedMph !== '') {
                  setTargetSpeedMph(parseFloat((targetSpeedMph * 1.60934).toFixed(1)));
                }
                setUnitSystem('metric');
              }}>Metric (km/kg)</button>
            </div>
          </div>

          <section className="form-group" style={{ position: 'relative' }}>
            <label>Search Bike Model</label>
            <input type="text" placeholder="e.g. Onyx, Sur-Ron..." value={bikeSearchQuery} onFocus={() => setShowBikeResults(true)} onChange={(e) => { setBikeSearchQuery(e.target.value); setShowBikeResults(true); }} />
            {showBikeResults && bikeSearchQuery && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '4px', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                {filteredBikes.map((bike, idx) => (<div key={bike.id || idx} onClick={() => loadBike(bike)} style={{ padding: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #222' }}>{bike.name}</div>))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input type="text" placeholder="Nickname to Save" value={newBikeName} onChange={(e) => setNewBikeName(e.target.value)} style={{ padding: '0.4rem' }} />
              <button onClick={saveCurrentBike} style={{ padding: '0.4rem 0.8rem', backgroundColor: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
            </div>
          </section>

          <section className="form-group">
            <label>Origin</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}><input type="text" name="origin" value={trip.origin} onChange={handleInputChange} /><button onClick={useCurrentLocation} style={{ padding: '0 0.8rem', cursor: 'pointer' }}>Loc</button></div>
          </section>
          
          <div style={{ textAlign: 'center', margin: '-0.5rem 0 0.5rem 0' }}>
              <button 
                onClick={() => setTrip(p => ({ ...p, origin: p.destination, destination: p.origin }))} 
                style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
                title="Swap Origin and Destination"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"/>
                </svg>
              </button>
          </div>

          <section className="form-group"><label>Destination</label><input type="text" name="destination" value={trip.destination} onChange={handleInputChange} /></section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>        
            <section className="form-group"><label>Voltage (V)</label><input type="number" value={specs.voltage} onChange={(e) => handleSpecChange('voltage', e.target.value)} /></section>
            <section className="form-group">
              <label>Capacity ({capacityInputMode.toUpperCase()})</label>
              <div className="mode-toggle" style={{ marginBottom: '0.5rem' }}>
                <button className={capacityInputMode === 'ah' ? 'active' : ''} onClick={() => {
                  if (capacityInputMode === 'wh' && specs.voltage && specs.capacityAh) {
                    const ah = Number(specs.capacityAh) / Number(specs.voltage);
                    setSpecs(prev => ({ ...prev, capacityAh: parseFloat(ah.toFixed(1)) }));
                  }
                  setCapacityInputMode('ah');
                }}>Ah</button>
                <button className={capacityInputMode === 'wh' ? 'active' : ''} onClick={() => {
                  if (capacityInputMode === 'ah' && specs.voltage && specs.capacityAh) {
                    const wh = Number(specs.voltage) * Number(specs.capacityAh);
                    setSpecs(prev => ({ ...prev, capacityAh: parseFloat(wh.toFixed(0)) }));
                  }
                  setCapacityInputMode('wh');
                }}>Wh</button>
              </div>
              <input type="number" value={specs.capacityAh} onChange={(e) => handleSpecChange('capacityAh', e.target.value)} />
            </section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>        
            <section className="form-group"><label>Motor (W)</label><input type="number" value={specs.motorWatts} onChange={(e) => handleSpecChange('motorWatts', e.target.value)} /></section>
            <section className="form-group"><label>Bike Wt ({unitSystem === 'imperial' ? 'lbs' : 'kg'})</label><input type="number" value={specs.bikeWeightLbs} onChange={(e) => handleSpecChange('bikeWeightLbs', e.target.value)} /></section>
          </div>

          <section className="form-group"><label>Rider Weight ({unitSystem === 'imperial' ? 'lbs' : 'kg'})</label><input type="number" value={riderWeightLbs} onChange={(e) => setRiderWeightLbs(parseFloat(e.target.value) || '')} /></section>

          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1rem' }}>
            <label style={{ color: 'var(--accent-color)', fontSize: '0.65rem' }}>Advanced Environment</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
               <section className="form-group">
                 <label>Temp ({unitSystem === 'imperial' ? '°F' : '°C'})</label>
                 <input type="number" value={ambientTempF} onChange={(e) => setAmbientTempF(parseFloat(e.target.value) || '')} />
               </section>
               <section className="form-group">
                 <label>Tire PSI</label>
                 <input type="number" placeholder="Auto" value={tirePressurePsi} onChange={(e) => setTirePressurePsi(parseFloat(e.target.value) || '')} />
               </section>
            </div>
            <section className="form-group">
               <label>Tire Type</label>
               <div className="mode-toggle">
                  <button className={tireType === 'road' ? 'active' : ''} onClick={() => setTireType('road')}>Road</button>
                  <button className={tireType === 'knobby' ? 'active' : ''} onClick={() => setTireType('knobby')}>Knobby</button>
               </div>
            </section>
          </div>

          <section className="form-group">
            <label>Power Control Type</label>
            <div className="mode-toggle">
              <button className={controlType === 'pas' ? 'active' : ''} onClick={() => setControlType('pas')}>Pedal Assist (PAS)</button>
              <button className={controlType === 'switch' ? 'active' : ''} onClick={() => setControlType('switch')}>3-Speed Switch</button>
            </div>
          </section>

          {controlType === 'pas' ? (
            <section className="form-group">
              <label>Pedal Assist Level (1-5)</label>
              <div className="mode-toggle" style={{ flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map(lv => (
                  <button key={lv} className={pasLevel === lv ? 'active' : ''} onClick={() => setPasLevel(lv)} style={{ flex: 'none', width: '18%' }}>{lv}</button>
                ))}
              </div>
              <p style={{ fontSize: '0.6rem', color: '#777', marginTop: '0.4rem' }}>* Assumes 150W human power at PAS 1, decreasing as PAS increases.</p>
            </section>
          ) : (
            <section className="form-group">
              <label>3-Speed Switch Mode</label>
              <div className="mode-toggle">
                <button className={mode === 'eco' ? 'active' : ''} onClick={() => setMode('eco')}>ECO</button>
                <button className={mode === 'normal' ? 'active' : ''} onClick={() => setMode('normal')}>NORMAL</button>
                <button className={mode === 'sport' ? 'active' : ''} onClick={() => setMode('sport')}>SPORT</button>
              </div>
            </section>
          )}

          <section className="form-group">
            <label>Current Battery Level</label>
            <div className="mode-toggle" style={{ marginBottom: '0.5rem' }}>
              <button className={batteryInputMode === 'percent' ? 'active' : ''} onClick={() => handleToggleBatteryMode('percent')}>%</button>
              <button className={batteryInputMode === 'voltage' ? 'active' : ''} onClick={() => handleToggleBatteryMode('voltage')}>V</button>
            </div>
            <input type="number" value={batteryInputMode === 'percent' ? startBattery : startVoltage} onChange={(e) => batteryInputMode === 'percent' ? setStartBattery(parseFloat(e.target.value) || '') : setStartVoltage(parseFloat(e.target.value) || '')} />
          </section>

          <section className="form-group"><label>Average Speed ({unitSystem === 'imperial' ? 'mph' : 'km/h'})</label><input type="number" value={targetSpeedMph} onChange={(e) => setTargetSpeedMph(parseFloat(e.target.value) || '')} /></section>

          <section className="form-group">
            <label>Trip Type</label>
            <div className="mode-toggle">
              <button className={!isRoundTrip ? 'active' : ''} onClick={() => setIsRoundTrip(false)}>One Way</button>
              <button className={isRoundTrip ? 'active' : ''} onClick={() => setIsRoundTrip(true)}>Round Trip</button>
            </div>
            {isRoundTrip && (
              <div style={{ marginTop: '0.8rem', padding: '0.8rem', background: '#222', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'none' }}>
                  <input type="checkbox" checked={isCustomReturn} onChange={e => setIsCustomReturn(e.target.checked)} style={{ width: 'auto' }} />
                  Custom Return Route
                </label>
              </div>
            )}
          </section>

          <section className="form-group">
            <label>Style</label>
            <div className="mode-toggle">
              <button className={ridingStyle === 'relaxed' ? 'active' : ''} onClick={() => setRidingStyle('relaxed')}>Relaxed</button>
              <button className={ridingStyle === 'aggressive' ? 'active' : ''} onClick={() => setRidingStyle('aggressive')}>Aggressive</button>
            </div>
          </section>

          {metrics && (
            <div ref={metricsCardRef} className="card metrics-card" style={{ marginTop: '1rem', borderLeft: '4px solid #ff6600', background: 'rgba(40,40,40,0.9)' }}>
              <h3 style={{ fontSize: '0.9rem', color: '#ff6600' }}>ESTIMATED METRICS</h3>

              {response && response.routes.length > 1 && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.65rem', color: '#888' }}>SELECT ROUTE</label>
                  <div className="mode-toggle" style={{ marginTop: '0.4rem' }}>
                    {response.routes.map((_, idx) => (
                      <button 
                        key={idx} 
                        className={selectedRouteIndex === idx ? 'active' : ''} 
                        onClick={() => {
                          setSelectedRouteIndex(idx);
                          calculateMetrics(response, idx);
                        }}
                      >
                        Route {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'white' }}>Battery Left: {metrics.batteryPercentUsed.toFixed(1)}%</p>
              <p style={{ fontSize: '0.8rem', color: '#b0b0b0' }}>Est. End Voltage: {(getBatteryLevels(Number(specs.voltage)).min + (metrics.batteryPercentUsed / 100) * (getBatteryLevels(Number(specs.voltage)).max - getBatteryLevels(Number(specs.voltage)).min)).toFixed(1)}V</p>
              
              <div style={{ marginTop: '0.8rem', padding: '0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                  <span style={{ color: '#888' }}>Travel Time:</span>
                  <span style={{ color: 'white', fontWeight: 'bold' }}>{Math.floor(metrics.durationMin / 60)}h {Math.round(metrics.durationMin % 60)}m</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                  <span style={{ color: '#888' }}>Distance:</span>
                  <span style={{ color: 'white' }}>
                    {unitSystem === 'imperial' 
                      ? `${metrics.distanceMiles.toFixed(1)} mi` 
                      : `${(metrics.distanceMiles * 1.60934).toFixed(1)} km`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                  <span style={{ color: '#888' }}>Elevation Gain:</span>
                  <span style={{ color: 'white' }}>
                    {unitSystem === 'imperial' 
                      ? `${metrics.elevationGainFeet.toFixed(0)} ft` 
                      : `${(metrics.elevationGainFeet * 0.3048).toFixed(0)} m`}
                  </span>
                </div>
                {metrics.windConditions && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#34a853' }}>
                    <span>🌬️ Wind:</span>
                    <span>
                      {unitSystem === 'imperial' 
                        ? `${metrics.windConditions.speed.toFixed(1)} mph` 
                        : `${(metrics.windConditions.speed * 1.60934).toFixed(1)} km/h`} 
                      ({metrics.windConditions.headwindComponent > 0 ? 'Headwind' : 'Tailwind'})
                    </span>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#777', textAlign: 'center' }}>
                {unitSystem === 'imperial' 
                  ? `Wh/mile: ${(metrics.estimatedWh / metrics.distanceMiles).toFixed(1)}` 
                  : `Wh/km: ${(metrics.estimatedWh / (metrics.distanceMiles * 1.60934)).toFixed(1)}`}
              </div>

              <button onClick={() => {
                  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(trip.origin)}&destination=${encodeURIComponent(trip.destination)}&travelmode=bicycling`;
                  window.open(url, '_blank');
              }} style={{ width: '100%', marginTop: '1rem', padding: '0.6rem', backgroundColor: '#34a853', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>🚀 Open Maps</button>
              
              <button onClick={() => {
                  if (!isPro && !isHostTier) {
                    alert("The Share Card feature is only available for PRO users.");
                    handleUpgrade('pro');
                    return;
                  }
                  ReactGA.event({ category: "Engagement", action: "Open Share Preview" });
                  setShowSharePreview(true);
              }} style={{ width: '100%', marginTop: '0.5rem', padding: '0.6rem', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Save Image (PRO)</button>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <AdBanner isPro={isPro} />
            {!isPro && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={() => handleUpgrade('pro')} style={{ width: '100%', background: 'none', border: 'none', color: '#ff6600', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}>Go PRO / Remove Ads ($4.99)</button>
                <button onClick={() => handleUpgrade('host')} style={{ width: '100%', padding: '0.6rem', background: 'linear-gradient(45deg, #ff6600, #ff9900)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.75rem', cursor: 'pointer' }}>Unlock Group Rides & Host Tier ($9.99/mo)</button>
              </div>
            )}
            {isPro && !isHostTier && (
               <button onClick={() => handleUpgrade('host')} style={{ width: '100%', marginTop: '0.5rem', padding: '0.6rem', background: 'linear-gradient(45deg, #ff6600, #ff9900)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.75rem', cursor: 'pointer' }}>Upgrade to Host Tier ($9.99/mo)</button>
            )}
            
            {user && (
              <div style={{ marginTop: '1rem', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                <label style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase' }}>Social Profile</label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                  <span style={{ fontSize: '0.9rem', color: 'white', fontWeight: 'bold' }}>{username || 'Anonymous Rider'}</span>
                </div>
              </div>
            )}
          </div>
          
            {rideError && <div style={{ background: 'rgba(217,48,37,0.1)', color: '#d93025', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem' }}>{rideError}</div>}
            
            <section className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
              <label style={{ color: '#ff6600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 👥 Group Ride Tracker
               {!isHostTier && <span style={{ fontSize: '0.6rem', background: '#333', padding: '2px 6px', borderRadius: '4px' }}>{isPro ? 'PRO' : 'HOST TIER'}</span>}
               {isHostTier && hostTierExpiresAt && (
                 <span style={{ fontSize: '0.55rem', color: '#888', marginLeft: 'auto' }}>
                   Expires: {new Date(hostTierExpiresAt).toLocaleDateString()}
                 </span>
               )}
            </label>
            
            {!isPro ? (
              <div style={{ background: 'rgba(255,102,0,0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,102,0,0.2)', marginTop: '0.5rem' }}>
                 <p style={{ fontSize: '0.7rem', color: '#ccc', margin: 0 }}>Upgrade to PRO or HOST to join real-time group rides.</p>
                 <button onClick={() => handleUpgrade('pro')} style={{ width: '100%', marginTop: '0.8rem', padding: '0.5rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>Upgrade</button>
              </div>
            ) : (
              <div style={{ marginTop: '0.5rem' }}>
                 {!activeRide ? (
                   <>
                     {isHostTier ? (
                       <div className="form-group">
                         <label style={{ fontSize: '0.65rem' }}>Host a New Ride</label>
                         <div style={{ display: 'flex', gap: '0.5rem' }}>
                           <input type="text" placeholder="Ride Name" value={groupRideName} onChange={e => setGroupRideName(e.target.value)} />
                           <button onClick={createRide} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#ff6600', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white' }}>Host</button>
                         </div>
                         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.65rem', textTransform: 'none' }}>
                           <input type="checkbox" checked={isPublicRide} onChange={e => setIsPublicRide(e.target.checked)} style={{ width: 'auto' }} />
                           Visible on public map
                         </label>
                       </div>
                     ) : (
                       <div style={{ padding: '0.5rem', border: '1px dashed #444', borderRadius: '8px', marginBottom: '1rem' }}>
                          <p style={{ fontSize: '0.6rem', color: '#888', margin: 0 }}>You are a PRO user. You can join rides, but only HOSTS can create them.</p>
                          <button onClick={() => handleUpgrade('host')} style={{ background: 'none', border: 'none', color: '#ff6600', fontSize: '0.65rem', cursor: 'pointer', padding: 0, textDecoration: 'underline', marginTop: '0.2rem' }}>Upgrade to Host</button>
                       </div>
                     )}
                     <div className="form-group">
                       <label style={{ fontSize: '0.65rem' }}>Join by ID/PIN</label>
                       <div style={{ display: 'flex', gap: '0.5rem' }}>
                         <input type="text" placeholder="PIN Code" value={joinPin} onChange={e => setJoinPin(e.target.value)} />
                         <button onClick={() => joinRide()} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#444', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white' }}>Join</button>
                       </div>
                     </div>

                     {publicRides.length > 0 && (
                       <div className="form-group" style={{ marginTop: '1rem' }}>
                         <label style={{ fontSize: '0.65rem', color: 'var(--accent-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           📡 Nearby Public Rides
                           {user?.email === 'mattyfliptv@gmail.com' && (
                             <button onClick={endAllPublicRides} style={{ background: 'none', border: 'none', color: '#d93025', fontSize: '0.6rem', cursor: 'pointer', textDecoration: 'underline' }}>End All</button>
                           )}
                         </label>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                           {publicRides.map(ride => (
                             <div key={ride.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '0.6rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{ride.name}</span>
                                <button onClick={() => joinRide(ride.id)} style={{ padding: '0.3rem 0.6rem', backgroundColor: '#34a853', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.65rem', cursor: 'pointer' }}>Join</button>
                             </div>
                           ))}
                         </div>
                       </div>
                     )}
                   </>
                 ) : (
                   <div style={{ background: 'rgba(52,168,83,0.1)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(52,168,83,0.3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontWeight: 'bold', color: '#34a853' }}>LIVE: {activeRide.name}</p>
                        <span style={{ fontSize: '0.6rem', color: '#888' }}>PIN: <span style={{ color: 'white', fontWeight: 'bold' }}>{activeRide.pin}</span></span>
                      </div>

                      <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '150px', overflowY: 'auto' }}>
                        {rideParticipants.map(p => (
                          <div key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.4rem', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeRide.creatorId === p.userId ? '#34a853' : '#ff6600' }} />
                              <span style={{ fontSize: '0.75rem' }}>
                                {p.name} {activeRide.leaderId === p.userId && '⭐️'}
                              </span>
                            </div>
                            {user?.uid === activeRide.creatorId && activeRide.leaderId !== p.userId && (
                              <button 
                                onClick={() => setLeader(p.userId)}
                                style={{ background: 'none', border: '1px solid #444', color: '#888', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                Set Leader
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {user?.uid === activeRide.creatorId && joinRequests.length > 0 && (
                        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
                          <label style={{ fontSize: '0.65rem', color: '#ffcc00', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Pending Riders ({joinRequests.length})</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {joinRequests.map(req => (
                              <div key={req.id} style={{ background: 'rgba(255,204,0,0.05)', padding: '0.8rem', borderRadius: '12px', border: '1px solid rgba(255,204,0,0.2)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'white' }}>{req.name}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#ffcc00', marginTop: '0.2rem' }}>
                                      {'★'.repeat(Math.round(req.rating || 0))}{'☆'.repeat(5 - Math.round(req.rating || 0))}
                                      <span style={{ marginLeft: '0.4rem', color: '#888' }}>({(req.rating || 0).toFixed(1)})</span>
                                    </div>
                                    <button 
                                      onClick={() => window.open(`/profile/${req.name.replace(/\s+/g, '_')}`, '_blank')}
                                      style={{ background: 'none', border: 'none', color: '#ff6600', fontSize: '0.65rem', padding: 0, textDecoration: 'underline', marginTop: '0.4rem', cursor: 'pointer' }}
                                    >
                                      View Profile
                                    </button>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button onClick={() => handleJoinRequest(req, 'accept')} style={{ background: '#34a853', color: 'white', border: 'none', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>Accept</button>
                                    <button onClick={() => handleJoinRequest(req, 'decline')} style={{ background: '#444', color: 'white', border: 'none', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem', cursor: 'pointer' }}>No</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                        <button onClick={leaveRide} style={{ flex: 1, padding: '0.4rem', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Leave</button>
                        {user?.uid === activeRide.creatorId && (
                          <button onClick={endRide} style={{ flex: 2, padding: '0.4rem', backgroundColor: '#d93025', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem' }}>End Ride</button>
                        )}
                      </div>
                   </div>
                 )}
              </div>
            )}
          </section>

          <button 
            className="calculate-btn" 
            onClick={() => { handleCalculate(); setShowMobileMenu(false); }} 
            disabled={isLoading}
            style={{ width: '100%', marginTop: '1rem', padding: '1rem', borderRadius: '12px' }}
          >
            {isLoading ? 'Calculating...' : 'Find Route'}
          </button>
        </aside>

        <main>
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
              center={center}
              zoom={10}
              onLoad={onMapLoad}
            >
              {response && (
                <div className="map-controls">
                    <button onClick={() => searchPOIs('cafe')}>☕ Cafes</button>
                    <button onClick={() => searchPOIs('bike shop')}>🚲 Shops</button>
                    <button onClick={() => searchPOIs('charging')}>⚡ Charging (PRO)</button>
                    <button onClick={searchByMapCenter}>🔍 Search Area</button>
                </div>
              )}

              {trip.origin && trip.destination && isLoading && !response && (
                <DirectionsService
                  options={{
                    origin: trip.origin,
                    destination: isRoundTrip ? trip.origin : trip.destination,
                    waypoints: [
                      ...trip.waypoints.map(wp => ({ location: wp, stopover: true })),
                      ...(isRoundTrip ? [{ location: trip.destination, stopover: true }] : []),
                      ...(isRoundTrip && isCustomReturn ? trip.returnWaypoints.map(wp => ({ location: wp, stopover: true })) : [])
                    ].filter(wp => wp.location && wp.location.trim() !== ""),
                    travelMode: google.maps.TravelMode.BICYCLING,
                    provideRouteAlternatives: true
                  }}
                  callback={directionsCallback}
                />
              )}
              {response && <DirectionsRenderer options={{ directions: response, routeIndex: selectedRouteIndex }} />}
              
              {activeRide?.leaderTrail && activeRide.leaderTrail.length > 1 && (
                <Polyline 
                  path={activeRide.leaderTrail}
                  options={{
                    strokeColor: '#34a853',
                    strokeOpacity: 0.8,
                    strokeWeight: 4,
                    icons: [{
                      icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW },
                      offset: '100%',
                      repeat: '100px'
                    }]
                  }}
                />
              )}
              
              {/* Public Rides Discovery */}
              {publicRides.filter(r => r.id !== activeRide?.id).map(ride => (
                <Marker 
                  key={ride.id} 
                  position={{ lat: ride.startLat, lng: ride.startLng }} 
                  onClick={() => setSelectedPublicRide(ride)}
                  icon={{
                    url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                    scaledSize: new google.maps.Size(40, 40)
                  }}
                />
              ))}

              {selectedPublicRide && (
                <InfoWindow 
                  position={{ lat: selectedPublicRide.startLat, lng: selectedPublicRide.startLng }} 
                  onCloseClick={() => setSelectedPublicRide(null)}
                >
                  <div style={{ padding: '0.5rem', color: '#333' }}>
                    <h4 style={{ margin: 0 }}>👥 {selectedPublicRide.name}</h4>
                    <p style={{ margin: '0.2rem 0', fontSize: '0.8rem' }}>Host: {selectedPublicRide.creatorId.substring(0, 5)}...</p>
                    <button 
                      onClick={() => { joinRide(selectedPublicRide.id); setSelectedPublicRide(null); }} 
                      style={{ width: '100%', marginTop: '0.5rem', padding: '0.4rem', backgroundColor: '#34a853', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Join Group Ride
                    </button>
                  </div>
                </InfoWindow>
              )}
              
      {/* Ride Participants */}
              {rideParticipants.map(p => {
                const isOrganizer = activeRide?.creatorId === p.userId;
                return (
                  <Marker 
                    key={p.userId} 
                    position={{ lat: p.lat, lng: p.lng }} 
                    label={{ 
                      text: p.name, 
                      color: 'white', 
                      className: 'rider-label',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                    icon={{
                      path: google.maps.SymbolPath.CIRCLE,
                      fillColor: isOrganizer ? '#34a853' : '#ff6600', // Green for Organizer, Orange for Riders
                      fillOpacity: 1,
                      strokeColor: 'white',
                      strokeWeight: 2,
                      scale: 8
                    }}
                  />
                );
              })}

              {pois.map(poi => (
                <Marker 
                  key={poi.id} 
                  position={poi.position} 
                  title={poi.name} 
                  onClick={() => setSelectedPoi(poi)} 
                  icon={poi.type === 'charging station' ? {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: '#d93025', // Red
                    fillOpacity: 1,
                    strokeColor: 'white',
                    strokeWeight: 2,
                    scale: 10
                  } : undefined}
                  label={poi.type === 'charging station' ? {
                    text: '⚡',
                    color: 'white',
                    fontSize: '12px'
                  } : undefined}
                />
              ))}
              {selectedPoi && (
                <InfoWindow position={selectedPoi.position} onCloseClick={() => setSelectedPoi(null)}>
                  <div style={{ padding: '0.5rem', color: '#333' }}>
                    <h4 style={{ margin: 0 }}>{selectedPoi.name}</h4>
                    <p style={{ margin: '0.2rem 0', fontSize: '0.8rem' }}>{selectedPoi.address}</p>
                    <button onClick={() => { addPOIAsWaypoint(selectedPoi); setSelectedPoi(null); }} style={{ width: '100%', marginTop: '0.5rem', padding: '0.2rem', backgroundColor: '#ff6600', color: 'white', border: 'none', cursor: 'pointer' }}>Add Stop</button>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          ) : (
            <div className="map-placeholder">
              {loadError ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <p style={{ color: '#ff4444', fontWeight: 'bold' }}>Error Loading Maps</p>
                  <p style={{ fontSize: '0.8rem' }}>{loadError.message}</p>
                  <p style={{ fontSize: '0.7rem', marginTop: '1rem' }}>Check VITE_GOOGLE_MAPS_API_KEY.</p>
                </div>
              ) : "Loading Google Maps API..."}
            </div>
          )}
        </main>
      </div>

      <footer style={{ padding: '2rem', borderTop: '1px solid #333', background: '#1a1a1a', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>&copy; 2026 Range Anxiety. Estimates only. Ride safe!</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
             <a href="https://ebikekingnj.com" target="_blank" rel="noreferrer" style={{ color: '#888', textDecoration: 'none', fontSize: '0.7rem' }}>ebikekingnj.com</a>
             <span style={{ color: '#444' }}>|</span>
             <a href="#" onClick={(e) => { e.preventDefault(); setShowToSPage(true); }} style={{ color: '#888', textDecoration: 'none', fontSize: '0.7rem' }}>Terms of Service</a>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem' }}>
             <svg style={{ width: '20px', height: '20px', fill: '#444', cursor: 'pointer' }}><use href="/icons.svg#bluesky-icon" /></svg>
             <svg style={{ width: '20px', height: '20px', fill: '#444', cursor: 'pointer' }}><use href="/icons.svg#discord-icon" /></svg>
             <svg style={{ width: '20px', height: '20px', fill: '#444', cursor: 'pointer' }}><use href="/icons.svg#github-icon" /></svg>
             <svg style={{ width: '20px', height: '20px', fill: '#444', cursor: 'pointer' }}><use href="/icons.svg#x-icon" /></svg>
          </div>
          <button 
            onClick={() => setShowInstallTutorial(true)}
            style={{ 
              marginTop: '1.5rem',
              background: 'none', 
              border: '1px solid #444', 
              color: '#888', 
              borderRadius: '8px', 
              padding: '0.5rem 1rem', 
              fontSize: '0.7rem', 
              cursor: 'pointer' 
            }}
          >
            Install as Mobile App
          </button>
        </div>
      </footer>
      
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}

      {showSharePreview && metrics && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 10001, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto', backdropFilter: 'blur(10px)' }}>
          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
            <h3 style={{ color: 'white', marginBottom: '5px', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Preview Trip Dashboard</h3>
            <p style={{ color: '#ff6600', fontSize: '0.8rem' }}>Ready for high-res export</p>
          </div>

          <div style={{ 
            position: "relative", 
            boxShadow: '0 30px 60px rgba(0,0,0,0.8)', 
            borderRadius: '40px',
            transform: 'scale(0.65)',
            transformOrigin: 'center center',
            margin: '-120px 0' // Compensate for scaled-down height
          }}>
            <div 
              ref={shareCardRef}
              style={{ 
                width: "600px", 
                height: "900px",
                background: "#0a0a0a radial-gradient(circle at center, #1a1a1a 0%, #050505 100%)", 
                padding: "2rem", 
                color: "white",
                fontFamily: "'Inter', sans-serif",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                borderRadius: "40px",
                border: "1px solid #333",
                overflow: "hidden",
                position: "relative"
              }}
            >
              {/* Circuit Pattern Overlay */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.05, pointerEvents: 'none', backgroundImage: 'radial-gradient(#ff6600 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }} />
              
              {/* Header Section - BETTER READABILITY */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 2, marginBottom: '0.5rem' }}>
                <div>
                  <h1 style={{ color: '#ff6600', margin: 0, fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.02em', fontStyle: 'italic' }}>RANGE ANXIETY</h1>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: '#666', fontWeight: 600 }}>Trip Report • {new Date().toLocaleDateString()}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white' }}>{specs.voltage}V {specs.capacityAh}Ah</div>
                  <div style={{ fontSize: '0.7rem', color: '#ff6600', fontWeight: 600 }}>{bikeSearchQuery || "Custom E-Bike"}</div>
                </div>
              </div>

              {/* Route Map Snapshot - MAINTAIN FOCUS */}
              {mapSnapshot && (
                <div style={{ flex: 1, width: '100%', borderRadius: '24px', overflow: 'hidden', border: '2px solid rgba(255,102,0,0.6)', position: 'relative', zIndex: 2, boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
                  <img 
                    src={mapSnapshot} 
                    alt="Route Snapshot" 
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                  />
                </div>
              )}

              {/* UNIFIED METRICS GRID */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto auto', gap: '0.6rem', margin: '0.8rem 0', zIndex: 2 }}>
                
                {/* End Battery */}
                <div style={{ background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 100%)', borderRadius: '15px', border: '1px solid #444', padding: '0.6rem', textAlign: 'center', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' }}>
                  <div style={{ fontSize: '0.5rem', color: '#ff6600', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Battery Left</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{metrics.batteryPercentUsed.toFixed(0)}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#ff6600', fontWeight: 700 }}>{(getBatteryLevels(Number(specs.voltage)).min + (metrics.batteryPercentUsed / 100) * (getBatteryLevels(Number(specs.voltage)).max - getBatteryLevels(Number(specs.voltage)).min)).toFixed(1)}V</div>
                </div>

                {/* Distance */}
                <div style={{ background: 'rgba(30,30,30,0.8)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.2rem' }}>Distance</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{unitSystem === 'imperial' ? `${metrics.distanceMiles.toFixed(1)}` : `${(metrics.distanceMiles * 1.60934).toFixed(1)}`}<span style={{ fontSize: '0.6rem', marginLeft: '2px' }}>{unitSystem === 'imperial' ? 'mi' : 'km'}</span></div>
                </div>

                {/* Efficiency */}
                <div style={{ background: 'rgba(30,30,30,0.8)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.2rem' }}>Efficiency</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{(metrics.estimatedWh / metrics.distanceMiles).toFixed(0)}<span style={{ fontSize: '0.6rem', marginLeft: '2px' }}>Wh</span></div>
                </div>

                {/* Start Battery */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.6rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.2rem' }}>Start Bat</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{startBattery}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#888' }}>{startVoltage}V</div>
                </div>

                {/* Elevation */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.2rem' }}>Gain/Loss</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{metrics.elevationGainFeet > metrics.elevationLossFeet ? `+${(metrics.elevationGainFeet - metrics.elevationLossFeet).toFixed(0)}` : `-${(metrics.elevationLossFeet - metrics.elevationGainFeet).toFixed(0)}`}<span style={{ fontSize: '0.6rem', marginLeft: '2px' }}>ft</span></div>
                </div>

                {/* Wind */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.2rem' }}>Wind</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{metrics.windConditions ? Math.round(metrics.windConditions.speed) : '0'}<span style={{ fontSize: '0.6rem', marginLeft: '2px' }}>{(metrics.windConditions?.headwindComponent || 0) > 0 ? '🌬️' : '💨'}</span></div>
                </div>

              </div>

              {/* Route Summary Text */}
              <div style={{ fontSize: '1rem', color: 'white', textAlign: 'center', marginBottom: '0.8rem', zIndex: 2, fontWeight: 600 }}>
                {trip.origin || "Current Location"} <span style={{ color: '#ff6600' }}>➔</span> {trip.destination}
                <div style={{ fontSize: '0.65rem', color: '#ff6600', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.2rem' }}>
                  {isRoundTrip ? '🔄 Round Trip' : '➔ One Way'}
                </div>
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: 'auto', zIndex: 2 }}>
                <div style={{ color: '#ff6600', fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.1em' }}>rangeanxiety.app</div>
                <p style={{ color: '#444', fontSize: '0.6rem', marginTop: '0.5rem', maxWidth: '80%', marginInline: 'auto' }}>
                  * Estimates only. Actual range may vary based on conditions, rider behavior, and hardware health.
                </p>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "30px", display: "flex", flexWrap: 'wrap', gap: "15px", width: "100%", maxWidth: "600px" }}>
            <button 
              onClick={() => setShowSharePreview(false)} 
              style={{ flex: 1, padding: '14px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}
            >
              Cancel
            </button>
            <button 
              onClick={async () => {
                await downloadShareCard();
                setShowSharePreview(false);
              }} 
              disabled={isLoading}
              style={{ flex: 1, padding: '14px', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}
            >
              {isLoading ? '...' : 'Private Download'}
            </button>
            <button 
              onClick={shareToCommunity} 
              disabled={isLoading}
              style={{ width: '100%', padding: '14px', backgroundColor: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', boxShadow: '0 0 20px rgba(255,102,0,0.4)' }}
            >
              {isLoading ? 'Processing...' : 'Post to Community Feed'}
            </button>
            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem', justifyContent: 'center', width: '100%' }}>
              <input 
                type="checkbox" 
                id="allow-comments-map" 
                checked={commentsEnabled} 
                onChange={e => setCommentsEnabled(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <label htmlFor="allow-comments-map" style={{ margin: 0, textTransform: 'none', fontSize: '0.85rem', color: '#ccc' }}>Allow community comments</label>
            </div>
            <p style={{ width: '100%', textAlign: 'center', fontSize: '0.6rem', color: '#666', marginTop: '10px' }}>
               * Private Download saves locally only. Nothing is saved to our servers unless you click "Post to Community Feed".
            </p>
          </div>
        </div>
      )}

      {/* Off-screen container for image generation (high-res export) */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', pointerEvents: 'none' }}>
        <div 
          ref={shareCardRef} 
          style={{ 
            width: "600px", 
            height: "900px",
            background: "#0a0a0a radial-gradient(circle at center, #1a1a1a 0%, #050505 100%)", 
            padding: "2rem", 
            color: "white",
            fontFamily: "'Inter', sans-serif",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            borderRadius: "40px",
            border: "1px solid #333",
            overflow: "hidden",
            position: "relative"
          }}
        >
          {/* Circuit Pattern Overlay */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.05, pointerEvents: 'none', backgroundImage: 'radial-gradient(#ff6600 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }} />
          
          {metrics && (
            <>
              {/* Header Section - BETTER READABILITY */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 2, marginBottom: '0.5rem' }}>
                <div>
                  <h1 style={{ color: '#ff6600', margin: 0, fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.02em', fontStyle: 'italic' }}>RANGE ANXIETY</h1>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: '#666', fontWeight: 600 }}>Trip Report • {new Date().toLocaleDateString()}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white' }}>{specs.voltage}V {specs.capacityAh}Ah</div>
                  <div style={{ fontSize: '0.7rem', color: '#ff6600', fontWeight: 600 }}>{bikeSearchQuery || "Custom E-Bike"}</div>
                </div>
              </div>

              {/* Route Map Snapshot - MAINTAIN FOCUS */}
              {mapSnapshot && (
                <div style={{ flex: 1, width: '100%', borderRadius: '24px', overflow: 'hidden', border: '2px solid rgba(255,102,0,0.6)', position: 'relative', zIndex: 2, boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
                  <img 
                    src={mapSnapshot} 
                    alt="Route Snapshot" 
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                  />
                </div>
              )}

              {/* UNIFIED METRICS GRID */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto auto', gap: '0.6rem', margin: '0.8rem 0', zIndex: 2 }}>
                
                {/* End Battery */}
                <div style={{ background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 100%)', borderRadius: '15px', border: '1px solid #444', padding: '0.6rem', textAlign: 'center', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' }}>
                  <div style={{ fontSize: '0.5rem', color: '#ff6600', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Battery Left</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{metrics.batteryPercentUsed.toFixed(0)}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#ff6600', fontWeight: 700 }}>{(getBatteryLevels(Number(specs.voltage)).min + (metrics.batteryPercentUsed / 100) * (getBatteryLevels(Number(specs.voltage)).max - getBatteryLevels(Number(specs.voltage)).min)).toFixed(1)}V</div>
                </div>

                {/* Distance */}
                <div style={{ background: 'rgba(30,30,30,0.8)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.2rem' }}>Distance</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{unitSystem === 'imperial' ? `${metrics.distanceMiles.toFixed(1)}` : `${(metrics.distanceMiles * 1.60934).toFixed(1)}`}<span style={{ fontSize: '0.6rem', marginLeft: '2px' }}>{unitSystem === 'imperial' ? 'mi' : 'km'}</span></div>
                </div>

                {/* Efficiency */}
                <div style={{ background: 'rgba(30,30,30,0.8)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.2rem' }}>Efficiency</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{(metrics.estimatedWh / metrics.distanceMiles).toFixed(0)}<span style={{ fontSize: '0.6rem', marginLeft: '2px' }}>Wh</span></div>
                </div>

                {/* Start Battery */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.6rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.2rem' }}>Start Bat</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{startBattery}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#888' }}>{startVoltage}V</div>
                </div>

                {/* Elevation */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.2rem' }}>Gain/Loss</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{metrics.elevationGainFeet > metrics.elevationLossFeet ? `+${(metrics.elevationGainFeet - metrics.elevationLossFeet).toFixed(0)}` : `-${(metrics.elevationLossFeet - metrics.elevationGainFeet).toFixed(0)}`}<span style={{ fontSize: '0.6rem', marginLeft: '2px' }}>ft</span></div>
                </div>

                {/* Wind */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.2rem' }}>Wind</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{metrics.windConditions ? Math.round(metrics.windConditions.speed) : '0'}<span style={{ fontSize: '0.6rem', marginLeft: '2px' }}>{(metrics.windConditions?.headwindComponent || 0) > 0 ? '🌬️' : '💨'}</span></div>
                </div>

              </div>

              {/* Route Summary Text */}
              <div style={{ fontSize: '1rem', color: 'white', textAlign: 'center', marginBottom: '0.8rem', zIndex: 2, fontWeight: 600 }}>
                {trip.origin || "Current Location"} <span style={{ color: '#ff6600' }}>➔</span> {trip.destination}
                <div style={{ fontSize: '0.65rem', color: '#ff6600', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.2rem' }}>
                  {isRoundTrip ? '🔄 Round Trip' : '➔ One Way'}
                </div>
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: 'auto', zIndex: 2 }}>
                <div style={{ color: '#ff6600', fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.1em' }}>rangeanxiety.app</div>
                <p style={{ color: '#444', fontSize: '0.6rem', marginTop: '0.5rem' }}>
                  * Estimates only. Actual range may vary based on conditions.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Floating UI Controls (Persistent) */}
      <div className="persistent-controls" style={{ position: 'fixed', bottom: '2rem', right: '1rem', zIndex: 20002, display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          <button 
            className="mobile-toggle-btn-floating"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            style={{
              padding: '0.8rem 1.2rem',
              borderRadius: '30px',
              backgroundColor: '#ff6600',
              color: 'white',
              border: 'none',
              boxShadow: '0 8px 25px rgba(255,102,0,0.4)',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap'
            }}
          >
            {showMobileMenu ? 'Show Map' : (metrics ? '📊 Trip Stats' : 'Trip Settings')}
          </button>

          <button 
            onClick={recenterMap}
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundColor: '#ff6600',
              color: 'white',
              border: 'none',
              boxShadow: '0 8px 25px rgba(255,102,0,0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem'
            }}
            title="Recenter Map"
          >
            🎯
          </button>
      </div>

      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
      
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}

      {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
    </div>
  )
}

export default MapHome
