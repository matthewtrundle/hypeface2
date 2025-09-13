'use client';

import { useQuery } from '@tanstack/react-query';
import { useSocket } from '@/hooks/use-socket';
import { api } from '@/lib/api';
import { DashboardHeader } from '@/components/dashboard/header';
import { PositionsList } from '@/components/dashboard/positions-list';
import { TradeHistory } from '@/components/dashboard/trade-history';
import { BalanceCard } from '@/components/dashboard/balance-card';
import { PnLCard } from '@/components/dashboard/pnl-card';
import { SystemStatus } from '@/components/dashboard/system-status';
import { QuickActions } from '@/components/dashboard/quick-actions';

export default function DashboardPage() {
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboardData,
    refetchInterval: 5000,
  });

  useSocket({
    onPositionUpdate: (position) => {
      console.log('Position updated:', position);
    },
    onTradeExecuted: (trade) => {
      console.log('Trade executed:', trade);
    },
    onBalanceUpdate: (balance) => {
      console.log('Balance updated:', balance);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600">Error loading dashboard</p>
          <p className="text-sm text-gray-600 mt-2">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Bar */}
        <div className="mb-6">
          <SystemStatus status={dashboardData?.systemStatus} />
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <BalanceCard balance={dashboardData?.balance} />
          <PnLCard pnl={dashboardData?.pnl} />
          <QuickActions />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-semibold mb-4">Active Positions</h2>
            <PositionsList positions={dashboardData?.positions || []} />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4">Recent Trades</h2>
            <TradeHistory trades={dashboardData?.trades || []} />
          </div>
        </div>
      </div>
    </div>
  );
}