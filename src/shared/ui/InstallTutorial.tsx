import React, { useState, useEffect } from 'react';
import styles from './InstallTutorial.module.css';

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
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>📱</div>
        <h2 className={styles.title}>Install Range Anxiety</h2>
        <p className={styles.subtitle}>
          Get the best experience by saving the app directly to your home screen. It works just like a regular app from the store!
        </p>

        {platform === 'ios' && (
          <div className={styles.instructionsBox}>
            <div className={styles.stepRow}>
              <div className={styles.stepNumber}>1</div>
              <p className={styles.stepText}>Tap the <strong>Share</strong> icon in Safari <span style={{ fontSize: '1.2rem' }}>⎋</span></p>
            </div>
            <div className={styles.stepRow}>
              <div className={styles.stepNumber}>2</div>
              <p className={styles.stepText}>Scroll down and tap <strong>Add to Home Screen</strong></p>
            </div>
          </div>
        )}

        {platform === 'android' && (
          <div className={styles.instructionsBox}>
            <div className={styles.stepRow}>
              <div className={styles.stepNumber}>1</div>
              <p className={styles.stepText}>Tap the <strong>Three Dots</strong> menu <span style={{ fontSize: '1.2rem' }}>⋮</span></p>
            </div>
            <div className={styles.stepRow}>
              <div className={styles.stepNumber}>2</div>
              <p className={styles.stepText}>Tap <strong>Install App</strong> or <strong>Add to Home Screen</strong></p>
            </div>
          </div>
        )}

        {platform === 'desktop' && (
          <div className={styles.instructionsBox}>
            <p className={styles.desktopText}>
              On your computer? Open this site on your <strong>mobile phone</strong> to install it as an app.
            </p>
          </div>
        )}

        <button 
          onClick={onClose}
          className={styles.button}
        >
          Got it!
        </button>
      </div>
    </div>
  );
};

export default InstallTutorial;
