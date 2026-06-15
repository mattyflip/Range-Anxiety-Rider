import React, { useState } from 'react'
import NavBar from '../shared/ui/NavBar'
import AuthModal from '../features/auth/AuthModal'
import SEO from '../shared/ui/SEO'
import { useUserData } from '../hooks/useUserData';

const About: React.FC = () => {
  const { user, loading } = useUserData();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const handleShowAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO 
        title="About - Range Anxiety Rider" 
        description="Learn how Range Anxiety Rider powers e-bike riders with precision data."
      />
      <NavBar 
        user={user} 
        onShowInstall={() => {}} 
        onShowAuth={handleShowAuth} 
      />

      <main style={{ padding: '4rem 1.5rem', maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
        <header style={{ marginBottom: '4rem' }}>
          <h1 style={{ fontSize: 'clamp(2rem, 8vw, 4rem)', fontWeight: 900, color: '#ff6600', margin: 0, lineHeight: '1', textTransform: 'uppercase', letterSpacing: '-2px' }}>How it Works</h1>
          <div style={{ color: 'white', fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>THE SCIENCE OF RANGE</div>
        </header>

        {loading ? (
          <div style={{ color: '#ff6600', padding: '4rem' }}>Loading...</div>
        ) : (
          <>
            <section style={{ marginBottom: '5rem' }}>
              <p style={{ fontSize: '1.4rem', color: '#ccc', maxWidth: '600px', margin: '0 auto 2.5rem auto', lineHeight: '1.4' }}>
                Conquer range anxiety with our advanced terrain-aware physics engine designed specifically for e-bike riders.
              </p>
              {!user && (
                <button 
                  onClick={() => handleShowAuth('register')}
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
              )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', textAlign: 'left' }}>
              <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '32px', border: '1px solid #333' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🗺️</div>
                <h2 style={{ color: '#ff6600', marginTop: 0 }}>Smart Navigation</h2>
                <p style={{ color: '#aaa', lineHeight: '1.6' }}>Plan multi-stop trips optimized for your battery life.</p>
                <ul style={{ color: '#888', paddingLeft: '1.2rem', fontSize: '0.9rem', lineHeight: '1.8' }}>
                  <li>Dynamic routing based on remaining charge</li>
                  <li>"Best Range" optimization for long trips</li>
                  <li>Discover validated charging points along your route</li>
                </ul>
              </div>

              <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '32px', border: '1px solid #333' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔋</div>
                <h2 style={{ color: '#ff6600', marginTop: 0 }}>Precision Physics</h2>
                <p style={{ color: '#aaa', lineHeight: '1.6' }}>Get accurate estimates tailored to your exact bike model.</p>
                <ul style={{ color: '#888', paddingLeft: '1.2rem', fontSize: '0.9rem', lineHeight: '1.8' }}>
                  <li>Calculations factor in rider weight and tire PSI</li>
                  <li>Real-time wind direction and speed adjustments</li>
                  <li>Live elevation profiling for every route</li>
                </ul>
              </div>
              
              <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '32px', border: '1px solid #333' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🚲</div>
                <h2 style={{ color: '#ff6600', marginTop: 0 }}>E-Bike Rentals</h2>
                <p style={{ color: '#aaa', lineHeight: '1.6' }}>Explore the local marketplace for top-tier rentals.</p>
                <ul style={{ color: '#888', paddingLeft: '1.2rem', fontSize: '0.9rem', lineHeight: '1.8' }}>
                  <li>Browse available bikes in your local area</li>
                  <li>View exact motor specs before renting</li>
                  <li>Manage active rentals right from your app</li>
                </ul>
              </div>
            </div>
          </>
        )}

        <div style={{ color: '#444', fontSize: '0.8rem', marginTop: '6rem', borderTop: '1px solid #222', paddingTop: '2rem' }}>
          &copy; {new Date().getFullYear()} Range Anxiety Rider. All rights reserved.
        </div>
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} initialMode={authMode} />}
    </div>
  );
};

export default About;
