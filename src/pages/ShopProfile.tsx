import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, auth } from '../firebase'
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { useJsApiLoader, GoogleMap } from '@react-google-maps/api'
import NavBar from '../shared/ui/NavBar'
import ModernAutocomplete from '../features/map/ModernAutocomplete'
import AdvancedMarker from '../features/map/AdvancedMarker'
import SEO from '../shared/ui/SEO'
import Toast, { type ToastType } from '../shared/ui/Toast'
import ConfirmationModal from '../shared/ui/ConfirmationModal'
import type { Organization } from '../types';
import { useUserData } from '../hooks/useUserData';

const LIBRARIES: ("places" | "geometry" | "marker")[] = ["places", "geometry", "marker"];

const ShopProfile: React.FC = () => {
  const navigate = useNavigate();
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", libraries: LIBRARIES });
  const { user, userData, loading: authLoading } = useUserData();

  // Shop Profile states
  const [shopName, setShopName] = useState('');
  const [shopBio, setShopBio] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopLat, setShopLat] = useState<number | null>(null);
  const [shopLng, setShopLng] = useState<number | null>(null);
  const [shopPhone, setShopPhone] = useState('');
  const [shopEmail, setShopEmail] = useState('');
  
  // Pricing states
  const [pricePerHour, setPricePerHour] = useState('');
  const [pricePerDay, setPricePerDay] = useState('');
  const [minimumCharge, setMinimumCharge] = useState('');
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('18:00');
  
  const [isUpdating, setIsUpdating] = useState(false);
  const isShopTier = userData?.isShopTier || false;
  const shopTierExpiresAt = userData?.shopTierExpiresAt?.toDate?.() || null;

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<ToastType>('info');

  // Confirmation state
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  } | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToastMessage(message);
    setToastType(type);
  }, []);

  const handleShopUpgrade = async () => {
    if (!user) return;
    try {
      showToast("Forwarding to secure checkout...", "info");
      const idToken = await user.getIdToken();
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.uid,
          tier: 'shop'
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Checkout failed');
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (e: any) {
      console.error(e);
      showToast(e.message || "Failed to initiate checkout", "error");
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setConfirmation({
      title: "Delete Account?",
      message: "This will permanently delete your shop profile, organization, and all fleet data. This cannot be undone. Are you sure?",
      confirmText: "Delete Permanently",
      isDestructive: true,
      onConfirm: async () => {
        setConfirmation(null);
        setIsUpdating(true);
        try {
          const idToken = await user.getIdToken();
          const response = await fetch('/api/delete-account', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            showToast("Account deleted successfully.", "success");
            setTimeout(() => navigate('/'), 2000);
          } else {
            const res = await response.json();
            throw new Error(res.error || 'Deletion failed');
          }
        } catch (e: any) {
          console.error(e);
          showToast(`Error: ${e.message}`, "error");
        } finally {
          setIsUpdating(false);
        }
      }
    });
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/'); return; }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (userData?.orgId && userData?.role === 'fleet') {
      getDoc(doc(db, "organizations", userData.orgId)).then(snap => {
        if (snap.exists()) {
          const d = snap.data() as Organization;
          setShopName(d.name || '');
          setShopBio(d.bio || '');
          setShopAddress(d.address || '');
          setShopLat(d.location?.lat || null);
          setShopLng(d.location?.lng || null);
          setShopPhone(d.phone || '');
          setShopEmail(d.email || '');
          // Load pricing
          setPricePerHour(d.pricing?.pricePerHour?.toString() || '25');
          setPricePerDay(d.pricing?.pricePerDay?.toString() || '100');
          setMinimumCharge(d.pricing?.minimumCharge?.toString() || '15');
          setOpenTime(d.hours?.open || '09:00');
          setCloseTime(d.hours?.close || '18:00');
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
        phone: shopPhone,
        email: shopEmail,
        hours: {
          open: openTime,
          close: closeTime
        },
        pricing: {
          pricePerHour: parseFloat(pricePerHour) || 25,
          pricePerDay: parseFloat(pricePerDay) || 100,
          minimumCharge: parseFloat(minimumCharge) || 15
        },
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      await updateDoc(doc(db, "users", user.uid), {
        orgName: shopName,
        orgAddress: shopAddress,
        orgLocation: { lat: shopLat, lng: shopLng }
      });
      showToast("Shop profile updated!", "success");
    } catch (e: any) {
      console.error(e);
      showToast("Update failed.", "error");
    } finally { setIsUpdating(false); }
  };

  if (authLoading) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Loading Shop Profile...</div>;

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
                    <div style={{ width: '100%', height: '250px', borderRadius: '15px', overflow: 'hidden', border: '1px solid #333', position: 'relative' }}>
                      <GoogleMap
                        mapContainerStyle={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        center={{ lat: shopLat, lng: shopLng }}
                        zoom={17}
                        onLoad={(map) => {
                          setTimeout(() => {
                            if (window.google) {
                              google.maps.event.trigger(map, 'resize');
                            }
                          }, 300);
                        }}
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
              </div>
            </section>

            {/* Pricing Section */}
            <section className="card" style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #34a853', marginBottom: '2rem' }}>
              <h2 style={{ color: '#34a853', fontSize: '1.2rem', marginBottom: '1.5rem' }}>💰 Rental Pricing</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Price/Hour ($)</label>
                    <input type="number" value={pricePerHour} onChange={e => setPricePerHour(e.target.value)} placeholder="25" style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white' }} />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Price/Day ($)</label>
                    <input type="number" value={pricePerDay} onChange={e => setPricePerDay(e.target.value)} placeholder="100" style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white' }} />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Minimum ($)</label>
                    <input type="number" value={minimumCharge} onChange={e => setMinimumCharge(e.target.value)} placeholder="15" style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Opening Time</label>
                    <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white' }} />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Closing Time</label>
                    <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} style={{ width: '100%', padding: '0.9rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white' }} />
                  </div>
                </div>
              </div>
            </section>

            <button onClick={handleUpdateShop} disabled={isUpdating} style={{ width: '100%', padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '1rem' }}>
              {isUpdating ? 'Saving...' : 'Update Shop Details'}
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <h2 style={{ color: 'white' }}>Personal settings can be edited in your Profile.</h2>
            <button onClick={() => navigate('/map')} style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Back to Map</button>
          </div>
        )}

        {isShopTier ? (
          <section className="card" style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #333', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ color: 'white', fontSize: '1.1rem', margin: 0 }}>Subscription: SHOP TIER</h2>
                <p style={{ color: '#888', fontSize: '0.8rem', margin: '5px 0 0 0' }}>Professional fleet features active until {shopTierExpiresAt?.toLocaleDateString()}</p>
              </div>
              <div style={{ fontSize: '2rem' }}>🏬</div>
            </div>
          </section>
        ) : (
          <section className="card" style={{ background: 'linear-gradient(135deg, #1a1a1a, #221000)', padding: '2rem', borderRadius: '24px', border: '2px solid rgba(255,102,0,0.5)', marginBottom: '2rem', textAlign: 'center' }}>
            <h2 style={{ color: 'white', fontSize: '1.5rem', margin: '0 0 0.5rem 0' }}>Unlock Fleet Hub</h2>
            <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Subscribe to the Shop Tier ($49.99/mo) to access real-time tracking, rental management, and more.</p>
            <button onClick={handleShopUpgrade} style={{ padding: '0.8rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Subscribe Now</button>
          </section>
        )}

        <section style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid #222', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
           <button onClick={() => signOut(auth).then(() => navigate('/'))} style={{ width: '100%', padding: '1rem', background: '#222', color: 'white', border: '1px solid #333', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Sign Out</button>
           <button onClick={handleDeleteAccount} style={{ width: '100%', padding: '1rem', background: 'transparent', color: '#666', border: 'none', fontSize: '0.8rem', cursor: 'pointer' }}>Delete Account</button>
        </section>
      </main>

      {toastMessage && <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} />}
      {confirmation && (
        <ConfirmationModal
          title={confirmation.title}
          message={confirmation.message}
          confirmText={confirmation.confirmText}
          isDestructive={confirmation.isDestructive}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </div>
  );
};

export default ShopProfile;
