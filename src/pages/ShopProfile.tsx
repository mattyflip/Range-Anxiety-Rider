import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { onAuthStateChanged, deleteUser, signOut } from 'firebase/auth'
import { doc, updateDoc, deleteDoc, query, collection, onSnapshot, setDoc, getDoc } from 'firebase/firestore'
import NavBar from '../components/NavBar'
import SEO from '../components/SEO'

const ShopProfile: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Shop Profile states
  const [shopName, setShopName] = useState('');
  const [shopBio, setShopBio] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopEmail, setShopEmail] = useState('');
  
  // Garage/Fleet states
  const [newBikeName, setNewBikeName] = useState('');
  const [newBikeVolts, setNewBikeVolts] = useState('48');
  const [newBikeAh, setNewBikeAh] = useState('15');
  const [newBikeMotorWatts, setNewBikeMotorWatts] = useState('750');
  const [newBikeTirePSI, setNewBikeTirePSI] = useState('30');
  const [newBikeWeight, setNewBikeWeight] = useState('65');
  const [newBikeTargetSpeed, setNewBikeTargetSpeed] = useState('20');
  const [newBikeControllerAmps, setNewBikeControllerAmps] = useState('');
  const [newBikeCycleCount, setNewBikeCycleCount] = useState('0');
  const [newBikeBatteryPercent, setNewBikeBatteryPercent] = useState('100');
  const [newBikeBatteryVolts, setNewBikeBatteryVolts] = useState('54.6');
  const [orgBikes, setOrgBikes] = useState<any[]>([]);
  const [editingBikeId, setEditingBikeId] = useState<string | null>(null);

  const [isUpdating, setIsUpdating] = useState(false);
  const [isShopTier, setIsShopTier] = useState(false);
  const [shopTierExpiresAt, setShopTierExpiresAt] = useState<Date | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        const userDocRef = doc(db, "users", u.uid);
        const unsubSnap = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUserData(data);
            setIsShopTier(data.isShopTier || false);
            if (data.shopTierExpiresAt?.toDate) {
              setShopTierExpiresAt(data.shopTierExpiresAt.toDate());
            }
          }
          setLoading(false);
        });
        return () => unsubSnap();
      } else {
        navigate('/');
      }
    });
    return () => unsubAuth();
  }, [navigate]);

  useEffect(() => {
    if (userData?.orgId && userData?.role === 'fleet') {
      const q = query(collection(db, `organizations/${userData.orgId}/bikes`));
      const unsub = onSnapshot(q, (snap) => {
        setOrgBikes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      getDoc(doc(db, "organizations", userData.orgId)).then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          setShopName(d.name || '');
          setShopBio(d.bio || '');
          setShopAddress(d.address || '');
          setShopPhone(d.phone || '');
          setShopEmail(d.email || '');
        }
      });
      return () => unsub();
    }
  }, [userData]);

  const handleUpdateShop = async () => {
    if (!user || !userData?.orgId) return;
    setIsUpdating(true);
    try {
      await setDoc(doc(db, "organizations", userData.orgId), {
        name: shopName,
        bio: shopBio,
        address: shopAddress,
        phone: shopPhone,
        email: shopEmail,
        ownerId: user.uid,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      await updateDoc(doc(db, "users", user.uid), {
        orgName: shopName,
        orgAddress: shopAddress
      });
      alert("Shop profile updated!");
    } catch (e: any) {
      console.error(e);
      alert("Update failed: " + e.message);
    } finally { setIsUpdating(false); }
  };

  const getBatteryLimits = (nominalVolts: number) => {
    if (nominalVolts === 36) return { min: 30, max: 42 };
    if (nominalVolts === 48) return { min: 40, max: 54.6 };
    if (nominalVolts === 52) return { min: 42, max: 58.8 };
    if (nominalVolts === 60) return { min: 48, max: 67.2 };
    if (nominalVolts === 72) return { min: 60, max: 84 };
    return { min: nominalVolts * 0.8, max: nominalVolts * 1.15 };
  };

  const handleVoltsChange = (v: string) => {
    setNewBikeBatteryVolts(v);
    const volts = parseFloat(v);
    if (!isNaN(volts)) {
      const limits = getBatteryLimits(parseFloat(newBikeVolts));
      const percent = Math.min(100, Math.max(0, ((volts - limits.min) / (limits.max - limits.min)) * 100));
      setNewBikeBatteryPercent(Math.round(percent).toString());
    }
  };

  const handlePercentChange = (p: string) => {
    setNewBikeBatteryPercent(p);
    const percent = parseFloat(p);
    if (!isNaN(percent)) {
      const limits = getBatteryLimits(parseFloat(newBikeVolts));
      const volts = limits.min + (percent / 100) * (limits.max - limits.min);
      setNewBikeBatteryVolts(volts.toFixed(1));
    }
  };

  const handleSaveBike = async () => {
    if (!newBikeName.trim() || !user || !userData?.orgId) return;
    const bikeId = editingBikeId || Date.now().toString();
    const batteryLevel = parseInt(newBikeBatteryPercent) || 100;
    try {
      await setDoc(doc(db, `organizations/${userData.orgId}/bikes`, bikeId), {
        unitId: newBikeName,
        specs: {
          voltage: parseFloat(newBikeVolts),
          capacityAh: parseFloat(newBikeAh),
          motorWatts: parseFloat(newBikeMotorWatts),
          tirePSI: parseFloat(newBikeTirePSI),
          bikeWeightLbs: parseFloat(newBikeWeight),
          targetSpeedMph: parseFloat(newBikeTargetSpeed),
          controllerAmps: newBikeControllerAmps ? parseFloat(newBikeControllerAmps) : null,
          cycleCount: parseInt(newBikeCycleCount) || 0,
          currentBatteryPercent: batteryLevel
        },
        status: 'available',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // GLOBAL SYNC
      const { getDocs, where, collection, query, updateDoc } = await import('firebase/firestore');
      const liveRef = collection(db, `organizations/${userData.orgId}/live_units`);
      const q = query(liveRef, where("unitName", "==", newBikeName));
      const liveSnap = await getDocs(q);
      const updatePromises = liveSnap.docs.map(liveDoc => 
        updateDoc(doc(db, `organizations/${userData.orgId}/live_units`, liveDoc.id), {
          battery: batteryLevel
        })
      );
      await Promise.all(updatePromises);
      
      resetBikeForm();
      alert(editingBikeId ? "Bike updated globally!" : "Bike added to fleet!");
    } catch (e) { console.error(e); }
  };

  const resetBikeForm = () => {
    setEditingBikeId(null);
    setNewBikeName('');
    setNewBikeVolts('48');
    setNewBikeAh('15');
    setNewBikeMotorWatts('750');
    setNewBikeTirePSI('30');
    setNewBikeWeight('65');
    setNewBikeTargetSpeed('20');
    setNewBikeControllerAmps('');
    setNewBikeCycleCount('0');
    setNewBikeBatteryPercent('100');
    setNewBikeBatteryVolts('54.6');
  };

  const handleEditBike = (bike: any) => {
    setEditingBikeId(bike.id);
    setNewBikeName(bike.unitId);
    setNewBikeVolts(bike.specs.voltage.toString());
    setNewBikeAh(bike.specs.capacityAh.toString());
    setNewBikeMotorWatts(bike.specs.motorWatts.toString());
    setNewBikeTirePSI(bike.specs.tirePSI.toString());
    setNewBikeWeight(bike.specs.bikeWeightLbs.toString());
    setNewBikeTargetSpeed(bike.specs.targetSpeedMph.toString());
    setNewBikeControllerAmps(bike.specs.controllerAmps?.toString() || '');
    setNewBikeCycleCount(bike.specs.cycleCount?.toString() || '0');
    setNewBikeBatteryPercent(bike.specs.currentBatteryPercent?.toString() || '100');
    
    const limits = getBatteryLimits(bike.specs.voltage);
    const volts = limits.min + ((bike.specs.currentBatteryPercent || 100) / 100) * (limits.max - limits.min);
    setNewBikeBatteryVolts(volts.toFixed(1));

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteFleetBike = async (id: string) => {
    if (!window.confirm("Remove this bike from fleet?")) return;
    try {
      await deleteDoc(doc(db, `organizations/${userData.orgId}/bikes`, id));
    } catch (e) { console.error(e); }
  };

  if (loading) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Loading...</div>;

  const isFleet = userData?.role === 'fleet';

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212' }}>
      <SEO title={isFleet ? "Shop Profile" : "Settings"} />
      <NavBar user={user} onShowInstall={() => {}} onShowAuth={() => {}} />

      <main style={{ maxWidth: '700px', margin: '2rem auto', padding: '1rem' }}>
        <h1 style={{ color: 'white', marginBottom: '2rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {isFleet ? 'Shop Profile' : 'User Settings'}
        </h1>

        {isFleet ? (
          <>
            <section className="card" style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #ff6600', marginBottom: '2rem' }}>
              <h2 style={{ color: '#ff6600', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Shop Information</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <div className="form-group">
                  <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Shop Name</label>
                  <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white' }} />
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Shop Bio</label>
                  <textarea value={shopBio} onChange={e => setShopBio(e.target.value)} placeholder="Tell riders about your shop..." style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white', minHeight: '100px' }} />
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>HQ Address</label>
                  <input type="text" value={shopAddress} onChange={e => setShopAddress(e.target.value)} style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Phone Number</label>
                    <input type="tel" value={shopPhone} onChange={e => setShopPhone(e.target.value)} style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white' }} />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Public Email</label>
                    <input type="email" value={shopEmail} onChange={e => setShopEmail(e.target.value)} style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white' }} />
                  </div>
                </div>
                <button onClick={handleUpdateShop} disabled={isUpdating} style={{ width: '100%', padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '1rem' }}>
                  {isUpdating ? 'Saving...' : 'Update Shop Details'}
                </button>
              </div>
            </section>

            <section className="card" style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', marginBottom: '2rem' }}>
              <h2 style={{ color: '#ff6600', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Garage / Fleet Inventory</h2>
              <div style={{ background: '#222', padding: '1.5rem', borderRadius: '20px', marginBottom: '2rem', border: `1px ${editingBikeId ? 'solid' : 'dashed'} ${editingBikeId ? '#ff6600' : '#444'}` }}>
                <h3 style={{ color: 'white', fontSize: '0.9rem', marginBottom: '1.2rem' }}>{editingBikeId ? '📝 Edit Unit' : '➕ Register New Fleet Unit'}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <input type="text" placeholder="Unit ID (e.g. B-01)" value={newBikeName} onChange={e => setNewBikeName(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Voltage (V)</label>
                      <input type="number" value={newBikeVolts} onChange={e => setNewBikeVolts(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Capacity (Ah)</label>
                      <input type="number" value={newBikeAh} onChange={e => setNewBikeAh(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Motor Watts</label>
                      <input type="number" value={newBikeMotorWatts} onChange={e => setNewBikeMotorWatts(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Tire PSI</label>
                      <input type="number" value={newBikeTirePSI} onChange={e => setNewBikeTirePSI(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Bike Weight (lbs)</label>
                      <input type="number" value={newBikeWeight} onChange={e => setNewBikeWeight(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Top Speed (mph)</label>
                      <input type="number" value={newBikeTargetSpeed} onChange={e => setNewBikeTargetSpeed(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Controller Amps</label>
                      <input type="number" value={newBikeControllerAmps} onChange={e => setNewBikeControllerAmps(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Cycle Count</label>
                      <input type="number" value={newBikeCycleCount} onChange={e => setNewBikeCycleCount(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                    </div>
                    <div style={{ borderTop: '1px solid #333', gridColumn: 'span 2', margin: '0.5rem 0' }}></div>
                    <div>
                      <label style={{ display: 'block', color: '#ff6600', fontSize: '0.7rem', marginBottom: '0.3rem', fontWeight: 'bold' }}>Current Battery %</label>
                      <input type="number" min="0" max="100" value={newBikeBatteryPercent} onChange={e => handlePercentChange(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #ff6600', borderRadius: '8px', color: 'white', fontWeight: 'bold' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#ff6600', fontSize: '0.7rem', marginBottom: '0.3rem', fontWeight: 'bold' }}>Current Volts (V)</label>
                      <input type="number" step="0.1" value={newBikeBatteryVolts} onChange={e => handleVoltsChange(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #ff6600', borderRadius: '8px', color: 'white', fontWeight: 'bold' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button onClick={handleSaveBike} style={{ flex: 1, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                      {editingBikeId ? 'Update Unit' : 'Add to Fleet'}
                    </button>
                    {editingBikeId && <button onClick={resetBikeForm} style={{ padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {orgBikes.map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', padding: '1.2rem', borderRadius: '16px', border: '1px solid #333' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                        <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>{b.unitId}</div>
                        <div style={{ color: '#34a853', fontSize: '0.65rem', fontWeight: 'bold', background: 'rgba(52,168,83,0.1)', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' }}>{b.status}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem', fontSize: '0.7rem', color: '#aaa' }}>
                        <div>⚡ {b.specs.voltage}V / {b.specs.capacityAh}Ah</div>
                        <div style={{ color: (b.specs.currentBatteryPercent || 100) < 30 ? '#ff4444' : '#34a853', fontWeight: 'bold' }}>🔋 {b.specs.currentBatteryPercent || 100}% Charged</div>
                        <div>🔌 {b.specs.motorWatts}W</div>
                        <div>💨 {b.specs.targetSpeedMph}mph</div>
                        <div>🎈 {b.specs.tirePSI} PSI</div>
                        <div>⚖️ {b.specs.bikeWeightLbs}lbs</div>
                        <div>🔄 {b.specs.cycleCount || 0} cycles</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1.5rem' }}>
                      <button onClick={() => handleEditBike(b)} style={{ background: '#333', border: 'none', color: 'white', padding: '0.5rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem' }}>EDIT</button>
                      <button onClick={() => handleDeleteFleetBike(b.id)} style={{ background: 'rgba(255,68,68,0.1)', border: 'none', color: '#ff4444', padding: '0.5rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem' }}>DELETE</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <h2 style={{ color: 'white' }}>Personal settings can be edited in your Profile.</h2>
            <button onClick={() => navigate('/map')} style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Back to Map</button>
          </div>
        )}

        {isShopTier && (
          <section className="card" style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ color: 'white', fontSize: '1.1rem', margin: 0 }}>Subscription: SHOP TIER</h2>
                <p style={{ color: '#888', fontSize: '0.8rem', margin: '5px 0 0 0' }}>Professional fleet features active until {shopTierExpiresAt?.toLocaleDateString()}</p>
              </div>
              <div style={{ fontSize: '2rem' }}>🏬</div>
            </div>
          </section>
        )}

        <section style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid #222', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
           <button onClick={() => signOut(auth).then(() => navigate('/'))} style={{ width: '100%', padding: '1rem', background: '#222', color: 'white', border: '1px solid #333', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Sign Out</button>
           <button onClick={async () => { if(window.confirm("Delete account?")) { await deleteDoc(doc(db, "users", user.uid)); await deleteUser(user); navigate('/'); } }} style={{ width: '100%', padding: '1rem', background: 'transparent', color: '#666', border: 'none', fontSize: '0.8rem', cursor: 'pointer' }}>Delete Account</button>
        </section>
      </main>
    </div>
  );
};

export default ShopProfile;
