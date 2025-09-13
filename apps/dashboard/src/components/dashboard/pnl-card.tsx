'use client';

import { formatCurrency, getPnLColor } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface PnLCardProps {
  pnl?: {
    totalPnl: number;
    todayPnl: number;
    unrealizedPnl: number;
    realizedPnl: number;
  };
}

export function PnLCard({ pnl }: PnLCardProps) {
  if (!pnl) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-32"></div>
        </div>
      </div>
    );
  }

  const isPositive = pnl.totalPnl >= 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">Total P&L</h3>
        {isPositive ? (
          <TrendingUp className="h-5 w-5 text-green-500" />
        ) : (
          <TrendingDown className="h-5 w-5 text-red-500" />
        )}
      </div>

      <div className="space-y-2">
        <div>
          <p className={`text-2xl font-bold ${getPnLColor(pnl.totalPnl)}`}>
            {formatCurrency(pnl.totalPnl)}
          </p>
          <p className="text-xs text-gray-500">All Time P&L</p>
        </div>

        <div className="pt-3 border-t">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Today</span>
            <span className={`font-medium ${getPnLColor(pnl.todayPnl)}`}>
              {formatCurrency(pnl.todayPnl)}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-600">Unrealized</span>
            <span className={`font-medium ${getPnLColor(pnl.unrealizedPnl)}`}>
              {formatCurrency(pnl.unrealizedPnl)}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-600">Realized</span>
            <span className={`font-medium ${getPnLColor(pnl.realizedPnl)}`}>
              {formatCurrency(pnl.realizedPnl)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}