import React, { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, query, onSnapshot, doc, updateDoc, setDoc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import NavBar from '../components/NavBar'
import SEO from '../components/SEO'
import { useNavigate } from 'react-router-dom'
import { createNotification } from '../utils/notifications'

const Rent: React.FC = () => {
  const [shops, setShops] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedShop, setSelectedShop] = useState<any>(null);
  const [availableBikes, setAvailableBikes] = useState<any[]>([]);
  const [bikeCounts, setBikeCounts] = useState<Record<string, number>>({});
  const navigate = useNavigate();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) setUserData(snap.data());
      }
    });

    const qShops = query(collection(db, "organizations"));
    const unsubShops = onSnapshot(qShops, (snap) => {
      const shopsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setShops(shopsData);
      setLoading(false);

      // Fetch bike counts for each shop
      shopsData.forEach(shop => {
        const qBikes = query(collection(db, `organizations/${shop.id}/bikes`));
        onSnapshot(qBikes, (bikeSnap) => {
          const count = bikeSnap.docs.filter(d => d.data().status === 'available').length;
          setBikeCounts(prev => ({ ...prev, [shop.id]: count }));
        });
      });
    });

    return () => { unsubAuth(); unsubShops(); };
  }, []);

  useEffect(() => {
    if (selectedShop) {
      const qBikes = query(collection(db, `organizations/${selectedShop.id}/bikes`));
      const unsubBikes = onSnapshot(qBikes, (snap) => {
        setAvailableBikes(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(b => b.status === 'available'));
      });
      return () => unsubBikes();
    }
  }, [selectedShop]);

  const handleStartRental = async (bike: any) => {
    if (!user || !userData || !selectedShop) return;
    
    if (window.confirm(`Confirm rental for ${bike.unitId}? Your live telemetry will be shared with ${selectedShop.name}.`)) {
      try {
        const rentalDate = new Date().toISOString();

        // 1. Update master bike status
        await updateDoc(doc(db, `organizations/${selectedShop.id}/bikes`, bike.id), {
          status: 'rented',
          currentRiderId: user.uid,
          rentedAt: rentalDate
        });

        // 2. Initialize live unit for shop tracking
        await setDoc(doc(db, `organizations/${selectedShop.id}/live_units`, user.uid), {
          unitName: bike.unitId,
          battery: bike.specs.currentBatteryPercent || 100,
          position: { lat: 0, lng: 0 },
          lastSeen: Date.now(),
          status: 'rented'
        });

        // 3. Update user's active rental
        await updateDoc(doc(db, "users", user.uid), {
          activeRental: {
            shopId: selectedShop.id,
            bikeId: bike.id,
            unitId: bike.unitId,
            rentedAt: rentalDate
          },
          orgId: selectedShop.id
        });

        // 4. Send in-app notification to shop owner
        if (selectedShop.ownerId) {
          await createNotification(
            selectedShop.ownerId,
            user.uid,
            userData.username || user.email,
            'rental_request',
            bike.id,
            `New rental for ${bike.unitId} started by ${userData.username || user.email}. Contact: ${user.email}`
          );
        }

        // 5. Create booking record (triggers email via Cloud Function/Extension)
        await addDoc(collection(db, "bookings"), {
          shopId: selectedShop.id,
          shopName: selectedShop.name,
          shopEmail: selectedShop.email,
          riderId: user.uid,
          riderName: userData.username || user.email,
          riderEmail: user.email,
          bikeId: bike.id,
          unitId: bike.unitId,
          rentalDate,
          createdAt: serverTimestamp()
        });

        alert("Rental started! Redirecting to Trip Map...");
        navigate('/map');
      } catch (e: any) {
        console.error(e);
        alert("Failed to start rental: " + e.message);
      }
    }
  };

  const truncateBio = (bio: string, limit: number = 80) => {
    if (!bio) return 'Professional e-bike rental service.';
    return bio.length > limit ? bio.substring(0, limit) + '...' : bio;
  };

  if (loading) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>Opening Marketplace...</div>;

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO title="Rent an E-Bike" />
      <NavBar user={user} onShowInstall={() => {}} onShowAuth={() => {}} />

      <main style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, color: '#ff6600', textTransform: 'uppercase' }}>Rent a Pro Fleet</h1>
          <p style={{ color: '#888', maxWidth: '600px', margin: '1rem auto' }}>Discover professional e-bike shops and rent high-performance units optimized for Range Anxiety Rider.</p>
        </header>

        {!selectedShop ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            {shops.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', background: '#1a1a1a', borderRadius: '24px', border: '1px dashed #333' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚲</div>
                <h2 style={{ color: '#666' }}>No shops available in your area yet.</h2>
              </div>
            ) : (
              shops.map(shop => (
                <div 
                  key={shop.id} 
                  onClick={() => setSelectedShop(shop)}
                  style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '32px', border: '1px solid #333', cursor: 'pointer', transition: 'transform 0.2s', display: 'flex', flexDirection: 'column' }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '2.5rem' }}>🏬</div>
                    <div style={{ background: 'rgba(255,102,0,0.1)', color: '#ff6600', padding: '4px 12px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                      {bikeCounts[shop.id] || 0} BIKES READY
                    </div>
                  </div>
                  <h2 style={{ color: '#ff6600', marginTop: 0, fontSize: '1.4rem' }}>{shop.name}</h2>
                  <p style={{ color: '#888', fontSize: '0.85rem', flex: 1 }}>{truncateBio(shop.bio)}</p>
                  <div style={{ color: '#555', fontSize: '0.75rem', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid #222', paddingTop: '1rem' }}>
                    📍 {shop.address}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div>
            <button 
              onClick={() => setSelectedShop(null)}
              style={{ background: 'none', border: 'none', color: '#ff6600', cursor: 'pointer', fontWeight: 'bold', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              ← BACK TO SHOPS
            </button>
            
            <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #111 100%)', padding: '2.5rem', borderRadius: '32px', border: '1px solid #ff6600', marginBottom: '3rem' }}>
               <h2 style={{ fontSize: '2rem', color: 'white', margin: 0 }}>{selectedShop.name}</h2>
               <p style={{ color: '#888', marginTop: '1rem' }}>{selectedShop.bio}</p>
            </div>

            <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Available Fleet</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
               {availableBikes.length === 0 ? (
                 <div style={{ gridColumn: '1/-1', color: '#444', textAlign: 'center', padding: '2rem' }}>All units are currently rented. Check back soon!</div>
               ) : (
                 availableBikes.map(bike => (
                   <div key={bike.id} style={{ background: '#1a1a1a', padding: '0', borderRadius: '24px', border: '1px solid #333', overflow: 'hidden' }}>
                      {bike.imageUrl ? (
                        <img src={bike.imageUrl} alt={bike.unitId} style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '180px', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>🚲</div>
                      )}
                      
                      <div style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                           <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>{bike.unitId}</div>
                           <div style={{ background: 'rgba(52,168,83,0.1)', color: '#34a853', padding: '4px 10px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 'bold' }}>READY</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1.5rem' }}>
                           <div style={{ background: '#111', padding: '0.8rem', borderRadius: '12px' }}>
                              <div style={{ color: '#555', fontSize: '0.6rem', fontWeight: 'bold' }}>BATTERY</div>
                              <div style={{ fontWeight: 'bold' }}>{bike.specs.currentBatteryPercent}%</div>
                           </div>
                           <div style={{ background: '#111', padding: '0.8rem', borderRadius: '12px' }}>
                              <div style={{ color: '#555', fontSize: '0.6rem', fontWeight: 'bold' }}>MOTOR</div>
                              <div style={{ fontWeight: 'bold' }}>{bike.specs.motorWatts}W</div>
                           </div>
                        </div>
                        <button 
                          onClick={() => handleStartRental(bike)}
                          style={{ width: '100%', padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          RENT THIS BIKE
                        </button>
                      </div>
                   </div>
                 ))
               )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Rent;
