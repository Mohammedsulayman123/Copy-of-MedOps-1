
import React, { useState, useEffect } from 'react';
import { User, AppData, FieldLog, ReportType, WASHReport, ReportStatus } from '../types';
import { db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { OfflineAI } from '../services/OfflineAI';
import { addLog, addReport, updateReport, nudgeReport } from '../services/db';
import { calculateRiskScore } from '../utils/risk';
import { encodeReport } from '../utils/smsCodec';
import { registerPlugin } from '@capacitor/core';
const SMS = registerPlugin('SMS');


interface VolunteerDashboardProps {
  user: User;
  isOnline: boolean;
  data: AppData;
}

const ZONES = ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E', 'Zone F', 'Zone G', 'Zone H', 'Zone I', 'Zone J'] as const;
const FACILITIES = {
  TOILET: ['Toilet Block 1', 'Toilet Block 2', 'Toilet Block 3', 'Toilet Block 4'],
  WATER_POINT: ['Water Point 1', 'Water Point 2', 'Water Point 3']
};

const VolunteerDashboard: React.FC<VolunteerDashboardProps> = ({ user, isOnline, data }) => {
  const [view, setView] = useState<'activity' | 'wash' | 'history'>('activity');
  const [reportType, setReportType] = useState<ReportType>(ReportType.TOILET);
  const [step, setStep] = useState(1);

  // Activity Log State
  const [activity, setActivity] = useState('');
  const [hours, setHours] = useState('1');
  const [nudgeMessage, setNudgeMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user.id) return;

    // Subscribe to my own profile to check for nudges
    const unsub = onSnapshot(doc(db, 'users', user.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as User;
        if (data.nudges && data.nudges.length > 0) {
          const latestNudge = data.nudges[data.nudges.length - 1];
          setNudgeMessage(`${latestNudge.message} - ${latestNudge.sender}`);
        }
      }
    });

    return () => unsub();
  }, [user.id]);

  // WASH Report State
  // WASH Report State
  const [formData, setFormData] = useState<any>({
    zone: 'Zone A',
    facilityId: '',

    // Legacy mapping (Toilet)
    // Gate
    isFunctional: '', // YES, LIMITED, NO

    // Toilet Specifics
    issues: [],
    reasonUnusable: [],
    alternativeNearby: '',

    // Legacy / Shared
    usable: '', // kept for compatibility if needed, but we use isFunctional now
    water: '',
    soap: null,
    lighting: null,
    lock: null,

    // Water - Functional (Yes)
    available: '', // Yes, Limited
    flowStrength: '',
    quality: '',
    usersPerDay: '',
    waitingTime: '',
    users: [],
    areaCondition: '',

    // Water - Limited
    wpIssues: [],

    // Water - No
    wpReasonNonFunctional: [],
    wpAlternativeNearby: '',
    wpAlternativeDistance: '',

    problems: [],
    targetGroups: [],
    notes: '',
    urgency: 'Normal'
  });

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const urgency = OfflineAI.analyzeUrgency(text);
    setFormData(prev => ({ ...prev, notes: text, urgency }));
  };

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activity) return;

    const newLog: FieldLog = {
      id: Math.random().toString(36).substr(2, 9),
      authorName: user.name || user.id,
      timestamp: new Date().toISOString(),
      activity,
      hours: parseFloat(hours),
      synced: isOnline
    };

    const savePromise = addLog(newLog);

    if (isOnline) {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 3000)
      );

      try {
        await Promise.race([savePromise, timeoutPromise]);
        setActivity('');
        alert("Activity Logged!");
      } catch (e: any) {
        if (e.message === "Timeout") {
          console.log("Log timed out - treating as offline");
          setActivity('');
          alert("You are offline. Log will be saved locally and sync when online.");
        } else {
          console.error(e);
          alert("Failed to log activity");
        }
      }
    } else {
      savePromise.catch(e => console.error("Offline log failed", e));
      setActivity('');
      alert("You are offline. Log will be saved locally and sync when online.");
    }
  };

  /* New State for Duplicate Handling */
  const [duplicateReport, setDuplicateReport] = useState<WASHReport | null>(null);

  const handleWASHSubmit = async () => {
    // Check for duplicates
    const existingReport = data.reports.find(r =>
      r.zone === formData.zone &&
      r.facilityId === formData.facilityId &&
      r.type === reportType &&
      r.status !== 'Resolved'
    );

    if (existingReport) {
      setDuplicateReport(existingReport);
      return;
    }

    // MAPPINGS for Risk Logic
    const TOILET_ISSUES_MAP: Record<string, string> = {
      'Limited water': 'limited_water',
      'Broken lighting': 'broken_lighting',
      'No lock': 'no_lock',
      'Long waiting times': 'long_waiting'
    };
    const TOILET_REASONS_MAP: Record<string, string> = {
      'No water': 'no_water',
      'Completely blocked': 'blocked',
      'Structural collapse': 'collapsed',
      'Safety risk': 'safety_risk'
    };
    const WP_ISSUES_MAP: Record<string, string> = {
      'Intermittent water': 'intermittent',
      'Very weak flow': 'weak_flow',
      'Poor water quality': 'poor_quality',
      'Long queues': 'long_queues',
      'Safety concern': 'safety_concern'
    };
    const WP_REASONS_MAP: Record<string, string> = {
      'Contaminated water': 'contaminated',
      'No water source': 'no_source'
    };

    const mapValues = (values: string[] | undefined, map: Record<string, string>) => {
      if (!values) return [];
      return values.map(v => map[v] || v); // Return mapped value or original
    };

    // Use the new Unified Risk Calculator
    const riskAnalysis = calculateRiskScore(
      reportType,
      {
        // Map form data to the unified interface
        functional: formData.isFunctional?.toLowerCase(), // Unified functional field
        users: formData.users,
        usersPerDay: formData.usersPerDay,
        notes: formData.notes,

        // Toilet Specifics
        water: formData.water?.toLowerCase(),
        soap: typeof formData.soap === 'boolean' ? (formData.soap ? 'yes' : 'no') : formData.soap,
        lighting: typeof formData.lighting === 'boolean' ? (formData.lighting ? 'yes' : 'no') : formData.lighting,
        lock: typeof formData.lock === 'boolean' ? (formData.lock ? 'yes' : 'no') : formData.lock,
        issues: mapValues(formData.issues, TOILET_ISSUES_MAP),
        reasonUnusable: mapValues(formData.reasonUnusable, TOILET_REASONS_MAP),
        alternativeNearby: formData.alternativeNearby?.toLowerCase(),

        // Water Point Specifics
        // Functional
        waterAvailable: formData.available?.toLowerCase(),
        flowStrength: formData.flowStrength?.toLowerCase(),
        quality: formData.quality?.toLowerCase(),
        waitingTime: formData.waitingTime?.toLowerCase(), // Ensure '5-15min' format matches logic
        areaCondition: formData.areaCondition?.toLowerCase(),

        // Limited
        wpIssues: mapValues(formData.wpIssues, WP_ISSUES_MAP),

        // Non-Functional
        wpReasonNonFunctional: mapValues(formData.wpReasonNonFunctional, WP_REASONS_MAP),
        wpAlternativeNearby: formData.wpAlternativeNearby?.toLowerCase(),
        wpAlternativeDistance: formData.wpAlternativeDistance?.toLowerCase()
      }
    );

    const newReport: WASHReport = {
      id: Math.random().toString(36).substr(2, 9),
      type: reportType,
      zone: formData.zone,
      facilityId: formData.facilityId,
      timestamp: new Date().toISOString(),
      synced: isOnline,
      status: riskAnalysis ? riskAnalysis.priority === 'CRITICAL' ? 'In Progress' : 'Pending' : 'Pending',
      details: {
        ...formData,
        riskScore: riskAnalysis?.score,
        riskPriority: riskAnalysis?.priority,
        riskReasoning: riskAnalysis?.reasoning
      },
      nudges: []
    };

    // Race addReport against a timeout
    const savePromise = addReport(newReport);

    let submissionSuccess = false;

    if (isOnline) {
      // Create a timeout promise that rejects after 3 seconds
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 3000)
      );

      try {
        await Promise.race([savePromise, timeoutPromise]);
        alert('Report Submitted Successfully');
        submissionSuccess = true;
      } catch (e: any) {
        if (e.message === "Timeout") {
          console.log("Submission timed out - treating as offline save");
          alert('Network timeout. Switching to Offline Mode.');
        } else {
          console.error(e);
          alert('Failed to submit report. Trying SMS fallback.');
        }
      }
    } else {
      savePromise.catch(e => console.error("Offline save failed", e));
      alert('Offline Mode: Saving locally...');
    }

    // AUTOMATIC SMS FALLBACK
    // Trigger if explicitly offline OR if online submission failed/timed out
    if (!isOnline || !submissionSuccess) {
      try {
        const smsCode = encodeReport(formData, reportType);
        const targetNumber = '5551234'; // NGO HQ Number

        // Attempt Native SMS
        await (SMS as any).send({ phoneNumber: targetNumber, message: smsCode });

        alert(`✅ REPORT SENT VIA SMS\nTarget: ${targetNumber}\nCode: ${smsCode}`);
      } catch (smsErr: any) {
        console.error("SMS Send Failed", smsErr);
        alert(`SMS Failed: ${smsErr.message || JSON.stringify(smsErr)}`);
        // Don't alert error again if we already alerted offline save, 
        // but valuable to know if SMS failed too.
      }
    }

    resetForm(); // Reset form after attempting everything
    setView('history');
  };

  const resetForm = () => {
    setStep(1);
    setFormData({
      zone: 'Zone A',
      facilityId: '',
      isFunctional: '',

      // Toilet
      water: '',
      soap: null,
      lighting: null,
      lock: null,
      issues: [],
      reasonUnusable: [],
      alternativeNearby: '',
      usable: '',

      // Water Point
      available: '',
      quality: '',
      usagePressure: '',
      flowStrength: '',
      waitingTime: '',
      usersPerDay: '',
      areaCondition: '',
      wpIssues: [],
      wpReasonNonFunctional: [],
      wpAlternativeNearby: '',
      wpAlternativeDistance: '',

      users: [],
      problems: [],
      targetGroups: [],
      notes: '',
      urgency: 'Normal'
    });
    setDuplicateReport(null);
  };

  const handleNudge = async (reportId: string) => {
    const report = data.reports.find(r => r.id === reportId);
    if (!report) return;

    // Check if already nudged today
    const hasNudgedToday = report.nudges?.some(n =>
      n.userId === user.id &&
      new Date(n.timestamp).toDateString() === new Date().toDateString()
    );

    if (hasNudgedToday) {
      alert("You have already nudged this report today.");
      return;
    }

    await nudgeReport(reportId, user.id);
    alert("Report nudged! Priority raised.");
    if (duplicateReport) {
      resetForm();
      setView('history');
    }
  };

  const handleUpdateReport = async (originalReport: WASHReport) => {
    // 1. Archive the old report (Assign new ID to old data, status 'Archived')
    // Actually, to implement "Replace the existing unresolved report with the new data", we should keep the ID for the active one.
    // So: Copy old data to a new ARCHIVED doc. Update current doc with NEW data.

    try {
      // Archive old
      const archivedReport: WASHReport = {
        ...originalReport,
        id: Math.random().toString(36).substr(2, 9), // New ID for history
        status: 'Archived', // New status type
        timestamp: new Date().toISOString() // Archived time? Or keep original? Let's keep original for history accuracy, maybe add archivedAt.
      };
      await addReport(archivedReport);

      // Overwrite existing report with new data (keeping original ID)
      // Recalculate risk for new data
      const riskAnalysis = calculateRiskScore(reportType, {
        functional: formData.isFunctional?.toLowerCase(),
        users: formData.users,
        usersPerDay: formData.usersPerDay,
        notes: formData.notes,
        water: formData.water?.toLowerCase(),
        soap: typeof formData.soap === 'boolean' ? (formData.soap ? 'yes' : 'no') : formData.soap,
        lighting: typeof formData.lighting === 'boolean' ? (formData.lighting ? 'yes' : 'no') : formData.lighting,
        lock: typeof formData.lock === 'boolean' ? (formData.lock ? 'yes' : 'no') : formData.lock,
        issues: formData.issues,
        reasonUnusable: formData.reasonUnusable,
        alternativeNearby: formData.alternativeNearby?.toLowerCase(),
        waterAvailable: formData.available?.toLowerCase(),
        flowStrength: formData.flowStrength?.toLowerCase(),
        quality: formData.quality?.toLowerCase(),
        waitingTime: formData.waitingTime?.toLowerCase(),
        areaCondition: formData.areaCondition?.toLowerCase(),
        wpIssues: formData.wpIssues,
        wpReasonNonFunctional: formData.wpReasonNonFunctional,
        wpAlternativeNearby: formData.wpAlternativeNearby?.toLowerCase(),
        wpAlternativeDistance: formData.wpAlternativeDistance?.toLowerCase()
      });

      const updatedReportData: Partial<WASHReport> = {
        timestamp: new Date().toISOString(),
        details: {
          ...formData,
          riskScore: riskAnalysis?.score,
          riskPriority: riskAnalysis?.priority,
          riskReasoning: riskAnalysis?.reasoning
        },
        // Keep status as Pending or In Progress based on risk, or keep original? 
        // "Replace the existing unresolved report". Usually resets to Pending unless logic says otherwise.
        status: riskAnalysis?.priority === 'CRITICAL' ? 'In Progress' : 'Pending',
        synced: isOnline
      };

      await updateReport(originalReport.id, updatedReportData);

      alert("Report Updated Successfully");
      setDuplicateReport(null);
      resetForm();
      setView('history');
    } catch (e) {
      console.error("Update failed", e);
      alert("Failed to update report");
    }
  };

  const handleSubmitNewReport = async (originalReport: WASHReport) => {
    // "Store the new report. Mark the newest unresolved report as the active report."
    // "Older unresolved reports must NOT affect live risk calculations"
    // So: Mark OLD report as 'Archived'. Create NEW report as 'Pending'.

    try {
      // Archive old
      await updateReport(originalReport.id, { status: 'Archived' });

      // Submit new
      // We can just call handleWASHSubmit() again? 
      // But handleWASHSubmit contains the duplicate check. We need to bypass it or reset.
      // Easiest is to manually submit here or refactor handleWASHSubmit.
      // Let's manually submit here to avoid recursion issues.

      const riskAnalysis = calculateRiskScore(reportType, {
        functional: formData.isFunctional?.toLowerCase(),
        users: formData.users,
        usersPerDay: formData.usersPerDay,
        notes: formData.notes,
        water: formData.water?.toLowerCase(),
        soap: typeof formData.soap === 'boolean' ? (formData.soap ? 'yes' : 'no') : formData.soap,
        lighting: typeof formData.lighting === 'boolean' ? (formData.lighting ? 'yes' : 'no') : formData.lighting,
        lock: typeof formData.lock === 'boolean' ? (formData.lock ? 'yes' : 'no') : formData.lock,
        issues: formData.issues,
        reasonUnusable: formData.reasonUnusable,
        alternativeNearby: formData.alternativeNearby?.toLowerCase(),
        waterAvailable: formData.available?.toLowerCase(),
        flowStrength: formData.flowStrength?.toLowerCase(),
        quality: formData.quality?.toLowerCase(),
        waitingTime: formData.waitingTime?.toLowerCase(),
        areaCondition: formData.areaCondition?.toLowerCase(),
        wpIssues: formData.wpIssues,
        wpReasonNonFunctional: formData.wpReasonNonFunctional,
        wpAlternativeNearby: formData.wpAlternativeNearby?.toLowerCase(),
        wpAlternativeDistance: formData.wpAlternativeDistance?.toLowerCase()
      });

      const newReport: WASHReport = {
        id: Math.random().toString(36).substr(2, 9),
        type: reportType,
        zone: formData.zone,
        facilityId: formData.facilityId,
        timestamp: new Date().toISOString(),
        synced: isOnline,
        status: riskAnalysis?.priority === 'CRITICAL' ? 'In Progress' : 'Pending',
        details: {
          ...formData,
          riskScore: riskAnalysis?.score,
          riskPriority: riskAnalysis?.priority,
          riskReasoning: riskAnalysis?.reasoning
        },
        nudges: []
      };

      await addReport(newReport);

      alert("New Report Submitted");
      setDuplicateReport(null);
      resetForm();
      setView('history');
    } catch (e) {
      console.error("New submission failed", e);
      alert("Failed to submit new report");
    }
  };

  const toggleListValue = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter(v => v !== value)
        : [...prev[key], value]
    }));
  };

  const OptionButton = ({ label, isSelected, onClick, showRadio = true }: any) => (
    <button
      onClick={onClick}
      className={`w-full p-5 rounded-2xl border-2 text-left transition-all flex items-center justify-between group ${isSelected
        ? 'border-blue-600 bg-blue-50 text-blue-800 shadow-md'
        : 'border-slate-100 bg-white hover:border-slate-300 text-slate-800'
        }`}
    >
      <span className="font-black uppercase tracking-tight text-sm">{label}</span>
      {showRadio && (
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-200 group-hover:border-slate-300'
          }`}>
          {isSelected && <div className="w-2 h-2 rounded-full bg-white"></div>}
        </div>
      )}
    </button>
  );

  const StatusBadge = ({ status }: { status?: ReportStatus }) => {
    const currentStatus = status || 'Pending';
    const isResolved = currentStatus === 'Resolved';

    const colors = {
      'Pending': 'border-slate-200 text-slate-400',
      'Acknowledged': 'border-blue-200 text-blue-600 bg-blue-50',
      'In Progress': 'border-amber-200 text-amber-600 bg-amber-50 animate-pulse',
      'Resolved': 'border-emerald-200 text-emerald-600 bg-emerald-50'
    };

    return (
      <div className={`px-2.5 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest flex items-center space-x-1 ${colors[currentStatus]}`}>
        {isResolved && (
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
        )}
        <span>{currentStatus}</span>
      </div>
    );
  };

  /* Check for Daily Log */
  const hasLoggedToday = data.logs.some(log => log.authorName === (user.name || user.id) && new Date(log.timestamp).toDateString() === new Date().toDateString());

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">

      {/* Duplicate Report Modal - Global Overlay */}
      {duplicateReport && (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-300">
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase mb-2">Unresolved Report Exists</h3>
              <p className="text-sm text-slate-500 mb-6 font-medium">
                An unresolved report already exists for <span className="text-slate-800 font-bold">{duplicateReport.facilityId}</span>. <br />
                Do you want to update it or submit a new one?
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => handleUpdateReport(duplicateReport)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase py-4 rounded-xl shadow-lg shadow-blue-200 transition-all"
                >
                  Update Existing Report
                </button>
                <button
                  onClick={() => handleSubmitNewReport(duplicateReport)}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-all"
                >
                  Submit New Report
                </button>
                <button
                  onClick={() => setDuplicateReport(null)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black uppercase py-4 rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Field Dashboard</h1>
          <div className="flex items-center space-x-2">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active Sector: Sector-4G / {user.id}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Offline indicator is global now in App.tsx */}
        </div>
        <div className="flex bg-slate-200 p-1 rounded-xl relative group">
          {!hasLoggedToday && (
            <div className="absolute -top-10 right-0 bg-slate-900 text-white text-[10px] uppercase font-black px-3 py-2 rounded-lg shadow-xl animate-bounce">
              Daily Check-in Required
              <div className="absolute bottom-[-4px] right-8 w-2 h-2 bg-slate-900 rotate-45"></div>
            </div>
          )}
          <button
            onClick={() => setView('activity')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${view === 'activity' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500'}`}
          >
            Daily Log
          </button>
          <button
            disabled={!hasLoggedToday}
            onClick={() => setView('wash')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${!hasLoggedToday ? 'opacity-50 cursor-not-allowed' : ''} ${view === 'wash' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
          >
            WASH Report
          </button>
          <button
            disabled={!hasLoggedToday}
            onClick={() => setView('history')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${!hasLoggedToday ? 'opacity-50 cursor-not-allowed' : ''} ${view === 'history' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
          >
            Status Feed
          </button>
        </div>
      </div>

      {view === 'activity' ? (
        <div className="space-y-6">
          <div className="bg-slate-800 p-6 rounded-3xl shadow-xl text-white">
            <h3 className="text-slate-400 text-[10px] font-black uppercase mb-4 tracking-widest">Post Field Update</h3>
            {data.logs.some(log => log.authorName === (user.name || user.id) && new Date(log.timestamp).toDateString() === new Date().toDateString()) ? (
              <div className="bg-emerald-500/20 border border-emerald-500/50 p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center mb-2">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h4 className="font-bold text-emerald-400 uppercase tracking-wider text-sm">Update Logged</h4>
                <p className="text-xs text-emerald-200">You have already submitted your daily log for today.</p>
              </div>
            ) : (
              <form onSubmit={handleLogActivity} className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  placeholder="Example: Active CAMP:CAMP 1/VOL-54"
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  className="flex-grow bg-slate-700/50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-emerald-500 outline-none placeholder:text-slate-500 text-white"
                />
                <div className="flex gap-4">
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="w-20 bg-slate-700/50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-center text-white font-bold"
                  />
                  <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/20">
                    Log
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-50 flex justify-between items-center">
              <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Recent Activity</h2>
              <span className="text-[9px] text-slate-400 font-bold uppercase">{data.logs.filter(l => new Date(l.timestamp) > new Date('2026-01-27T05:00:00')).length} entries</span>
            </div>
            <div className="divide-y divide-slate-50">
              {data.logs.filter(l => new Date(l.timestamp) > new Date('2026-01-27T06:16:00')).length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Activity Log Cleared</p>
                </div>
              ) : (
                data.logs.filter(l => new Date(l.timestamp) > new Date('2026-01-27T06:16:00')).map((log) => (
                  <div key={log.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{log.activity}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(log.timestamp).toLocaleDateString()} • {log.hours}h</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${log.synced ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : view === 'history' ? (
        <div className="space-y-6">
          <div className="bg-indigo-900 p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
            </div>
            <div className="relative z-10">
              <h3 className="text-indigo-300 text-[10px] font-black uppercase mb-2 tracking-[0.2em]">Live Status Feed</h3>
              <h2 className="text-3xl font-black uppercase tracking-tighter">Real-time Updates on Interventions and Facility Repairs</h2>

            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="divide-y divide-slate-50">
              {data.reports.filter(r => new Date(r.timestamp) > new Date('2026-01-27T06:16:00')).length === 0 ? (
                <div className="p-24 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                  </div>
                  <p className="text-xs font-black text-slate-300 uppercase tracking-widest">No reports filed yet</p>
                </div>
              ) : (
                data.reports.filter(r => new Date(r.timestamp) > new Date('2026-01-27T06:16:00')).map((report) => (
                  <div key={report.id} className="p-6 hover:bg-slate-50 transition-all group relative">
                    {/* Nudge Button in Feed */}
                    <div className="absolute top-6 right-6 flex items-center space-x-2">
                      <button
                        onClick={() => handleNudge(report.id)}
                        disabled={report.nudges?.some(n => n.userId === user.id && new Date(n.timestamp).toDateString() === new Date().toDateString())}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-amber-100 text-slate-400 hover:text-amber-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Nudge to increase priority"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        <span className="text-[10px] font-black uppercase">{report.nudges?.length || 0}</span>
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${report.type === ReportType.TOILET ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700'}`}>
                            {report.type.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">
                            {report.zone} — <span className="text-blue-600">{report.facilityId}</span>
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Submitted: {new Date(report.timestamp).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center space-x-3 pr-16">
                        <StatusBadge status={report.status} />
                        <div className={`w-1.5 h-1.5 rounded-full ${report.synced ? 'bg-emerald-500' : 'bg-amber-500'}`} title={report.synced ? 'Synced' : 'Waiting to Sync'}></div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col min-h-[600px]">
          {/* Nudge Notification */}
          {nudgeMessage && !hasLoggedToday && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4 mx-4 rounded-r shadow-md animate-bounce">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-amber-700 font-bold">
                    {nudgeMessage}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Daily Log Requirement Banner */}
          {/* Form Header */}
          <div className="bg-blue-600 p-8 text-white">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                {(() => {
                  let current = step;
                  let total = 9; // Default max

                  if (reportType === ReportType.TOILET) {
                    if (step >= 40 && step < 50) { current = step - 36; total = 9; } // Functional: 40->4, 45->9
                    else if (step >= 50 && step < 60) { current = step - 46; total = 9; } // Limited: 50->4, 55->9
                    else if (step >= 60 && step < 70) { current = step - 56; total = 6; } // No: 60->4, 62->6
                  } else {
                    // Water Point
                    if (step >= 10 && step < 20) { current = step - 6; total = 10; } // Yes: 10->4, 16->10
                    else if (step >= 20 && step < 30) { current = step - 16; total = 9; } // Limited: 20->4, 25->9
                    else if (step >= 30 && step < 40) { current = step - 26; total = 7; } // No: 30->4, 33->7
                  }

                  return `Phase ${current} of ${total}`;
                })()}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setReportType(ReportType.TOILET); setStep(1); }}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${reportType === ReportType.TOILET ? 'bg-white text-blue-600 shadow-md' : 'bg-blue-500/50 text-white hover:bg-blue-500'}`}
                >Toilet</button>
                <button
                  onClick={() => { setReportType(ReportType.WATER_POINT); setStep(1); }}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${reportType === ReportType.WATER_POINT ? 'bg-white text-blue-600 shadow-md' : 'bg-blue-500/50 text-white hover:bg-blue-500'}`}
                >Water Point</button>
              </div>
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tighter">
              {reportType === ReportType.TOILET ? 'Sanitation Audit' : 'Hydration Check'}
            </h2>
          </div>

          {/* Form Content */}
          <div className="p-8 flex-grow overflow-y-auto max-h-[500px]">
            {step === 1 && (
              <div className="space-y-6">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Deployment Zone</label>
                <div className="grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-1 gap-3">
                    {(data.zones && data.zones.length > 0 ? data.zones : ZONES.map(z => ({ id: z, name: z }))).map(z => (
                      <OptionButton
                        key={z.id}
                        label={z.name}
                        isSelected={formData.zone === z.name}
                        onClick={() => { setFormData({ ...formData, zone: z.name }); setStep(2); }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Target Facility</label>
                <div className="grid grid-cols-1 gap-3">
                  {FACILITIES[reportType].map(f => (
                    <OptionButton
                      key={f}
                      label={f}
                      isSelected={formData.facilityId === f}
                      onClick={() => { setFormData({ ...formData, facilityId: f }); setStep(3); }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* TOILET REPORT FLOW */}
            {/* TOILET REPORT FLOW */}
            {reportType === ReportType.TOILET && (
              <>
                {/* GATE QUESTION - Q1 */}
                {step === 3 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                      Q1. Is the toilet functional?
                    </label>
                    <div className="space-y-3">
                      {['YES', 'LIMITED', 'NO'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.isFunctional === opt}
                          onClick={() => {
                            setFormData({ ...formData, isFunctional: opt });
                            if (opt === 'YES') setStep(40); // Section 2A
                            else if (opt === 'LIMITED') setStep(50); // Section 2B
                            else setStep(60); // Section 2C
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* SECTION 2A: YES (Functional) */}
                {formData.isFunctional === 'YES' && (
                  <>
                    {step === 40 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q2. Water Available?</label>
                        <div className="space-y-3">
                          {['YES', 'LIMITED', 'NO'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.water === opt} onClick={() => { setFormData({ ...formData, water: opt }); setStep(41); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 41 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q3. Soap Available?</label>
                        <div className="space-y-3">
                          {['YES', 'NO'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.soap === (opt === 'YES')} onClick={() => { setFormData({ ...formData, soap: opt === 'YES' }); setStep(42); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 42 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q4. Lighting Works?</label>
                        <div className="space-y-3">
                          {['YES', 'NO'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.lighting === (opt === 'YES')} onClick={() => { setFormData({ ...formData, lighting: opt === 'YES' }); setStep(43); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 43 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q5. Door Lock Works?</label>
                        <div className="space-y-3">
                          {['YES', 'NO'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.lock === (opt === 'YES')} onClick={() => { setFormData({ ...formData, lock: opt === 'YES' }); setStep(44); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 44 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q6. Users Per Day?</label>
                        <div className="space-y-3">
                          {['<25', '25-50', '50-100', '100+'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.usersPerDay === opt} onClick={() => { setFormData({ ...formData, usersPerDay: opt }); setStep(45); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 45 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q7/Q8. Users & Notes</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['Women', 'Children', 'Elderly', 'Disabled', 'General population'].map(group => (
                            <button key={group} onClick={() => toggleListValue('users', group)} className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.users.includes(group) ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'}`}>{group} {formData.users.includes(group) && '✓'}</button>
                          ))}
                          <div className="mt-4">
                            <textarea value={formData.notes} onChange={handleNotesChange} placeholder="Additional notes..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none" rows={3} />
                          </div>
                          <button onClick={handleWASHSubmit} className="mt-4 bg-emerald-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-emerald-700">Submit Functional Report</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* SECTION 2B: LIMITED */}
                {formData.isFunctional === 'LIMITED' && (
                  <>
                    {step === 50 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q2. Issues Present (Multi)</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['Limited water', 'Broken lighting', 'No lock', 'Poor cleanliness', 'Long waiting times', 'Structural damage', 'Other'].map(issue => (
                            <button key={issue} onClick={() => toggleListValue('issues', issue)} className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.issues?.includes(issue) ? 'bg-amber-500 text-white border-amber-500 shadow-lg' : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'}`}>{issue} {formData.issues?.includes(issue) && '✓'}</button>
                          ))}
                          <button onClick={() => setStep(51)} className="mt-4 bg-slate-800 text-white py-3 rounded-xl font-black text-xs uppercase">Next</button>
                        </div>
                      </div>
                    )}
                    {step === 51 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q3. Water Available?</label>
                        <div className="space-y-3">
                          {['LIMITED', 'NO'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.water === opt} onClick={() => { setFormData({ ...formData, water: opt }); setStep(52); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 52 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q4. Soap Available?</label>
                        <div className="space-y-3">
                          {['YES', 'NO'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.soap === (opt === 'YES')} onClick={() => { setFormData({ ...formData, soap: opt === 'YES' }); setStep(53); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 53 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q5. Lighting Works?</label>
                        <div className="space-y-3">
                          {['YES', 'NO'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.lighting === (opt === 'YES')} onClick={() => { setFormData({ ...formData, lighting: opt === 'YES' }); setStep(54); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 54 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q6. Users Per Day?</label>
                        <div className="space-y-3">
                          {['<25', '25-50', '50-100', '100+'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.usersPerDay === opt} onClick={() => { setFormData({ ...formData, usersPerDay: opt }); setStep(55); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 55 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q7/Q8. Users & Notes</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['Women', 'Children', 'Elderly', 'Disabled', 'General population'].map(group => (
                            <button key={group} onClick={() => toggleListValue('users', group)} className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.users.includes(group) ? 'bg-amber-600 text-white border-amber-600 shadow-lg' : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'}`}>{group} {formData.users.includes(group) && '✓'}</button>
                          ))}
                          <div className="mt-4">
                            <textarea value={formData.notes} onChange={handleNotesChange} placeholder="Additional notes..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-amber-500 outline-none" rows={3} />
                          </div>
                          <button onClick={handleWASHSubmit} className="mt-4 bg-amber-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-amber-700">Submit Limited Report</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* SECTION 2C: NON-FUNCTIONAL (NO) */}
                {formData.isFunctional === 'NO' && (
                  <>
                    {step === 60 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q2. Reason Unusable (Multi)</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['No water', 'Completely blocked', 'Structural collapse', 'Safety risk', 'Flooded', 'Vandalized', 'Other'].map(issue => (
                            <button key={issue} onClick={() => toggleListValue('reasonUnusable', issue)} className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.reasonUnusable?.includes(issue) ? 'bg-red-500 text-white border-red-500 shadow-lg' : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'}`}>{issue} {formData.reasonUnusable?.includes(issue) && '✓'}</button>
                          ))}
                          <button onClick={() => setStep(61)} className="mt-4 bg-slate-800 text-white py-3 rounded-xl font-black text-xs uppercase">Next</button>
                        </div>
                      </div>
                    )}
                    {step === 61 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q3. Alternative Toilet Nearby?</label>
                        <div className="space-y-3">
                          {['YES', 'NO', 'UNKNOWN'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.alternativeNearby === opt} onClick={() => { setFormData({ ...formData, alternativeNearby: opt }); setStep(62); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 62 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q4/Q5. Users & Notes</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['Women', 'Children', 'Elderly', 'Disabled', 'General population'].map(group => (
                            <button key={group} onClick={() => toggleListValue('users', group)} className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.users.includes(group) ? 'bg-red-600 text-white border-red-600 shadow-lg' : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'}`}>{group} {formData.users.includes(group) && '✓'}</button>
                          ))}
                          <div className="mt-4">
                            <textarea value={formData.notes} onChange={handleNotesChange} placeholder="Additional notes..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-red-500 outline-none" rows={3} />
                          </div>
                          <button onClick={handleWASHSubmit} className="mt-4 bg-red-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-red-700">Submit Critical Report</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* WATER POINT REPORT FLOW */}
            {reportType === ReportType.WATER_POINT && (
              <>
                {/* GATE QUESTION - Q1 */}
                {step === 3 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                      Q1. Is the water point functional?
                    </label>
                    <div className="space-y-3">
                      {['YES', 'LIMITED', 'NO'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.isFunctional === opt}
                          onClick={() => {
                            setFormData({ ...formData, isFunctional: opt });
                            // Branching Logic
                            if (opt === 'YES') setStep(10); // Section 2A
                            else if (opt === 'LIMITED') setStep(20); // Section 2B
                            else setStep(30); // Section 2C
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* SECTION 2A: FUNCTIONAL (YES) */}
                {formData.isFunctional === 'YES' && (
                  <>
                    {step === 10 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q2. Currently Available?</label>
                        <div className="space-y-3">
                          {['YES', 'LIMITED'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.available === opt} onClick={() => { setFormData({ ...formData, available: opt }); setStep(11); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 11 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q3. Flow Strength?</label>
                        <div className="space-y-3">
                          {['Strong', 'Weak'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.flowStrength === opt} onClick={() => { setFormData({ ...formData, flowStrength: opt }); setStep(12); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 12 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q4. Water Quality?</label>
                        <div className="space-y-3">
                          {['Clear', 'Dirty', 'Smelly', 'Unknown'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.quality === opt} onClick={() => { setFormData({ ...formData, quality: opt }); setStep(13); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 13 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q5. Users Per Day?</label>
                        <div className="space-y-3">
                          {['<25', '25-50', '50-100', '100+'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.usersPerDay === opt} onClick={() => { setFormData({ ...formData, usersPerDay: opt }); setStep(14); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 14 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q6. Avg Waiting Time?</label>
                        <div className="space-y-3">
                          {['<5 min', '5–15 min', '>15 min'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.waitingTime === opt} onClick={() => { setFormData({ ...formData, waitingTime: opt }); setStep(15); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 15 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q8. Area Condition?</label>
                        <div className="space-y-3">
                          {['Clean', 'Muddy', 'Flooded', 'Unsafe'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.areaCondition === opt} onClick={() => { setFormData({ ...formData, areaCondition: opt }); setStep(16); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 16 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q7/Q9. Primary Users & Notes</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['Women', 'Children', 'Elderly', 'Disabled', 'Men'].map(group => (
                            <button key={group} onClick={() => toggleListValue('users', group)} className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.users.includes(group) ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'}`}>{group} {formData.users.includes(group) && '✓'}</button>
                          ))}
                          <div className="mt-4">
                            <textarea value={formData.notes} onChange={handleNotesChange} placeholder="Section 2A Additional notes..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none" rows={3} />
                          </div>
                          <button onClick={handleWASHSubmit} className="mt-4 bg-emerald-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-emerald-700">Submit Functional Report</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* SECTION 2B: LIMITED */}
                {formData.isFunctional === 'LIMITED' && (
                  <>
                    {step === 20 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q2. Issues Present (Multi)</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['Intermittent water', 'Very weak flow', 'Long queues', 'Poor water quality', 'Structural damage', 'Safety concern', 'Other'].map(issue => (
                            <button key={issue} onClick={() => toggleListValue('wpIssues', issue)} className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.wpIssues?.includes(issue) ? 'bg-amber-500 text-white border-amber-500 shadow-lg' : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'}`}>{issue} {formData.wpIssues?.includes(issue) && '✓'}</button>
                          ))}
                          <button onClick={() => setStep(21)} className="mt-4 bg-slate-800 text-white py-3 rounded-xl font-black text-xs uppercase">Next</button>
                        </div>
                      </div>
                    )}
                    {step === 21 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q3. Currently Available?</label>
                        <div className="space-y-3">
                          {['LIMITED', 'NO'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.available === opt} onClick={() => { setFormData({ ...formData, available: opt }); setStep(22); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 22 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q4. Water Quality?</label>
                        <div className="space-y-3">
                          {['Clear', 'Dirty', 'Smelly', 'Unknown'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.quality === opt} onClick={() => { setFormData({ ...formData, quality: opt }); setStep(23); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 23 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q5. Users Per Day?</label>
                        <div className="space-y-3">
                          {['<25', '25-50', '50-100', '100+'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.usersPerDay === opt} onClick={() => { setFormData({ ...formData, usersPerDay: opt }); setStep(24); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 24 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q6. Avg Waiting Time?</label>
                        <div className="space-y-3">
                          {['<5 min', '5–15 min', '>15 min'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.waitingTime === opt} onClick={() => { setFormData({ ...formData, waitingTime: opt }); setStep(25); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 25 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q7/Q8. Primary Users & Notes</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['Women', 'Children', 'Elderly', 'Disabled', 'Men'].map(group => (
                            <button key={group} onClick={() => toggleListValue('users', group)} className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.users.includes(group) ? 'bg-amber-600 text-white border-amber-600 shadow-lg' : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'}`}>{group} {formData.users.includes(group) && '✓'}</button>
                          ))}
                          <div className="mt-4">
                            <textarea value={formData.notes} onChange={handleNotesChange} placeholder="Section 2B Additional notes..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-amber-500 outline-none" rows={3} />
                          </div>
                          <button onClick={handleWASHSubmit} className="mt-4 bg-amber-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-amber-700">Submit Limited Report</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* SECTION 2C: NON-FUNCTIONAL (NO) */}
                {formData.isFunctional === 'NO' && (
                  <>
                    {step === 30 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q2. Reason (Multi)</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['No water source', 'Pump broken', 'Tap damaged', 'Contaminated water', 'Flooded', 'Safety risk', 'Other'].map(issue => (
                            <button key={issue} onClick={() => toggleListValue('wpReasonNonFunctional', issue)} className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.wpReasonNonFunctional?.includes(issue) ? 'bg-red-500 text-white border-red-500 shadow-lg' : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'}`}>{issue} {formData.wpReasonNonFunctional?.includes(issue) && '✓'}</button>
                          ))}
                          <button onClick={() => setStep(31)} className="mt-4 bg-slate-800 text-white py-3 rounded-xl font-black text-xs uppercase">Next</button>
                        </div>
                      </div>
                    )}
                    {step === 31 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q3. Alternative Nearby?</label>
                        <div className="space-y-3">
                          {['YES', 'NO', 'UNKNOWN'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.wpAlternativeNearby === opt} onClick={() => { setFormData({ ...formData, wpAlternativeNearby: opt }); setStep(32); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 32 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q4. Distance to Alternative?</label>
                        <div className="space-y-3">
                          {['<100m', '100–300m', '>300m', 'Unknown'].map(opt => (
                            <OptionButton key={opt} label={opt} isSelected={formData.wpAlternativeDistance === opt} onClick={() => { setFormData({ ...formData, wpAlternativeDistance: opt }); setStep(33); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {step === 33 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Q5/Q6. Affected Users & Notes</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['Women', 'Children', 'Elderly', 'Disabled', 'General population'].map(group => (
                            <button key={group} onClick={() => toggleListValue('users', group)} className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.users.includes(group) ? 'bg-red-600 text-white border-red-600 shadow-lg' : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'}`}>{group} {formData.users.includes(group) && '✓'}</button>
                          ))}
                          <div className="mt-4">
                            <textarea value={formData.notes} onChange={handleNotesChange} placeholder="Section 2C Additional notes..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-red-500 outline-none" rows={3} />
                          </div>
                          <button onClick={handleWASHSubmit} className="mt-4 bg-red-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-red-700">Submit Critical Report</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Form Footer */}
          {step > 1 && (
            <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
              <button
                onClick={() => {
                  if ([40, 50, 60, 10, 20, 30].includes(step)) {
                    setStep(3);
                  } else {
                    setStep(step - 1);
                  }
                }}
                className="text-[10px] font-black uppercase text-slate-400 hover:text-blue-600 transition-colors tracking-widest flex items-center space-x-2"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                <span>Back to previous step</span>
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default VolunteerDashboard;
