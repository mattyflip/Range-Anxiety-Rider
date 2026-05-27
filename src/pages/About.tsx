import React, { useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, getDocs, collection, addDoc } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import { createNotification } from '../utils/notifications'
import SEO from '../components/SEO'

const About: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [userRole, setUserRole] = useState<'rider' | 'fleet' | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          setUserRole(data.role || 'rider');
        }
      } else {
        setUserRole(null);
        setUserData(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const renderGuestView = () => (
    <>
      <section style={{ marginBottom: '5rem' }}>
        <p style={{ fontSize: '1.4rem', color: '#ccc', maxWidth: '600px', margin: '0 auto 2.5rem auto', lineHeight: '1.4' }}>
          The professional platform for high-performance e-bike fleets. Choose your path to get started.
        </p>
        <button 
          onClick={() => setShowAuthModal(true)}
          style={{ 
            padding: '1.2rem 3rem', 
            background: '#ff6600', 
            color: 'white', 
            border: 'none', 
            borderRadius: '50px', 
            fontWeight: '900', 
            fontSize: '1.2rem', 
            cursor: 'pointer',
            boxShadow: '0 10px 30px rgba(255,102,0,0.3)',
            transition: 'transform 0.2s'
          }}
        >
          CREATE ACCOUNT
        </button>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', textAlign: 'left' }}>
        <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '32px', border: '1px solid #333' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏬</div>
          <h2 style={{ color: '#ff6600', marginTop: 0 }}>For Shop Owners</h2>
          <p style={{ color: '#aaa', lineHeight: '1.6' }}>Manage your entire rental inventory with scientific precision.</p>
          <ul style={{ color: '#888', paddingLeft: '1.2rem', fontSize: '0.9rem', lineHeight: '1.8' }}>
            <li>Build a virtual garage with exact bike specs</li>
            <li>Track live GPS location of all rented units</li>
            <li>Monitor battery levels and range health remotely</li>
            <li>Curate suggested routes for your customers</li>
          </ul>
        </div>

        <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '32px', border: '1px solid #333' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🚲</div>
          <h2 style={{ color: '#ff6600', marginTop: 0 }}>For Riders</h2>
          <p style={{ color: '#aaa', lineHeight: '1.6' }}>Conquer range anxiety with terrain-aware navigation.</p>
          <ul style={{ color: '#888', paddingLeft: '1.2rem', fontSize: '0.9rem', lineHeight: '1.8' }}>
            <li>Get battery estimates based on your specific bike</li>
            <li>Factoring in live wind, elevation, and PSI</li>
            <li>Plan multi-stop trips with "Best Range" optimization</li>
            <li>Locate validated charging points on the move</li>
          </ul>
        </div>
      </div>
    </>
  );

  const renderFleetView = () => (
    <div style={{ textAlign: 'left' }}>
      <div style={{ background: 'rgba(255,102,0,0.1)', padding: '2rem', borderRadius: '24px', border: '1px solid #ff6600', marginBottom: '3rem' }}>
        <h2 style={{ color: '#ff6600', marginTop: 0 }}>Welcome, Shop Manager</h2>
        <p style={{ color: '#ccc', margin: 0 }}>Your account is configured for <strong>Fleet Oversight</strong>. Here is how to manage your business:</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          <div style={{ background: '#222', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>1</div>
          <div>
            <h3 style={{ color: 'white', margin: '0 0 0.5rem 0' }}>Initialize Your Garage</h3>
            <p style={{ color: '#888', margin: 0 }}>Go to your <strong>Shop Profile</strong> to add your e-bikes. Input precise data like Motor Watts, Tire PSI, and Weight. This data powers the physics engine for every customer who rents that bike.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          <div style={{ background: '#222', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>2</div>
          <div>
            <h3 style={{ color: 'white', margin: '0 0 0.5rem 0' }}>Live Fleet Tracking</h3>
            <p style={{ color: '#888', margin: 0 }}>Use the <strong>Fleet Dashboard</strong> to see all your active units on one map. Filter by specific bikes or groups to monitor their battery health and estimated remaining range in real-time.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          <div style={{ background: '#222', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>3</div>
          <div>
            <h3 style={{ color: 'white', margin: '0 0 0.5rem 0' }}>Sync Battery Levels</h3>
            <p style={{ color: '#888', margin: 0 }}>When a bike returns to the shop, update its charge level in your Garage. It will sync globally, ensuring the next rider starts with a 100% accurate range projection.</p>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '4rem', textAlign: 'center' }}>
        <button 
          onClick={() => window.location.href = '/fleet'}
          style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          GO TO DASHBOARD
        </button>
      </div>
    </div>
  );

  const [shops, setShops] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState<any>(null);
  const [shopBikes, setShopBikes] = useState<any[]>([]);
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    if (userRole === 'rider') {
      getDocs(collection(db, "organizations")).then(snap => {
        setShops(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    }
  }, [userRole]);

  useEffect(() => {
    if (selectedShop) {
      getDocs(collection(db, `organizations/${selectedShop.id}/bikes`)).then(snap => {
        setShopBikes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(b => b.status === 'available'));
      });
    }
  }, [selectedShop]);

  const handleBookBike = async (bike: any) => {
    if (!user || !selectedShop) return;
    setIsBooking(true);
    try {
      const requestData = {
        riderId: user.uid,
        riderName: userData?.username || user.email,
        bikeId: bike.id,
        unitId: bike.unitId,
        shopId: selectedShop.id,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      // 1. Create Request in Shop's Collection
      await addDoc(collection(db, `organizations/${selectedShop.id}/rental_requests`), requestData);

      // 2. In-App Notification to Owner
      await createNotification(
        selectedShop.ownerId,
        user.uid,
        userData?.username || "Rider",
        'rental_request',
        bike.id,
        `wants to rent ${bike.unitId}. Check appointments!`
      );

      // 3. Email Notification to Owner
      if (selectedShop.email) {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await user.getIdToken()}`
          },
          body: JSON.stringify({
            to: selectedShop.email,
            subject: `New Rental Request: ${bike.unitId}`,
            text: `${userData?.username || user.email} has requested to book ${bike.unitId}. Log into your Fleet Hub to manage this appointment.`,
            html: `<h3>New Rental Appointment</h3><p><strong>Rider:</strong> ${userData?.username || user.email}</p><p><strong>Bike:</strong> ${bike.unitId}</p><p>Please log into your <a href="https://rangeanxietyrider.com/fleet">Fleet Hub</a> to assign this bike when the customer arrives.</p>`
          })
        });
      }

      alert(`Request sent to ${selectedShop.name}! They will contact you to confirm.`);
    } catch (e) {
      console.error(e);
      alert("Booking failed. Please try again.");
    } finally { setIsBooking(false); }
  };

  const renderRiderView = () => (
    <div style={{ textAlign: 'left' }}>
      <div style={{ background: 'rgba(52,168,83,0.1)', padding: '2rem', borderRadius: '24px', border: '1px solid #34a853', marginBottom: '3rem' }}>
        <h2 style={{ color: '#34a853', marginTop: 0 }}>Welcome, Rider</h2>
        <p style={{ color: '#ccc', margin: 0 }}>Find a shop and book your precision-tuned e-bike rental:</p>
      </div>

      {!selectedShop ? (
        <section>
           <h3 style={{ color: 'white', marginBottom: '1.5rem' }}>Step 1: Select a Local Shop</h3>
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {shops.map(shop => (
                <div key={shop.id} onClick={() => setSelectedShop(shop)} style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '20px', border: '1px solid #333', cursor: 'pointer', transition: 'border-color 0.2s' }}>
                   <div style={{ color: '#ff6600', fontWeight: '900', fontSize: '1.2rem' }}>{shop.name}</div>
                   <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.5rem' }}>📍 {shop.address}</div>
                </div>
              ))}
           </div>
        </section>
      ) : (
        <section>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h3 style={{ color: 'white', margin: 0 }}>Step 2: Choose a Bike at {selectedShop.name}</h3>
              <button onClick={() => setSelectedShop(null)} style={{ background: 'none', border: '1px solid #444', color: '#888', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>Change Shop</button>
           </div>
           
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.5rem' }}>
              {shopBikes.length === 0 ? (
                <div style={{ color: '#444' }}>No bikes available for booking at the moment.</div>
              ) : (
                shopBikes.map(bike => (
                  <div key={bike.id} style={{ background: '#1a1a1a', borderRadius: '20px', border: '1px solid #333', overflow: 'hidden' }}>
                     <div style={{ width: '100%', aspectRatio: '4/3', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {bike.imageUrl ? <img src={bike.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '2rem' }}>🚲</span>}
                     </div>
                     <div style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 'bold', color: 'white' }}>{bike.unitId}</div>
                        <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.3rem' }}>{bike.specs.motorWatts}W • {bike.specs.voltage}V</div>
                        <button 
                          onClick={() => handleBookBike(bike)}
                          disabled={isBooking}
                          style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          {isBooking ? 'BOOKING...' : 'BOOK NOW'}
                        </button>
                     </div>
                  </div>
                ))
              )}
           </div>
        </section>
      )}
    </div>
  );

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO 
        title="How it Works" 
        description="Learn how Range Anxiety Rider powers e-bike fleets and riders with precision data."
      />
      <NavBar 
        user={user} 
        onShowInstall={() => {}} 
        onShowAuth={() => setShowAuthModal(true)} 
      />

      <main style={{ padding: '4rem 1.5rem', maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
        <header style={{ marginBottom: '4rem' }}>
          <h1 style={{ fontSize: 'clamp(2rem, 8vw, 4rem)', fontWeight: 900, color: '#ff6600', margin: 0, lineHeight: '1', textTransform: 'uppercase', letterSpacing: '-2px' }}>How it Works</h1>
          <div style={{ color: 'white', fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>THE SCIENCE OF RANGE</div>
        </header>

        {loading ? (
          <div style={{ color: '#ff6600', padding: '4rem' }}>Calibrating...</div>
        ) : userRole === 'fleet' ? (
          renderFleetView()
        ) : userRole === 'rider' ? (
          renderRiderView()
        ) : (
          renderGuestView()
        )}

        <div style={{ color: '#444', fontSize: '0.8rem', marginTop: '6rem', borderTop: '1px solid #222', paddingTop: '2rem' }}>
          &copy; {new Date().getFullYear()} Range Anxiety Rider. All rights reserved.
        </div>
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default About;
