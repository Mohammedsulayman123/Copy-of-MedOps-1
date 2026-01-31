import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

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

// Initialize Firestore with modern offline persistence
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export default app;
