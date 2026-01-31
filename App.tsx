import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserRole, User, AppData } from './types';
import Login from './components/Login';
import VolunteerDashboard from './components/VolunteerDashboard';
import NGODashboard from './components/NGODashboard';
import Navbar from './components/Navbar';
import SMSGateway from './components/SMSGateway';
import { auth } from './services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getUserProfile, createUserProfile, subscribeToLogs, subscribeToProjects, subscribeToReports, subscribeToZones, subscribeToVolunteers } from './services/db';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false); // Managed by Firestore internally mostly, but we can keep for UI
  const [data, setData] = useState<AppData>({ logs: [], projects: [], reports: [], zones: [], volunteers: [] });
  const [loading, setLoading] = useState(true);

  // Auth Listener & Optimistic Load
  useEffect(() => {
    // 1. Try to load from local storage first (Optimistic)
    const tryLocalLoad = () => {
      try {
        const keys = Object.keys(localStorage);
        const userKey = keys.find(k => k.startsWith('cached_user_'));
        if (userKey) {
          const cached = JSON.parse(localStorage.getItem(userKey) || '{}');
          if (cached && cached.id) {
            console.log("Optimistic load:", cached.id);
            setUser(cached);
            setLoading(false); // Show UI immediately
          }
        }
      } catch (e) {
        console.error("Local load failed", e);
      }
    };

    tryLocalLoad();

    // 2. Firebase Auth Listener (Source of Truth)
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch profile
        try {
          const profile = await getUserProfile(firebaseUser.uid);
          if (profile) {
            setUser({ ...profile, lastSync: new Date().toISOString() });
            localStorage.setItem(`cached_user_${profile.id}`, JSON.stringify(profile));
          } else {
            console.log("No profile found - Creating one...");
            const newProfile: User = {
              id: firebaseUser.uid,
              name: firebaseUser.displayName || "Volunteer",
              role: UserRole.VOLUNTEER, // Defaulting to Volunteer
              organization: 'org1', // Default Org
            };
            await createUserProfile(firebaseUser.uid, newProfile);
            setUser(newProfile);
            localStorage.setItem(`cached_user_${firebaseUser.uid}`, JSON.stringify(newProfile));
          }
        } catch (e) {
          console.error("Profile fetch failed", e);
        }
      } else {
        // Only clear user if we really are signed out and intended to be
        // Don't clear if we just have a blip, but here firebaseUser is null means signed out.
        // We might want to keep the local user for offline read-only if desired, but standard is signout.
        // For resilience, we check if we were "logging out" or just "offline".
        // But onAuthStateChanged(null) usually means valid sign out or no token.
        // We will respect it, but maybe delay clearing if offline? 
        // For now, let's respect it to allow logout.
        // setUser(null); 
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Subscriptions (only when logged in)
  useEffect(() => {
    if (!user) return;

    const unsubLogs = subscribeToLogs((logs) => setData(prev => ({ ...prev, logs })));
    const unsubReports = subscribeToReports((reports) => setData(prev => ({ ...prev, reports })));
    const unsubProjects = subscribeToProjects((projects) => setData(prev => ({ ...prev, projects })));
    const unsubZones = subscribeToZones((zones) => setData(prev => ({ ...prev, zones })));
    const unsubVolunteers = subscribeToVolunteers((volunteers) => setData(prev => ({ ...prev, volunteers })));

    return () => {
      unsubLogs();
      unsubReports();
      unsubProjects();
      unsubZones();
      unsubVolunteers();
    };
  }, [user?.id]); // Re-subscribe if user changes (or just on mount/unmount of auth)

  // Online Status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-emerald-600 font-bold">Loading...</div>;
  }

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
                  // Login component now handles auth and redirect trigger
                  <div className="flex-grow flex items-center"><Login onLogin={(u) => setUser(u)} /></div>
                ) : (
                  <Navigate to={user.role === UserRole.VOLUNTEER ? "/volunteer" : "/ngo"} replace />
                )
              }
            />

            <Route
              path="/volunteer"
              element={
                user?.role === UserRole.VOLUNTEER ? (
                  <VolunteerDashboard user={user} isOnline={isOnline} data={data} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />

            <Route
              path="/ngo"
              element={
                user?.role === UserRole.NGO ? (
                  <NGODashboard user={user} isOnline={isOnline} data={data} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>

        <footer className="py-4 text-center text-slate-300 text-[9px] uppercase tracking-[0.2em] font-bold">
          &copy; {new Date().getFullYear()} WASH Link | Resilient Core v1.2
        </footer>

        {/* SMS SIMULATION WIDGET */}
        <SMSGateway />
      </div>
    </HashRouter>
  );
};

export default App;
