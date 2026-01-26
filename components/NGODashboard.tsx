
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { User, AppData, WASHReport, ReportType, ReportStatus, FieldLog } from '../types';
import L from 'leaflet';
import { addReport, addZone, deleteZone, createUserProfile, deleteUser, nudgeVolunteer, addLog } from '../services/db';
import { UserRole } from '../types';

interface NGODashboardProps {
  user: User;
  isOnline: boolean;
  data: AppData;
}

interface RiskDetails {
  zone: string;
  prob: number;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  confidence: 'High' | 'Medium' | 'Low';
  reportCount: number;
  signals: string[];
}

/* Dynamic Zones: Loaded from AppData */

const NGODashboard: React.FC<NGODashboardProps> = ({ user, data, isOnline }) => {
  const [selectedZoneDetail, setSelectedZoneDetail] = useState<RiskDetails | null>(null);
  const [feedType, setFeedType] = useState<'REPORTS' | 'LOGS'>('REPORTS');
  const [reportFilter, setReportFilter] = useState<'ALL' | ReportType>('ALL');
  const [isManagingZones, setIsManagingZones] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [isManagingVolunteers, setIsManagingVolunteers] = useState(false);
  const [newVolId, setNewVolId] = useState('');
  const [newVolName, setNewVolName] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const zoneLayers = useRef<L.FeatureGroup | null>(null);

  // AI Brain: Risk Logic + Signal Extraction
  const riskAnalysis = useMemo(() => {
    const zones = data.zones?.map(z => z.name) || [];

    return zones.map(zone => {
      const zoneReports = data.reports.filter(r => r.zone === zone && r.status !== 'Resolved');
      let totalToiletScore = 0;
      let totalWaterScore = 0;
      let toiletCount = 0;
      let waterCount = 0;
      let unusableToilets = 0;
      let nonFunctionalWater = 0;
      let highPressureCount = 0;
      let vulnerableGroupsDetected = false;

      zoneReports.forEach(r => {
        const signals = r.details;
        if (r.type === ReportType.TOILET) {
          toiletCount++;
          let s = 0;
          if (signals.usable === 'No') { s += 2; unusableToilets++; }
          else if (signals.usable === 'Partially') s += 1;

          if (signals.problems?.includes('Overflowing / clogged')) s += 2;
          if (signals.problems?.includes('Unsafe at night')) s += 1;
          if (signals.lighting === 'No') s += 1;
          if (signals.usagePressure === '100+') { s += 2; highPressureCount++; }
          if (signals.targetGroups?.some(g => ['Women & girls', 'Children'].includes(g))) { s += 1; vulnerableGroupsDetected = true; }
          totalToiletScore += s;
        } else {
          waterCount++;
          let s = 0;
          if (signals.available === 'No') { s += 3; nonFunctionalWater++; }
          else if (signals.available === 'Limited') s += 1;

          if (signals.isFunctional === 'No') { s += 2; nonFunctionalWater++; }
          if (['Dirty', 'Smelly'].includes(signals.quality || '')) s += 2;
          if (signals.usagePressure === '100+') { s += 2; highPressureCount++; }
          if (signals.targetGroups?.some(g => ['Women & girls', 'Children'].includes(g))) { s += 1; vulnerableGroupsDetected = true; }
          totalWaterScore += s;
        }
      });

      const avgToilet = toiletCount ? totalToiletScore / toiletCount : 0;
      const avgWater = waterCount ? totalWaterScore / waterCount : 0;
      const combinedRisk = (avgToilet + avgWater) / 2;
      const prob = Math.min(combinedRisk / 8, 1);

      let priority: 'Critical' | 'High' | 'Medium' | 'Low' = 'Low';
      if (prob >= 0.7) priority = 'Critical';
      else if (prob >= 0.45) priority = 'High';
      else if (prob >= 0.3) priority = 'Medium';

      const confidence: 'High' | 'Medium' | 'Low' = zoneReports.length > 5 ? 'High' : zoneReports.length > 2 ? 'Medium' : 'Low';

      const signals: string[] = [];
      if (unusableToilets > 0) signals.push(`${unusableToilets}/${toiletCount} toilets reported unusable`);
      if (nonFunctionalWater > 0) signals.push(`${nonFunctionalWater} water points failing or dry`);
      if (highPressureCount > 0) signals.push(`Extreme usage pressure (100+ users per unit)`);
      if (vulnerableGroupsDetected) signals.push(`Women & children present in high-risk zone`);
      if (zoneReports.length > 0) signals.push(`${zoneReports.length} independent volunteer reports`);

      return { zone, prob, priority, confidence, reportCount: zoneReports.length, signals };
    });
  }, [data.reports, data.zones]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current, {
        center: [21.1966, 92.1583],
        zoom: 13,
        zoomControl: false,
        attributionControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(leafletMap.current);
      zoneLayers.current = L.featureGroup().addTo(leafletMap.current);
    }

    if (zoneLayers.current) {
      zoneLayers.current.clearLayers();

      riskAnalysis.forEach((analysis) => {
        const zoneData = data.zones?.find(z => z.name === analysis.zone);
        if (!zoneData) return;

        const coords = zoneData.coordinates as L.LatLngExpression[];

        const color = analysis.priority === 'Critical' ? '#ef4444' :
          analysis.priority === 'High' ? '#f59e0b' :
            analysis.priority === 'Medium' ? '#10b981' : '#3b82f6';

        const polygon = L.polygon(coords, {
          color: color,
          fillColor: color,
          fillOpacity: 0.6,
          weight: 2
        });

        polygon.on('click', () => setSelectedZoneDetail(analysis));
        polygon.bindTooltip(`<b>${analysis.zone}</b><br/>Risk: ${(analysis.prob * 100).toFixed(0)}%`, {
          permanent: false,
          direction: 'top',
          className: 'bg-slate-900 border-none text-white text-[10px] font-black rounded px-2 py-1 shadow-lg'
        });

        polygon.addTo(zoneLayers.current!);
      });

      if (zoneLayers.current.getLayers().length > 0) {
        leafletMap.current.fitBounds(zoneLayers.current.getBounds(), { padding: [20, 20] });
      }
    }
  }, [riskAnalysis]);

  const updateReportStatus = async (reportId: string, status: ReportStatus) => {
    const reportToUpdate = data.reports.find(r => r.id === reportId);
    if (reportToUpdate) {
      await addReport({ ...reportToUpdate, status, synced: isOnline });
    }
  };

  const filteredReports = useMemo(() => {
    return data.reports.filter(r => reportFilter === 'ALL' || r.type === reportFilter);
  }, [data.reports, reportFilter]);

  const totalPersonnelHours = useMemo(() => {
    return data.logs.reduce((acc, log) => acc + log.hours, 0);
  }, [data.logs]);

  const StatusBadge = ({ report }: { report: WASHReport }) => {
    const status = report.status || 'Pending';
    const isResolved = status === 'Resolved';
    const colors = {
      'Pending': 'border-slate-200 text-slate-400',
      'Acknowledged': 'border-blue-200 text-blue-600 bg-blue-50',
      'In Progress': 'border-amber-200 text-amber-600 bg-amber-50 animate-pulse',
      'Resolved': 'border-emerald-200 text-emerald-600 bg-emerald-50'
    };
    const nextStatus: Record<string, ReportStatus> = {
      'Pending': 'Acknowledged',
      'Acknowledged': 'In Progress',
      'In Progress': 'Resolved',
      'Resolved': 'Resolved' // Stay on Resolved
    };

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          const next = nextStatus[status] || 'Pending';
          updateReportStatus(report.id, next);
        }}
        className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm ${colors[status]}`}
      >
        {status}
      </button>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="text-center pt-8 pb-4">
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase mb-2">
          {user.organization} HQ
        </h1>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] inline-block border-b-2 border-slate-100 pb-2">
          Humanitarian Intelligence Portal
        </p>
      </div>

      {/* Tactical Map */}
      <div className="bg-[#0f172a] rounded-[2.5rem] overflow-hidden border border-slate-800 shadow-2xl h-[400px] relative">
        <div ref={mapRef} className="w-full h-full tactical-map z-0" />
        <div className="absolute top-6 left-6 z-[10] bg-[#1a2333]/90 backdrop-blur-md border border-white/5 p-5 rounded-2xl shadow-2xl max-w-[240px]">
          <h3 className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1.5">Spatial Intelligence</h3>
          <p className="text-xs font-black text-white uppercase tracking-tight mb-4">Tactical Deployment Zones</p>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1"><div className="w-2 h-2 rounded-full bg-red-500"></div><span className="text-[8px] font-black text-slate-400 uppercase">Critical</span></div>
            <div className="flex items-center space-x-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div><span className="text-[8px] font-black text-slate-400 uppercase">High</span></div>
            <div className="flex items-center space-x-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span className="text-[8px] font-black text-slate-400 uppercase">Medium</span></div>
          </div>
          <button
            onClick={() => setIsManagingZones(true)}
            className="w-full mt-3 bg-white/10 hover:bg-white/20 text-white text-[9px] font-black uppercase py-2 rounded-lg transition-all border border-white/10"
          >
            Manage Zones
          </button>
          <button
            onClick={() => setIsManagingVolunteers(true)}
            className="w-full mt-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase py-2 rounded-lg transition-all border border-emerald-500/20"
          >
            Manage Volunteers
          </button>
        </div>
      </div>

      {/* Zone Management Modal */}
      {isManagingZones && (
        <div className="fixed inset-0 bg-[#070b14]/95 backdrop-blur-xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-[#0f172a] w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-[#1a2333]">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Strategic Zones</h3>
              <button onClick={() => setIsManagingZones(false)} className="text-slate-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-8 overflow-y-auto space-y-4">
              {/* Add New Zone */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New Zone Name (e.g. Zone K)"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  className="flex-grow bg-[#0f172a] border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-bold uppercase placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={async () => {
                    if (!newZoneName) return;
                    try {
                      const baseLat = 21.1966;
                      const baseLng = 92.1583;
                      const offsetLat = (Math.random() - 0.5) * 0.02;
                      const offsetLng = (Math.random() - 0.5) * 0.02;

                      const newZone: any = {
                        id: newZoneName,
                        name: newZoneName,
                        coordinates: [
                          { lat: baseLat + offsetLat, lng: baseLng + offsetLng },
                          { lat: baseLat + offsetLat + 0.005, lng: baseLng + offsetLng - 0.005 },
                          { lat: baseLat + offsetLat + 0.005, lng: baseLng + offsetLng + 0.005 }
                        ]
                      };
                      await addZone(newZone);
                      setNewZoneName('');
                      alert("Zone added successfully!");
                    } catch (err: any) {
                      console.error("Failed to add zone:", err);
                      alert(`Failed to add zone: ${err.message || err}`);
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 rounded-xl font-black text-xs uppercase"
                >
                  Add
                </button>
              </div>

              <div className="space-y-2">
                {data.zones?.map(zone => (
                  <div key={zone.id} className="flex items-center justify-between bg-[#1a2333] p-4 rounded-xl border border-white/5">
                    <span className="text-white font-bold text-sm uppercase">{zone.name}</span>
                    <button
                      onClick={() => deleteZone(zone.id)}
                      className="text-red-500 hover:text-red-400 text-[10px] font-black uppercase border border-red-500/20 px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {(!data.zones || data.zones.length === 0) && (
                  <div className="text-center text-slate-500 text-xs py-4">No zones defined.</div>
                )}

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Volunteer Management Modal */}
      {isManagingVolunteers && (
        <div className="fixed inset-0 bg-[#070b14]/95 backdrop-blur-xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-[#0f172a] w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-[#1a2333]">
              <div className="flex items-center space-x-4">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Active Field Agents</h3>
                {data.volunteers && data.volunteers.length > 0 && (
                  <button
                    onClick={async () => {
                      if (confirm("DANGER: This will remove ALL volunteers. Are you sure?")) {
                        for (const vol of data.volunteers) {
                          try {
                            await deleteUser(vol.docId || vol.id);
                          } catch (e) {
                            console.error(e);
                          }
                        }
                        alert("All agents recalled.");
                      }
                    }}
                    className="text-[9px] bg-red-900/30 hover:bg-red-900/50 text-red-500 border border-red-500/20 px-3 py-1.5 rounded-lg font-black uppercase transition-all"
                  >
                    Revoke All
                  </button>
                )}
              </div>
              <button onClick={() => setIsManagingVolunteers(false)} className="text-slate-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>


            {/* Manual SMS removed */}


            <div className="p-8 overflow-y-auto space-y-4">
              {/* Add New Volunteer */}
              <div className="flex flex-col gap-2 bg-[#1a2333]/50 p-4 rounded-xl border border-white/5">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Deploy New Agent</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ID (e.g. VOL-2045)"
                    value={newVolId}
                    onChange={(e) => setNewVolId(e.target.value)}
                    className="w-1/3 bg-[#0f172a] border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-bold uppercase placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    placeholder="Name (e.g. Sarah J)"
                    value={newVolName}
                    onChange={(e) => setNewVolName(e.target.value)}
                    className="flex-grow bg-[#0f172a] border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-bold uppercase placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!newVolId || !newVolName) return;
                    try {
                      const profile = {
                        id: newVolId.toUpperCase(),
                        role: UserRole.VOLUNTEER,
                        name: newVolName,
                        organization: user.organization,
                        lastSync: new Date().toISOString()
                      };
                      await createUserProfile(newVolId.toUpperCase(), profile);

                      setNewVolId('');
                      setNewVolName('');
                      alert("Agent deployed successfully.");
                    } catch (err: any) {
                      console.error(err);
                      alert("Failed to deploy agent: " + err.message);
                    }
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-black text-xs uppercase shadow-lg shadow-emerald-500/20"
                >
                  Deploy Agent
                </button>
              </div>

              <div className="space-y-2">
                {data.volunteers?.length === 0 ? (
                  <div className="text-center text-slate-500 text-xs py-4">No active agents deployed.</div>
                ) : (
                  data.volunteers?.map(vol => (
                    <div key={vol.id} className="flex items-center justify-between bg-[#1a2333] p-4 rounded-xl border border-white/5">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-500 font-bold text-xs">
                          {vol.name?.charAt(0)}
                        </div>
                        <div>
                          <h4 className="text-white font-bold text-xs uppercase">{vol.name}</h4>
                          <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">{vol.id}</span>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (confirm(`Revoke access for ${vol.name}?`)) {
                            try {
                              console.log("Attempting to delete user by Doc ID:", vol.docId || vol.id);
                              await deleteUser(vol.docId || vol.id);
                              alert(`Access revoked for ${vol.name}`);
                            } catch (err: any) {
                              console.error("Delete failed:", err);
                              alert(`Failed to revoke access: ${err.message}`);
                            }
                          }
                        }}
                        className="text-red-500 hover:text-red-400 text-[10px] font-black uppercase border border-red-500/20 px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Risk Analysis Cards Section - Matching Screenshot Aesthetic */}
      <div className="bg-[#0f172a] rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden border border-white/5">
        <div className="relative z-10 space-y-10">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Info DashBoard</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {riskAnalysis.map((res) => (
              <button
                key={res.zone}
                onClick={() => setSelectedZoneDetail(res)}
                className="bg-[#1a2333] border border-white/5 p-8 rounded-[2rem] hover:bg-[#1e293b] transition-all text-left group active:scale-[0.98] shadow-lg"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-black tracking-tight">{res.zone}</h3>
                  <span className={`text-[8px] px-3 py-1 rounded-md font-black uppercase tracking-widest ${res.priority === 'Critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    res.priority === 'High' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      res.priority === 'Medium' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                    {res.priority} Priority
                  </span>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Infection Risk</span>
                    <span className="text-[10px] font-black text-slate-200">{(res.prob * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${res.prob > 0.6 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                      res.prob > 0.35 ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' :
                        'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                      }`} style={{ width: `${res.prob * 100}%` }}></div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                  <div className="flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Confidence: {res.confidence}</span>
                  </div>
                  <span className="text-[8px] font-black text-slate-200 uppercase tracking-widest">{res.reportCount} Active Reports</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Operations Center - Unified Feed */}
      <div className="w-full pb-12">
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          {/* Feed Tabs */}
          <div className="px-8 py-6 border-b border-slate-50 flex flex-col sm:flex-row items-center justify-between bg-slate-50/10 gap-4">
            <div className="flex items-center space-x-1 bg-slate-100 p-1.5 rounded-2xl shadow-inner">
              <button
                onClick={() => setFeedType('REPORTS')}
                className={`flex items-center space-x-2 px-8 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${feedType === 'REPORTS' ? 'bg-white shadow-lg text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                <span>Facility Reports</span>
              </button>
              <button
                onClick={() => setFeedType('LOGS')}
                className={`flex items-center space-x-2 px-8 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${feedType === 'LOGS' ? 'bg-white shadow-lg text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                <span>Volunteer Activity</span>
              </button>
            </div>
            {feedType === 'REPORTS' ? (
              <div className="flex bg-slate-100 p-1.5 rounded-xl shadow-inner">
                <button
                  onClick={() => setReportFilter('ALL')}
                  className={`px-5 py-2 text-[9px] font-black uppercase rounded-lg transition-all ${reportFilter === 'ALL' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
                >All</button>
                <button
                  onClick={() => setReportFilter(ReportType.TOILET)}
                  className={`px-5 py-2 text-[9px] font-black uppercase rounded-lg transition-all ${reportFilter === ReportType.TOILET ? 'bg-white shadow-sm text-purple-600' : 'text-slate-400'}`}
                >Toilets</button>
                <button
                  onClick={() => setReportFilter(ReportType.WATER_POINT)}
                  className={`px-5 py-2 text-[9px] font-black uppercase rounded-lg transition-all ${reportFilter === ReportType.WATER_POINT ? 'bg-white shadow-sm text-cyan-600' : 'text-slate-400'}`}
                >Water</button>
              </div>
            ) : (
              <div className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-5 py-3 rounded-xl border border-emerald-100 tracking-widest uppercase">
                {totalPersonnelHours} Active Field Hours Tracked
              </div>
            )}
          </div>

          <div className="flex-grow overflow-auto divide-y divide-slate-50">
            {feedType === 'REPORTS' ? (
              filteredReports.length === 0 ? (
                <div className="py-32 text-center text-slate-300 font-black uppercase text-xs tracking-[0.3em]">No signals detected</div>
              ) : (
                filteredReports.map((report) => (
                  <div key={report.id} className="p-8 hover:bg-slate-50/50 transition-all border-l-4 border-transparent hover:border-blue-500">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${report.type === ReportType.TOILET ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700'}`}>
                          {report.type}
                        </span>
                        <h4 className="font-black text-slate-800 text-base uppercase tracking-tight">{report.zone} — <span className="text-blue-600">{report.facilityId}</span></h4>
                      </div>
                      <StatusBadge report={report} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Functional</span>
                        <span className="text-xs font-bold text-slate-700">{report.details.usable || report.details.available || 'N/A'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Pressure</span>
                        <span className="text-xs font-bold text-slate-700">{report.details.usagePressure} Users</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Issues</span>
                        <span className="text-xs font-bold text-red-500">{report.details.problems?.length || 0} Alerts</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nudges</span>
                        <span className={`text-xs font-bold ${report.nudges?.length ? 'text-amber-500' : 'text-slate-400'}`}>
                          {report.nudges?.length || 0}
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Recorded</span>
                        <span className="text-xs font-bold text-slate-500">{new Date(report.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : (
              // Enhanced Volunteer Activity Tab
              <div className="space-y-6">
                {/* Date Filter & Status Summary */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center space-x-4 w-full md:w-auto">
                    <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Activity Date</label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-full px-3 py-2 uppercase"
                      />
                    </div>
                  </div>

                  {/* Compliance Stats */}
                  {(() => {
                    const filteredLogs = data.logs.filter(log => new Date(log.timestamp).toDateString() === new Date(selectedDate).toDateString());
                    const activeVolunteers = data.volunteers || [];
                    const loggedVolunteerNames = new Set(filteredLogs.map(l => l.authorName));
                    // Match roughly by name since we stored name in log. Ideally store ID.
                    // For better accuracy, logs should store volunteerId. 
                    // Current Log interface: authorName.
                    // Let's assume authorName matches user.name for now (as set in Login.tsx).

                    const missing = activeVolunteers.filter(v => !loggedVolunteerNames.has(v.name || ''));

                    return (
                      <div className="flex items-center space-x-8">
                        <div className="text-center">
                          <div className="text-2xl font-black text-slate-800">{filteredLogs.length}</div>
                          <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Logs Submitted</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-2xl font-black ${missing.length > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{missing.length}</div>
                          <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Missing Reports</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Missing Reports Alert Section */}
                {(() => {
                  const filteredLogs = data.logs.filter(log => new Date(log.timestamp).toDateString() === new Date(selectedDate).toDateString());
                  const activeVolunteers = data.volunteers || [];
                  const loggedVolunteerNames = new Set(filteredLogs.map(l => l.authorName));
                  const missing = activeVolunteers.filter(v => !loggedVolunteerNames.has(v.name || ''));

                  if (missing.length === 0) return null;

                  return (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <h4 className="text-xs font-black text-red-800 uppercase tracking-widest">Pending Check-ins for {(new Date(selectedDate)).toLocaleDateString()}</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {missing.map(vol => (
                          <div key={vol.id} className="bg-white border border-red-100 px-4 py-2 rounded-lg flex items-center space-x-3 shadow-sm justify-between w-full md:w-auto">
                            <div className="flex items-center space-x-3">
                              <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold">
                                {vol.name?.charAt(0)}
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-700 uppercase">{vol.name}</div>
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{vol.id}</div>
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  await nudgeVolunteer(vol.docId || vol.id, user.organization || "HQ");
                                  alert(`Nudged ${vol.name}`);
                                } catch (e: any) {
                                  alert("Failed to nudge: " + e.message);
                                }
                              }}
                              className="text-[9px] font-black uppercase text-amber-500 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 hover:bg-amber-100 transition-colors"
                            >
                              Nudge
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Filtered Log Feed */}
                <div className="space-y-4">
                  {(() => {
                    const filteredLogs = data.logs.filter(log => new Date(log.timestamp).toDateString() === new Date(selectedDate).toDateString());

                    if (filteredLogs.length === 0) {
                      return (
                        <div className="py-20 text-center">
                          <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </div>
                          <div className="text-slate-300 font-black uppercase text-xs tracking-[0.3em]">No activity logged for this date</div>
                        </div>
                      );
                    }

                    return filteredLogs.map((log) => (
                      <div key={log.id} className="p-8 bg-white rounded-2xl border border-slate-100 hover:border-emerald-200 transition-all shadow-sm group">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-sm uppercase group-hover:scale-110 transition-transform">
                              {log.authorName.charAt(0)}
                            </div>
                            <div>
                              <h4 className="font-black text-slate-800 text-sm uppercase leading-tight">{log.authorName}</h4>
                              <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest">Active Contribution — {log.hours}h</span>
                            </div>
                          </div>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="ml-14">
                          <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl italic text-slate-600 text-sm font-medium leading-relaxed">
                            "{log.activity}"
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Breakdown Modal - High Fidelity Matching the Screenshot */}
      {selectedZoneDetail && (
        <div className="fixed inset-0 bg-[#070b14]/95 backdrop-blur-xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-[#0f172a] w-full max-w-xl rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden flex flex-col">
            {/* Header Section */}
            <div className="p-10 pb-4 flex justify-between items-start">
              <div>
                <span className="text-[9px] font-black uppercase text-blue-400 tracking-[0.4em] mb-2 block">Info DashBoard</span>
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">
                  Why {selectedZoneDetail.zone} is Flagged
                </h2>
              </div>
              <button onClick={() => setSelectedZoneDetail(null)} className="text-slate-500 hover:text-white transition-colors p-2 -mr-4 -mt-4">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            {/* Priority Card in Modal */}
            <div className="px-10 py-6">
              <div className="bg-[#1a2333] border border-white/5 rounded-[2rem] p-6 flex items-center space-x-6">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-[0_0_20px_rgba(37,99,235,0.4)]">
                  {(selectedZoneDetail.prob * 100).toFixed(0)}%
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Risk Mitigation Priority</span>
                  <p className="text-lg font-black text-white uppercase tracking-tight">
                    {selectedZoneDetail.prob > 0.6 ? 'Critical Immediate Response' : selectedZoneDetail.prob > 0.3 ? 'Proactive Monitor Required' : 'Low Required Intervention'}
                  </p>
                </div>
              </div>
            </div>

            {/* Signal List */}
            <div className="px-10 pb-6 space-y-4 flex-grow overflow-y-auto max-h-[40vh]">
              <div className="flex items-center space-x-4 mb-2">
                <div className="w-1 h-5 bg-blue-600 rounded-full"></div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Critical Risk Signals</span>
              </div>
              {selectedZoneDetail.signals.map((signal, idx) => (
                <div key={idx} className="bg-[#1a2333]/60 p-5 rounded-2xl border border-white/5 flex items-center space-x-4 group hover:bg-[#1a2333] transition-colors">
                  <div className="w-6 h-6 rounded-full border-2 border-blue-500 flex items-center justify-center flex-shrink-0 text-blue-500">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  </div>
                  <span className="text-sm font-bold text-slate-300 uppercase tracking-tight leading-relaxed">{signal}</span>
                </div>
              ))}
            </div>

            {/* Footer Action */}
            <div className="p-10 pt-4">
              <button
                onClick={() => setSelectedZoneDetail(null)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-[0.2em] py-6 rounded-3xl shadow-2xl shadow-blue-900/40 transition-all active:scale-95"
              >
                Acknowledge & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NGODashboard;
