import React, { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, query, onSnapshot, addDoc, serverTimestamp, where, getDocs } from 'firebase/firestore'
import NavBar from '../shared/ui/NavBar'
import SEO from '../shared/ui/SEO'
import AuthModal from '../features/auth/AuthModal'
import InstallTutorial from '../shared/ui/InstallTutorial'
import { createNotification } from '../utils/notifications'
import { useUserData } from '../hooks/useUserData';

const Rent: React.FC = () => {
  const { user, userData, loading: authLoading } = useUserData();
  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShop, setSelectedShop] = useState<any>(null);
  const [availableBikes] = useState<any[]>([]);
  const [bikeCounts, setBikeCounts] = useState<Record<string, number>>({});
  const [selectedBike, setSelectedBike] = useState<any>(null);
  const [bookingForm, setBookingForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    phone: ''
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  useEffect(() => {
    if (userData?.phone) {
       setBookingForm(prev => ({ ...prev, phone: userData.phone || '' }));
    }
  }, [userData]);

  useEffect(() => {
    const qShops = query(collection(db, "organizations"));
    const unsubShops = onSnapshot(qShops, (snap) => {
      const shopsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setShops(shopsData);
      setLoading(false);

      // Fetch bike counts for each shop
      shopsData.forEach(shop => {
        const qBikes = query(collection(db, `organizations/${shop.id}/bikes`), where("status", "==", "available"));
        getDocs(qBikes).then(s => {
          setBikeCounts(prev => ({ ...prev, [shop.id]: s.size }));
        });
      });
    });

    return () => unsubShops();
  }, []);

  const handleBook = async () => {
    if (!user || !userData) { setShowAuthModal(true); return; }
    if (!selectedBike || !selectedShop) return;

    try {
      await addDoc(collection(db, `organizations/${selectedShop.id}/rental_requests`), {
        riderId: user.uid,
        riderName: userData.username || user.email?.split('@')[0] || "Rider",
        riderEmail: user.email,
        riderPhone: bookingForm.phone,
        bikeId: selectedBike.id,
        unitId: selectedBike.unitId,
        rentalDate: bookingForm.date,
        rentalTime: bookingForm.time,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      await createNotification(
        selectedShop.ownerId,
        user.uid,
        userData.username || "Rider",
        'rental_request',
        selectedBike.id,
        `New rental request from ${userData.username || user.email} for ${selectedBike.unitId}`
      );

      alert("Rental request sent! The shop will contact you shortly.");
      setSelectedBike(null);
      setSelectedShop(null);
    } catch (e) { console.error(e); }
  };

  if (loading || authLoading) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>Loading Shops...</div>;

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO title="Rent an E-Bike" />
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={() => setShowAuthModal(true)} />

      <main style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{ marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, color: '#ff6600', margin: 0 }}>RENTAL HUB</h1>
          <p style={{ color: '#888', fontWeight: 'bold' }}>Find a high-performance fleet near you.</p>
        </header>

        {!selectedShop ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {shops.map(shop => (
              <div key={shop.id} onClick={() => setSelectedShop(shop)} style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', cursor: 'pointer', transition: 'transform 0.2s' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏬</div>
                <h2 style={{ color: 'white', margin: '0 0 0.5rem 0' }}>{shop.name}</h2>
                <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.5rem' }}>{shop.address}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span style={{ color: '#ff6600', fontWeight: 'bold' }}>{bikeCounts[shop.id] || 0} Bikes Available</span>
                   <button style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.5rem 1.2rem', borderRadius: '8px', fontWeight: 'bold' }}>BROWSE</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <button onClick={() => setSelectedShop(null)} style={{ background: 'none', border: 'none', color: '#ff6600', fontWeight: 'bold', cursor: 'pointer', marginBottom: '2rem' }}>← BACK TO SHOPS</button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
               <section>
                  <h2 style={{ color: 'white', marginBottom: '1.5rem' }}>Available at {selectedShop.name}</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {availableBikes.length === 0 && <p style={{ color: '#444' }}>Fetching bike inventory...</p>}
                    {/* Inventory logic normally goes here, for now mock list based on shop data if any */}
                  </div>
               </section>
               <aside style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', height: 'fit-content' }}>
                  <h3 style={{ color: 'white', marginTop: 0 }}>Book Your Ride</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1.5rem' }}>
                     <div className="form-group">
                        <label style={{ color: '#666', fontSize: '0.7rem' }}>DATE</label>
                        <input type="date" value={bookingForm.date} onChange={e => setBookingForm({...bookingForm, date: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '10px', color: 'white' }} />
                     </div>
                     <div className="form-group">
                        <label style={{ color: '#666', fontSize: '0.7rem' }}>TIME</label>
                        <input type="time" value={bookingForm.time} onChange={e => setBookingForm({...bookingForm, time: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '10px', color: 'white' }} />
                     </div>
                     <div className="form-group">
                        <label style={{ color: '#666', fontSize: '0.7rem' }}>MOBILE NUMBER</label>
                        <input type="tel" value={bookingForm.phone} onChange={e => setBookingForm({...bookingForm, phone: e.target.value})} placeholder="+1..." style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '10px', color: 'white' }} />
                     </div>
                     <button 
                        onClick={handleBook}
                        style={{ width: '100%', padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '1rem', marginTop: '1rem', cursor: 'pointer' }}
                     >
                        REQUEST BOOKING
                     </button>
                  </div>
               </aside>
            </div>
          </div>
        )}
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
    </div>
  );
};

export default Rent;
