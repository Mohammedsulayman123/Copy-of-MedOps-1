
import React, { useState } from 'react';
import { UserRole, User } from '../types';
import { auth } from '../services/firebase';
import { signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { createUserProfile, getUserProfile } from '../services/db';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState<'volunteer' | 'ngo'>('volunteer');

  // Volunteer State
  const [volId, setVolId] = useState('');

  // NGO State
  const [ngoId, setNgoId] = useState('');
  const [ngoPassword, setNgoPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVolunteerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simple validation (matches pattern VOL-XXXX)
    if (volId.toUpperCase().startsWith('VOL-')) {
      try {
        const result = await signInAnonymously(auth);
        const uid = result.user.uid;

        // Optimistic Login: Create/Merge profile blindly without checking first
        // This is much faster and works offline immediately
        const profile: User = {
          id: volId.toUpperCase(),
          role: UserRole.VOLUNTEER,
          name: 'Volunteer ' + volId.split('-')[1],
          lastSync: new Date().toISOString()
        };

        // Fire and forget (or await if we want to ensure write persistence first)
        // With offline mode, this returns almost instantly
        await createUserProfile(uid, profile);

        // Explicitly update App state to avoid race conditions with onAuthStateChanged
        onLogin(profile);

      } catch (err: any) {
        setError('Login failed: ' + err.message);
        setLoading(false);
      }
    } else {
      setError('Invalid Volunteer ID format. Use VOL-1023 style.');
      setLoading(false);
    }
  };

  const handleNGOSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (ngoId && ngoPassword) {
      try {
        // Assume ID is the email prefix for simplicity
        const email = ngoId.includes('@') ? ngoId : `${ngoId.toLowerCase()}@medops.app`;
        const result = await signInWithEmailAndPassword(auth, email, ngoPassword);

        // Optimistic Profile Creation for NGO
        const ngoProfile: User = {
          id: ngoId.toUpperCase(),
          role: UserRole.NGO,
          organization: ngoId.split('-')[1] || ngoId,
          lastSync: new Date().toISOString()
        };

        // Create/Ensure profile exists in DB
        await createUserProfile(result.user.uid, ngoProfile);

        // Immediate State Update
        onLogin(ngoProfile);
      } catch (err: any) {
        setError('Authentication failed. Check credentials.');
        setLoading(false);
      }
    } else {
      setError('Please provide both NGO ID and Password.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 transition-all">
      {/* Header */}
      <div className="bg-emerald-600 p-8 text-white text-center">
        <h1 className="text-2xl font-bold">HumanityLink</h1>
        <p className="text-emerald-100 mt-2">Connecting compassion with action</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('volunteer')}
          className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'volunteer'
            ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30'
            : 'text-slate-500 hover:text-slate-700'
            }`}
        >
          Volunteer Login
        </button>
        <button
          onClick={() => setActiveTab('ngo')}
          className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'ngo'
            ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30'
            : 'text-slate-500 hover:text-slate-700'
            }`}
        >
          NGO Login
        </button>
      </div>

      {/* Forms */}
      <div className="p-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
            {error}
          </div>
        )}

        {activeTab === 'volunteer' ? (
          <form onSubmit={handleVolunteerSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Volunteer ID</label>
              <input
                type="text"
                placeholder="e.g. VOL-1023"
                value={volId}
                onChange={(e) => setVolId(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
                disabled={loading}
              />
              <p className="mt-2 text-xs text-slate-400">Login using Volunteer ID only (no password required)</p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-emerald-200 disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Enter Dashboard'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleNGOSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">NGO ID / Email</label>
                <input
                  type="text"
                  placeholder="e.g. NGO-ALPHA"
                  value={ngoId}
                  onChange={(e) => setNgoId(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={ngoPassword}
                  onChange={(e) => setNgoPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                  disabled={loading}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-blue-200 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Secure Login'}
            </button>
          </form>
        )}
      </div>

      <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-center space-x-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <p className="text-xs text-slate-500">Secure Humanitarian Auth System active</p>
      </div>
    </div>
  );
};

export default Login;
