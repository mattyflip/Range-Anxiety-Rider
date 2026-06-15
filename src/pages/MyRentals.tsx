import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { query, where, onSnapshot, doc, updateDoc, collectionGroup } from 'firebase/firestore';
import NavBar from '../shared/ui/NavBar';
import SEO from '../shared/ui/SEO';
import Toast, { type ToastType } from '../shared/ui/Toast';
import ConfirmationModal from '../shared/ui/ConfirmationModal';
import AuthModal from '../features/auth/AuthModal';
import InstallTutorial from '../shared/ui/InstallTutorial';
import { useUserData } from '../hooks/useUserData';
import type { RentalRequest, RentalStatus } from '../types';

const STATUS_CONFIG: Record<RentalStatus, { label: string; color: string; bg: string }> = {
  pending: { label: '⏳ Pending', color: '#ffbb33', bg: 'rgba(255,187,51,0.1)' },
  approved: { label: '✅ Ready for Pickup', color: '#34a853', bg: 'rgba(52,168,83,0.1)' },
  declined: { label: '❌ Declined', color: '#ff4444', bg: 'rgba(255,68,68,0.1)' },
  active: { label: '🚴 Active Ride', color: '#4285F4', bg: 'rgba(66,133,244,0.1)' },
  completed: { label: '✓ Completed', color: '#888', bg: 'rgba(136,136,136,0.1)' },
  cancelled: { label: '🚫 Cancelled', color: '#666', bg: 'rgba(102,102,102,0.1)' },
};

const MyRentals: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useUserData();
  const [rentals, setRentals] = useState<RentalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  const handleShowAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const [selectedRental, setSelectedRental] = useState<RentalRequest | null>(null);

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

  const showToast = (message: string, type: ToastType = 'info') => {
    setToastMessage(message);
    setToastType(type);
  };

  const [authChecked, setAuthChecked] = useState(false);
  if (!authLoading && !authChecked) {
    setAuthChecked(true);
    if (!user) {
      setShowAuthModal(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !user) return;

    // Fetch all rental requests where this user is the rider across all shops
    const qRequests = query(
      collectionGroup(db, 'rental_requests'), 
      where("riderId", "==", user.uid)
    );

    const unsubRequests = onSnapshot(qRequests, (reqSnap) => {
      const allRentals = reqSnap.docs.map(d => ({
        id: d.id,
        shopId: d.ref.parent.parent?.id || '',
        ...d.data()
      } as RentalRequest));
      
      // Sort by createdAt
      allRentals.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      
      setRentals(allRentals);
      setLoading(false);
    }, (error) => {
      console.error("Failed to load rentals:", error);
      setLoading(false);
    });

    return () => unsubRequests();
  }, [user, authLoading]);

  const handleCancelRequest = async (rental: RentalRequest) => {
    setConfirmation({
      title: "Cancel Rental?",
      message: "Are you sure you want to cancel this rental request?",
      confirmText: "Cancel Request",
      isDestructive: true,
      onConfirm: async () => {
        setConfirmation(null);
        try {
          await updateDoc(doc(db, `organizations/${rental.shopId}/rental_requests`, rental.id), {
            status: 'cancelled'
          });
          showToast('Rental request cancelled.', 'success');
        } catch (e) {
          console.error('Failed to cancel:', e);
          showToast('Failed to cancel request.', 'error');
        }
      }
    });
  };

  const pendingCount = rentals.filter(r => r.status === 'pending').length;
  const approvedCount = rentals.filter(r => r.status === 'approved').length;
  const activeCount = rentals.filter(r => r.status === 'active').length;

  const renderRentalCard = (rental: RentalRequest) => {
    const config = STATUS_CONFIG[rental.status] || { label: `Unknown: ${rental.status}`, color: '#fff', bg: '#333' };
    
    return (
      <div 
        key={`${rental.shopId}-${rental.id}`}
        onClick={() => rental.status === 'approved' && setSelectedRental(rental)}
        style={{
          background: '#1a1a1a',
          padding: '1.5rem',
          borderRadius: '16px',
          border: '1px solid #333',
          marginBottom: '1rem',
          cursor: rental.status === 'approved' ? 'pointer' : 'default',
          opacity: rental.status === 'cancelled' || rental.status === 'declined' ? 0.6 : 1
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'white' }}>{rental.unitId}</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>{rental.shopName}</div>
          </div>
          <div style={{ 
            background: config.bg, 
            color: config.color, 
            padding: '0.4rem 0.8rem', 
            borderRadius: '20px', 
            fontSize: '0.7rem', 
            fontWeight: 'bold'
          }}>
            {config.label}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
          <div style={{ background: '#111', padding: '0.8rem', borderRadius: '8px' }}>
            <div style={{ color: '#666', fontSize: '0.65rem', textTransform: 'uppercase' }}>Date</div>
            <div style={{ color: 'white', fontWeight: 'bold' }}>{rental.rentalDate}</div>
          </div>
          <div style={{ background: '#111', padding: '0.8rem', borderRadius: '8px' }}>
            <div style={{ color: '#666', fontSize: '0.65rem', textTransform: 'uppercase' }}>Time</div>
            <div style={{ color: 'white', fontWeight: 'bold' }}>{rental.pickupTime} - {rental.returnTime}</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#ff6600', fontWeight: 'bold', fontSize: '1.2rem' }}>
            ${rental.totalPrice?.toFixed(2) || '0.00'}
            <span style={{ color: '#666', fontSize: '0.7rem', fontWeight: 'normal' }}>
              {' '}({rental.duration}h @ ${rental.pricePerHour}/hr)
            </span>
          </div>

          {rental.status === 'pending' && (
            <button 
              onClick={(e) => { e.stopPropagation(); handleCancelRequest(rental); }}
              style={{ 
                background: 'transparent', 
                border: '1px solid #ff4444', 
                color: '#ff4444', 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                fontSize: '0.7rem', 
                cursor: 'pointer' 
              }}
            >
              Cancel
            </button>
          )}

          {rental.status === 'approved' && (
            <div style={{ color: '#34a853', fontSize: '0.8rem' }}>
              Tap for QR Code →
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading || authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#121212', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6600' }}>
        Loading your rentals...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO title="My Rentals" />
      <NavBar user={user} onShowInstall={() => setShowInstallTutorial(true)} onShowAuth={handleShowAuth} />

      <main style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem 1rem' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#ff6600', margin: 0 }}>MY RENTALS</h1>
          <p style={{ color: '#888', marginTop: '0.5rem' }}>Track your bike rentals</p>
        </header>

        {/* Summary Stats */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1, background: '#1a1a1a', padding: '1rem', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ffbb33' }}>{pendingCount}</div>
            <div style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase' }}>Pending</div>
          </div>
          <div style={{ flex: 1, background: '#1a1a1a', padding: '1rem', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#34a853' }}>{approvedCount}</div>
            <div style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase' }}>Ready</div>
          </div>
          <div style={{ flex: 1, background: '#1a1a1a', padding: '1rem', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4285F4' }}>{activeCount}</div>
            <div style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase' }}>Active</div>
          </div>
        </div>

        {rentals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: '#666' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚲</div>
            <h2 style={{ color: '#888' }}>No rentals yet</h2>
            <p style={{ color: '#666', marginBottom: '2rem' }}>Find a shop and book your first ride!</p>
            <button 
              onClick={() => navigate('/rent')}
              style={{ 
                background: '#ff6600', 
                color: 'white', 
                border: 'none', 
                padding: '1rem 2rem', 
                borderRadius: '12px', 
                fontWeight: 'bold', 
                cursor: 'pointer' 
              }}
            >
              Browse Shops
            </button>
          </div>
        ) : (
          <div>
            {rentals.map(renderRentalCard)}
          </div>
        )}
      </main>

      {/* QR Code Modal */}
      {selectedRental && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(0,0,0,0.95)', 
            zIndex: 10000, 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '24px', border: '1px solid #34a853', maxWidth: '350px', width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎫</div>
            <h2 style={{ color: '#34a853', marginBottom: '0.5rem' }}>Ready for Pickup!</h2>
            <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '2rem' }}>
              Show this QR code or PIN at {selectedRental.shopName}
            </p>

            {/* QR Code Placeholder */}
            <div style={{ 
              background: 'white', 
              padding: '1rem', 
              borderRadius: '12px', 
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{ 
                width: '150px', 
                height: '150px', 
                background: '#121212',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '0.7rem'
              }}>
                {/* QR code would render here - using placeholder */}
                <svg viewBox="0 0 100 100" width="150" height="150">
                  <rect x="10" y="10" width="30" height="30" fill="#121212"/>
                  <rect x="60" y="10" width="30" height="30" fill="#121212"/>
                  <rect x="10" y="60" width="30" height="30" fill="#121212"/>
                  <rect x="50" y="50" width="20" height="20" fill="#121212"/>
                  <rect x="80" y="60" width="10" height="10" fill="#121212"/>
                  <rect x="60" y="80" width="10" height="10" fill="#121212"/>
                  <rect x="20" y="20" width="10" height="10" fill="white"/>
                  <rect x="20" y="40" width="10" height="10" fill="white"/>
                  <rect x="70" y="20" width="10" height="10" fill="white"/>
                  <rect x="70" y="40" width="10" height="10" fill="white"/>
                  <rect x="20" y="70" width="10" height="10" fill="white"/>
                  <rect x="40" y="50" width="10" height="10" fill="white"/>
                  <rect x="50" y="50" width="10" height="10" fill="white"/>
                  <rect x="60" y="50" width="10" height="10" fill="white"/>
                </svg>
              </div>
            </div>

            {/* PIN Code */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ color: '#666', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Or enter PIN</div>
              <div style={{ 
                background: '#111', 
                padding: '1rem', 
                borderRadius: '12px', 
                fontSize: '2rem', 
                fontWeight: 'bold', 
                color: 'white',
                letterSpacing: '0.3em'
              }}>
                {selectedRental.pin || '1234'}
              </div>
            </div>

            {/* Details */}
            <div style={{ background: '#111', padding: '1rem', borderRadius: '12px', textAlign: 'left', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#666' }}>Bike</span>
                <span style={{ color: 'white' }}>{selectedRental.unitId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#666' }}>Date</span>
                <span style={{ color: 'white' }}>{selectedRental.rentalDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Time</span>
                <span style={{ color: 'white' }}>{selectedRental.pickupTime}</span>
              </div>
            </div>

            <button 
              onClick={() => setSelectedRental(null)}
              style={{ 
                width: '100%', 
                padding: '1rem', 
                background: 'transparent', 
                border: '1px solid #333', 
                color: '#888', 
                borderRadius: '12px', 
                cursor: 'pointer' 
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => { setShowAuthModal(false); navigate('/'); }} initialMode={authMode} />}
      {showInstallTutorial && <InstallTutorial onClose={() => setShowInstallTutorial(false)} />}
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

export default MyRentals;