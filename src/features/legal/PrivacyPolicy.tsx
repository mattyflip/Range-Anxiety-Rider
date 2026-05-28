import React from 'react';

const PrivacyPolicy: React.FC<{ onClose: () => void }> = ({ onClose }) => {
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
        <h2 style={{ color: '#ff6600', marginBottom: '1rem' }}>Privacy Policy</h2>
        <p style={{ fontSize: '0.8rem', color: '#888' }}>Last Updated: May 26, 2026</p>
        
        <div style={{ marginTop: '1.5rem', lineHeight: '1.6', fontSize: '0.9rem' }}>
          <h3>1. Information We Collect</h3>
          <p><strong>Account Information:</strong> When you create an account, we collect your email address and any profile information you provide.</p>
          <p><strong>Bike Data:</strong> We store the specifications of the bikes you save (e.g., battery capacity, motor type, weight) to provide accurate range estimates.</p>
          <p><strong>Location Data:</strong> To provide route planning and range estimates, we may process location data. This is typically done on-device or via third-party map providers (Google Maps).</p>

          <h3>2. How We Use Your Information</h3>
          <p>We use your data to:</p>
          <ul>
            <li>Calculate and provide range estimates.</li>
            <li>Maintain your account and saved bikes.</li>
            <li>Send technical updates and marketing communications (with your consent).</li>
            <li>Improve our physics models and app performance.</li>
          </ul>

          <h3>3. Third-Party Services</h3>
          <p>We utilize trusted third-party services to operate:</p>
          <ul>
            <li><strong>Firebase:</strong> For authentication and database hosting.</li>
            <li><strong>Stripe:</strong> For processing payments (we do not store your credit card information).</li>
            <li><strong>Google Maps:</strong> For mapping, elevation data, and location services.</li>
            <li><strong>Resend:</strong> For sending system and marketing emails.</li>
          </ul>

          <h3>4. Cookies and Tracking</h3>
          <p>We use essential cookies to keep you logged in and local storage to save your app preferences. We may use Google Analytics to understand how users interact with the app.</p>

          <h3>5. Data Security</h3>
          <p>We implement industry-standard security measures to protect your data. However, no method of transmission over the Internet is 100% secure.</p>

          <h3>6. Your Rights</h3>
          <p>You may request to view, update, or delete your personal data at any time by contacting us at mattyfliptv@gmail.com.</p>

          <h3>7. Changes to This Policy</h3>
          <p>We may update this policy from time to time. We will notify you of any significant changes via the email address associated with your account.</p>
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

export default PrivacyPolicy;
