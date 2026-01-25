
import React, { useState } from 'react';
import { User, AppData, FieldLog, ReportType, WASHReport, ReportStatus } from '../types';
import { OfflineAI } from '../services/OfflineAI';

interface VolunteerDashboardProps {
  user: User;
  isOnline: boolean;
  data: AppData;
  onUpdate: (data: AppData) => void;
}

const ZONES = ['Zone A', 'Zone B', 'Zone C'] as const;
const FACILITIES = {
  TOILET: ['Toilet 1', 'Toilet 2', 'Toilet 3', 'Toilet 4'],
  WATER_POINT: ['Water Point 1', 'Water Point 2', 'Water Point 3']
};

const VolunteerDashboard: React.FC<VolunteerDashboardProps> = ({ user, isOnline, data, onUpdate }) => {
  const [view, setView] = useState<'activity' | 'wash' | 'history'>('activity');
  const [reportType, setReportType] = useState<ReportType>(ReportType.TOILET);
  const [step, setStep] = useState(1);

  // Activity Log State
  const [activity, setActivity] = useState('');
  const [hours, setHours] = useState('1');

  // WASH Report State
  const [formData, setFormData] = useState<any>({
    zone: 'Zone A',
    facilityId: '',
    usable: '',
    available: '',
    isFunctional: '',
    quality: '',
    usagePressure: '',
    waitingTime: '',
    problems: [],
    targetGroups: [],
    lighting: '',
    notes: '',
    urgency: 'Normal'
  });

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const urgency = OfflineAI.analyzeUrgency(text);
    setFormData(prev => ({ ...prev, notes: text, urgency }));
  };

  const handleLogActivity = (e: React.FormEvent) => {
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

    onUpdate({ ...data, logs: [newLog, ...data.logs] });
    setActivity('');
  };

  const handleWASHSubmit = () => {
    const newReport: WASHReport = {
      id: Math.random().toString(36).substr(2, 9),
      type: reportType,
      zone: formData.zone,
      facilityId: formData.facilityId,
      timestamp: new Date().toISOString(),
      synced: isOnline,
      status: 'Pending',
      details: { ...formData }
    };

    onUpdate({ ...data, reports: [newReport, ...(data.reports || [])] });
    setStep(1);
    setFormData({
      zone: 'Zone A',
      facilityId: '',
      usable: '',
      available: '',
      isFunctional: '',
      quality: '',
      usagePressure: '',
      waitingTime: '',
      problems: [],
      targetGroups: [],
      lighting: ''
    });
    alert('Report Submitted Successfully');
    setView('history');
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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Field Dashboard</h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active Sector: Sector-4G / {user.id}</p>
        </div>
        <div className="flex bg-slate-200 p-1 rounded-xl">
          <button
            onClick={() => setView('activity')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${view === 'activity' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500'}`}
          >
            Daily Log
          </button>
          <button
            onClick={() => setView('wash')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${view === 'wash' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
          >
            WASH Report
          </button>
          <button
            onClick={() => setView('history')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${view === 'history' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
          >
            Status Feed
          </button>
        </div>
      </div>

      {view === 'activity' ? (
        <div className="space-y-6">
          <div className="bg-slate-800 p-6 rounded-3xl shadow-xl text-white">
            <h3 className="text-slate-400 text-[10px] font-black uppercase mb-4 tracking-widest">Post Field Update</h3>
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
                  <div key={report.id} className="p-6 hover:bg-slate-50 transition-all group">
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
                      <div className="flex items-center space-x-3">
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
          {/* Form Header */}
          <div className="bg-blue-600 p-8 text-white">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Phase {step} of {reportType === ReportType.TOILET ? 7 : 8}</span>
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
                  {ZONES.map(z => (
                    <OptionButton
                      key={z}
                      label={z}
                      isSelected={formData.zone === z}
                      onClick={() => { setFormData({ ...formData, zone: z }); setStep(2); }}
                    />
                  ))}
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

            {step === 3 && (
              <div className="space-y-6">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                  {reportType === ReportType.TOILET ? 'Current Usability' : 'Water Availability'}
                </label>
                <div className="space-y-3">
                  {['Yes', reportType === ReportType.TOILET ? 'Partially' : 'Limited', 'No'].map(opt => (
                    <OptionButton
                      key={opt}
                      label={opt}
                      isSelected={(reportType === ReportType.TOILET ? formData.usable : formData.available) === opt}
                      onClick={() => { setFormData({ ...formData, [reportType === ReportType.TOILET ? 'usable' : 'available']: opt }); setStep(4); }}
                    />
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                  {reportType === ReportType.TOILET ? 'Infrastructure Issues' : 'Mechanical Integrity'}
                </label>
                {reportType === ReportType.TOILET ? (
                  <div className="grid grid-cols-1 gap-2">
                    {['Broken door / no lock', 'Overflowing / clogged', 'Strong smell', 'Unsafe at night', 'No water nearby', 'Not accessible'].map(issue => (
                      <button
                        key={issue}
                        onClick={() => toggleListValue('problems', issue)}
                        className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.problems.includes(issue)
                          ? 'bg-blue-600 text-white border-blue-600 shadow-lg'
                          : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'
                          }`}
                      >
                        {issue}
                        {formData.problems.includes(issue) && (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        )}
                      </button>
                    ))}
                    <button onClick={() => setStep(5)} className="mt-4 bg-slate-900 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200">Continue Observation</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {['Yes', 'No'].map(opt => (
                      <OptionButton
                        key={opt}
                        label={`Working: ${opt}`}
                        isSelected={formData.isFunctional === opt}
                        onClick={() => { setFormData({ ...formData, isFunctional: opt }); setStep(5); }}
                      />
                    ))}
                  </div>
                )}


                <div className="mt-6">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">Field Notes & Urgency</label>
                  <textarea
                    value={formData.notes}
                    onChange={handleNotesChange}
                    placeholder="Describe any critical issues (e.g., 'Cholera suspected', 'Severe leak')..."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    rows={3}
                  />
                  {formData.urgency !== 'Normal' && (
                    <div className={`mt-2 p-3 rounded-lg flex items-center space-x-2 ${formData.urgency === 'Critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <span className="text-[10px] font-black uppercase tracking-widest">AI Flag: {formData.urgency} Priority</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                  {reportType === ReportType.TOILET ? 'Lighting at Night' : 'Visual Purity Check'}
                </label>
                <div className="space-y-3">
                  {(reportType === ReportType.TOILET ? ['Yes', 'No'] : ['Clear', 'Dirty', 'Smelly']).map(opt => (
                    <OptionButton
                      key={opt}
                      label={opt}
                      isSelected={(reportType === ReportType.TOILET ? formData.lighting : formData.quality) === opt}
                      onClick={() => { setFormData({ ...formData, [reportType === ReportType.TOILET ? 'lighting' : 'quality']: opt }); setStep(6); }}
                    />
                  ))}
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-6">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                  {reportType === ReportType.TOILET ? 'Population Load' : 'Congestion / Waiting'}
                </label>
                <div className="space-y-3">
                  {(reportType === ReportType.TOILET
                    ? ['<25', '25-50', '50-100', '100+']
                    : ['<5 minutes', '5-15 minutes', '>15 minutes']
                  ).map(opt => (
                    <OptionButton
                      key={opt}
                      label={opt}
                      isSelected={(reportType === ReportType.TOILET ? formData.usagePressure : formData.waitingTime) === opt}
                      onClick={() => { setFormData({ ...formData, [reportType === ReportType.TOILET ? 'usagePressure' : 'waitingTime']: opt }); setStep(7); }}
                    />
                  ))}
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="space-y-6">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                  {reportType === ReportType.TOILET ? 'Demographics Identified' : 'Load Estimate'}
                </label>
                {reportType === ReportType.TOILET ? (
                  <div className="grid grid-cols-1 gap-2">
                    {['Women & girls', 'Children', 'Men', 'Elderly / disabled'].map(group => (
                      <button
                        key={group}
                        onClick={() => toggleListValue('targetGroups', group)}
                        className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.targetGroups.includes(group)
                          ? 'bg-blue-600 text-white border-blue-600 shadow-lg'
                          : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'
                          }`}
                      >
                        {group}
                        {formData.targetGroups.includes(group) && (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        )}
                      </button>
                    ))}
                    <button onClick={handleWASHSubmit} className="mt-6 bg-emerald-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-100 transition-all hover:bg-emerald-700">Finalize Report</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {['<25', '25-50', '50-100', '100+'].map(opt => (
                      <OptionButton
                        key={opt}
                        label={opt}
                        isSelected={formData.usagePressure === opt}
                        onClick={() => { setFormData({ ...formData, usagePressure: opt }); setStep(8); }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 8 && reportType === ReportType.WATER_POINT && (
              <div className="space-y-6">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Primary Users</label>
                <div className="grid grid-cols-1 gap-2">
                  {['Women & girls', 'Children', 'Men', 'Elderly / disabled'].map(group => (
                    <button
                      key={group}
                      onClick={() => toggleListValue('targetGroups', group)}
                      className={`p-4 rounded-xl border-2 text-left text-[11px] font-black uppercase tracking-tight transition-all flex items-center justify-between ${formData.targetGroups.includes(group)
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg'
                        : 'bg-white border-slate-100 text-slate-800 hover:border-slate-300'
                        }`}
                    >
                      {group}
                      {formData.targetGroups.includes(group) && (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      )}
                    </button>
                  ))}
                  <button onClick={handleWASHSubmit} className="mt-6 bg-emerald-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-100 transition-all hover:bg-emerald-700">Finalize Report</button>
                </div>
              </div>
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
