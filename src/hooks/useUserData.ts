import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserProfile } from '../types';

/**
 * Hook to manage authentication state and fetch user profile data from Firestore.
 * Can be used without arguments to manage both auth and data, 
 * or with a specific user object to just fetch data.
 */
export function useUserData(providedUser?: User | null) {
  const [user, setUser] = useState<User | null>(providedUser || null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync user state if providedUser changes
  useEffect(() => {
    if (providedUser !== undefined) {
      setUser(providedUser);
    }
  }, [providedUser]);

  // Handle Auth changes if no user was provided
  useEffect(() => {
    if (providedUser !== undefined) return;

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [providedUser]);

  // Fetch Firestore user document whenever the user changes
  useEffect(() => {
    if (!user) {
      setUserData(null);
      // If we are not listening to auth, we should stop loading if there's no user
      if (providedUser !== undefined || !auth.currentUser) {
         setLoading(false);
      }
      return;
    }

    setLoading(true);

    // Using onSnapshot for real-time updates (isAdmin, isPro, etc.)
    // This is more robust than a single getDoc for an application profile.
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        setUserData({ uid: snap.id, ...snap.data() } as UserProfile);
      } else {
        setUserData(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching user data in useUserData hook:", error);
      setUserData(null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, providedUser]);

  return { user, userData, loading };
}
