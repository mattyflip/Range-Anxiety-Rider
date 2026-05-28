import { useState, useEffect } from 'react';
import { auth, db } from '../../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const AdBanner = () => {
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user: any) => {
      if (user) {
        return onSnapshot(doc(db, "users", user.uid), (snap) => {
          if (snap.exists()) setUserData(snap.data());
        });
      } else {
        setUserData(null);
      }
    });
    return () => unsubAuth();
  }, []);

  // Hide ads if user is Shop Tier or has an active Group Ride Host pass
  const isPremium = userData?.isShopTier || (userData?.canHostGroupRide && new Date(userData.groupRideExpiresAt?.seconds * 1000) > new Date());

  if (isPremium) return null;

  return (
    <div style={{ width: '100%', padding: '2rem', background: '#1a1a1a', borderRadius: '24px', border: '1px solid #333', textAlign: 'center', margin: '2rem 0' }}>
       <div style={{ color: '#444', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '1rem', textTransform: 'uppercase' }}>Advertisement</div>
       <div style={{ padding: '3rem', background: '#111', borderRadius: '12px', border: '1px dashed #222' }}>
          <div style={{ color: '#444' }}>Space for e-bike accessory partner</div>
       </div>
       <button 
         onClick={() => window.location.href = '/profile'}
         style={{ marginTop: '1.5rem', background: 'none', border: 'none', color: '#ff6600', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
       >
         UPGRADE TO REMOVE ADS
       </button>
    </div>
  );
};

export default AdBanner;
