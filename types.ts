
export enum UserRole {
  VOLUNTEER = 'VOLUNTEER',
  NGO = 'NGO',
  NONE = 'NONE'
}

export interface User {
  id: string;
  role: UserRole;
  name?: string;
  organization?: string;
  lastSync?: string;
  docId?: string; // Firestore Document ID (needed for deletion if different from id)
  nudges?: { sender: string; timestamp: string; message: string; }[];
}

export interface FieldLog {
  id: string;
  authorName: string;
  timestamp: string;
  activity: string;
  hours: number;
  synced: boolean;
}

export interface Project {
  id: string;
  name: string;
  progress: number;
  status: 'Planning' | 'In Progress' | 'Urgent' | 'Draft';
  synced: boolean;
}

export enum ReportType {
  TOILET = 'TOILET',
  WATER_POINT = 'WATER_POINT'
}

export type ReportStatus = 'Pending' | 'Acknowledged' | 'In Progress' | 'Resolved';

export interface WASHReport {
  id: string;
  type: ReportType;
  zone: string;
  facilityId: string;
  timestamp: string;
  synced: boolean;
  status?: ReportStatus;
  details: {
    usable?: string; // Yes, Partially, No
    available?: string; // Yes, Limited, No
    water?: string; // Yes, Limited, None
    soap?: boolean;
    lock?: boolean;
    problems?: string[];
    lighting?: boolean | string; // Yes, No (updated to boolean for new logic, string for compat)
    quality?: string; // Clear, Dirty, Smelly
    usagePressure: string; // <25, 25-50, 50-100, 100+
    usersPerDay?: string; // <25, 25-50, 50-100, 100+
    waitingTime?: string;
    targetGroups?: string[];
    users?: string[];
    isFunctional?: string; // Yes, No
    notes?: string;
    urgency?: string;
    riskScore?: number;
    riskPriority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    riskReasoning?: string[];
  };
  nudges?: { userId: string; timestamp: string; }[];
}

export interface Zone {
  id: string; // e.g. "Zone A"
  name: string;
  coordinates: { lat: number; lng: number }[]; // LatLng object array
}

export interface AppData {
  logs: FieldLog[];
  projects: Project[];
  reports: WASHReport[];
  zones: Zone[];
  volunteers: User[];
}
