import React, { useState } from 'react'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import SEO from '../components/SEO'

const About: React.FC = () => {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO 
        title="Welcome" 
        description="Range Anxiety Rider — The professional fleet and rental management platform for electric bikes."
        url="https://range-anxiety-rider.vercel.app/"
      />
      <NavBar 
        user={null} 
        onShowInstall={() => {}} 
        onShowAuth={() => setShowAuthModal(true)} 
      />

      <main style={{ padding: '4rem 1.5rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: 'clamp(2rem, 8vw, 4.5rem)', fontWeight: 900, color: '#ff6600', margin: 0, lineHeight: '1.1', textTransform: 'uppercase', letterSpacing: '-2px' }}>Range Anxiety</h1>
          <div style={{ color: 'white', fontSize: '1.2rem', fontWeight: 'bold', marginTop: '0.5rem' }}>RIDER PLATFORM</div>
        </header>

        <section style={{ marginBottom: '5rem' }}>
          <p style={{ fontSize: '1.4rem', color: '#ccc', maxWidth: '600px', margin: '0 auto 2.5rem auto', lineHeight: '1.4' }}>
            The professional fleet and rental management platform optimized for electric bike shops and delivery services.
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
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            GET STARTED
          </button>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem', marginBottom: '4rem' }}>
          <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🚲</div>
            <h3 style={{ color: '#ff6600' }}>Fleet Tracking</h3>
            <p style={{ color: '#888', fontSize: '0.9rem' }}>Real-time oversight of your entire rental inventory on a single dashboard.</p>
          </div>
          
          <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🗺️</div>
            <h3 style={{ color: '#ff6600' }}>Precision Range</h3>
            <p style={{ color: '#888', fontSize: '0.9rem' }}>Give your customers confidence with terrain and weather-aware range estimation.</p>
          </div>

          <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔌</div>
            <h3 style={{ color: '#ff6600' }}>Charging Map</h3>
            <p style={{ color: '#888', fontSize: '0.9rem' }}>Integrated charging network access to keep your fleet moving.</p>
          </div>
        </div>

        <div style={{ color: '#444', fontSize: '0.8rem', marginTop: '4rem' }}>
          &copy; {new Date().getFullYear()} Range Anxiety Rider. All rights reserved.
        </div>
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default About;
