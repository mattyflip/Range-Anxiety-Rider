import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ebikeking.rangeanxiety',
  appName: 'Range Anxiety',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'rangeanxiety.app'
  }
};

export default config;
