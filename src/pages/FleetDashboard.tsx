import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, storage } from '../firebase'
import { doc, collection, onSnapshot, query, updateDoc, setDoc, deleteDoc, getDocs, where } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { sendEmail } from '../utils/email'
import NavBar from '../shared/ui/NavBar'
import SEO from '../shared/ui/SEO'
import type { Bike, LiveUnit, Notification } from '../types';
import { useUserData } from '../hooks/useUserData';

const FleetDashboard = () => {
  const navigate = useNavigate();
  const { user, userData, loading: authLoading } = useUserData();
  const [userRole, setUserRole] = useState<'rider' | 'fleet'>('rider');
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  
  const [fleetBikes, setFleetBikes] = useState<Bike[]>([]);
  const [liveUnits, setLiveUnits] = useState<LiveUnit[]>([]);
  const [alerts, setAlerts] = useState<Notification[]>([]);
  const [rentalRequests, setRentalRequests] = useState<any[]>([]);
  
  // Direct Assignment State
  const [showDirectAssignModal, setShowDirectAssignModal] = useState(false);
  const [targetRiderEmail, setTargetRiderEmail] = useState('');
  const [bikeToAssign, setBikeToAssign] = useState<Bike | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // Bike Edit Modal State
  const [showBikeModal, setShowShowBikeModal] = useState(false);
  const [editingBike, setEditingBike] = useState<Bike | null>(null);
  const [bikeForm, setBikeForm] = useState({
    unitId: '',
    voltage: '48',
    capacityAh: '15',
    capacityUnit: 'Ah',
    motorWatts: '750',
    tirePSI: '30',
    tireType: 'all-terrain',
    driveMode: 'both',
    bikeWeightLbs: '65',
    targetSpeedMph: '20',
    controllerAmps: '',
    cycleCount: '0',
    imageUrl: ''
  });

  // Auth & Org Initialization
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/'); return; }

    const d = userData;
    if (d) {
      const isAdmin = d.isAdmin === true;
      const role = isAdmin ? 'fleet' : (d.role || 'rider');
      setUserRole(role);
      
      // Auto-setup org for new fleet users
      if (role === 'fleet' && !d.orgId) {
        const newOrgId = 'org_' + user.uid.substring(0, 8);
        updateDoc(doc(db, "users", user.uid), { orgId: newOrgId }).then(() => {
           // userData is already synced via hook
        });
      }
    }
    setLoading(false);
  }, [user, userData, authLoading, navigate]);

  // Fleet Listeners
  useEffect(() => {
    if (!userData?.orgId || userRole !== 'fleet') return;

    const qBikes = query(collection(db, `organizations/${userData.orgId}/bikes`));
    const unsubBikes = onSnapshot(qBikes, (snap) => {
      setFleetBikes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bike)));
    });

    const qLive = query(collection(db, `organizations/${userData.orgId}/live_units`));
    const unsubLive = onSnapshot(qLive, (snap) => {
      setLiveUnits(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiveUnit)));
    });

    const qAlerts = query(collection(db, `users/${user?.uid}/notifications`), where('type', '==', 'fleet_alert'), where('read', '==', false));
    const unsubAlerts = onSnapshot(qAlerts, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      setAlerts(data.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });

    const qRequests = query(collection(db, `organizations/${userData.orgId}/rental_requests`), where('status', '==', 'pending'));
    const unsubRequests = onSnapshot(qRequests, (snap) => {
      setRentalRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubBikes(); unsubLive(); unsubAlerts(); unsubRequests(); };
  }, [userData?.orgId, userRole, user?.uid]);

  const handleUpdateReqNotes = async (requestId: string, notes: string) => {
    if (!userData?.orgId) return;
    try {
      await updateDoc(doc(db, `organizations/${userData.orgId}/rental_requests`, requestId), { 
        shopNotes: notes 
      });
    } catch (e) { console.error("Failed to update notes", e); }
  };

  const handleDismissAlert = async (alertId: string) => {
    try {
      await updateDoc(doc(db, `users/${user?.uid}/notifications`, alertId), { read: true });
    } catch (e) { console.error(e); }
  };

  // Generate a 4-digit PIN
  const generatePIN = () => Math.floor(1000 + Math.random() * 9000).toString();

  // Generate a simple QR code string (could be encoded data)
  const generateQRCode = (request: any) => {
    return `RAR-${request.id.slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
  };

  const handleApproveRequest = async (request: any) => {
    if (!userData?.orgId) return;
    try {
      const now = new Date().toISOString();
      const pin = generatePIN();
      const qrCode = generateQRCode(request);

      // 1. Mark request as approved with QR/PIN
      await updateDoc(doc(db, `organizations/${userData.orgId}/rental_requests`, request.id), { 
        status: 'approved',
        approvedAt: now,
        qrCode,
        pin
      });

      // 2. Mark bike as rented and link to rider UID
      await updateDoc(doc(db, `organizations/${userData.orgId}/bikes`, request.bikeId), { 
        status: 'rented',
        currentRiderId: request.riderId,
        rentedAt: now
      });

      // 3. Initialize Live Unit
      await setDoc(doc(db, `organizations/${userData.orgId}/live_units`, request.riderId), {
        unitName: request.unitId,
        bikeId: request.bikeId,
        status: 'rented',
        lastSeen: Date.now()
      });

      // 4. Update user's active rental
      await updateDoc(doc(db, "users", request.riderId), {
        activeRental: {
          shopId: userData.orgId,
          bikeId: request.bikeId,
          unitId: request.unitId,
          rentedAt: now
        },
        orgId: userData.orgId
      });

      // 5. Send notification to rider
      const { createNotification } = await import('../utils/notifications');
      await createNotification(
        request.riderId,
        userData.orgId,
        userData.orgName || 'Shop',
        'rental_approved',
        request.bikeId,
        `Your rental for ${request.unitId} is ready! PIN: ${pin}`
      );

      alert(`✅ Rental approved! QR code and PIN sent to rider.`);
    } catch (e) { 
      console.error(e); 
      alert('Failed to approve rental.');
    }
  };

  const handleDeclineRequest = async (request: any, reason?: string) => {
    if (!userData?.orgId) return;
    try {
      await updateDoc(doc(db, `organizations/${userData.orgId}/rental_requests`, request.id), {
        status: 'declined',
        declinedReason: reason || 'No reason provided'
      });

      // Send notification
      const { createNotification } = await import('../utils/notifications');
      await createNotification(
        request.riderId,
        userData.orgId,
        userData.orgName || 'Shop',
        'rental_declined',
        request.bikeId,
        `Your rental request for ${request.unitId} was declined. ${reason ? `Reason: ${reason}` : ''}`
      );

      alert('Rental request declined.');
    } catch (e) { 
      console.error(e); 
    }
  };

  // Keep old function for backward compat but mark deprecated
  const handleAssignRider = async (request: any) => {
    await handleApproveRequest(request);
  };

  const handleReturnBike = async (bike: Bike) => {
    if (!userData?.orgId) return;
    try {
      // 1. Update bike status in master list
      const bikeRef = doc(db, `organizations/${userData.orgId}/bikes`, bike.id);
      await updateDoc(bikeRef, { 
        status: 'available',
        currentRiderId: null 
      });

      // 2. Remove from live units and cleanup user active rental
      const q = query(collection(db, `organizations/${userData.orgId}/live_units`), where("bikeId", "==", bike.id));
      const liveSnap = await getDocs(q);
      const deletePromises = liveSnap.docs.map(async (d) => {
        const riderUid = d.id;
        await deleteDoc(doc(db, `organizations/${userData.orgId}/live_units`, riderUid));
        await updateDoc(doc(db, "users", riderUid), {
          activeRental: null,
          orgId: null
        });
      });
      await Promise.all(deletePromises);

      alert(`${bike.unitId} returned to inventory.`);
    } catch (e) { console.error(e); }
  };

  const handleDirectRentOut = async () => {
    if (!userData?.orgId || !bikeToAssign || !targetRiderEmail.trim()) return;
    setIsAssigning(true);
    try {
      // 1. Find user by email
      const q = query(collection(db, "users"), where("email", "==", targetRiderEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        alert("No user found with that email. Please ensure the rider has created an account.");
        return;
      }

      const riderDoc = snap.docs[0];
      const riderData = riderDoc.data();
      const riderId = riderDoc.id;

      const rentalDate = new Date().toISOString();

      // 2. Link bike to rider UID
      await updateDoc(doc(db, `organizations/${userData.orgId}/bikes`, bikeToAssign.id), { 
        status: 'rented',
        currentRiderId: riderId,
        rentedAt: rentalDate
      });

      // 3. Initialize Live Unit
      await setDoc(doc(db, `organizations/${userData.orgId}/live_units`, riderId), {
        unitName: bikeToAssign.unitId,
        bikeId: bikeToAssign.id,
        status: 'rented',
        lastSeen: Date.now()
      });

      // 4. Update user's active rental
      await updateDoc(doc(db, "users", riderId), {
        activeRental: {
          shopId: userData.orgId,
          bikeId: bikeToAssign.id,
          unitId: bikeToAssign.unitId,
          rentedAt: rentalDate
        },
        orgId: userData.orgId
      });

      // 5. Send Confirmation Email to Rider
      try {
        await sendEmail({
          to: targetRiderEmail.trim().toLowerCase(),
          subject: `🚲 Rental Started: ${bikeToAssign.unitId}`,
          text: `Your rental at ${userData.orgName || 'the shop'} has started! Your assigned bike is ${bikeToAssign.unitId}. View your live range and route planner here: https://rangeanxietyrider.com/map`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
              <h2 style="color: #ff6600;">Let's Ride!</h2>
              <p>Your rental session for <strong>${bikeToAssign.unitId}</strong> is now active.</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Shop:</strong> ${userData.orgName || 'E-Bike King'}</p>
                <p style="margin: 5px 0 0 0;"><strong>Bike:</strong> ${bikeToAssign.unitId}</p>
              </div>
              <a href="https://rangeanxietyrider.com/map" style="display: inline-block; padding: 12px 25px; background: #ff6600; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">OPEN NAVIGATION MAP</a>
              <p style="margin-top: 25px; font-size: 0.8rem; color: #888;">*Range estimates are for reference only. Ride safely!</p>
            </div>
          `
        });
      } catch (emailErr) {
        console.error("Confirmation email failed (non-critical):", emailErr);
      }

      alert(`Bike ${bikeToAssign.unitId} assigned to ${riderData.username || targetRiderEmail}!`);
      setShowDirectAssignModal(false);
      setTargetRiderEmail('');
      setBikeToAssign(null);
    } catch (e: any) {
      console.error(e);
      alert("Assignment failed: " + e.message);
    } finally { setIsAssigning(false); }
  };

  const handleUpdateBattery = async (bike: Bike, percent: number) => {
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

  const handleImageUpload = async (file: File) => {
    if (!user) return;
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `bikes/${user.uid}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      setBikeForm({ ...bikeForm, imageUrl: url });
      alert("Photo uploaded successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to upload photo.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveBikeSpecs = async () => {
    if (!userData?.orgId || !bikeForm.unitId.trim()) return;
    const bikeId = editingBike?.id || Date.now().toString();
    try {
      let finalCapacityAh = parseFloat(bikeForm.capacityAh);
      if (bikeForm.capacityUnit === 'Wh') {
        const v = parseFloat(bikeForm.voltage) || 48;
        finalCapacityAh = finalCapacityAh / v;
      }

      await setDoc(doc(db, `organizations/${userData.orgId}/bikes`, bikeId), {
        unitId: bikeForm.unitId,
        imageUrl: bikeForm.imageUrl || '',
        specs: {
          voltage: parseFloat(bikeForm.voltage),
          capacityAh: finalCapacityAh,
          capacityUnit: bikeForm.capacityUnit,
          originalCapacityInput: parseFloat(bikeForm.capacityAh),
          motorWatts: parseFloat(bikeForm.motorWatts),
          tirePSI: parseFloat(bikeForm.tirePSI),
          tireType: bikeForm.tireType,
          driveMode: bikeForm.driveMode,
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

  const openEditModal = (bike: Bike) => {
    setEditingBike(bike);
    setBikeForm({
      unitId: bike.unitId,
      voltage: bike.specs.voltage?.toString() || '48',
      capacityAh: bike.specs.originalCapacityInput?.toString() || bike.specs.capacityAh?.toString() || '15',
      capacityUnit: bike.specs.capacityUnit || 'Ah',
      motorWatts: bike.specs.motorWatts?.toString() || '750',
      tirePSI: bike.specs.tirePSI?.toString() || '30',
      tireType: bike.specs.tireType || 'all-terrain',
      driveMode: bike.specs.driveMode || 'both',
      bikeWeightLbs: bike.specs.bikeWeightLbs?.toString() || '65',
      targetSpeedMph: bike.specs.targetSpeedMph?.toString() || '20',
      controllerAmps: bike.specs.controllerAmps?.toString() || '',
      cycleCount: bike.specs.cycleCount?.toString() || '0',
      imageUrl: bike.imageUrl || ''
    });
    setShowShowBikeModal(true);
  };

  const handleTestEmail = async () => {
    if (!user?.email) return;
    try {
      await sendEmail({
        to: user.email,
        subject: "📧 Email System Test - Range Anxiety Rider",
        text: "If you are reading this, your professional email domain (Info@rangeanxietyrider.com) is correctly configured and working through Resend!",
        html: `
          <div style="font-family: sans-serif; padding: 20px; background: #f9f9f9;">
            <h2 style="color: #ff6600;">System Diagnostic: SUCCESS</h2>
            <p>Your professional email domain is now active.</p>
            <hr/>
            <p style="font-size: 0.8rem; color: #666;">Sent from Range Anxiety Rider Platform</p>
          </div>
        `
      });
      alert("Success! Check your inbox (and spam folder) for the test email.");
    } catch (e: any) {
      console.error(e);
      alert("Email Failed: " + e.message + "\n\nTip: Ensure your RESEND_API_KEY is in Vercel and your domain is verified in Resend.");
    }
  };

  if (loading) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>Loading Fleet Data...</div>;

  const rentedBikes = fleetBikes.filter(b => b.status === 'rented');
  const availableBikes = fleetBikes.filter(b => b.status === 'available');
  const lowBatteryBikes = fleetBikes.filter(b => (b.specs?.currentBatteryPercent || 0) < 30);

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white', overflowY: 'auto' }}>
      <SEO title="Shop Dashboard" />
      <NavBar user={user} onShowInstall={() => {}} onShowAuth={() => {}} />

      <main style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: '1 1 300px' }}>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: '#ff6600', textTransform: 'uppercase' }}>Fleet Hub</h1>
            <div style={{ color: '#888', fontWeight: 'bold' }}>{userData?.orgName || 'Bike Shop'} Management</div>
          </div>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            <button 
              onClick={handleTestEmail}
              style={{ padding: '0.8rem 1.2rem', background: '#222', color: '#888', border: '1px solid #333', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              📧 TEST EMAIL
            </button>
            <button 
              onClick={() => { setEditingBike(null); setBikeForm({ unitId: '', voltage: '48', capacityAh: '15', capacityUnit: 'Ah', motorWatts: '750', tirePSI: '30', tireType: 'all-terrain', driveMode: 'both', bikeWeightLbs: '65', targetSpeedMph: '20', controllerAmps: '', cycleCount: '0', imageUrl: '' }); setShowShowBikeModal(true); }}
              style={{ padding: '0.8rem 1.5rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              + REGISTER BIKE
            </button>
          </div>
        </header>

        {/* KPI Dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          {[
            { label: 'TOTAL FLEET', val: fleetBikes.length, color: 'white' },
            { label: 'RENTED OUT', val: rentedBikes.length, color: '#ff6600' },
            { label: 'AVAILABLE', val: availableBikes.length, color: '#34a853' },
            { label: 'LOW BATTERY', val: lowBatteryBikes.length, color: '#ff4444' }
          ].map((kpi, i) => (
            <div key={i} style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '20px', border: '1px solid #333', textAlign: 'center' }}>
              <div style={{ color: '#666', fontSize: '0.65rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>{kpi.label}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: kpi.color }}>{kpi.val}</div>
            </div>
          ))}
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', color: '#ff4444', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚠️ SECURITY ALERTS ({alerts.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
               {alerts.map(alert => (
                 <div key={alert.id} style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444', padding: '1rem', borderRadius: '15px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', animation: 'pulse 2s infinite' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                       <span style={{ fontSize: '1.2rem' }}>🚨</span>
                       <div>
                          <div style={{ fontWeight: 'bold', color: 'white', fontSize: '0.9rem' }}>{alert.text}</div>
                          <div style={{ fontSize: '0.65rem', color: '#888' }}>{alert.fromName} • {new Date(alert.createdAt?.seconds * 1000).toLocaleTimeString()}</div>
                       </div>
                    </div>
                    <button 
                      onClick={() => handleDismissAlert(alert.id)}
                      style={{ background: '#ff4444', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem', width: '100%', maxWidth: '150px' }}
                    >
                      DISMISS
                    </button>
                 </div>
               ))}
            </div>
          </div>
        )}

        {/* Appointments Section */}
        {rentalRequests.length > 0 && (
          <div id="appointments" style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', color: '#34a853', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🗓️ BOOKING REQUESTS ({rentalRequests.length})
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
               {rentalRequests.map(req => (
                 <div key={req.id} style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '20px', border: '1px solid #333' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                       <div>
                          <div style={{ color: 'white', fontWeight: 900, fontSize: '1rem' }}>{req.riderName}</div>
                          <div style={{ color: '#888', fontSize: '0.65rem' }}>{new Date(req.createdAt?.seconds * 1000 || Date.now()).toLocaleString()}</div>
                       </div>
                       <div style={{ background: 'rgba(52,168,83,0.1)', color: '#34a853', padding: '3px 8px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 'bold', height: 'fit-content' }}>PENDING</div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
                       <div style={{ background: '#111', padding: '0.6rem', borderRadius: '10px', border: '1px solid #222' }}>
                          <div style={{ color: '#555', fontSize: '0.55rem', fontWeight: 'bold', marginBottom: '2px' }}>BIKE</div>
                          <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>{req.unitId}</div>
                       </div>
                       <div style={{ background: '#111', padding: '0.6rem', borderRadius: '10px', border: '1px solid #222' }}>
                          <div style={{ color: '#555', fontSize: '0.55rem', fontWeight: 'bold', marginBottom: '2px' }}>PICKUP</div>
                          <div style={{ color: '#ff6600', fontWeight: 'bold', fontSize: '0.8rem' }}>{req.rentalDate}</div>
                       </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                       <label style={{ display: 'block', color: '#555', fontSize: '0.55rem', fontWeight: 'bold', marginBottom: '4px' }}>INTERNAL SHOP NOTES</label>
                       <textarea 
                         placeholder="Add pickup notes..."
                         defaultValue={req.shopNotes || ''}
                         onBlur={(e) => handleUpdateReqNotes(req.id, e.target.value)}
                         style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: '8px', color: '#aaa', padding: '0.6rem', fontSize: '0.7rem', minHeight: '40px', resize: 'vertical' }}
                       />
                    </div>

                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                       <button 
                         onClick={() => handleAssignRider(req)}
                         style={{ flex: 1, padding: '0.7rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem' }}
                       >
                         APPROVE
                       </button>
                       <button 
                         onClick={() => handleDeclineRequest(req)}
                         style={{ padding: '0.7rem', background: '#333', color: '#ff4444', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem' }}
                       >
                         REJECT
                       </button>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Main Fleet List */}
          <section style={{ order: 2 }}>
            <h2 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📦 Inventory Management
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {fleetBikes.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', background: '#1a1a1a', borderRadius: '24px', border: '1px dashed #333', color: '#444' }}>No bikes in inventory.</div>
              ) : (
                fleetBikes.sort((a,b) => a.unitId.localeCompare(b.unitId)).map(b => (
                  <div key={b.id} style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '20px', border: '1px solid #333', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: '1 1 300px' }}>
                      <div style={{ width: '50px', height: '50px', borderRadius: '10px', background: '#222', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {b.imageUrl ? <img src={b.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.2rem' }}>🚲</span>}
                      </div>
                      <div style={{ minWidth: '80px' }}>
                        <div style={{ color: 'white', fontWeight: 900, fontSize: '1.1rem' }}>{b.unitId}</div>
                        <div style={{ fontSize: '0.55rem', color: b.status === 'rented' ? '#ff6600' : '#34a853', fontWeight: 'bold', textTransform: 'uppercase' }}>{b.status}</div>
                      </div>
                      
                      <div style={{ flex: 1, minWidth: '150px' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="number" 
                              value={b.specs.currentBatteryPercent} 
                              onChange={(e) => handleUpdateBattery(b, parseInt(e.target.value))}
                              style={{ width: '50px', background: '#111', border: '1px solid #333', color: 'white', padding: '4px', borderRadius: '6px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.8rem' }} 
                            />
                            <div style={{ flex: 1, height: '6px', background: '#222', borderRadius: '3px', overflow: 'hidden' }}>
                               <div style={{ width: `${b.specs.currentBatteryPercent}%`, height: '100%', background: (b.specs.currentBatteryPercent || 0) < 30 ? '#ff4444' : '#34a853' }} />
                            </div>
                         </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.6rem', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                      <button onClick={() => openEditModal(b)} style={{ background: '#222', border: '1px solid #333', color: '#888', padding: '0.5rem 0.8rem', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 'bold', cursor: 'pointer' }}>EDIT</button>
                      {b.status === 'available' ? (
                        <button onClick={() => { setBikeToAssign(b); setShowDirectAssignModal(true); }} style={{ background: 'rgba(52,168,83,0.1)', border: '1px solid #34a853', color: '#34a853', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 'bold', cursor: 'pointer' }}>RENT OUT</button>
                      ) : (
                        <button onClick={() => handleReturnBike(b)} style={{ background: 'rgba(255,102,0,0.1)', border: '1px solid #ff6600', color: '#ff6600', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 'bold', cursor: 'pointer' }}>RETURN</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Active Rentals Sidebar */}
          <aside style={{ order: 1 }}>
            <h2 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1.2rem' }}>🛰️ Active Units</h2>
            <div style={{ background: '#111', borderRadius: '24px', padding: '1.2rem', border: '1px solid #222' }}>
              {rentedBikes.length === 0 ? (
                <div style={{ color: '#444', fontSize: '0.75rem', textAlign: 'center', padding: '1rem' }}>No units in field.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                   {rentedBikes.map(b => {
                     const live = liveUnits.find(l => l.unitName === b.unitId);
                     return (
                       <div key={b.id} style={{ borderBottom: '1px solid #222', paddingBottom: '1rem' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{b.unitId}</div>
                            <div style={{ fontSize: '0.6rem', color: '#34a853' }}>{live ? '🛰️ LIVE' : '⌛ SYNC'}</div>
                         </div>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div style={{ background: '#1a1a1a', padding: '0.4rem', borderRadius: '8px' }}>
                               <div style={{ color: '#555', fontSize: '0.5rem', fontWeight: 'bold' }}>BATTERY</div>
                               <div style={{ color: (live?.battery || b.specs.currentBatteryPercent || 0) < 30 ? '#ff4444' : 'white', fontWeight: 900, fontSize: '0.9rem' }}>{live?.battery || b.specs.currentBatteryPercent}%</div>
                            </div>
                            <div style={{ background: '#1a1a1a', padding: '0.4rem', borderRadius: '8px' }}>
                               <div style={{ color: '#555', fontSize: '0.5rem', fontWeight: 'bold' }}>RANGE</div>
                               <div style={{ color: '#ff6600', fontWeight: 900, fontSize: '0.9rem' }}>{live?.milesRemaining ? `${live.milesRemaining.toFixed(1)} mi` : '--'}</div>
                            </div>
                         </div>
                       </div>
                     )
                   })}
                </div>
              )}
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
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Capacity (Ah or Wh)</label>
                   <div style={{ display: 'flex', gap: '0.5rem' }}>
                     <input type="number" value={bikeForm.capacityAh} onChange={e => setBikeForm({...bikeForm, capacityAh: e.target.value})} style={{ flex: 1, padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                     <select value={bikeForm.capacityUnit} onChange={e => setBikeForm({...bikeForm, capacityUnit: e.target.value})} style={{ width: '60px', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }}>
                       <option value="Ah">Ah</option>
                       <option value="Wh">Wh</option>
                     </select>
                   </div>
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Motor Watts</label>
                   <input type="number" value={bikeForm.motorWatts} onChange={e => setBikeForm({...bikeForm, motorWatts: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Tire Type</label>
                   <select value={bikeForm.tireType} onChange={e => setBikeForm({...bikeForm, tireType: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }}>
                     <option value="slick">Slick</option>
                     <option value="all-terrain">All-Terrain</option>
                     <option value="knobby">Knobby</option>
                   </select>
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Tire PSI</label>
                   <input type="number" value={bikeForm.tirePSI} onChange={e => setBikeForm({...bikeForm, tirePSI: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Drive Mode</label>
                   <select value={bikeForm.driveMode} onChange={e => setBikeForm({...bikeForm, driveMode: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }}>
                     <option value="throttle_only">Throttle Only</option>
                     <option value="pas_only">Pedal Assist Only</option>
                     <option value="both">Throttle + Pedal Assist</option>
                   </select>
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Bike Weight (lbs)</label>
                   <input type="number" value={bikeForm.bikeWeightLbs} onChange={e => setBikeForm({...bikeForm, bikeWeightLbs: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
                 <div>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Target Speed (mph)</label>
                   <input type="number" value={bikeForm.targetSpeedMph} onChange={e => setBikeForm({...bikeForm, targetSpeedMph: e.target.value})} style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#ff6600', fontWeight: 'bold' }} />
                 </div>
                 <div style={{ gridColumn: 'span 2' }}>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Bike Photo</label>
                   <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: '#111', padding: '1rem', borderRadius: '12px', border: '1px dashed #333' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '12px', background: '#222', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #333' }}>
                        {bikeForm.imageUrl ? (
                          <img src={bikeForm.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: '2rem' }}>🚲</span>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <input 
                          type="file" 
                          id="bike-photo-upload" 
                          hidden 
                          accept="image/*"
                          onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                        />
                        <button 
                          onClick={() => document.getElementById('bike-photo-upload')?.click()}
                          disabled={isUploading}
                          style={{ background: '#222', border: '1px solid #444', color: 'white', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
                        >
                          {isUploading ? 'UPLOADING...' : (bikeForm.imageUrl ? 'CHANGE PHOTO' : 'UPLOAD PHOTO')}
                        </button>
                        <div style={{ color: '#444', fontSize: '0.6rem', marginTop: '0.5rem', textAlign: 'center' }}>PNG, JPG up to 5MB</div>
                      </div>
                   </div>
                 </div>
                 <div style={{ gridColumn: 'span 2' }}>
                   <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Bike Image URL (Optional)</label>
                   <input value={bikeForm.imageUrl} onChange={e => setBikeForm({...bikeForm, imageUrl: e.target.value})} placeholder="https://..." style={{ width: '100%', padding: '0.8rem', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                 </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                 <button onClick={handleSaveBikeSpecs} style={{ flex: 1, padding: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>SAVE CHANGES</button>
                 <button onClick={() => setShowShowBikeModal(false)} style={{ padding: '1rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>CANCEL</button>
              </div>
           </div>
        </div>
      )}
      {/* Direct Assignment Modal */}
      {showDirectAssignModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1a1a1a', width: '100%', maxWidth: '450px', borderRadius: '32px', padding: '2.5rem', border: '1px solid #34a853', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚲</div>
            <h2 style={{ color: 'white', margin: 0 }}>Rent Out {bikeToAssign?.unitId}</h2>
            <p style={{ color: '#888', marginTop: '0.5rem', fontSize: '0.9rem' }}>Enter the rider's email to securely link this bike to their account.</p>
            
            <div style={{ marginTop: '2rem', textAlign: 'left' }}>
              <label style={{ display: 'block', color: '#666', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Rider Email Address</label>
              <input 
                type="email" 
                value={targetRiderEmail}
                onChange={e => setTargetRiderEmail(e.target.value)}
                placeholder="rider@example.com"
                style={{ width: '100%', padding: '1rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white', fontSize: '1rem' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2.5rem' }}>
              <button 
                onClick={handleDirectRentOut}
                disabled={isAssigning || !targetRiderEmail.trim()}
                style={{ width: '100%', padding: '1.2rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '15px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer', opacity: isAssigning ? 0.6 : 1 }}
              >
                {isAssigning ? 'VERIFYING RIDER...' : 'AUTHORIZE RENTAL'}
              </button>
              <button 
                onClick={() => { setShowDirectAssignModal(false); setTargetRiderEmail(''); }}
                style={{ width: '100%', padding: '1rem', background: 'transparent', color: '#666', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
              >
                CANCEL
              </button>
            </div>
            
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#111', borderRadius: '12px', border: '1px solid #222' }}>
              <p style={{ fontSize: '0.65rem', color: '#444', margin: 0 }}>
                *The rider must have an active Range Anxiety account. Ask them to register on their phone if they haven't yet.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetDashboard;
