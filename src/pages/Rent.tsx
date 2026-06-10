import React, { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, query, onSnapshot, addDoc, serverTimestamp, where, getDocs } from 'firebase/firestore'
import NavBar from '../shared/ui/NavBar'
import SEO from '../shared/ui/SEO'
import AuthModal from '../features/auth/AuthModal'
import InstallTutorial from '../shared/ui/InstallTutorial'
import { createNotification } from '../utils/notifications'
import { useUserData } from '../hooks/useUserData';
import type { Organization } from '../types';
import { useNavigate } from 'react-router-dom';

interface BikeData {
  id: string;
  unitId?: string;
  specs?: {
    motorWatts?: number | string;
    voltage?: number | string;
    capacityAh?: number | string;
  };
}

const Rent: React.FC = () => {
  const navigate = useNavigate();
  const { user, userData, loading: authLoading } = useUserData();
  const [shops, setShops] = useState<(Organization & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShop, setSelectedShop] = useState<(Organization & { id: string }) | null>(null);
  const [availableBikes, setAvailableBikes] = useState<BikeData[]>([]);
  const [bikeCounts, setBikeCounts] = useState<Record<string, number>>({});
  const [selectedBike, setSelectedBike] = useState<BikeData | null>(null);
  const [bookingForm, setBookingForm] = useState({
    date: new Date().toISOString().split('T')[0],
    pickupTime: '10:00',
    duration: 2,  // hours
    phone: ''
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  // Calculate total price
  const pricePerHour = selectedShop?.pricing?.pricePerHour || 25;
  const minimumCharge = selectedShop?.pricing?.minimumCharge || 15;
  const totalPrice = Math.max(bookingForm.duration * pricePerHour, minimumCharge);

  const [prevPhone, setPrevPhone] = useState(userData?.phone);
  if (userData?.phone !== prevPhone) {
    setPrevPhone(userData?.phone);
    if (!bookingForm.phone) {
      setBookingForm({ ...bookingForm, phone: userData?.phone || '' });
    }
  }

  useEffect(() => {
    const qShops = query(collection(db, "organizations"));
    const unsubShops = onSnapshot(qShops, (snap) => {
      const shopsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Organization & { id: string }));
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

  useEffect(() => {
    if (!selectedShop) return;

    const qBikes = query(collection(db, `organizations/${selectedShop.id}/bikes`), where("status", "==", "available"));
    const unsubBikes = onSnapshot(qBikes, (snap) => {
      setAvailableBikes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubBikes();
  }, [selectedShop?.id]);

  const calculateReturnTime = (pickupTime: string, duration: number): string => {
    const [hours, minutes] = pickupTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + duration * 60;
    const returnHours = Math.floor(totalMinutes / 60) % 24;
    const returnMinutes = totalMinutes % 60;
    return `${returnHours.toString().padStart(2, '0')}:${returnMinutes.toString().padStart(2, '0')}`;
  };

  const handleBook = async () => {
    if (!user || !userData) { setShowAuthModal(true); return; }
    if (!selectedBike || !selectedShop) {
      alert('Please select a bike first.');
      return;
    }
    if (!bookingForm.phone.trim()) {
      alert('Please enter your phone number.');
      return;
    }

    try {
      const pickupTime = bookingForm.pickupTime;
      const returnTime = calculateReturnTime(pickupTime, bookingForm.duration);

      await addDoc(collection(db, `organizations/${selectedShop.id}/rental_requests`), {
        riderId: user.uid,
        riderName: userData.username || user.email?.split('@')[0] || "Rider",
        riderEmail: user.email,
        riderPhone: bookingForm.phone,
        bikeId: selectedBike.id,
        unitId: selectedBike.unitId,
        rentalDate: bookingForm.date,
        pickupTime,
        returnTime,
        duration: bookingForm.duration,
        pricePerHour,
        totalPrice,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      await createNotification(
        selectedShop.ownerId,
        user.uid,
        userData.username || "Rider",
        'rental_request',
        selectedBike.id,
        `New rental request from ${userData.username || user.email} for ${selectedBike.unitId} ($${totalPrice.toFixed(2)})`
      );

      alert(`✅ Rental request sent for $${totalPrice.toFixed(2)}! The shop will contact you shortly.`);
      setSelectedBike(null);
      setSelectedShop(null);
      navigate('/rentals');
    } catch (e) { 
      console.error(e);
      alert('Failed to submit rental request. Please try again.');
    }
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
              <div key={shop.id} onClick={() => { setSelectedShop(shop); setAvailableBikes([]); setSelectedBike(null); }} style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', cursor: 'pointer', transition: 'transform 0.2s' }}>
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
            <button onClick={() => { setSelectedShop(null); setAvailableBikes([]); setSelectedBike(null); }} style={{ background: 'none', border: 'none', color: '#ff6600', fontWeight: 'bold', cursor: 'pointer', marginBottom: '2rem' }}>← BACK TO SHOPS</button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
               <section>
                  <h2 style={{ color: 'white', marginBottom: '1.5rem' }}>Available at {selectedShop.name}</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {availableBikes.length === 0 ? (
                      <p style={{ color: '#444' }}>No bikes currently available for rental at this location.</p>
                    ) : (
                      availableBikes.map(bike => (
                        <div 
                          key={bike.id} 
                          onClick={() => setSelectedBike(bike)}
                          style={{ 
                            background: '#1a1a1a', 
                            padding: '1.5rem', 
                            borderRadius: '16px', 
                            border: selectedBike?.id === bike.id ? '2px solid #ff6600' : '1px solid #333',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'white' }}>{bike.unitId}</div>
                            <div style={{ fontSize: '0.8rem', color: '#888' }}>{bike.specs?.motorWatts}W · {bike.specs?.voltage}V · {bike.specs?.capacityAh}Ah</div>
                          </div>
                          <div style={{ color: '#ff6600', fontWeight: 'bold' }}>
                            {selectedBike?.id === bike.id ? 'SELECTED' : 'SELECT'}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
               </section>
               <aside style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', height: 'fit-content' }}>
                  <h3 style={{ color: 'white', marginTop: 0 }}>Book Your Ride</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1.5rem' }}>
                     <div className="form-group">
                        <label style={{ color: '#666', fontSize: '0.7rem' }}>DATE</label>
                        <input type="date" value={bookingForm.date} onChange={e => setBookingForm({...bookingForm, date: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '10px', color: 'white' }} />
                     </div>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                       <div className="form-group">
                          <label style={{ color: '#666', fontSize: '0.7rem' }}>PICKUP</label>
                          <input type="time" value={bookingForm.pickupTime} onChange={e => setBookingForm({...bookingForm, pickupTime: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '10px', color: 'white' }} />
                       </div>
                       <div className="form-group">
                          <label style={{ color: '#666', fontSize: '0.7rem' }}>DURATION</label>
                          <select 
                            value={bookingForm.duration} 
                            onChange={e => setBookingForm({...bookingForm, duration: parseInt(e.target.value)})} 
                            style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '10px', color: 'white' }}
                          >
                            <option value={1}>1 hour</option>
                            <option value={2}>2 hours</option>
                            <option value={4}>4 hours</option>
                            <option value={6}>6 hours</option>
                            <option value={8}>8 hours</option>
                            <option value={12}>12 hours</option>
                            <option value={24}>24 hours</option>
                          </select>
                       </div>
                     </div>
                     <div className="form-group">
                        <label style={{ color: '#666', fontSize: '0.7rem' }}>MOBILE NUMBER</label>
                        <input type="tel" value={bookingForm.phone} onChange={e => setBookingForm({...bookingForm, phone: e.target.value})} placeholder="+1..." style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '10px', color: 'white' }} />
                     </div>

                     {/* Price Summary */}
                     <div style={{ background: '#111', padding: '1rem', borderRadius: '12px', marginTop: '0.5rem' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                         <span style={{ color: '#666', fontSize: '0.8rem' }}>Rate</span>
                         <span style={{ color: '#888', fontSize: '0.8rem' }}>${pricePerHour}/hr</span>
                       </div>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                         <span style={{ color: '#666', fontSize: '0.8rem' }}>Duration</span>
                         <span style={{ color: '#888', fontSize: '0.8rem' }}>{bookingForm.duration}h</span>
                       </div>
                       <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #333', paddingTop: '0.8rem', marginTop: '0.5rem' }}>
                         <span style={{ color: '#888', fontWeight: 'bold' }}>Total</span>
                         <span style={{ color: '#ff6600', fontWeight: 'bold', fontSize: '1.3rem' }}>${totalPrice.toFixed(2)}</span>
                       </div>
                       {totalPrice === minimumCharge && (
                         <div style={{ color: '#666', fontSize: '0.65rem', textAlign: 'right', marginTop: '0.3rem' }}>
                           (minimum charge applied)
                         </div>
                       )}
                     </div>

                     <button 
                        onClick={handleBook}
                        disabled={!selectedBike}
                        style={{ width: '100%', padding: '1rem', background: selectedBike ? '#ff6600' : '#444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '1rem', marginTop: '0.5rem', cursor: selectedBike ? 'pointer' : 'not-allowed' }}
                     >
                        {!selectedBike ? 'SELECT A BIKE' : `REQUEST BOOKING - $${totalPrice.toFixed(2)}`}
                     </button>
                     <p style={{ color: '#444', fontSize: '0.65rem', textAlign: 'center', margin: 0 }}>
                       Payment collected at pickup
                     </p>
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
