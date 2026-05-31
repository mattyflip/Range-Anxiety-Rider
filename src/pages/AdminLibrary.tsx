import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp, deleteDoc, writeBatch } from 'firebase/firestore';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Edit Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingBike, setEditingBike] = useState<SavedBike | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'standard',
    voltage: '48',
    capacityAh: '15',
    motorWatts: '750',
    bikeWeightLbs: '65',
    tirePSI: '30',
    tireType: 'all-terrain',
    controllerType: '',
    driveMode: 'both'
  });

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

  const filteredBikes = useMemo(() => {
    return bikes.filter(b => {
      const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'All Types' || (b as any).type?.toLowerCase() === typeFilter.toLowerCase().replace(' ', '-');
      return matchesSearch && matchesType;
    });
  }, [bikes, searchQuery, typeFilter]);

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

  const openEditModal = (bike?: SavedBike) => {
    if (bike) {
      setEditingBike(bike);
      setForm({
        name: bike.name,
        type: (bike as any).type || 'standard',
        voltage: bike.specs.voltage?.toString() || '48',
        capacityAh: bike.specs.capacityAh?.toString() || '15',
        motorWatts: bike.specs.motorWatts?.toString() || '750',
        bikeWeightLbs: bike.specs.bikeWeightLbs?.toString() || '65',
        tirePSI: bike.specs.tirePSI?.toString() || '30',
        tireType: bike.specs.tireType || 'all-terrain',
        controllerType: bike.specs.controllerType || '',
        driveMode: bike.specs.driveMode || 'both'
      });
    } else {
      setEditingBike(null);
      setForm({
        name: '',
        type: 'standard',
        voltage: '48',
        capacityAh: '15',
        motorWatts: '750',
        bikeWeightLbs: '65',
        tirePSI: '30',
        tireType: 'all-terrain',
        controllerType: '',
        driveMode: 'both'
      });
    }
    setShowModal(true);
  };

  const handleDuplicate = (bike: SavedBike) => {
    setEditingBike(null); // Ensure it's treated as a new entry
    setForm({
      name: `${bike.name} (Copy)`,
      type: (bike as any).type || 'standard',
      voltage: bike.specs.voltage?.toString() || '48',
      capacityAh: bike.specs.capacityAh?.toString() || '15',
      motorWatts: bike.specs.motorWatts?.toString() || '750',
      bikeWeightLbs: bike.specs.bikeWeightLbs?.toString() || '65',
      tirePSI: bike.specs.tirePSI?.toString() || '30',
      tireType: bike.specs.tireType || 'all-terrain',
      controllerType: bike.specs.controllerType || '',
      driveMode: bike.specs.driveMode || 'both'
    });
    setShowModal(true);
  };

  const handleSaveBike = async () => {
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      // Use the existing ID if editing, otherwise generate a new one from the name
      const bikeId = editingBike?.id || form.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const bikeRef = doc(db, "global_bikes", bikeId);
      
      await setDoc(bikeRef, {
        name: form.name,
        type: form.type,
        specs: {
          voltage: parseFloat(form.voltage),
          capacityAh: parseFloat(form.capacityAh),
          motorWatts: parseFloat(form.motorWatts),
          bikeWeightLbs: parseFloat(form.bikeWeightLbs),
          tirePSI: parseFloat(form.tirePSI),
          tireType: form.tireType,
          controllerType: form.controllerType,
          driveMode: form.driveMode
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      setShowModal(false);
    } catch (e) {
      console.error(e);
      alert("Failed to save bike.");
    } finally {
      setIsSaving(false);
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
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#ff6600' }}>GLOBAL LIBRARY</h1>
              <span style={{ background: '#222', color: '#666', fontSize: '0.6rem', padding: '2px 8px', borderRadius: '10px', border: '1px solid #333' }}>v{__APP_VERSION__}</span>
            </div>
            <p style={{ color: '#888', fontWeight: 'bold' }}>Catalog Management (Admin Only)</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={handleSeedDatabase}
              disabled={isSeeding}
              style={{ padding: '0.8rem 1.5rem', background: '#222', color: '#ff6600', border: '1px solid #ff6600', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {isSeeding ? 'SEEDING...' : '🌱 RE-SEED FROM CODE'}
            </button>
            <button 
              onClick={() => openEditModal()}
              style={{ padding: '0.8rem 1.5rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              + ADD NEW MODEL
            </button>
          </div>
        </header>

        <section style={{ background: '#1a1a1a', borderRadius: '24px', border: '1px solid #333', overflow: 'hidden' }}>
           <div style={{ padding: '1.5rem', borderBottom: '1px solid #333', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '250px' }}>
                <label style={{ display: 'block', color: '#666', fontSize: '0.65rem', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Search Catalog</label>
                <input 
                  type="text" 
                  placeholder="Model name, brand, or motor..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '0.8rem', color: 'white' }}
                />
              </div>
              <div style={{ width: '150px' }}>
                <label style={{ display: 'block', color: '#666', fontSize: '0.65rem', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Filter Type</label>
                <select 
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                  style={{ width: '100%', background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '0.8rem', color: 'white' }}
                >
                  <option>All Types</option>
                  <option>Standard</option>
                  <option>Pedal</option>
                  <option>Emoto</option>
                </select>
              </div>
           </div>

           <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredBikes.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: '#444' }}>No results matching your filter.</div>
              ) : (
                filteredBikes.map(bike => (
                  <div key={bike.id} style={{ padding: '1.5rem', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                           <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{bike.name}</div>
                           <span style={{ background: '#333', color: '#888', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{(bike as any).type}</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.2rem' }}>
                          {bike.specs.voltage}V • {bike.specs.capacityAh}Ah • {bike.specs.motorWatts}W
                        </div>
                     </div>
                     <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                        <button 
                          onClick={() => handleDuplicate(bike)}
                          style={{ background: 'rgba(255,102,0,0.1)', border: '1px solid rgba(255,102,0,0.2)', color: '#ff6600', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          DUPLICATE
                        </button>
                        <button 
                          onClick={() => openEditModal(bike)}
                          style={{ background: '#222', border: '1px solid #333', color: '#888', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          EDIT
                        </button>
                        <button 
                          onClick={() => bike.id && handleDeleteBike(bike.id)}
                          style={{ background: 'none', border: 'none', color: '#ff4444', padding: '0.5rem', cursor: 'pointer', fontSize: '1rem' }}
                          title="Delete Model"
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

      {/* Edit/Add Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
           <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '500px', borderRadius: '32px', padding: '2rem', border: '1px solid #333', maxHeight: '90vh', overflowY: 'auto' }}>
              <h2 style={{ color: '#ff6600', marginTop: 0 }}>{editingBike ? 'Edit Bike Model' : 'Add New Model'}</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
                 <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Model Name</label>
                    <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>

                 <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Type</label>
                    <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }}>
                       <option value="standard">Standard</option>
                       <option value="pedal">Pedal E-Bike</option>
                       <option value="emoto">E-Moto</option>
                    </select>
                 </div>

                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Voltage (V)</label>
                   <input type="number" value={form.voltage} onChange={e => setForm({...form, voltage: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Capacity (Ah)</label>
                   <input type="number" value={form.capacityAh} onChange={e => setForm({...form, capacityAh: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>

                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Motor Watts</label>
                   <input type="number" value={form.motorWatts} onChange={e => setForm({...form, motorWatts: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Bike Weight (lbs)</label>
                   <input type="number" value={form.bikeWeightLbs} onChange={e => setForm({...form, bikeWeightLbs: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>

                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Tire Type</label>
                   <select value={form.tireType} onChange={e => setForm({...form, tireType: e.target.value as any})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }}>
                     <option value="slick">Slick</option>
                     <option value="all-terrain">All-Terrain</option>
                     <option value="knobby">Knobby</option>
                   </select>
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Tire PSI</label>
                   <input type="number" value={form.tirePSI} onChange={e => setForm({...form, tirePSI: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>

                 <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Controller / Engine Details</label>
                    <input value={form.controllerType} onChange={e => setForm({...form, controllerType: e.target.value})} placeholder="e.g. Sine Wave, FOC, Bosch Gen 4" style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
                 <button 
                  onClick={handleSaveBike} 
                  disabled={isSaving || !form.name.trim()}
                  style={{ flex: 2, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', opacity: (isSaving || !form.name.trim()) ? 0.5 : 1 }}
                 >
                    {isSaving ? 'SAVING...' : 'SAVE MODEL'}
                 </button>
                 <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>CANCEL</button>
              </div>
           </div>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default AdminLibrary;
