import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  addDoc, 
  updateDoc, 
  query, 
  onSnapshot, 
  setDoc, 
  arrayUnion, 
  deleteDoc, 
  where, 
  getDocs 
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { GroupRide, Participant, UserProfile } from '../types';

interface UseGroupRideProps {
  user: User | null;
  userData: UserProfile | null;
  center: google.maps.LatLngLiteral;
  onLocationUpdate?: (loc: google.maps.LatLngLiteral) => void;
  showAuthModal: () => void;
}

export const useGroupRide = ({ user, userData, center, onLocationUpdate, showAuthModal }: UseGroupRideProps) => {
  const [activeRide, setActiveRide] = useState<GroupRide | null>(null);
  const [publicRides, setPublicRides] = useState<GroupRide[]>([]);
  const [rideParticipants, setRideParticipants] = useState<Participant[]>([]);
  const [groupRideName, setGroupRideName] = useState('');
  const [isPublicRide, setIsPublicRide] = useState(true);
  const [joinPin, setJoinPin] = useState('');

  // 1. Initial Load of Active Ride from localStorage
  useEffect(() => {
    if (!user) {
      setActiveRide(null);
      localStorage.removeItem('active_ride_id');
      return;
    }

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
  }, [user, activeRide]);

  // 2. Sync Public Rides
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

  // 3. Sync Participants for Active Ride
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

  // 4. Location Upload during Ride
  useEffect(() => {
    if (!activeRide || !user) return;
    const interval = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (onLocationUpdate) onLocationUpdate(loc);
          
          await setDoc(doc(db, `group_rides/${activeRide.id}/participants`, user.uid), {
            userId: user.uid, 
            name: userData?.username || 'Rider', 
            lat: loc.lat, 
            lng: loc.lng, 
            lastUpdatedAt: Date.now()
          }, { merge: true });

          if (activeRide.leaderId === user.uid) {
            await updateDoc(doc(db, "group_rides", activeRide.id), { leaderTrail: arrayUnion(loc) });
          }
        });
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [activeRide?.id, user, userData?.username, activeRide?.leaderId, onLocationUpdate]);

  const createRide = async () => {
    if (!user) { showAuthModal(); return; }
    if (!groupRideName) { alert("Name required."); return; }
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const rideData = { 
      name: groupRideName, 
      isPublic: isPublicRide, 
      pin, 
      creatorId: user.uid, 
      status: 'active', 
      startLat: center.lat, 
      startLng: center.lng, 
      leaderId: user.uid 
    };
    const rideRef = await addDoc(collection(db, "group_rides"), rideData);
    const newRide = { id: rideRef.id, ...rideData } as GroupRide;
    setActiveRide(newRide);
    localStorage.setItem('active_ride_id', rideRef.id);
    await setDoc(doc(db, `group_rides/${rideRef.id}/participants`, user.uid), { 
      userId: user.uid, 
      name: userData?.username || 'Host', 
      lat: center.lat, 
      lng: center.lng, 
      lastUpdatedAt: Date.now() 
    });
  };

  const joinRide = async (rideId?: string) => {
    if (!user) { showAuthModal(); return; }
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
      await setDoc(doc(db, `group_rides/${targetRide.id}/participants`, user.uid), { 
        userId: user.uid, 
        name: userData?.username || 'Rider', 
        lat: center.lat, 
        lng: center.lng, 
        lastUpdatedAt: Date.now() 
      });
      const joinedRide = targetRide as GroupRide;
      setActiveRide(joinedRide);
      localStorage.setItem('active_ride_id', joinedRide.id);
      setJoinPin('');
    } else { 
      alert("Ride not found."); 
    }
  };

  const leaveRide = async () => {
    if (!activeRide || !user) return;
    await deleteDoc(doc(db, `group_rides/${activeRide.id}/participants`, user.uid));
    setActiveRide(null); 
    setRideParticipants([]);
    localStorage.removeItem('active_ride_id');
  };

  const endRide = async () => {
    if (!activeRide) return;
    await updateDoc(doc(db, "group_rides", activeRide.id), { status: 'offline' });
    setActiveRide(null); 
    setRideParticipants([]);
    localStorage.removeItem('active_ride_id');
  };

  const setRideLeader = async (participantId: string) => {
    if (!activeRide || user?.uid !== activeRide.creatorId) return;
    await updateDoc(doc(db, "group_rides", activeRide.id), { leaderId: participantId });
    setActiveRide({ ...activeRide, leaderId: participantId });
  };

  return {
    activeRide,
    publicRides,
    rideParticipants,
    groupRideName,
    setGroupRideName,
    isPublicRide,
    setIsPublicRide,
    joinPin,
    setJoinPin,
    createRide,
    joinRide,
    leaveRide,
    endRide,
    setRideLeader
  };
};
