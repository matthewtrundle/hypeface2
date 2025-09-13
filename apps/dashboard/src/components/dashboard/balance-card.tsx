'use client';

import { formatCurrency } from '@/lib/utils';
import { Wallet } from 'lucide-react';

interface BalanceCardProps {
  balance?: {
    total: number;
    available: number;
    reserved: number;
    currency: string;
  };
}

export function BalanceCard({ balance }: BalanceCardProps) {
  if (!balance) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-32"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">Wallet Balance</h3>
        <Wallet className="h-5 w-5 text-gray-400" />
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(balance.total)}
          </p>
          <p className="text-xs text-gray-500">Total Balance</p>
        </div>

        <div className="pt-3 border-t">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Available</span>
            <span className="font-medium">{formatCurrency(balance.available)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-600">Reserved</span>
            <span className="font-medium">{formatCurrency(balance.reserved)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}