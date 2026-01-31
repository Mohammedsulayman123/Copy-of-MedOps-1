import { db } from './services/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

// Mock Data matching the App
const sanitizeData = (data: any): any => {
    if (data === undefined) return null;
    if (data === null) return null;
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

async function debug() {
    console.log("Starting DEBUG Report Write...");

    // Simulate a complex report
    const id = doc(collection(db, 'reports')).id;
    const report = {
        id: id,
        type: "TOILET",
        zone: "Zone A",
        facilityId: "Toilet Block 1",
        timestamp: new Date().toISOString(),
        status: "Pending",
        details: {
            zone: "Zone A",
            facilityId: "Toilet Block 1",
            isFunctional: "YES",
            issues: [],
            reasonUnusable: [],
            alternativeNearby: "",
            // Simulate optional/missing fields
            soap: undefined,
            lighting: undefined,
            lock: undefined,
            riskScore: 35,
            riskPriority: "MEDIUM",
            riskReasoning: []
        },
        nudges: []
    };

    try {
        console.log("Writing report:", id);
        const cleanData = sanitizeData({ ...report, synced: true });
        console.log("Sanitized Payload:", JSON.stringify(cleanData, null, 2));

        await setDoc(doc(db, 'reports', id), cleanData, { merge: true });
        console.log("✅ SUCCESS! Report written.");
    } catch (e: any) {
        console.error("❌ FAILED!");
        console.error("Code:", e.code);
        console.error("Message:", e.message);
    }
}

debug();
