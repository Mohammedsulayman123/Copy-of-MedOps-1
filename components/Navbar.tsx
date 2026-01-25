
import React from 'react';
import { User, UserRole } from '../types';

interface NavbarProps {
  user: User;
  onLogout: () => void;
  isOnline: boolean;
  isSyncing: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout, isOnline, isSyncing }) => {
  const isVolunteer = user.role === UserRole.VOLUNTEER;

  return (
    <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm ${isVolunteer ? 'bg-emerald-600' : 'bg-blue-600'}`}>
            H
          </div>
          <div className="hidden xs:block">
            <span className="block font-bold text-slate-800 text-sm leading-none">HumanityLink</span>
            <div className="flex items-center mt-1">
              <span className={`w-2 h-2 rounded-full mr-1.5 ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'} ${isSyncing ? 'animate-bounce' : ''}`}></span>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                {isSyncing ? 'Syncing...' : isOnline ? 'Live Connection' : 'Offline Mode'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 sm:space-x-6">
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-slate-700">{user.name || user.organization}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter ${
              isVolunteer ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
            }`}>
              {user.role}
            </span>
          </div>
          
          <div className="h-6 w-px bg-slate-100 hidden sm:block"></div>

          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-red-500 transition-colors p-1"
            title="Secure Exit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
