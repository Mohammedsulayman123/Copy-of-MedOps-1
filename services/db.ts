import { db } from './firebase';
import {
    collection,
    onSnapshot,
    query,
    where,
    doc,
    setDoc,
    getDoc,
    orderBy,
    deleteDoc
} from 'firebase/firestore';
import { User, FieldLog, WASHReport, Project, Zone } from '../types';

// ==========================================
// 🛡️ DATA SANITIZATION (The "Undefined" Fix)
// ==========================================
// Firestore rejects 'undefined', so we convert it to null.
// We also convert Dates to ISO strings consistently.
const sanitizeData = (data: any): any => {
    if (data === undefined) return null;
    if (data === null) return null;
    if (typeof data === 'number' && Number.isNaN(data)) return null; // Firestore rejects NaN
    if (typeof data !== 'object') return data;
    if (data instanceof Date) return data.toISOString();
    if (Array.isArray(data)) return data.map(sanitizeData);

    const sanitized: any = {};
    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            sanitized[key] = sanitizeData(data[key]);
        }
    }
    return sanitized;
};

// ==========================================
// 👤 USER PROFILES
// ==========================================

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
        // Safe Update: Merge true prevents overwriting existing fields
        await setDoc(doc(db, 'users', uid), sanitizeData(user), { merge: true });
    } catch (error) {
        console.error("Error creating user profile:", error);
        throw error;
    }
};

export const deleteUser = async (uid: string) => {
    try {
        await deleteDoc(doc(db, 'users', uid));
    } catch (error) {
        console.error("Error deleting user:", error);
        throw error;
    }
};

// ==========================================
// 📝 FIELD LOGS (Volunteers)
// ==========================================

export const subscribeToLogs = (callback: (logs: FieldLog[]) => void) => {
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            synced: !snapshot.metadata.hasPendingWrites && !doc.metadata.hasPendingWrites
        } as FieldLog));
        callback(logs);
    }, (error) => {
        console.error("SUBSCRIPTION ERROR (LOGS):", error);
    });
};

export const addLog = async (log: FieldLog) => {
    try {
        const { id, ...data } = log;
        // 1. Sanitize (Fix undefined)
        // 2. Merge (Prevent overwrite)
        await setDoc(doc(db, 'logs', id), sanitizeData({ ...data }), { merge: true });
    } catch (error) {
        console.error("Error adding log:", error);
        throw error;
    }
};

// ==========================================
// 🚽 WASH REPORTS (Main Feature)
// ==========================================

export const subscribeToReports = (callback: (reports: WASHReport[]) => void) => {
    const q = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
        const reports = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            synced: !snapshot.metadata.hasPendingWrites && !doc.metadata.hasPendingWrites
        } as WASHReport));
        callback(reports);
    }, (error) => {
        console.error("SUBSCRIPTION ERROR (REPORTS):", error);
    });
};

export const addReport = async (report: WASHReport) => {
    try {
        const { id, ...data } = report;
        await setDoc(doc(db, 'reports', id), sanitizeData({ ...data }), { merge: true });
    } catch (error) {
        console.error("Error adding report:", error);
        throw error;
    }
};

export const updateReport = async (reportId: string, updates: Partial<WASHReport>) => {
    try {
        await setDoc(doc(db, 'reports', reportId), sanitizeData(updates), { merge: true });
    } catch (error) {
        console.error("Error updating report:", error);
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

            const newNudge = {
                userId,
                timestamp: new Date().toISOString()
            };

            await setDoc(reportRef, {
                nudges: sanitizeData([...currentNudges, newNudge])
            }, { merge: true });
        }
    } catch (error) {
        console.error("Error nudging report:", error);
        throw error;
    }
};

// ==========================================
// 🌍 ZONES & PROJECTS (Metadata)
// ==========================================

export const subscribeToProjects = (callback: (projects: Project[]) => void) => {
    const q = query(collection(db, 'projects'));
    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
        const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        callback(projects);
    }, (error) => console.error("SUBSCRIPTION ERROR (PROJECTS):", error));
};

export const subscribeToZones = (callback: (zones: Zone[]) => void) => {
    const q = query(collection(db, 'zones'), orderBy('name'));
    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
        const zones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Zone));
        callback(zones);
    }, (error) => console.error("SUBSCRIPTION ERROR (ZONES):", error));
};

export const addZone = async (zone: Zone) => {
    try {
        const { id, ...data } = zone;
        await setDoc(doc(db, 'zones', id), sanitizeData(data), { merge: true });
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

// ==========================================
// 👥 VOLUNTEER MANAGEMENT
// ==========================================

export const subscribeToVolunteers = (callback: (volunteers: User[]) => void) => {
    const q = query(collection(db, 'users'), where('role', '==', 'VOLUNTEER'));
    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
        // Note: We map 'docId' too just in case 'id' field is missing inside data
        const volunteers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), docId: doc.id } as User));
        callback(volunteers);
    }, (error) => console.error("SUBSCRIPTION ERROR (VOLUNTEERS):", error));
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
                nudges: sanitizeData([...currentNudges, newNudge])
            }, { merge: true });
        }
    } catch (error) {
        console.error("Error nudging volunteer:", error);
        throw error;
    }
};
