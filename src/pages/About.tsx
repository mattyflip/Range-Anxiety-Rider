import React, { useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import { getDoc, doc } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import AdBanner from '../components/AdBanner'

const About: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
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
      <NavBar 
        user={user} 
        onShowInstall={() => {}} 
        onShowAuth={() => setShowAuthModal(true)}
      />

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <button 
            onClick={() => window.location.href = '/'}
            style={{ padding: '0.6rem 1.5rem', background: 'rgba(255,102,0,0.1)', color: '#ff6600', border: '1px solid #ff6600', borderRadius: '30px', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            ← Go to App
          </button>
        </div>

        <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 900, color: '#ff6600', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>How It Works</h1>
          <p className="desktop-only" style={{ fontSize: '1.2rem', color: '#888', maxWidth: '600px', margin: '0 auto', lineHeight: '1.5' }}>
            The science behind conquering range anxiety. Learn how our physics-based model calculates your e-bike's battery life.
          </p>
        </header>

        <div style={{ width: '100%', maxWidth: '700px', margin: '0 auto 4rem auto', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: '1px solid #333' }}>
          <img 
            src="/assets/watt-son.png" 
            alt="Watt-son's Guide to Precise Range" 
            style={{ width: '100%', display: 'block' }} 
          />
        </div>

        <section style={{ marginBottom: '4rem' }}>
          <h2 style={{ color: '#ff6600', fontSize: '1.8rem', marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Physics-Based Accuracy</h2>
          <p style={{ lineHeight: '1.8', color: '#ccc', fontSize: '1.1rem' }}>
            Unlike basic range estimators that only look at distance, <strong>Range Anxiety</strong> uses a sophisticated mathematical model to predict battery consumption. We calculate the energy required to overcome several real-world forces:
          </p>
          <ul style={{ marginTop: '1.5rem', color: '#ccc', lineHeight: '2' }}>
            <li><strong>Aerodynamic Drag:</strong> Calculated based on your target speed and real-time wind conditions (headwinds/tailwinds).</li>
            <li><strong>Rolling Resistance:</strong> Determined by your tire type (road vs. knobby), tire pressure, and the combined weight of you and your bike.</li>
            <li><strong>Potential Energy (Climbing):</strong> We use high-resolution elevation data to calculate the exact wattage needed to pull your weight up hills.</li>
            <li><strong>Thermal Efficiency:</strong> Battery performance drops in the cold. Our model accounts for ambient temperature to adjust capacity estimates.</li>
          </ul>
        </section>

        <section style={{ marginBottom: '4rem', background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333' }}>
          <h2 style={{ color: '#ff6600', fontSize: '1.8rem', marginBottom: '1.5rem' }}>Supported E-Bikes & E-Motos</h2>
          <p style={{ color: '#888', marginBottom: '2rem' }}>
            We support custom specifications for any electric bike, but our library includes optimized defaults for the industry's most popular models:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', color: '#ccc' }}>
            <div>
              <h4 style={{ color: 'white', marginBottom: '0.5rem' }}>E-Motos</h4>
              <ul style={{ fontSize: '0.9rem', listStyle: 'none', padding: 0 }}>
                <li>Sur-Ron Light Bee X / Ultra Bee / Storm Bee</li>
                <li>Talaria Sting R / MX5 Pro / XXX / Dragon</li>
                <li>Onyx RCR / CTY2</li>
                <li>Stark Varg / E Ride Pro SS</li> and more!
              </ul>
            </div>
            <div>
              <h4 style={{ color: 'white', marginBottom: '0.5rem' }}>Premium E-Bikes</h4>
              <ul style={{ fontSize: '0.9rem', listStyle: 'none', padding: 0 }}>
                <li>Specialized Turbo Levo / Vado / Creo</li>
                <li>Trek Fuel EXe / Rail / Allant+</li>
                <li>Aventon Aventure / Level / Soltera</li>
                <li>Rad Power Radster / RadWagon / RadRunner</li> and many more!
              </ul>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: '4rem' }}>
          <h2 style={{ color: '#ff6600', fontSize: '1.8rem', marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>The Share Card</h2>
          <p style={{ lineHeight: '1.8', color: '#ccc', fontSize: '1.1rem' }}>
            When you plan a trip, we generate a high-impact <strong>Share Card</strong>. This isn't just a screenshot; it's a data-rich report that includes your route map, wind direction, elevation profile, and exact battery percentages. Shared trips are indexed by city and state, allowing the community to discover and "Load Route" popular rides in their local area.
          </p>
        </section>

        {/* Strategic Ad Placement for Info Page */}
        <div style={{ marginBottom: '4rem' }}>
          <AdBanner isPro={userData?.isPro || false} />
        </div>

        <div style={{ width: '100%', maxWidth: '500px', margin: '0 auto 4rem auto', borderRadius: '30px', overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,0.6)', border: '1px solid #333' }}>
          <img 
            src="/assets/example-share-card.png" 
            alt="Example Range Anxiety Share Card" 
            style={{ width: '100%', display: 'block' }} 
          />
        </div>

        <footer style={{ textAlign: 'center', padding: '4rem 0', borderTop: '1px solid #333' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>Ready to plan your next ride?</h3>
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
