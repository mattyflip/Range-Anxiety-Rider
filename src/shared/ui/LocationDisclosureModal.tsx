import React from 'react';

interface LocationDisclosureModalProps {
  onAccept: () => void;
  onCancel: () => void;
}

const LocationDisclosureModal: React.FC<LocationDisclosureModalProps> = ({ onAccept, onCancel }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.9)',
      zIndex: 30000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem'
    }}>
      <div style={{
        backgroundColor: '#1e1e1e',
        color: 'white',
        padding: '2rem',
        borderRadius: '24px',
        maxWidth: '450px',
        border: '1px solid #333',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📍</div>
        <h2 style={{ color: '#ff6600', marginBottom: '1rem', marginTop: 0 }}>Location Disclosure</h2>
        
        <p style={{ lineHeight: '1.5', color: '#ccc', fontSize: '0.95rem' }}>
          <strong>Range Anxiety Rider</strong> collects location data to enable:
        </p>
        
        <ul style={{ textAlign: 'left', fontSize: '0.9rem', color: '#bbb', marginBottom: '1.5rem' }}>
          <li>Real-time range calculations based on current terrain.</li>
          <li>Precise navigation to your destination.</li>
          <li>Battery death point detection during your ride.</li>
          <li>Group ride features so you can see your friends on the map.</li>
        </ul>

        <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '2rem' }}>
          This data is collected even when the app is in the background or not in use, only when an active trip or navigation is in progress.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button 
            onClick={onAccept}
            style={{
              width: '100%',
              padding: '1rem',
              backgroundColor: '#ff6600',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            I Understand & Accept
          </button>
          <button 
            onClick={onCancel}
            style={{
              width: '100%',
              padding: '0.8rem',
              backgroundColor: 'transparent',
              color: '#666',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationDisclosureModal;
