import React, { useState } from 'react'
import NavBar from '../shared/ui/NavBar'
import AuthModal from '../features/auth/AuthModal'
import SEO from '../shared/ui/SEO'

import { useUserData } from '../hooks/useUserData';

const About: React.FC = () => {
  const { user, userData, loading } = useUserData();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const userRole = userData?.role || null;

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

  const renderRiderView = () => (
    <div style={{ textAlign: 'left' }}>
      <div style={{ background: 'rgba(52,168,83,0.1)', padding: '2rem', borderRadius: '24px', border: '1px solid #34a853', marginBottom: '3rem' }}>
        <h2 style={{ color: '#34a853', marginTop: 0 }}>Welcome, Rider</h2>
        <p style={{ color: '#ccc', margin: 0 }}>Get ready for a precision-tuned e-bike experience. Use our marketplace to find a local shop and reserve your unit.</p>
      </div>

      <section style={{ textAlign: 'center', padding: '3rem', background: '#1a1a1a', borderRadius: '32px', border: '1px solid #333' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🚲</div>
        <h3 style={{ color: 'white', fontSize: '1.5rem', marginBottom: '1rem' }}>Ready to conquer range anxiety?</h3>
        <p style={{ color: '#888', marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem auto' }}>
          Browse available fleets, check battery health in real-time, and book your ride with integrated terrain-aware navigation.
        </p>
        <button 
          onClick={() => window.location.href = '/rent'}
          style={{ padding: '1.2rem 3rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '50px', fontWeight: '900', fontSize: '1.2rem', cursor: 'pointer', boxShadow: '0 10px 30px rgba(255,102,0,0.3)' }}
        >
          EXPLORE RENTAL MARKETPLACE
        </button>
      </section>
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
