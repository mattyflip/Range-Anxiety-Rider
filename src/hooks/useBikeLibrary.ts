import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import type { SavedBike } from '../types';
import { STANDARD_BIKES, PEDAL_EBIKES_US_UK_CA, E_MOTOS_GLOBAL } from '../utils/bikeLibrary';

/**
 * Hook to fetch and cache the global bike library from Firestore.
 * Falls back to static local data if Firestore is empty or inaccessible.
 */
export function useBikeLibrary() {
  const [bikes, setBikes] = useState<SavedBike[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initial local fallback (for immediate UI response)
    const staticBikes = [
      ...STANDARD_BIKES,
      ...PEDAL_EBIKES_US_UK_CA,
      ...E_MOTOS_GLOBAL
    ];

    // 2. Subscribe to Firestore global_bikes
    const q = query(collection(db, "global_bikes"), orderBy("name", "asc"));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const fetched = snap.docs.map(docSnap => ({ 
          id: docSnap.id, 
          ...docSnap.data() 
        } as SavedBike));
        setBikes(fetched);
      } else {
        // Use static fallback if DB is empty
        setBikes(staticBikes);
      }
      setLoading(false);
    }, (error) => {
      console.warn("Firestore bike library fetch failed, using local fallback:", error);
      setBikes(staticBikes);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { bikes, loading };
}
