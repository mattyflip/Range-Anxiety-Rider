import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, serverTimestamp, deleteDoc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import NavBar from '../shared/ui/NavBar';
import SEO from '../shared/ui/SEO';
import AuthModal from '../features/auth/AuthModal';
import { useUserData } from '../hooks/useUserData';
import type { SavedBike } from '../types';

// Temporarily import static data for seeding
import { STANDARD_BIKES, PEDAL_EBIKES_US_UK_CA, E_MOTOS_GLOBAL } from '../utils/bikeLibrary';

const AdminLibrary: React.FC = () => {
  const navigate = useNavigate();
  const { user, userData, loading: authLoading } = useUserData();
  const [bikes, setBikes] = useState<SavedBike[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !userData?.isAdmin) {
      navigate('/map');
      return;
    }

    const q = query(collection(db, "global_bikes"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched: SavedBike[] = [];
      snap.forEach(docSnap => {
        fetched.push({ id: docSnap.id, ...docSnap.data() } as SavedBike);
      });
      setBikes(fetched);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, userData, authLoading, navigate]);

  const handleSeedDatabase = async () => {
    if (!window.confirm("This will overwrite existing global bikes with hardcoded data. Continue?")) return;
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      
      const allStaticBikes = [
        ...STANDARD_BIKES.map(b => ({ ...b, type: 'standard' })),
        ...PEDAL_EBIKES_US_UK_CA.map(b => ({ ...b, type: 'pedal' })),
        ...E_MOTOS_GLOBAL.map(b => ({ ...b, type: 'emoto' }))
      ];

      for (const bike of allStaticBikes) {
        const bikeId = bike.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const bikeRef = doc(db, "global_bikes", bikeId);
        batch.set(bikeRef, {
          ...bike,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      alert(`Successfully seeded ${allStaticBikes.length} bikes!`);
    } catch (e) {
      console.error("Seeding failed", e);
      alert("Seeding failed. Check console.");
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDeleteBike = async (id: string) => {
    if (!window.confirm("Delete this bike from the global library?")) return;
    try {
      await deleteDoc(doc(db, "global_bikes", id));
    } catch (e) { console.error(e); }
  };

  if (authLoading || loading) return <div style={{ minHeight: '100vh', background: '#121212', color: '#ff6600', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Accessing Secure Library...</div>;

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO title="Admin Library Manager" />
      <NavBar user={user} onShowInstall={() => {}} onShowAuth={() => setShowAuthModal(true)} />

      <main style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#ff6600' }}>GLOBAL LIBRARY</h1>
            <p style={{ color: '#888', fontWeight: 'bold' }}>Catalog Management (Admin Only)</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {bikes.length === 0 && (
              <button 
                onClick={handleSeedDatabase}
                disabled={isSeeding}
                style={{ padding: '0.8rem 1.5rem', background: '#222', color: '#ff6600', border: '1px solid #ff6600', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {isSeeding ? 'SEEDING...' : '🌱 SEED FROM CODE'}
              </button>
            )}
            <button 
              style={{ padding: '0.8rem 1.5rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              + ADD NEW MODEL
            </button>
          </div>
        </header>

        <section style={{ background: '#1a1a1a', borderRadius: '24px', border: '1px solid #333', overflow: 'hidden' }}>
           <div style={{ padding: '1.5rem', borderBottom: '1px solid #333', display: 'flex', gap: '1rem' }}>
              <input 
                type="text" 
                placeholder="Filter catalog..." 
                style={{ flex: 1, background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '0.8rem', color: 'white' }}
              />
              <select style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '0.8rem', color: 'white' }}>
                <option>All Types</option>
                <option>Standard</option>
                <option>Pedal E-Bike</option>
                <option>E-Moto</option>
              </select>
           </div>

           <div style={{ display: 'flex', flexDirection: 'column' }}>
              {bikes.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: '#444' }}>Library is empty. Use the seed button to populate.</div>
              ) : (
                bikes.map(bike => (
                  <div key={bike.id} style={{ padding: '1.5rem', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{bike.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.2rem' }}>
                          {bike.specs.voltage}V • {bike.specs.capacityAh}Ah • {bike.specs.motorWatts}W
                        </div>
                     </div>
                     <div style={{ display: 'flex', gap: '0.8rem' }}>
                        <button style={{ background: '#222', border: '1px solid #333', color: '#888', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>EDIT</button>
                        <button 
                          onClick={() => bike.id && handleDeleteBike(bike.id)}
                          style={{ background: 'none', border: 'none', color: '#ff4444', padding: '0.5rem', cursor: 'pointer', fontSize: '1rem' }}
                        >
                          🗑️
                        </button>
                     </div>
                  </div>
                ))
              )}
           </div>
        </section>
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default AdminLibrary;
