
import React, { useState, useEffect } from 'react';
import { User, AppData, FieldLog, ReportType, WASHReport, ReportStatus } from '../types';
import { db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { OfflineAI } from '../services/OfflineAI';
import { addLog, addReport, nudgeReport } from '../services/db';
import { calculateRiskScore, calculateWaterPointRisk } from '../utils/risk';


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
  const [formData, setFormData] = useState<any>({
    zone: 'Zone A',
    facilityId: '',
    usable: '', // Toilet: Facility working?
    water: '', // Toilet: Water available?
    soap: null, // Toilet: Soap available? (boolean)
    lighting: null, // Toilet: Lighting works? (boolean)
    lock: null, // Toilet: Lock works? (boolean)
    usersPerDay: '', // Toilet: Users per day?
    users: [], // Toilet: Primary users?
    available: '', // Water Point
    isFunctional: '',
    quality: '',
    usagePressure: '',
    waitingTime: '',
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

    if (!isOnline) {
      alert("You are offline. Log will be saved locally and sync when online.");
    }

    const newLog: FieldLog = {
      id: Math.random().toString(36).substr(2, 9),
      authorName: user.name || user.id,
      timestamp: new Date().toISOString(),
      activity,
      hours: parseFloat(hours),
      synced: isOnline
    };

    await addLog(newLog);
    setActivity('');
    alert("Activity Logged!");
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

    const riskAnalysis = reportType === ReportType.TOILET ? calculateRiskScore({
      usability: formData.usable?.toLowerCase(),
      water: formData.water?.toLowerCase(),
      soap: formData.soap === true,
      lighting: formData.lighting === true,
      lock: formData.lock === true,
      usersPerDay: formData.usersPerDay,
      users: formData.users
    }) : calculateWaterPointRisk({
      functional: formData.isFunctional?.toLowerCase().replace('working: ', ''), // Handle "Working: Yes/No" format if present
      availability: formData.available?.toLowerCase(),
      quality: formData.quality?.toLowerCase(),
      waitingTime: formData.waitingTime,
      usersPerDay: formData.usersPerDay,
      users: formData.users
    });

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

    await addReport(newReport);
    resetForm();
    alert('Report Submitted Successfully');
    setView('history');
  };

  const resetForm = () => {
    setStep(1);
    setFormData({
      zone: 'Zone A',
      facilityId: '',
      usable: '',
      water: '',
      soap: null,
      lighting: null,
      lock: null,
      usersPerDay: '',
      users: [],
      available: '',
      isFunctional: '',
      quality: '',
      usagePressure: '',
      waitingTime: '',
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
              <h3 className="text-xl font-black text-slate-800 uppercase mb-2">Duplicate Report</h3>
              <p className="text-sm text-slate-500 mb-6 font-medium">
                An active report for <span className="text-slate-800 font-bold">{duplicateReport.facilityId}</span> in <span className="text-slate-800 font-bold">{duplicateReport.zone}</span> already exists.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => handleNudge(duplicateReport.id)}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black uppercase py-4 rounded-xl shadow-lg shadow-amber-200 transition-all flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                  <span>Nudge Priority</span>
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
                  placeholder="What did you achieve today?"
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
              <span className="text-[9px] text-slate-400 font-bold uppercase">{data.logs.length} entries</span>
            </div>
            <div className="divide-y divide-slate-50">
              {data.logs.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-xs font-black text-slate-300 uppercase tracking-widest">No activity logged today</p>
                </div>
              ) : (
                data.logs.map((log) => (
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
              <h2 className="text-3xl font-black uppercase tracking-tighter">Audit Resolution Tracking</h2>
              <p className="text-xs text-indigo-200 mt-2 font-medium">Monitor HQ interventions and facility repairs in real-time.</p>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="divide-y divide-slate-50">
              {data.reports.length === 0 ? (
                <div className="p-24 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                  </div>
                  <p className="text-xs font-black text-slate-300 uppercase tracking-widest">No reports filed yet</p>
                </div>
              ) : (
                data.reports.map((report) => (
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
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Phase {step} of {reportType === ReportType.TOILET ? 9 : 8}</span>
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
                    {data.zones?.map(z => (
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
            {reportType === ReportType.TOILET && (
              <>
                {step === 3 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">1. Facility Working?</label>
                    <div className="space-y-3">
                      {['Yes', 'Limited', 'No'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.usable === opt}
                          onClick={() => { setFormData({ ...formData, usable: opt }); setStep(4); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">2. Water Available?</label>
                    <div className="space-y-3">
                      {['Yes', 'Limited', 'None'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.water === opt}
                          onClick={() => { setFormData({ ...formData, water: opt }); setStep(5); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">3. Soap Available?</label>
                    <div className="space-y-3">
                      {['Yes', 'No'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.soap === (opt === 'Yes')}
                          onClick={() => { setFormData({ ...formData, soap: opt === 'Yes' }); setStep(6); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 6 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">4. Lighting Works?</label>
                    <div className="space-y-3">
                      {['Yes', 'No'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.lighting === (opt === 'Yes')}
                          onClick={() => { setFormData({ ...formData, lighting: opt === 'Yes' }); setStep(7); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 7 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">5. Lock Works?</label>
                    <div className="space-y-3">
                      {['Yes', 'No'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.lock === (opt === 'Yes')}
                          onClick={() => { setFormData({ ...formData, lock: opt === 'Yes' }); setStep(8); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 8 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">6. Users Per Day?</label>
                    <div className="space-y-3">
                      {['<25', '25-50', '50-100', '100+'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.usersPerDay === opt}
                          onClick={() => { setFormData({ ...formData, usersPerDay: opt }); setStep(9); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 9 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">7. Primary Users?</label>
                    <div className="grid grid-cols-1 gap-2">
                      {['Women', 'Children', 'Men', 'Elderly', 'Disabled'].map(group => (
                        <button
                          key={group}
                          onClick={() => toggleListValue('users', group)}
                          className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.users.includes(group)
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg'
                            : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'
                            }`}
                        >
                          {group}
                          {formData.users.includes(group) && (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          )}
                        </button>
                      ))}

                      <div className="mt-6">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">Field Notes</label>
                        <textarea
                          value={formData.notes}
                          onChange={handleNotesChange}
                          placeholder="Any additional observations..."
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          rows={3}
                        />
                      </div>

                      <button onClick={handleWASHSubmit} className="mt-6 bg-emerald-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-100 transition-all hover:bg-emerald-700">Calculate Risk & Submit</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* WATER POINT REPORT FLOW */}
            {reportType === ReportType.WATER_POINT && (
              <>
                {step === 3 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                      1. Water Availability?
                    </label>
                    <div className="space-y-3">
                      {['Yes', 'Limited', 'None'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.available === opt}
                          onClick={() => { setFormData({ ...formData, available: opt }); setStep(4); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                      2. Water Quality?
                    </label>
                    <div className="space-y-3">
                      {['Clear', 'Dirty', 'Smelly'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.quality === opt}
                          onClick={() => { setFormData({ ...formData, quality: opt }); setStep(5); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                      3. Functional?
                    </label>
                    <div className="space-y-3">
                      {['Yes', 'No'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.isFunctional === opt}
                          onClick={() => { setFormData({ ...formData, isFunctional: opt }); setStep(6); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 6 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                      4. Waiting Time?
                    </label>
                    <div className="space-y-3">
                      {['<5 min', '5–15 min', '15+ min'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.waitingTime === opt}
                          onClick={() => { setFormData({ ...formData, waitingTime: opt }); setStep(7); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 7 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                      5. Users Per Day?
                    </label>
                    <div className="space-y-3">
                      {['<25', '25-50', '50-100', '100+'].map(opt => (
                        <OptionButton
                          key={opt}
                          label={opt}
                          isSelected={formData.usersPerDay === opt}
                          onClick={() => { setFormData({ ...formData, usersPerDay: opt }); setStep(8); }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 8 && (
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">6. Primary Users?</label>
                    <div className="grid grid-cols-1 gap-2">
                      {['Women', 'Children', 'Elderly', 'Disabled', 'Men'].map(group => (
                        <button
                          key={group}
                          onClick={() => toggleListValue('users', group)}
                          className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.users.includes(group)
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg'
                            : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'
                            }`}
                        >
                          {group}
                          {formData.users.includes(group) && (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          )}
                        </button>
                      ))}

                      <div className="mt-6">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">Field Notes</label>
                        <textarea
                          value={formData.notes}
                          onChange={handleNotesChange}
                          placeholder="Describe any critical issues..."
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          rows={3}
                        />
                      </div>

                      <button onClick={handleWASHSubmit} className="mt-6 bg-emerald-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-100 transition-all hover:bg-emerald-700">Calculate Risk & Submit</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Form Footer */}
          {step > 1 && (
            <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
              <button
                onClick={() => setStep(step - 1)}
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
