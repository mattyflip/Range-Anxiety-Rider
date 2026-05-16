import React, { useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import { getDoc, doc } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import AdBanner from '../components/AdBanner'
import SEO from '../components/SEO'

const About: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async u => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) setUserData(snap.data());
      }
    });
    return () => unsub();
  }, []);

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO 
        title="How It Works" 
        description="The science behind conquering range anxiety. Learn how our physics-based model calculates your e-bike's battery life using wind, elevation, and rider weight."
        url="https://rangeanxiety.app/how-it-works"
      />
      <NavBar 
        user={user} 
        onShowInstall={() => {}} 
        onShowAuth={() => setShowAuthModal(true)} 
      />

      <main style={{ padding: '4rem 2rem', maxWidth: '800px', margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 900, color: '#ff6600', marginBottom: '1rem' }}>Conquer Range Anxiety</h1>
          <p style={{ fontSize: '1.2rem', color: '#888', maxWidth: '600px', margin: '0 auto' }}>
            The most accurate physics-based range estimator for electric bikes, Sur-Rons, and electric motorcycles.
          </p>
        </header>

        <section style={{ marginBottom: '4rem' }}>
          <h2 style={{ color: 'white', borderLeft: '4px solid #ff6600', paddingLeft: '1rem', marginBottom: '1.5rem' }}>The Science of Range</h2>
          <p style={{ lineHeight: 1.8, color: '#ccc' }}>
            Unlike basic calculators that only look at Amp Hours, Range Anxiety uses a complex physics model to determine your actual battery usage. We account for:
          </p>
          <ul style={{ marginTop: '1.5rem', color: '#ccc', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <li>💨 <strong>Air Resistance:</strong> Drag increases exponentially with speed.</li>
            <li>⛰️ <strong>Elevation Change:</strong> Climbing uses significantly more Wh than flat ground.</li>
            <li>⚖️ <strong>Total Mass:</strong> Combined weight of rider and bike.</li>
            <li>🔋 <strong>Voltage Sag:</strong> Battery efficiency drops as voltage decreases.</li>
          </ul>
        </section>

        <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '24px', border: '1px solid #333', marginBottom: '4rem' }}>
          <h2 style={{ marginTop: 0, color: '#ff6600' }}>Why trust us?</h2>
          <p style={{ color: '#aaa', lineHeight: 1.6 }}>
            Our model has been tuned against real-world GPS data from thousands of miles of riding on popular platforms like the Sur-Ron Light Bee, Talaria Sting, and Specialized Turbo Levo. Whether you're commuting or shredding trails, our goal is to ensure you never push your bike home.
          </p>
        </div>

        <section style={{ marginBottom: '4rem' }}>
          <h2 style={{ color: 'white', borderLeft: '4px solid #ff6600', paddingLeft: '1rem', marginBottom: '1.5rem' }}>Advanced Features</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
            <div>
              <h3 style={{ color: 'white' }}>Live Navigation</h3>
              <p style={{ color: '#777', fontSize: '0.9rem' }}>Turn-by-turn voice directions optimized for e-bike paths and trails.</p>
            </div>
            <div>
              <h3 style={{ color: 'white' }}>Group Rides</h3>
              <p style={{ color: '#777', fontSize: '0.9rem' }}>See your friends on the map in real-time and share planned routes instantly.</p>
            </div>
            <div>
              <h3 style={{ color: 'white' }}>Charger Map</h3>
              <p style={{ color: '#777', fontSize: '0.9rem' }}>Find public charging stations and cafes to top off mid-ride.</p>
            </div>
          </div>
        </section>

        <AdBanner isPro={userData?.isPro || false} />

        <footer style={{ textAlign: 'center', marginTop: '6rem', padding: '4rem 0', borderTop: '1px solid #222' }}>
          <h2 style={{ marginBottom: '2rem' }}>Ready to plan your next trip?</h2>
          <button 
            onClick={() => window.location.href = '/'}
            style={{ padding: '1rem 3rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}
          >
            Launch Map
          </button>
        </footer>
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default About;
