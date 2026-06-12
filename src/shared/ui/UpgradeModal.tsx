import React from 'react';

interface UpgradeModalProps {
  title: string;
  message: string;
  featureName: string;
  onClose: () => void;
  onUpgrade: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({
  title,
  message,
  featureName,
  onClose,
  onUpgrade
}) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      zIndex: 25000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem'
    }}>
      <div style={{
        backgroundColor: '#1e1e1e',
        color: 'white',
        padding: '2.5rem',
        borderRadius: '28px',
        maxWidth: '450px',
        width: '100%',
        border: '2px solid #ff6600',
        textAlign: 'center',
        boxShadow: '0 20px 50px rgba(255, 102, 0, 0.2)'
      }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1.5rem' }}>🚀</div>
        <h2 style={{ marginTop: 0, marginBottom: '1rem', color: '#ff6600', fontSize: '1.5rem' }}>{title}</h2>
        <p style={{ color: '#ccc', lineHeight: '1.6', fontSize: '1rem', marginBottom: '2rem' }}>
          {message || `Unlock ${featureName} and other professional tools with a Range Anxiety Pro subscription.`}
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button 
            onClick={onUpgrade}
            style={{
              padding: '1.2rem',
              backgroundColor: '#ff6600',
              color: 'white',
              border: 'none',
              borderRadius: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '1.1rem',
              boxShadow: '0 4px 15px rgba(255, 102, 0, 0.3)'
            }}
          >
            Upgrade to Pro — $4.99
          </button>
          <button 
            onClick={onClose}
            style={{
              padding: '1rem',
              backgroundColor: 'transparent',
              color: '#888',
              border: 'none',
              borderRadius: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Maybe Later
          </button>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #333' }}>
          <p style={{ fontSize: '0.75rem', color: '#666', margin: 0 }}>
            Includes: Unlimited Garage, 3D Route Flyover, Early Access Physics, and Offline Maps.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
