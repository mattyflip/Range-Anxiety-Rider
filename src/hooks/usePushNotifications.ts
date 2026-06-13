import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';

export const usePushNotifications = (user: User | null) => {
  useEffect(() => {
    const setupPush = async () => {
      if (!user) return;

      const info = await Device.getInfo();
      if (info.platform === 'web') {
        console.log('[PUSH] Skipping push registration on web.');
        return;
      }

      // 1. Check/Request Permissions
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('[PUSH] User denied push permissions.');
        return;
      }

      // 2. Register with FCM/APNS
      await PushNotifications.register();

      // 3. Listen for token
      PushNotifications.addListener('registration', async (token) => {
        console.log('[PUSH] Token registered:', token.value);
        // Store token in Firestore under the user document
        const userRef = doc(db, 'users', user.uid);
        try {
          await updateDoc(userRef, {
            pushTokens: arrayUnion(token.value)
          });
        } catch (e) {
          console.error('[PUSH] Failed to store token:', e);
        }
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('[PUSH] Registration error:', error.error);
      });

      // 4. Listen for notifications while app is open
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[PUSH] Notification received:', notification);
        // You could trigger a local toast here if you want
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('[PUSH] Notification action performed:', notification);
        // Handle clicking the notification (e.g. navigate to a specific page)
      });
    };

    setupPush();

    // Cleanup listeners
    return () => {
      if (Capacitor.isNativePlatform()) {
        PushNotifications.removeAllListeners();
      }
    };
  }, [user?.uid]);
};
