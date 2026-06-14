import React from 'react';
import styles from './LoadingScreen.module.css';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'INITIALIZING SYSTEM...' }) => {
  return (
    <div className={`${styles.container} noise-bg`}>
      <img src="/logo.png" alt="Range Anxiety Logo" className={styles.logo} />
      <div className={styles.skeletonBar}></div>
      {message && <div className={styles.message}>{message}</div>}
    </div>
  );
};

export default LoadingScreen;
