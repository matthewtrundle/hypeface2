'use client';

import { getStatusColor } from '@/lib/utils';
import { CheckCircle, AlertCircle, XCircle, Wifi, Database, Server } from 'lucide-react';

interface SystemStatusProps {
  status?: {
    status: 'healthy' | 'degraded' | 'down';
    lastUpdate: Date | string;
    apiConnection: boolean;
    databaseConnection: boolean;
    redisConnection: boolean;
  };
}

export function SystemStatus({ status }: SystemStatusProps) {
  if (!status) {
    return null;
  }

  const getStatusIcon = () => {
    switch (status.status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'down':
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <p className={`font-medium ${getStatusColor(status.status)}`}>
              System {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
            </p>
            <p className="text-xs text-gray-500">
              Last updated: {new Date(status.lastUpdate).toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <Wifi className={`h-4 w-4 ${status.apiConnection ? 'text-green-500' : 'text-red-500'}`} />
            <span className="text-xs text-gray-600">API</span>
          </div>
          <div className="flex items-center space-x-1">
            <Database className={`h-4 w-4 ${status.databaseConnection ? 'text-green-500' : 'text-red-500'}`} />
            <span className="text-xs text-gray-600">DB</span>
          </div>
          <div className="flex items-center space-x-1">
            <Server className={`h-4 w-4 ${status.redisConnection ? 'text-green-500' : 'text-red-500'}`} />
            <span className="text-xs text-gray-600">Redis</span>
          </div>
        </div>
      </div>
    </div>
  );
}