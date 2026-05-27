import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { onAuthStateChanged, deleteUser, signOut } from 'firebase/auth'
import { doc, updateDoc, deleteDoc, onSnapshot, setDoc, getDoc } from 'firebase/firestore'
import { useJsApiLoader, GoogleMap } from '@react-google-maps/api'
import NavBar from '../components/NavBar'
import ModernAutocomplete from '../components/ModernAutocomplete'
import AdvancedMarker from '../components/AdvancedMarker'
import SEO from '../components/SEO'

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

const ShopProfile: React.FC = () => {
  const navigate = useNavigate();
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", libraries: LIBRARIES });
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Shop Profile states
  const [shopName, setShopName] = useState('');
  const [shopBio, setShopBio] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopLat, setShopLat] = useState<number | null>(null);
  const [shopLng, setShopLng] = useState<number | null>(null);
  const [shopPhone, setShopPhone] = useState('');
  const [shopEmail, setShopEmail] = useState('');
  
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
      getDoc(doc(db, "organizations", userData.orgId)).then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          setShopName(d.name || '');
          setShopBio(d.bio || '');
          setShopAddress(d.address || '');
          setShopLat(d.location?.lat || null);
          setShopLng(d.location?.lng || null);
          setShopPhone(d.phone || '');
          setShopEmail(d.email || '');
        }
      });
    }
  }, [userData]);

  const handleUpdateShop = async () => {
    if (!user) return;
    setIsUpdating(true);
    try {
      let orgId = userData?.orgId;
      
      if (!orgId) {
        orgId = 'org_' + user.uid.substring(0, 8);
        await updateDoc(doc(db, "users", user.uid), { orgId });
      }

      await setDoc(doc(db, "organizations", orgId), {
        name: shopName,
        bio: shopBio,
        address: shopAddress,
        location: {
          lat: shopLat,
          lng: shopLng,
          address: shopAddress
        },
        ownerId: user.uid,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      await updateDoc(doc(db, "users", user.uid), {
        orgName: shopName,
        orgAddress: shopAddress,
        orgLocation: { lat: shopLat, lng: shopLng }
      });
      alert("Shop profile updated!");
    } catch (e: any) {
      console.error(e);
      alert("Update failed: " + e.message);
    } finally { setIsUpdating(false); }
  };

  if (loading) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Loading Shop Profile...</div>;

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
                  {isLoaded ? (
                    <ModernAutocomplete 
                      value={shopAddress} 
                      onPlaceSelected={(addr, lat, lng) => {
                        setShopAddress(addr);
                        if (lat && lng) {
                          setShopLat(lat);
                          setShopLng(lng);
                        }
                      }} 
                    />
                  ) : (
                    <input type="text" value={shopAddress} onChange={e => setShopAddress(e.target.value)} style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white' }} />
                  )}
                </div>

                {isLoaded && shopLat && shopLng && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', color: '#888', fontSize: '0.65rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Fine-Tune Location (Click map to move pin)</label>
                    <div style={{ width: '100%', height: '250px', borderRadius: '15px', overflow: 'hidden', border: '1px solid #333' }}>
                      <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={{ lat: shopLat, lng: shopLng }}
                        zoom={17}
                        onClick={(e) => {
                          if (e.latLng) {
                            setShopLat(e.latLng.lat());
                            setShopLng(e.latLng.lng());
                          }
                        }}
                        options={{
                          mapId: import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID',
                          disableDefaultUI: true,
                          styles: [
                            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                          ]
                        }}
                      >
                        <AdvancedMarker 
                          position={{ lat: shopLat, lng: shopLng }} 
                          title="Shop HQ"
                          icon={{ path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, fillColor: '#ff6600', fillOpacity: 1, scale: 8, strokeColor: 'white', strokeWeight: 2 }}
                        />
                      </GoogleMap>
                    </div>
                    <div style={{ color: '#444', fontSize: '0.6rem', marginTop: '0.5rem', textAlign: 'center' }}>
                      Coordinates: {shopLat.toFixed(6)}, {shopLng.toFixed(6)}
                    </div>
                  </div>
                )}
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
