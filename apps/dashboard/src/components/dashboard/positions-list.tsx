'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency, formatPercentage, getPnLColor, calculatePnLPercentage } from '@/lib/utils';
import { X, TrendingUp, TrendingDown } from 'lucide-react';

interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice?: number;
  unrealizedPnl: number;
  status: 'open' | 'closed';
}

interface PositionsListProps {
  positions: Position[];
}

export function PositionsList({ positions }: PositionsListProps) {
  const queryClient = useQueryClient();

  const closePositionMutation = useMutation({
    mutationFn: (positionId: string) => api.closePosition(positionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const openPositions = positions.filter(p => p.status === 'open');

  if (openPositions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500 text-center">No open positions</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="divide-y divide-gray-200">
        {openPositions.map((position) => {
          const pnlPercentage = position.currentPrice
            ? calculatePnLPercentage(position.entryPrice, position.currentPrice, position.side)
            : 0;

          return (
            <div key={position.id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-semibold text-gray-900">{position.symbol}</span>
                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                      LONG
                    </span>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Size:</span>{' '}
                      <span className="font-medium">{position.size.toFixed(4)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Entry:</span>{' '}
                      <span className="font-medium">{formatCurrency(position.entryPrice)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Current:</span>{' '}
                      <span className="font-medium">
                        {position.currentPrice ? formatCurrency(position.currentPrice) : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">P&L:</span>{' '}
                      <span className={`font-medium ${getPnLColor(position.unrealizedPnl)}`}>
                        {formatCurrency(position.unrealizedPnl)} ({formatPercentage(pnlPercentage)})
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => closePositionMutation.mutate(position.id)}
                  disabled={closePositionMutation.isPending}
                  className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                  title="Close position"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}