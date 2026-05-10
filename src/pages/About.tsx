import React, { useState, useEffect } from 'react'
import { auth } from '../firebase'
import NavBar from '../components/NavBar'

const About: React.FC = () => {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsub();
  }, []);

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <NavBar user={user} onShowInstall={() => {}} />

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '4rem 1rem' }}>
        <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 900, color: '#ff6600', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>How It Works</h1>
          <p className="desktop-only" style={{ fontSize: '1.2rem', color: '#888', maxWidth: '600px', margin: '0 auto', lineHeight: '1.5' }}>
            The science behind conquering range anxiety. Learn how our physics-based model calculates your e-bike's battery life.
          </p>
        </header>

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
                <li>Stark Varg / E Ride Pro SS</li>
              </ul>
            </div>
            <div>
              <h4 style={{ color: 'white', marginBottom: '0.5rem' }}>Premium E-Bikes</h4>
              <ul style={{ fontSize: '0.9rem', listStyle: 'none', padding: 0 }}>
                <li>Specialized Turbo Levo / Vado / Creo</li>
                <li>Trek Fuel EXe / Rail / Allant+</li>
                <li>Aventon Aventure / Level / Soltera</li>
                <li>Rad Power Radster / RadWagon / RadRunner</li>
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
    </div>
  );
};

export default About;
