
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
  zone: 'Zone A' | 'Zone B' | 'Zone C';
  facilityId: string;
  timestamp: string;
  synced: boolean;
  status?: ReportStatus;
  details: {
    usable?: string; // Yes, Partially, No
    available?: string; // Yes, Limited, No
    problems?: string[];
    lighting?: string; // Yes, No
    quality?: string; // Clear, Dirty, Smelly
    usagePressure: string; // <25, 25-50, 50-100, 100+
    waitingTime?: string;
    targetGroups?: string[];
    isFunctional?: string; // Yes, No
  };
}

export interface AppData {
  logs: FieldLog[];
  projects: Project[];
  reports: WASHReport[];
}
