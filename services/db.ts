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
    Timestamp,
    deleteDoc,
    getDocs,
    writeBatch
} from 'firebase/firestore';
import { User, FieldLog, WASHReport, Project, AppData, Zone } from '../types';

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

export const nudgeReport = async (reportId: string, userId: string) => {
    try {
        const reportRef = doc(db, 'reports', reportId);
        const reportSnap = await getDoc(reportRef);

        if (reportSnap.exists()) {
            const reportData = reportSnap.data() as WASHReport;
            const currentNudges = reportData.nudges || [];

            // Add new nudge
            const newNudge = {
                userId,
                timestamp: new Date().toISOString()
            };

            await setDoc(reportRef, {
                nudges: [...currentNudges, newNudge]
            }, { merge: true });
        }
    } catch (error) {
        console.error("Error nudging report:", error);
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

// ZONES
export const subscribeToZones = (callback: (zones: Zone[]) => void) => {
    const q = query(collection(db, 'zones'), orderBy('name'));
    return onSnapshot(q, (snapshot) => {
        const zones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Zone));
        callback(zones);
    });
};

export const addZone = async (zone: Zone) => {
    try {
        const { id, ...data } = zone;
        await setDoc(doc(db, 'zones', id), data);
    } catch (error) {
        console.error("Error adding zone:", error);
        throw error;
    }
};

export const deleteZone = async (zoneId: string) => {
    try {
        await deleteDoc(doc(db, 'zones', zoneId));
    } catch (error) {
        console.error("Error deleting zone:", error);
        throw error;
    }
};

// VOLUNTEERS
export const subscribeToVolunteers = (callback: (volunteers: User[]) => void) => {
    const q = query(collection(db, 'users'), where('role', '==', 'VOLUNTEER'));
    return onSnapshot(q, (snapshot) => {
        const volunteers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), docId: doc.id } as User));
        callback(volunteers);
    });
};

export const deleteUser = async (uid: string) => {
    try {
        await deleteDoc(doc(db, 'users', uid));
    } catch (error) {
        console.error("Error deleting user:", error);
        throw error;
    }
};

export const nudgeVolunteer = async (volunteerId: string, senderName: string) => {
    try {
        const userRef = doc(db, 'users', volunteerId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const userData = userSnap.data() as User;
            const currentNudges = userData.nudges || [];

            const newNudge = {
                sender: senderName,
                timestamp: new Date().toISOString(),
                message: "Please submit your activity log for today"
            };

            await setDoc(userRef, {
                nudges: [...currentNudges, newNudge]
            }, { merge: true });
        }
    } catch (error) {
        console.error("Error nudging volunteer:", error);
        throw error;
    }
};

export const resetActivityData = async () => {
    const batch = writeBatch(db);

    // Clear Reports
    const reportsSnapshot = await getDocs(collection(db, 'reports'));
    reportsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });

    // Clear Logs
    const logsSnapshot = await getDocs(collection(db, 'logs'));
    logsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();
};
