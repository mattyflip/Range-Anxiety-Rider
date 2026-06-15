import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

console.log("[FIREBASE] Initializing with Project:", firebaseConfig.projectId);
if (!firebaseConfig.apiKey) {
  console.error("[FIREBASE] CRITICAL: API Key is missing! Check your .env file and build process.");
}

const app = initializeApp(firebaseConfig);

// Initialize Firebase App Check
if (typeof window !== "undefined") {
  const recaptchaKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isDebug = !!import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;

  if (isDebug || isLocal) {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || true;
  }
  
  // Only initialize App Check on Web/Local for now. 
  // Android requires native Play Integrity provider which isn't configured yet.
  if (isLocal && recaptchaKey && recaptchaKey !== 'dummy_key') {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaKey),
        isTokenAutoRefreshEnabled: true
      });
      console.log("[FIREBASE] App Check initialized (Local/Debug)");
    } catch (e) {
      console.warn("[FIREBASE] App Check initialization failed:", e);
    }
  } else {
    console.log("[FIREBASE] App Check skipped (Mobile or missing key)");
  }
}
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
