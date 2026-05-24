import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, collection, onSnapshot, query, updateDoc, setDoc, deleteDoc, getDocs, where } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import SEO from '../components/SEO'

const FleetDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [userRole, setUserRole] = useState<'rider' | 'fleet'>('rider');
  const [loading, setLoading] = useState(true);
  
  const [fleetBikes, setFleetBikes] = useState<any[]>([]);
  const [liveUnits, setLiveUnits] = useState<any[]>([]);
  
  // Bike Edit Modal State
  const [showBikeModal, setShowShowBikeModal] = useState(false);
  const [editingBike, setEditingBike] = useState<any>(null);
  const [bikeForm, setBikeForm] = useState({
    unitId: '',
    voltage: '48',
    capacityAh: '15',
    motorWatts: '750',
    tirePSI: '30',
    bikeWeightLbs: '65',
    targetSpeedMph: '20',
    controllerAmps: '',
    cycleCount: '0'
  });

  // Auth & Org Initialization
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const d = snap.data();
          setUserData(d);
          const isAdmin = u.email?.toLowerCase() === 'mattyfliptv@gmail.com';
          setUserRole(isAdmin ? 'fleet' : (d.role || 'rider'));
          if (isAdmin && !d.orgId) {
            await updateDoc(doc(db, "users", u.uid), { orgId: 'rental_shop_test' });
          }
        }
      } else { navigate('/'); }
      setLoading(false);
    });
  }, [navigate]);

  // Fleet Listeners
  useEffect(() => {
    if (!userData?.orgId || userRole !== 'fleet') return;

    const qBikes = query(collection(db, `organizations/${userData.orgId}/bikes`));
    const unsubBikes = onSnapshot(qBikes, (snap) => {
      setFleetBikes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qLive = query(collection(db, `organizations/${userData.orgId}/live_units`));
    const unsubLive = onSnapshot(qLive, (snap) => {
      setLiveUnits(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubBikes(); unsubLive(); };
  }, [userData?.orgId, userRole]);

  const handleReturnBike = async (bike: any) => {
    if (!userData?.orgId) return;
    try {
      // 1. Update bike status in master list
      const bikeRef = doc(db, `organizations/${userData.orgId}/bikes`, bike.id);
      await updateDoc(bikeRef, { status: 'available' });

      // 2. Remove from live units (if exists)
      const q = query(collection(db, `organizations/${userData.orgId}/live_units`), where("unitName", "==", bike.unitId));
      const liveSnap = await getDocs(q);
      const deletePromises = liveSnap.docs.map(d => deleteDoc(doc(db, `organizations/${userData.orgId}/live_units`, d.id)));
      await Promise.all(deletePromises);

      alert(`${bike.unitId} returned to inventory.`);
    } catch (e) { console.error(e); }
  };

  const handleRentOut = async (bike: any) => {
    if (!userData?.orgId) return;
    try {
      await updateDoc(doc(db, `organizations/${userData.orgId}/bikes`, bike.id), { status: 'rented' });
      alert(`${bike.unitId} marked as RENTED.`);
    } catch (e) { console.error(e); }
  };

  const handleUpdateBattery = async (bike: any, percent: number) => {
    if (!userData?.orgId) return;
    try {
      // Update Master Bike Doc
      await updateDoc(doc(db, `organizations/${userData.orgId}/bikes`, bike.id), {
        "specs.currentBatteryPercent": percent
      });

      // Sync to Live Units if active
      const q = query(collection(db, `organizations/${userData.orgId}/live_units`), where("unitName", "==", bike.unitId));
      const liveSnap = await getDocs(q);
      const syncPromises = liveSnap.docs.map(d => updateDoc(doc(db, `organizations/${userData.orgId}/live_units`, d.id), { battery: percent }));
      await Promise.all(syncPromises);
    } catch (e) { console.error(e); }
  };

  const handleSaveBikeSpecs = async () => {
    if (!userData?.orgId || !bikeForm.unitId.trim()) return;
    const bikeId = editingBike?.id || Date.now().toString();
    try {
      await setDoc(doc(db, `organizations/${userData.orgId}/bikes`, bikeId), {
        unitId: bikeForm.unitId,
        specs: {
          voltage: parseFloat(bikeForm.voltage),
          capacityAh: parseFloat(bikeForm.capacityAh),
          motorWatts: parseFloat(bikeForm.motorWatts),
          tirePSI: parseFloat(bikeForm.tirePSI),
          bikeWeightLbs: parseFloat(bikeForm.bikeWeightLbs),
          targetSpeedMph: parseFloat(bikeForm.targetSpeedMph),
          controllerAmps: bikeForm.controllerAmps ? parseFloat(bikeForm.controllerAmps) : null,
          cycleCount: parseInt(bikeForm.cycleCount) || 0,
          currentBatteryPercent: editingBike?.specs?.currentBatteryPercent || 100
        },
        status: editingBike?.status || 'available',
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setShowShowBikeModal(false);
      setEditingBike(null);
    } catch (e) { console.error(e); }
  };

  const openEditModal = (bike: any) => {
    setEditingBike(bike);
    setBikeForm({
      unitId: bike.unitId,
      voltage: bike.specs.voltage.toString(),
      capacityAh: bike.specs.capacityAh.toString(),
      motorWatts: bike.specs.motorWatts.toString(),
      tirePSI: bike.specs.tirePSI.toString(),
      bikeWeightLbs: bike.specs.bikeWeightLbs.toString(),
      targetSpeedMph: bike.specs.targetSpeedMph.toString(),
      controllerAmps: bike.specs.controllerAmps?.toString() || '',
      cycleCount: bike.specs.cycleCount?.toString() || '0'
    });
    setShowShowBikeModal(true);
  };

  if (loading) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>Loading Fleet Data...</div>;

  const rentedBikes = fleetBikes.filter(b => b.status === 'rented');
  const availableBikes = fleetBikes.filter(b => b.status === 'available');
  const lowBatteryBikes = fleetBikes.filter(b => (b.specs?.currentBatteryPercent || 0) < 30);

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO title="Shop Dashboard" />
      <NavBar user={user} onShowInstall={() => {}} onShowAuth={() => {}} />

      <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#ff6600', textTransform: 'uppercase' }}>Fleet Hub</h1>
            <div style={{ color: '#888', fontWeight: 'bold' }}>{userData?.orgName || 'Bike Shop'} Management</div>
          </div>
          <button 
            onClick={() => { setEditingBike(null); setBikeForm({ unitId: '', voltage: '48', capacityAh: '15', motorWatts: '750', tirePSI: '30', bikeWeightLbs: '65', targetSpeedMph: '20', controllerAmps: '', cycleCount: '0' }); setShowShowBikeModal(true); }}
            style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            + REGISTER NEW BIKE
          </button>
        </header>

        {/* KPI Dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          {[
            { label: 'TOTAL FLEET', val: fleetBikes.length, color: 'white' },
            { label: 'RENTED OUT', val: rentedBikes.length, color: '#ff6600' },
            { label: 'AVAILABLE', val: availableBikes.length, color: '#34a853' },
            { label: 'LOW BATTERY', val: lowBatteryBikes.length, color: '#ff4444' }
          ].map((kpi, i) => (
            <div key={i} style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '20px', border: '1px solid #333', textAlign: 'center' }}>
              <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{kpi.label}</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: kpi.color }}>{kpi.val}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem', alignItems: 'start' }}>
          {/* Main Fleet List */}
          <section>
            <h2 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📦 Inventory Management
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {fleetBikes.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center', background: '#1a1a1a', borderRadius: '24px', border: '1px dashed #333', color: '#444' }}>No bikes registered in garage.</div>
              ) : (
                fleetBikes.sort((a,b) => a.unitId.localeCompare(b.unitId)).map(b => (
                  <div key={b.id} style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '20px', border: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                      <div style={{ width: '100px' }}>
                        <div style={{ color: 'white', fontWeight: 900, fontSize: '1.2rem' }}>{b.unitId}</div>
                        <div style={{ fontSize: '0.6rem', color: b.status === 'rented' ? '#ff6600' : '#34a853', fontWeight: 'bold', textTransform: 'uppercase' }}>{b.status}</div>
                      </div>
                      
                      <div style={{ width: '200px' }}>
                         <label style={{ display: 'block', color: '#555', fontSize: '0.6rem', fontWeight: 'bold', marginBottom: '4px' }}>BATTERY CALIBRATION</label>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="number" 
                              value={b.specs.currentBatteryPercent} 
                              onChange={(e) => handleUpdateBattery(b, parseInt(e.target.value))}
                              style={{ width: '60px', background: '#111', border: '1px solid #333', color: 'white', padding: '5px', borderRadius: '6px', textAlign: 'center', fontWeight: 'bold' }} 
                            />
                            <span style={{ color: '#888', fontWeight: 'bold' }}>%</span>
                            <div style={{ flex: 1, height: '8px', background: '#222', borderRadius: '4px', overflow: 'hidden' }}>
                               <div style={{ width: `${b.specs.currentBatteryPercent}%`, height: '100%', background: b.specs.currentBatteryPercent < 30 ? '#ff4444' : '#34a853' }} />
                            </div>
                         </div>
                      </div>

                      <div style={{ color: '#666', fontSize: '0.7rem' }}>
                        <div>{b.specs.motorWatts}W • {b.specs.voltage}V</div>
                        <div>{b.specs.cycleCount} cycles</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                      <button onClick={() => openEditModal(b)} style={{ background: '#222', border: '1px solid #333', color: '#888', padding: '0.6rem 1rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>EDIT SPECS</button>
                      {b.status === 'available' ? (
                        <button onClick={() => handleRentOut(b)} style={{ background: 'rgba(52,168,83,0.1)', border: '1px solid #34a853', color: '#34a853', padding: '0.6rem 1.5rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>RENT OUT</button>
                      ) : (
                        <button onClick={() => handleReturnBike(b)} style={{ background: 'rgba(255,102,0,0.1)', border: '1px solid #ff6600', color: '#ff6600', padding: '0.6rem 1.5rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>RETURN BIKE</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Active Rentals Sidebar */}
          <aside>
            <h2 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '1.5rem' }}>🛰️ Active Field Units</h2>
            <div style={{ background: '#111', borderRadius: '24px', padding: '1.5rem', border: '1px solid #222' }}>
              {rentedBikes.length === 0 ? (
                <div style={{ color: '#444', fontSize: '0.8rem', textAlign: 'center', padding: '2rem' }}>No units currently in the field.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                   {rentedBikes.map(b => {
                     const live = liveUnits.find(l => l.unitName === b.unitId);
                     return (
                       <div key={b.id} style={{ borderBottom: '1px solid #222', paddingBottom: '1.2rem' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <div style={{ fontWeight: 'bold' }}>{b.unitId}</div>
                            <div style={{ fontSize: '0.65rem', color: '#34a853' }}>{live ? '🛰️ SIGNAL LIVE' : '⌛ SYNCING...'}</div>
                         </div>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div style={{ background: '#1a1a1a', padding: '0.5rem', borderRadius: '8px' }}>
                               <div style={{ color: '#555', fontSize: '0.55rem', fontWeight: 'bold' }}>BATTERY</div>
                               <div style={{ color: (live?.battery || b.specs.currentBatteryPercent) < 30 ? '#ff4444' : 'white', fontWeight: 900 }}>{live?.battery || b.specs.currentBatteryPercent}%</div>
                            </div>
                            <div style={{ background: '#1a1a1a', padding: '0.5rem', borderRadius: '8px' }}>
                               <div style={{ color: '#555', fontSize: '0.55rem', fontWeight: 'bold' }}>EST. RANGE</div>
                               <div style={{ color: 'white', fontWeight: 900 }}>-- mi</div>
                            </div>
                         </div>
                       </div>
                     )
                   })}
                </div>
              )}
            </div>
            
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(255,102,0,0.05)', borderRadius: '24px', border: '1px solid rgba(255,102,0,0.1)' }}>
               <h4 style={{ color: '#ff6600', margin: '0 0 0.5rem 0', fontSize: '0.8rem' }}>PRO TIP</h4>
               <p style={{ fontSize: '0.7rem', color: '#888', margin: 0, lineHeight: '1.5' }}>Use the <strong>Fleet Map</strong> to see these units' exact GPS coordinates and plan suggested routes for your customers.</p>
            </div>
          </aside>
        </div>
      </main>

      {/* Bike Edit Modal */}
      {showBikeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
           <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '500px', borderRadius: '32px', padding: '2rem', border: '1px solid #333' }}>
              <h2 style={{ color: '#ff6600', marginTop: 0 }}>{editingBike ? 'Edit Bike Specs' : 'Register New Bike'}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
                 <div style={{ gridColumn: 'span 2' }}>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Unit ID</label>
                   <input value={bikeForm.unitId} onChange={e => setBikeForm({...bikeForm, unitId: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Voltage (V)</label>
                   <input type="number" value={bikeForm.voltage} onChange={e => setBikeForm({...bikeForm, voltage: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Capacity (Ah)</label>
                   <input type="number" value={bikeForm.capacityAh} onChange={e => setBikeForm({...bikeForm, capacityAh: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Motor Watts</label>
                   <input type="number" value={bikeForm.motorWatts} onChange={e => setBikeForm({...bikeForm, motorWatts: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Tire PSI</label>
                   <input type="number" value={bikeForm.tirePSI} onChange={e => setBikeForm({...bikeForm, tirePSI: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                 <button onClick={handleSaveBikeSpecs} style={{ flex: 1, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>SAVE CHANGES</button>
                 <button onClick={() => setShowShowBikeModal(false)} style={{ padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>CANCEL</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default FleetDashboard;
