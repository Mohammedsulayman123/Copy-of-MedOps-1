import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';

// TODO: Replace with your Firebase configuration from the Console
// Go to Project Settings > General > Your apps > Web app (</>)
const firebaseConfig = {
    apiKey: "AIzaSyCGpBylkLiITyeT4WhPO9aUm7iwofzN6h4",
    authDomain: "medops-65950.firebaseapp.com",
    projectId: "medops-65950",
    storageBucket: "medops-65950.firebasestorage.app",
    messagingSenderId: "33077999489",
    appId: "1:33077999489:web:5ef498df2194da6bf85a80",
    measurementId: "G-X97P57HBQS"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with offline persistence enabled
export const db = initializeFirestore(app, {
    localCache: {
        // New Firestore SDK 10+ syntax for persistence
        kind: 'persistent',
        tabManager: 'persistent'
    } as any // Cast to any to avoid strict type issues depending on minor SDK version
});

// Explicitly enable persistence for older SDK fallback if needed, 
// though initializeFirestore with 'persistent' usually covers it.
/*
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a a time.
      console.warn('Persistence failed: Multiple tabs open');
  } else if (err.code == 'unimplemented') {
      // The current browser does not support all of the features required to enable persistence
      console.warn('Persistence failed: Browser not supported');
  }
});
*/

export default app;
