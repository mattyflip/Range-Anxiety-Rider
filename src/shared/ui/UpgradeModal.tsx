import React from 'react';
import styles from './UpgradeModal.module.css';

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
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>🚀</div>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>
          {message || `Unlock ${featureName} and other professional tools with a Range Anxiety Pro subscription.`}
        </p>
        
        <div className={styles.buttonContainer}>
          <button 
            onClick={onUpgrade}
            className={styles.upgradeButton}
          >
            Upgrade to Pro — $4.99
          </button>
          <button 
            onClick={onClose}
            className={styles.cancelButton}
          >
            Maybe Later
          </button>
        </div>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            Includes: Unlimited Garage, 3D Route Flyover, Early Access Physics, and Offline Maps.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
