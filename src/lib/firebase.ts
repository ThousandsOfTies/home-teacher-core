import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'dummy_api_key_for_local_testing',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'dummy-env.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'dummy-project-1234',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'dummy-bucket.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789:web:dummy12345'
};

let app, authInstance, dbInstance;
try {
  app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
} catch (error) {
  console.warn('Firebase initialization failed (probably invalid dummy key):', error);
  // Provide empty mock objects so the app doesn't crash entirely when importing these
  app = {} as any;
  authInstance = {} as any;
  dbInstance = {} as any;
}

export const auth = authInstance;
export const db = dbInstance;
