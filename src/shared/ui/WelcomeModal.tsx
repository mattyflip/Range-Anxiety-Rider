import React, { useState } from 'react'
import TermsOfService from './TermsOfService';
import PrivacyPolicy from './PrivacyPolicy';

interface WelcomeModalProps {
  onClose: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ onClose }) => {
  const [showToS, setShowToS] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <div 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        backgroundColor: 'rgba(0,0,0,0.95)', 
        zIndex: 30000, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        backdropFilter: 'blur(10px)',
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div 
        className="card" 
        style={{ 
          maxWidth: '500px', 
          width: '100%',
          background: '#1a1a1a', 
          padding: '2.5rem', 
          borderRadius: '30px', 
          border: '1px solid #333',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          textAlign: 'center',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>⚡</div>
        <h1 style={{ color: '#ff6600', marginBottom: '1rem', fontSize: '1.8rem' }}>Welcome to E-Bike King!</h1>
        <p style={{ color: '#ccc', fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '2rem' }}>
          Your ultimate tool for planning rides and conquering range anxiety.
        </p>

        <div style={{ textAlign: 'left', background: '#121212', padding: '1.5rem', borderRadius: '20px', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.2rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📍</span>
            <div>
              <div style={{ color: 'white', fontWeight: 'bold' }}>Plan Your Route</div>
              <div style={{ color: '#888', fontSize: '0.9rem' }}>Tap the map to add waypoints and see real-time range estimates.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.2rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🚲</span>
            <div>
              <div style={{ color: 'white', fontWeight: 'bold' }}>Custom Specs</div>
              <div style={{ color: '#888', fontSize: '0.9rem' }}>Select your bike and battery to get accurate, personalized data.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <span style={{ fontSize: '1.5rem' }}>👥</span>
            <div>
              <div style={{ color: 'white', fontWeight: 'bold' }}>Community Hub</div>
              <div style={{ color: '#888', fontSize: '0.9rem' }}>Join the forum to share trips, ask questions, and meet riders.</div>
            </div>
          </div>
        </div>

        <button 
          onClick={onClose}
          style={{ 
            width: '100%', 
            padding: '1.2rem', 
            background: '#ff6600', 
            color: 'white', 
            border: 'none', 
            borderRadius: '15px', 
            fontWeight: 'bold', 
            fontSize: '1.1rem',
            cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(255,102,0,0.3)'
          }}
        >
          Let's Ride!
        </button>
        
        <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#666' }}>
          By clicking Let's Ride!, you agree to our{' '}
          <span 
            onClick={() => setShowToS(true)} 
            style={{ color: '#ff6600', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Terms of Service
          </span>{' '}
          and{' '}
          <span 
            onClick={() => setShowPrivacy(true)} 
            style={{ color: '#ff6600', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Privacy Policy
          </span>.
        </p>

        {showToS && <TermsOfService onClose={() => setShowToS(false)} />}
        {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
      </div>
    </div>
  );
};

export default WelcomeModal;

