'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { LogOut, Settings, Activity } from 'lucide-react';

export function DashboardHeader() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await api.logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Activity className="h-8 w-8 text-primary mr-3" />
            <h1 className="text-xl font-bold text-gray-900">
              Hyperliquid Trading Bot
            </h1>
          </div>

          <nav className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/settings')}
              className="text-gray-600 hover:text-gray-900 p-2 rounded-md hover:bg-gray-100"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-900 p-2 rounded-md hover:bg-gray-100"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}