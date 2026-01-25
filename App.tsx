
import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserRole, User, AppData, FieldLog, Project, WASHReport } from './types';
import Login from './components/Login';
import VolunteerDashboard from './components/VolunteerDashboard';
import NGODashboard from './components/NGODashboard';
import Navbar from './components/Navbar';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [data, setData] = useState<AppData>({ logs: [], projects: [], reports: [] });

  // Persistence: Load Auth and Data
  useEffect(() => {
    const savedUser = localStorage.getItem('humanity_user');
    const savedData = localStorage.getItem('humanity_data');
    
    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setData({
        logs: parsed.logs || [],
        projects: parsed.projects || [],
        reports: parsed.reports || []
      });
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync Logic
  useEffect(() => {
    if (isOnline) {
      const hasUnsynced = 
        data.logs.some(l => !l.synced) || 
        data.projects.some(p => !p.synced) ||
        data.reports.some(r => !r.synced);

      if (hasUnsynced) {
        setIsSyncing(true);
        const timer = setTimeout(() => {
          const syncedData: AppData = {
            logs: data.logs.map(l => ({ ...l, synced: true })),
            projects: data.projects.map(p => ({ ...p, synced: true })),
            reports: data.reports.map(r => ({ ...r, synced: true }))
          };
          setData(syncedData);
          localStorage.setItem('humanity_data', JSON.stringify(syncedData));
          setIsSyncing(false);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [isOnline, data]);

  const updateData = useCallback((newData: AppData) => {
    setData(newData);
    localStorage.setItem('humanity_data', JSON.stringify(newData));
  }, []);

  const handleLogin = (userData: User) => {
    const enrichedUser = { ...userData, lastSync: new Date().toISOString() };
    setUser(enrichedUser);
    localStorage.setItem('humanity_user', JSON.stringify(enrichedUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('humanity_user');
  };

  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-50 flex flex-col transition-all">
        {!isOnline && (
          <div className="bg-amber-600 text-white text-[10px] font-black py-1.5 px-4 flex items-center justify-center space-x-2 tracking-widest uppercase z-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
            </svg>
            <span>Offline Operations Active</span>
          </div>
        )}

        {user && (
          <Navbar 
            user={user} 
            onLogout={handleLogout} 
            isOnline={isOnline} 
            isSyncing={isSyncing} 
          />
        )}
        
        <main className="flex-grow flex flex-col items-center p-4">
          <Routes>
            <Route 
              path="/login" 
              element={
                !user ? (
                  <div className="flex-grow flex items-center"><Login onLogin={handleLogin} /></div>
                ) : (
                  <Navigate to={user.role === UserRole.VOLUNTEER ? "/volunteer" : "/ngo"} replace />
                )
              } 
            />
            
            <Route 
              path="/volunteer" 
              element={
                user?.role === UserRole.VOLUNTEER ? (
                  <VolunteerDashboard user={user} isOnline={isOnline} data={data} onUpdate={updateData} />
                ) : (
                  <Navigate to="/login" replace />
                )
              } 
            />
            
            <Route 
              path="/ngo" 
              element={
                user?.role === UserRole.NGO ? (
                  <NGODashboard user={user} isOnline={isOnline} data={data} onUpdate={updateData} />
                ) : (
                  <Navigate to="/login" replace />
                )
              } 
            />

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>

        <footer className="py-4 text-center text-slate-300 text-[9px] uppercase tracking-[0.2em] font-bold">
          &copy; {new Date().getFullYear()} HumanityLink | Resilient Core v1.2
        </footer>
      </div>
    </HashRouter>
  );
};

export default App;
