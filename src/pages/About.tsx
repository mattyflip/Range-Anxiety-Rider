import React, { useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import { getDoc, doc } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import SEO from '../components/SEO'

const About: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async u => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO 
        title="About" 
        description="Learn more about Range Anxiety Rider, the professional fleet and rental management platform for electric bikes."
        url="https://range-anxiety-rider.vercel.app/about"
      />
      <NavBar 
        user={user} 
        onShowInstall={() => {}} 
        onShowAuth={() => setShowAuthModal(true)} 
      />

      <main style={{ padding: '4rem 1.5rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', fontWeight: 900, color: '#ff6600', margin: 0, lineHeight: '1.1', textTransform: 'uppercase' }}>Range Anxiety Rider</h1>
        </header>

        <section style={{ marginBottom: '5rem' }}>
          <p style={{ fontSize: '1.2rem', color: '#888', maxWidth: '600px', margin: '0 auto 1.5rem auto', lineHeight: '1.6' }}>
            The professional fleet and rental management platform optimized for electric bike shops and delivery services.
          </p>
        </section>

        <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', marginBottom: '4rem' }}>
          <h2 style={{ marginTop: 0, color: '#ff6600' }}>Our Mission</h2>
          <p style={{ color: '#aaa', lineHeight: 1.6 }}>
            We provide the tools necessary for e-bike shops to manage their rental inventory, track live unit status, and help customers conquer range anxiety with precision data.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: '6rem', padding: '4rem 0', borderTop: '1px solid #222' }}>
          <button 
            onClick={() => window.location.href = '/'}
            style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer', minWidth: '200px' }}
          >
            Go to Map
          </button>
        </div>
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default About;
