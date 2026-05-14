import React, { useState, useEffect } from 'react';

const InstallTutorial: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [platform] = useState<'ios' | 'android' | 'desktop'>(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
    if (/android/.test(userAgent)) return 'android';
    return 'desktop';
  });

  useEffect(() => {
    // Empty effect since state is initialized synchronously above
  }, []);

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
      padding: '20px',
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{
        maxWidth: '450px',
        width: '100%',
        background: '#1a1a1a',
        borderRadius: '24px',
        border: '1px solid #ff6600',
        padding: '2rem',
        color: 'white',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
        <h2 style={{ color: '#ff6600', marginBottom: '1rem', fontSize: '1.5rem' }}>Install Range Anxiety</h2>
        <p style={{ color: '#ccc', marginBottom: '2rem', fontSize: '0.9rem', lineHeight: '1.5' }}>
          Get the best experience by saving the app directly to your home screen. It works just like a regular app from the store!
        </p>

        {platform === 'ios' && (
          <div style={{ textAlign: 'left', background: 'rgba(255,102,0,0.1)', padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ width: '30px', height: '30px', background: '#ff6600', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>1</div>
              <p style={{ margin: 0 }}>Tap the <strong>Share</strong> icon in Safari <span style={{ fontSize: '1.2rem' }}>⎋</span></p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '30px', height: '30px', background: '#ff6600', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>2</div>
              <p style={{ margin: 0 }}>Scroll down and tap <strong>Add to Home Screen</strong></p>
            </div>
          </div>
        )}

        {platform === 'android' && (
          <div style={{ textAlign: 'left', background: 'rgba(255,102,0,0.1)', padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ width: '30px', height: '30px', background: '#ff6600', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>1</div>
              <p style={{ margin: 0 }}>Tap the <strong>Three Dots</strong> menu <span style={{ fontSize: '1.2rem' }}>⋮</span></p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '30px', height: '30px', background: '#ff6600', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>2</div>
              <p style={{ margin: 0 }}>Tap <strong>Install App</strong> or <strong>Add to Home Screen</strong></p>
            </div>
          </div>
        )}

        {platform === 'desktop' && (
          <div style={{ textAlign: 'left', background: 'rgba(255,102,0,0.1)', padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem' }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              On your computer? Open this site on your <strong>mobile phone</strong> to install it as an app.
            </p>
          </div>
        )}

        <button 
          onClick={onClose}
          style={{
            width: '100%',
            padding: '1rem',
            background: '#ff6600',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '1rem',
            boxShadow: '0 5px 15px rgba(255,102,0,0.3)'
          }}
        >
          Got it!
        </button>
      </div>
    </div>
  );
};

export default InstallTutorial;
