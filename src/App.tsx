import { useState, useCallback, useRef, useEffect } from 'react'
import ReactGA from "react-ga4"
import { GoogleMap, useJsApiLoader, DirectionsService, DirectionsRenderer, Marker, InfoWindow, Polyline } from '@react-google-maps/api'
import axios from 'axios'
import { toPng } from 'html-to-image'
import { auth, db } from './firebase'
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, onSnapshot, query, where, deleteDoc, getDocs, updateDoc, arrayUnion } from 'firebase/firestore'
import AdBanner from './components/AdBanner'
import TermsOfService from './components/TermsOfService'
import InstallTutorial from './components/InstallTutorial'
import heroLogo from './assets/logo-no-bg.png'

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
  name: string;
  specs: BikeSpecs;
}

const STANDARD_BIKES: SavedBike[] = [
  // --- Moped & High Performance ---
  { name: "Macfox X1 / X1S", specs: { voltage: 48, capacityAh: 10.4, motorWatts: 500, bikeWeightLbs: 65 } },
  { name: "Macfox X2", specs: { voltage: 48, capacityAh: 15.6, motorWatts: 750, bikeWeightLbs: 75 } },
  { name: "Ride1Up Revv 1", specs: { voltage: 52, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 93 } },
  { name: "Super73 S2", specs: { voltage: 48, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 73 } },
  { name: "Super73 R-Adventure", specs: { voltage: 48, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 80 } },
  { name: "Goat Motor Goat V3", specs: { voltage: 60, capacityAh: 20, motorWatts: 1000, bikeWeightLbs: 85 } },
  { name: "Ridstar Q20 Pro", specs: { voltage: 52, capacityAh: 20, motorWatts: 2000, bikeWeightLbs: 88 } },
  { name: "Onyx RCR", specs: { voltage: 72, capacityAh: 41, motorWatts: 3000, bikeWeightLbs: 145 } },
  { name: "Sur-Ron Light Bee X", specs: { voltage: 60, capacityAh: 32, motorWatts: 6000, bikeWeightLbs: 110 } },
  { name: "Talaria Sting R", specs: { voltage: 60, capacityAh: 45, motorWatts: 8000, bikeWeightLbs: 145 } },

  // --- Commuter & Everyday ---
  { name: "Aventon Level.2", specs: { voltage: 48, capacityAh: 14, motorWatts: 500, bikeWeightLbs: 62 } },
  { name: "Velotric Discover 1", specs: { voltage: 48, capacityAh: 14.4, motorWatts: 500, bikeWeightLbs: 65 } },
  { name: "Velotric Nomad 1", specs: { voltage: 48, capacityAh: 14.4, motorWatts: 750, bikeWeightLbs: 73 } },
  { name: "Vanpowers City Vanture", specs: { voltage: 36, capacityAh: 7, motorWatts: 350, bikeWeightLbs: 35 } },
  { name: "Vanpowers UrbanGlide-Ultra", specs: { voltage: 48, capacityAh: 15, motorWatts: 500, bikeWeightLbs: 70 } },
  { name: "Ride1Up 700 Series", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 62 } },
  { name: "Lectric XP 3.0", specs: { voltage: 48, capacityAh: 14, motorWatts: 500, bikeWeightLbs: 64 } },
  { name: "Rad Power RadRunner 2", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 65 } },
  { name: "Electra Townie Go! 7D", specs: { voltage: 36, capacityAh: 7, motorWatts: 250, bikeWeightLbs: 48 } },

  // --- Utility & Delivery ---
  { name: "Arrow 10 (Delivery)", specs: { voltage: 48, capacityAh: 20, motorWatts: 500, bikeWeightLbs: 65 } },
  { name: "Fly-7 (Delivery)", specs: { voltage: 48, capacityAh: 20, motorWatts: 750, bikeWeightLbs: 75 } },
  { name: "Senada Herald", specs: { voltage: 48, capacityAh: 14, motorWatts: 750, bikeWeightLbs: 68 } },
  { name: "Sondors MadMod", specs: { voltage: 48, capacityAh: 21, motorWatts: 750, bikeWeightLbs: 80 } },
  { name: "BOB E-Trike (PH)", specs: { voltage: 48, capacityAh: 20, motorWatts: 500, bikeWeightLbs: 110 } },
  { name: "Tern GSD S10", specs: { voltage: 36, capacityAh: 11, motorWatts: 250, bikeWeightLbs: 75 } }
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

function App() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

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
  const [targetSpeedMph, setTargetSpeedMph] = useState<number | ''>(15);
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

  const [user, setUser] = useState<User | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isHostTier, setIsHostTier] = useState(false);
  const [hostTierExpiresAt, setHostTierExpiresAt] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const [bikeSearchQuery, setBikeSearchQuery] = useState("");
  const [showBikeResults, setShowBikeResults] = useState(false);
  const [savedBikes, setSavedBikes] = useState<SavedBike[]>([]);
  const [newBikeName, setNewBikeName] = useState('');

  const [usernameInput, setUsernameInput] = useState('');
  const [showUsernameEdit, setShowUsernameEdit] = useState(false);

  const [agreedToToS, setAgreedToToS] = useState(false);
  const [showToSPage, setShowToSPage] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  // Group Rides State
  const [activeRide, setActiveRide] = useState<GroupRide | null>(null);
  const [publicRides, setPublicRides] = useState<GroupRide[]>([]);
  const [selectedPublicRide, setSelectedPublicRide] = useState<GroupRide | null>(null);
  const [rideParticipants, setRideParticipants] = useState<Participant[]>([]);
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

    return () => { unsubscribe(); rideUnsub(); };
  }, [activeRide?.id, user?.uid, response]);

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
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setIsPro(data.isPro || false);
            setIsHostTier(data.isHostTier || false);
            setHostTierExpiresAt(data.hostTierExpiresAt?.toMillis() || null);
            setUsername(data.username || '');
            if (data.bikes) setSavedBikes(data.bikes);
          } else {
            await setDoc(doc(db, "users", currentUser.uid), { email: currentUser.email, isPro: false, createdAt: new Date() });
            setIsPro(false);
            setIsHostTier(false);
          }
        } catch (e) { console.error("Firestore error:", e); }
      } else {
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

  const handleAuth = async () => {
    setError(null);
    try {
      if (isRegistering) {
        if (!agreedToToS) {
          setError("You must agree to the Terms of Service to create an account.");
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPass);
        try {
          await setDoc(doc(db, "marketing_emails", userCredential.user.uid), {
            email: authEmail,
            subscribedAt: serverTimestamp(),
            source: "account_creation"
          });
        } catch (e) { console.error("Marketing email log failed:", e); }
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPass);
      }
      setShowAuthModal(false); setAuthEmail(''); setAuthPass(''); setAgreedToToS(false);
    } catch (err: any) { console.error("Auth error:", err); setError(err.message); }
  };

  const handleSignOut = () => signOut(auth);

  const updateUsername = async (newVal: string) => {
    setUsername(newVal);
    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid), { username: newVal }, { merge: true });
      } catch (e) { console.error("Username update failed:", e); }
    }
  };

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
      if (rideId) {
        rideDoc = await getDoc(doc(db, "group_rides", rideId));
      } else {
        if (!joinPin) return;
        const q = query(collection(db, "group_rides"), where("pin", "==", joinPin), where("status", "==", "active"));
        const snap = await getDocs(q);
        if (!snap.empty) {
          rideDoc = snap.docs[0];
        }
      }

      if (rideDoc && rideDoc.exists()) {
        const data = rideDoc.data();
        ReactGA.event({ category: "Engagement", action: "Join Group Ride", label: data.name });
        setActiveRide({ id: rideDoc.id, ...data } as any);
        await setDoc(doc(db, `group_rides/${rideDoc.id}/participants`, user.uid), {
          userId: user.uid,
          name: user.email?.split('@')[0] || "Rider",
          lat: center.lat,
          lng: center.lng,
          lastUpdatedAt: Date.now()
        });
        setJoinPin('');
      } else {
        setRideError("Ride not found or invalid PIN.");
      }
    } catch (e) { console.error("Join ride failed:", e); setRideError("Failed to join ride."); }
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
    const newBike = { name: newBikeName, specs };
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

  const loadBike = (bike: SavedBike) => {
    ReactGA.event({ category: "Engagement", action: "Load Bike", label: bike.name });
    setSpecs(bike.specs);
    setBikeSearchQuery(bike.name);
    setShowBikeResults(false);
    if (bike.specs.voltage) {
      setStartVoltage(getBatteryLevels(Number(bike.specs.voltage)).max);
    }
    // Simple heuristic to set control type
    if (Number(bike.specs.voltage) >= 60 || bike.name.includes("Onyx") || bike.name.includes("Sur-Ron") || bike.name.includes("Talaria")) {
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
      try { 
        const elevResp = await axios.post('/api/elevation', { path }); 
        if (elevResp.data && typeof elevResp.data.gain === 'number') {
          gainFeet = elevResp.data.gain; 
        } else {
          console.warn("Elevation API returned unexpected data:", elevResp.data);
        }
      } catch (e: any) { 
        console.error("Elevation API call failed:", e.response?.data || e.message); 
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
    
    if (poiCategory === 'charging') {
      try {
        const resp = await axios.post('/api/charging', { lat: c.lat(), lng: c.lng(), category: poiCategory });
        if (resp.data.pois) setPois(resp.data.pois);
      } catch (e) { console.error("Radius search failed", e); }
    } else {
      searchPOIs(poiCategory);
    }
  };

  const addPOIAsWaypoint = (poi: POI) => { setTrip(prev => ({ ...prev, waypoints: [...prev.waypoints, poi.address] })); setResponse(null); setMetrics(null); };

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
    if (!shareCardRef.current || !metrics) return;
    try {
      setIsLoading(true);
      const el = shareCardRef.current;
      el.style.opacity = '1';
      
      // Wait for rendering
      await new Promise(resolve => setTimeout(resolve, 800));

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

  const filteredBikes = [...STANDARD_BIKES, ...savedBikes].filter(b => 
    b.name.toLowerCase().includes(bikeSearchQuery.toLowerCase())
  );

  return (
    <div className="container">
      <header>
        <div className="logo-container" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.8rem' }}>
          <img src={heroLogo} alt="Ebike King Logo" style={{ height: '2.8rem', width: 'auto' }} />
          <div className="logo" style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Range Anxiety</span>
          </div>
        </div>
        <div className="nav-actions" style={{ gap: '0.8rem' }}>
          <button 
            onClick={() => setShowInstallTutorial(true)}
            style={{ 
              background: 'linear-gradient(45deg, #ff6600, #ff9900)', 
              color: 'white', 
              border: 'none', 
              borderRadius: '20px', 
              padding: '0.4rem 1rem', 
              fontSize: '0.75rem', 
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(255,102,0,0.3)'
            }}
          >
            Get App
          </button>
          <button onClick={() => user ? handleSignOut() : setShowAuthModal(true)} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '20px', padding: '0.4rem 1rem', fontSize: '0.8rem', cursor: 'pointer' }}>
            {user ? `Sign Out (${isPro ? 'PRO' : 'Free'})` : 'Sign In'}
          </button>
        </div>
      </header>

      <div className="main-layout">
        <aside className={`sidebar ${showMobileMenu ? 'mobile-visible' : ''}`}>
          {error && <div style={{ background: 'rgba(217,48,37,0.1)', color: '#d93025', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem' }}>{error}</div>}
          
          <div className="form-group">
            <label style={{ color: 'var(--accent-color)', fontSize: '0.65rem' }}>Unit System</label>
            <div className="mode-toggle">
              <button className={unitSystem === 'imperial' ? 'active' : ''} onClick={() => setUnitSystem('imperial')}>Imperial (mi/lb)</button>
              <button className={unitSystem === 'metric' ? 'active' : ''} onClick={() => setUnitSystem('metric')}>Metric (km/kg)</button>
            </div>
          </div>

          <section className="form-group" style={{ position: 'relative' }}>
            <label>Search Bike Model</label>
            <input type="text" placeholder="e.g. Onyx, Sur-Ron..." value={bikeSearchQuery} onFocus={() => setShowBikeResults(true)} onChange={(e) => { setBikeSearchQuery(e.target.value); setShowBikeResults(true); }} />
            {showBikeResults && bikeSearchQuery && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '4px', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                {filteredBikes.map((bike, idx) => (<div key={idx} onClick={() => loadBike(bike)} style={{ padding: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #222' }}>{bike.name}</div>))}
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
            <label>Start Battery</label>
            <div className="mode-toggle" style={{ marginBottom: '0.5rem' }}>
              <button className={batteryInputMode === 'percent' ? 'active' : ''} onClick={() => setBatteryInputMode('percent')}>%</button>
              <button className={batteryInputMode === 'voltage' ? 'active' : ''} onClick={() => setBatteryInputMode('voltage')}>V</button>
            </div>
            <input type="number" value={batteryInputMode === 'percent' ? startBattery : startVoltage} onChange={(e) => batteryInputMode === 'percent' ? setStartBattery(parseFloat(e.target.value) || '') : setStartVoltage(parseFloat(e.target.value) || '')} />
          </section>

          <section className="form-group"><label>Target Speed ({unitSystem === 'imperial' ? 'mph' : 'km/h'})</label><input type="number" value={targetSpeedMph} onChange={(e) => setTargetSpeedMph(parseFloat(e.target.value) || '')} /></section>

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
            <div className="card metrics-card" style={{ marginTop: '1rem', borderLeft: '4px solid #ff6600', background: 'rgba(40,40,40,0.9)' }}>
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
                {!showUsernameEdit ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                    <span style={{ fontSize: '0.9rem', color: 'white', fontWeight: 'bold' }}>{username || 'Anonymous Rider'}</span>
                    <button onClick={() => { setUsernameInput(username); setShowUsernameEdit(true); }} style={{ background: 'none', border: 'none', color: '#ff6600', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}>Edit</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                    <input type="text" placeholder="Username" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} style={{ padding: '0.3rem', fontSize: '0.8rem' }} />
                    <button onClick={() => { updateUsername(usernameInput); setShowUsernameEdit(false); }} style={{ padding: '0.3rem 0.6rem', backgroundColor: '#34a853', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.7rem' }}>Save</button>
                  </div>
                )}
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
                    <button onClick={() => searchPOIs('charging')}>⚡ Charging</button>
                    <button onClick={searchByMapCenter}>🔍 Search Area</button>
                </div>
              )}

              {trip.origin && trip.destination && isLoading && !response && (
                <DirectionsService
                  options={{
                    origin: trip.origin,
                    destination: isRoundTrip ? trip.origin : trip.destination,
                    waypoints: [
                      ...(isRoundTrip ? [{ location: trip.destination, stopover: true }] : []),
                      ...(isRoundTrip && isCustomReturn ? trip.returnWaypoints.map(wp => ({ location: wp, stopover: true })) : [])
                    ].filter(wp => wp.location.trim() !== ""),
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
      
      {showAuthModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <div className="card" style={{ width: '350px', background: '#1e1e1e', padding: '2rem', borderRadius: '12px', border: '1px solid #333' }}>
            <h2 style={{ color: '#ff6600', marginBottom: '1.5rem', textAlign: 'center' }}>{isRegistering ? 'Create Account' : 'Sign In'}</h2>
            <div className="form-group"><label>Email</label><input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} /></div>
            <div className="form-group"><label>Password</label><input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} /></div>
            
            {isRegistering && (
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '1rem' }}>
                <input 
                  type="checkbox" 
                  id="tos-check" 
                  checked={agreedToToS} 
                  onChange={e => setAgreedToToS(e.target.checked)} 
                  style={{ width: 'auto', marginTop: '4px' }}
                />
                <label htmlFor="tos-check" style={{ fontSize: '0.75rem', textTransform: 'none', lineHeight: '1.4' }}>
                  I agree to the <button type="button" onClick={() => setShowToSPage(true)} style={{ background: 'none', border: 'none', color: '#ff6600', padding: 0, textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem' }}>Terms of Service</button> and to receive marketing updates from Ebike King NJ.
                </label>
              </div>
            )}

            <button className="calculate-btn" style={{ width: '100%', padding: '0.8rem', marginTop: '1rem' }} onClick={handleAuth}>{isRegistering ? 'Register' : 'Login'}</button>
            <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#888' }}>{isRegistering ? 'Already have an account?' : 'Need an account?'} <button onClick={() => setIsRegistering(!isRegistering)} style={{ background: 'none', border: 'none', color: '#ff6600', cursor: 'pointer', textDecoration: 'underline' }}>{isRegistering ? 'Sign In' : 'Register Now'}</button></p>
            <button onClick={() => setShowAuthModal(false)} style={{ width: '100%', marginTop: '1.5rem', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

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
                padding: "2.5rem", 
                color: "white",
                fontFamily: "'Inter', sans-serif",
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
                borderRadius: "40px",
                border: "1px solid #333",
                overflow: "hidden",
                position: "relative"
              }}
            >
              {/* Circuit Pattern Overlay */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.05, pointerEvents: 'none', backgroundImage: 'radial-gradient(#ff6600 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }} />
              
              {/* Header Section */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 2 }}>
                <div>
                  <h1 style={{ color: '#ff6600', margin: 0, fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-0.02em', fontStyle: 'italic' }}>RANGE ANXIETY</h1>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#666', fontWeight: 600 }}>Trip Report • {new Date().toLocaleDateString()}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white' }}>{specs.voltage}V {specs.capacityAh}Ah</div>
                  <div style={{ fontSize: '0.9rem', color: '#ff6600', fontWeight: 600 }}>{bikeSearchQuery || "Custom E-Bike"}</div>
                </div>
              </div>

              {/* Route Card */}
              <div style={{ background: 'rgba(30,30,30,0.6)', padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,102,0,0.3)', backdropFilter: 'blur(5px)', zIndex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span style={{ color: '#ff6600', fontSize: '1.2rem' }}>📍</span>
                  <span style={{ fontSize: '0.7rem', color: '#ff6600', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Route</span>
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '1.5rem', lineHeight: 1.4 }}>
                  {trip.origin || "Current Location"} <span style={{ color: '#ff6600' }}>➔</span> {trip.destination}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Distance</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900 }}>{unitSystem === 'imperial' ? `${metrics.distanceMiles.toFixed(1)} mi` : `${(metrics.distanceMiles * 1.60934).toFixed(1)} km`}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Gain</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900 }}>{unitSystem === 'imperial' ? `${metrics.elevationGainFeet.toFixed(0)} ft` : `${(metrics.elevationGainFeet * 0.3048).toFixed(0)} m`}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Duration</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900 }}>{Math.floor(metrics.durationMin / 60)}h {Math.round(metrics.durationMin % 60)}m</div>
                  </div>
                </div>
              </div>

              {/* Central Battery Display - METALLIC FRAME */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative', margin: '1rem 0' }}>
                {/* Metallic Bezel */}
                <div style={{ 
                  width: '100%', 
                  padding: '2.5rem 1rem', 
                  background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 100%)', 
                  borderRadius: '30px', 
                  border: '2px solid #444',
                  boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.1), 0 20px 40px rgba(0,0,0,0.5)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}>
                  {/* Screws */}
                  <div style={{ position: 'absolute', top: '15px', left: '15px', width: '8px', height: '8px', background: '#444', borderRadius: '50%', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)' }} />
                  <div style={{ position: 'absolute', top: '15px', right: '15px', width: '8px', height: '8px', background: '#444', borderRadius: '50%', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)' }} />
                  <div style={{ position: 'absolute', bottom: '15px', left: '15px', width: '8px', height: '8px', background: '#444', borderRadius: '50%', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)' }} />
                  <div style={{ position: 'absolute', bottom: '15px', right: '15px', width: '8px', height: '8px', background: '#444', borderRadius: '50%', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)' }} />

                  {/* Battery Icon Header */}
                  <div style={{ display: 'flex', gap: '3px', marginBottom: '1.5rem' }}>
                    {[...Array(8)].map((_, i) => (
                      <div key={i} style={{ 
                        width: '12px', 
                        height: '24px', 
                        background: i < (metrics.batteryPercentUsed / 12.5) ? '#ff6600' : '#333',
                        borderRadius: '2px',
                        boxShadow: i < (metrics.batteryPercentUsed / 12.5) ? '0 0 10px #ff6600' : 'none'
                      }} />
                    ))}
                  </div>

                  <div style={{ fontSize: '0.7rem', color: '#ff6600', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>Estimated Battery Remaining</div>
                  
                  {/* Glowing Screen */}
                  <div style={{ 
                    background: 'radial-gradient(circle at center, rgba(255,102,0,0.15) 0%, rgba(0,0,0,0.4) 100%)',
                    width: '85%',
                    padding: '2rem 1rem',
                    borderRadius: '15px',
                    border: '1px solid rgba(255,102,0,0.4)',
                    textAlign: 'center',
                    boxShadow: 'inset 0 0 30px rgba(255,102,0,0.2)'
                  }}>
                    <div style={{ fontSize: '6rem', fontWeight: 900, color: 'white', letterSpacing: '-0.05em', lineHeight: 1 }}>
                      {metrics.batteryPercentUsed.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '1.5rem', color: '#ff6600', fontWeight: 700, marginTop: '0.5rem' }}>
                      {(getBatteryLevels(Number(specs.voltage)).min + (metrics.batteryPercentUsed / 100) * (getBatteryLevels(Number(specs.voltage)).max - getBatteryLevels(Number(specs.voltage)).min)).toFixed(1)}V
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', zIndex: 2 }}>
                <div style={{ background: 'rgba(30,30,30,0.6)', padding: '1.2rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.3rem' }}>Efficiency</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{(metrics.estimatedWh / metrics.distanceMiles).toFixed(1)} <span style={{ fontSize: '0.7rem', color: '#666' }}>Wh/mi</span></div>
                  </div>
                  <span style={{ color: '#ff6600', fontSize: '1.5rem' }}>🌀</span>
                </div>
                <div style={{ background: 'rgba(30,30,30,0.6)', padding: '1.2rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.3rem' }}>Conditions</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{ambientTempF}°F • {ridingStyle}</div>
                  </div>
                  <span style={{ color: '#ff6600', fontSize: '1.5rem' }}>☀️</span>
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

          <div style={{ marginTop: "30px", display: "flex", gap: "15px", width: "100%", maxWidth: "600px" }}>
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
              style={{ flex: 2, padding: '14px', backgroundColor: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', boxShadow: '0 0 20px rgba(255,102,0,0.4)' }}
            >
              {isLoading ? 'Processing...' : 'Export Dashboard PNG'}
            </button>
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
            padding: "2.5rem", 
            color: "white",
            fontFamily: "'Inter', sans-serif",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
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
              {/* Header Section */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 2 }}>
                <div>
                  <h1 style={{ color: '#ff6600', margin: 0, fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-0.02em', fontStyle: 'italic' }}>RANGE ANXIETY</h1>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#666', fontWeight: 600 }}>Trip Report • {new Date().toLocaleDateString()}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white' }}>{specs.voltage}V {specs.capacityAh}Ah</div>
                  <div style={{ fontSize: '0.9rem', color: '#ff6600', fontWeight: 600 }}>{bikeSearchQuery || "Custom E-Bike"}</div>
                </div>
              </div>

              {/* Route Card */}
              <div style={{ background: 'rgba(30,30,30,0.6)', padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,102,0,0.3)', backdropFilter: 'blur(5px)', zIndex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span style={{ color: '#ff6600', fontSize: '1.2rem' }}>📍</span>
                  <span style={{ fontSize: '0.7rem', color: '#ff6600', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Route</span>
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '1.5rem', lineHeight: 1.4 }}>
                  {trip.origin || "Current Location"} <span style={{ color: '#ff6600' }}>➔</span> {trip.destination}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Distance</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900 }}>{unitSystem === 'imperial' ? `${metrics.distanceMiles.toFixed(1)} mi` : `${(metrics.distanceMiles * 1.60934).toFixed(1)} km`}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Gain</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900 }}>{unitSystem === 'imperial' ? `${metrics.elevationGainFeet.toFixed(0)} ft` : `${(metrics.elevationGainFeet * 0.3048).toFixed(0)} m`}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', fontWeight: 800 }}>Duration</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900 }}>{Math.floor(metrics.durationMin / 60)}h {Math.round(metrics.durationMin % 60)}m</div>
                  </div>
                </div>
              </div>

              {/* Central Battery Display - METALLIC FRAME */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative', margin: '1rem 0' }}>
                <div style={{ 
                  width: '100%', 
                  padding: '2.5rem 1rem', 
                  background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 100%)', 
                  borderRadius: '30px', 
                  border: '2px solid #444',
                  boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.1), 0 20px 40px rgba(0,0,0,0.5)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}>
                  {/* Screws */}
                  <div style={{ position: 'absolute', top: '15px', left: '15px', width: '8px', height: '8px', background: '#444', borderRadius: '50%' }} />
                  <div style={{ position: 'absolute', top: '15px', right: '15px', width: '8px', height: '8px', background: '#444', borderRadius: '50%' }} />
                  <div style={{ position: 'absolute', bottom: '15px', left: '15px', width: '8px', height: '8px', background: '#444', borderRadius: '50%' }} />
                  <div style={{ position: 'absolute', bottom: '15px', right: '15px', width: '8px', height: '8px', background: '#444', borderRadius: '50%' }} />

                  {/* Battery Segments */}
                  <div style={{ display: 'flex', gap: '3px', marginBottom: '1.5rem' }}>
                    {[...Array(8)].map((_, i) => (
                      <div key={i} style={{ 
                        width: '12px', 
                        height: '24px', 
                        background: i < (metrics.batteryPercentUsed / 12.5) ? '#ff6600' : '#333',
                        borderRadius: '2px',
                        boxShadow: i < (metrics.batteryPercentUsed / 12.5) ? '0 0 10px #ff6600' : 'none'
                      }} />
                    ))}
                  </div>

                  <div style={{ fontSize: '0.7rem', color: '#ff6600', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>Estimated Battery Remaining</div>
                  
                  <div style={{ 
                    background: 'radial-gradient(circle at center, rgba(255,102,0,0.15) 0%, rgba(0,0,0,0.4) 100%)',
                    width: '85%',
                    padding: '2rem 1rem',
                    borderRadius: '15px',
                    border: '1px solid rgba(255,102,0,0.4)',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '6rem', fontWeight: 900, color: 'white', letterSpacing: '-0.05em', lineHeight: 1 }}>
                      {metrics.batteryPercentUsed.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '1.5rem', color: '#ff6600', fontWeight: 700, marginTop: '0.5rem' }}>
                      {(getBatteryLevels(Number(specs.voltage)).min + (metrics.batteryPercentUsed / 100) * (getBatteryLevels(Number(specs.voltage)).max - getBatteryLevels(Number(specs.voltage)).min)).toFixed(1)}V
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', zIndex: 2 }}>
                <div style={{ background: 'rgba(30,30,30,0.6)', padding: '1.2rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.3rem' }}>Efficiency</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{(metrics.estimatedWh / metrics.distanceMiles).toFixed(1)} <span style={{ fontSize: '0.7rem', color: '#666' }}>Wh/mi</span></div>
                  </div>
                  <span style={{ fontSize: '1.5rem' }}>🌀</span>
                </div>
                <div style={{ background: 'rgba(30,30,30,0.6)', padding: '1.2rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.3rem' }}>Conditions</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{ambientTempF}°F • {ridingStyle}</div>
                  </div>
                  <span style={{ fontSize: '1.5rem' }}>☀️</span>
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
            {showMobileMenu ? 'Show Map' : 'Trip Settings'}
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
    </div>
  )
}

export default App
