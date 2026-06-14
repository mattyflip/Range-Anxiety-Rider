import React from 'react';
import styles from './LoadingScreen.module.css';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'INITIALIZING SYSTEM...' }) => {
  return (
    <div className={`${styles.container} noise-bg`}>
      <div className={styles.logo}>RANGE ANXIETY</div>
      <div className={styles.skeletonBar}></div>
      {message && <div className={styles.message}>{message}</div>}
    </div>
  );
};

export default LoadingScreen;
