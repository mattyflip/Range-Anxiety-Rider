import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ebikeking.rangeanxiety',
  appName: 'Range Anxiety',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    allowNavigation: [
      "*.google.com",
      "*.googleapis.com",
      "*.gstatic.com"
    ]
  }
};

export default config;
