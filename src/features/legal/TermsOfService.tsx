import React from 'react';

const TermsOfService: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.9)',
      zIndex: 20000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        backgroundColor: '#1e1e1e',
        color: 'white',
        padding: '2rem',
        borderRadius: '12px',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflowY: 'auto',
        border: '1px solid #333'
      }}>
        <h2 style={{ color: '#ff6600', marginBottom: '1rem' }}>Terms of Service</h2>
        <p style={{ fontSize: '0.8rem', color: '#888' }}>Last Updated: May 6, 2026</p>
        
        <div style={{ marginTop: '1.5rem', lineHeight: '1.6', fontSize: '0.9rem' }}>
          <h3>1. Acceptance of Terms</h3>
          <p>By creating an account or using the Range Anxiety app, you agree to be bound by these Terms of Service. If you do not agree, do not use the application.</p>

          <h3>2. Nature of the Service</h3>
          <p>Range Anxiety provides energy consumption estimates for electric vehicles based on user-provided data and physics models. These are <strong>estimates only</strong>. Real-world range depends on numerous factors including battery health, wind, tire pressure, and rider behavior.</p>

          <h3>3. User Accounts</h3>
          <p>You must provide a valid email address to create an account. You are responsible for maintaining the security of your account and password.</p>

          <h3>4. Marketing and Updates</h3>
          <p>By creating an account, you agree to receive technical updates, newsletters, and marketing communications from Range Anxiety and Ebike King NJ. You may opt-out at any time via the unsubscribe link in our emails.</p>

          <h3>5. Data Collection</h3>
          <p>We collect your email address and any bike specifications you save to provide our services and marketing updates. We do not sell your personal data to third parties.</p>

          <h3>6. Disclaimer of Warranties</h3>
          <p>The app is provided "as is" without any warranties. Range Anxiety and its developers are not responsible for any stranded riders, battery damage, or other incidents resulting from reliance on our estimates.</p>

          <h3>7. Limitation of Liability</h3>
          <p>In no event shall Range Anxiety be liable for any damages arising out of the use or inability to use the application.</p>
        </div>

        <button 
          onClick={onClose}
          style={{
            marginTop: '2rem',
            width: '100%',
            padding: '1rem',
            backgroundColor: '#ff6600',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default TermsOfService;
