import React, { useState } from 'react'
import TermsOfService from '../../features/legal/TermsOfService';
import PrivacyPolicy from '../../features/legal/PrivacyPolicy';
import styles from './WelcomeModal.module.css';

interface WelcomeModalProps {
  onClose: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ onClose }) => {
  const [showToS, setShowToS] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div 
        className={`${styles.modal} card`} 
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.icon}>⚡</div>
        <h1 className={styles.title}>Welcome to E-Bike King!</h1>
        <p className={styles.subtitle}>
          Your ultimate tool for planning rides and conquering range anxiety.
        </p>

        <div className={styles.features}>
          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>📍</span>
            <div>
              <div className={styles.featureTitle}>Plan Your Route</div>
              <div className={styles.featureDesc}>Tap the map to add waypoints and see real-time range estimates.</div>
            </div>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>🚲</span>
            <div>
              <div className={styles.featureTitle}>Custom Specs</div>
              <div className={styles.featureDesc}>Select your bike and battery to get accurate, personalized data.</div>
            </div>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>👥</span>
            <div>
              <div className={styles.featureTitle}>Community Hub</div>
              <div className={styles.featureDesc}>Join the forum to share trips, ask questions, and meet riders.</div>
            </div>
          </div>
        </div>

        <button onClick={onClose} className={styles.button}>
          Let's Ride!
        </button>
        
        <p className={styles.terms}>
          By clicking Let's Ride!, you agree to our{' '}
          <span onClick={() => setShowToS(true)} className={styles.link}>
            Terms of Service
          </span>{' '}
          and{' '}
          <span onClick={() => setShowPrivacy(true)} className={styles.link}>
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
