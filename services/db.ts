import { db } from './firebase';
import {
    collection,
    addDoc,
    onSnapshot,
    query,
    where,
    doc,
    setDoc,
    getDoc,
    orderBy,
    Timestamp
} from 'firebase/firestore';
import { User, FieldLog, WASHReport, Project, AppData } from '../types';

// USERS
export const getUserProfile = async (uid: string): Promise<User | null> => {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            return userDoc.data() as User;
        }
        return null;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
};

export const createUserProfile = async (uid: string, user: User) => {
    try {
        await setDoc(doc(db, 'users', uid), user, { merge: true });
    } catch (error) {
        console.error("Error creating user profile:", error);
    }
};

// LOGS
export const subscribeToLogs = (callback: (logs: FieldLog[]) => void) => {
    // In a real app, query by organization or user
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FieldLog));
        callback(logs);
    });
};

export const addLog = async (log: FieldLog) => {
    // We overwrite 'id' with Firestore ID or keep the generated one? 
    // Firestore generates IDs automatically if we use addDoc. 
    // If we want offline capability, generating ID locally and using setDoc is better, or addDoc handles temporary IDs too.
    // Let's use addDoc but identifying it might be tricky if we don't store the ID back.
    // Actually, local persistence handles this.
    try {
        // Remove 'id' if we want Firestore to generate, OR keep it if we self-generate. 
        // We defined 'id' in types, so let's stick to self-generated for offline ease or use doc references.
        // For simplicity, let's treat the local ID as the document ID.
        const { id, ...data } = log;
        // setDoc with specific ID is safer for offline de-duplication
        await setDoc(doc(db, 'logs', id), { ...data, synced: true });
    } catch (error) {
        console.error("Error adding log:", error);
        throw error;
    }
};

// REPORTS
export const subscribeToReports = (callback: (reports: WASHReport[]) => void) => {
    const q = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WASHReport));
        callback(reports);
    });
};

export const addReport = async (report: WASHReport) => {
    try {
        const { id, ...data } = report;
        await setDoc(doc(db, 'reports', id), { ...data, synced: true });
    } catch (error) {
        console.error("Error adding report:", error);
        throw error;
    }
};

// PROJECTS
export const subscribeToProjects = (callback: (projects: Project[]) => void) => {
    const q = query(collection(db, 'projects'));
    return onSnapshot(q, (snapshot) => {
        const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        callback(projects);
    });
};
