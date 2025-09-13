'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Play, Square, Send } from 'lucide-react';

export function QuickActions() {
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testAction, setTestAction] = useState<'buy' | 'sell'>('buy');
  const [testSymbol, setTestSymbol] = useState('BTC-USD');
  const queryClient = useQueryClient();

  const testWebhookMutation = useMutation({
    mutationFn: ({ action, symbol }: { action: 'buy' | 'sell'; symbol: string }) =>
      api.sendTestWebhook(action, symbol),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setIsTestModalOpen(false);
    },
  });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-600 mb-4">Quick Actions</h3>

      <div className="space-y-3">
        <button
          onClick={() => setIsTestModalOpen(true)}
          className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Send className="h-4 w-4 mr-2" />
          Send Test Signal
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button className="flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm">
            <Play className="h-4 w-4 mr-1" />
            Start Bot
          </button>
          <button className="flex items-center justify-center px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm">
            <Square className="h-4 w-4 mr-1" />
            Stop Bot
          </button>
        </div>
      </div>

      {/* Test Signal Modal */}
      {isTestModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Send Test Signal</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Action
                </label>
                <select
                  value={testAction}
                  onChange={(e) => setTestAction(e.target.value as 'buy' | 'sell')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="buy">Buy (Open Long)</option>
                  <option value="sell">Sell (Close Long)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Symbol
                </label>
                <input
                  type="text"
                  value={testSymbol}
                  onChange={(e) => setTestSymbol(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="BTC-USD"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => testWebhookMutation.mutate({ action: testAction, symbol: testSymbol })}
                disabled={testWebhookMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {testWebhookMutation.isPending ? 'Sending...' : 'Send Signal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}